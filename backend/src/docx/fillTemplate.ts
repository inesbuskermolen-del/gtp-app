import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// @ts-expect-error -- no published types for this package.
import ImageModule from 'docxtemplater-image-module-free';
import type { GtpContent } from '../gtpGenerator.js';
import { joinDistances, joinStops } from '../gtpGenerator.js';
import type { SiteContextImage } from '../siteImage.js';
import { GtpError } from '../errors.js';

// 1x1 transparent PNG — placeholder so the {%siteImage} tag always has a
// buffer to hand the image module even when the live fetch failed; the
// accompanying {#hasSiteImage} block (see toTemplateData) hides it and
// shows a "confirm manually" note instead, mirroring the transport._error
// pattern in transportNarrative.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

// Display size in the doc, scaled down from the fetched pixel size while
// keeping its aspect ratio — full pixel size would render far too large on
// the page.
const SITE_IMAGE_DISPLAY_WIDTH = 560;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'template.docx');

const ACTION_CATEGORY_TAGS: Record<string, string> = {
  walking: 'actionsWalking',
  cycling: 'actionsCycling',
  endOfTripFacilities: 'actionsEndOfTripFacilities',
  publicTransport: 'actionsPublicTransport',
  carpoolingCarShare: 'actionsCarpoolingCarShare',
  carParking: 'actionsCarParking',
  travelForWorkAmenities: 'actionsTravelForWorkAmenities',
  management: 'actionsManagement',
};

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Map our internal GTP content shape to the exact merge-tag names baked
 * into template.docx by templates/build-template.py — see that script for
 * the full list of tags and why each exists. */
export function toTemplateData(gtp: GtpContent, siteImage: SiteContextImage): Record<string, unknown> {
  const data: Record<string, unknown> = {
    hasSiteImage: Boolean(siteImage.buffer),
    // The image module resolves {%siteImage} to this value and passes it
    // into getImage(tagValue, tagName) as tagValue — our getImage ignores
    // it and always returns the pre-fetched buffer via closure, but the
    // key must exist and be non-empty or docxtemplater treats the tag as
    // unresolved and silently skips rendering the image altogether.
    siteImage: 'site-context-image',
    siteImageNote: siteImage.error || '',
    projectAddress: gtp.meta.address,
    client: gtp.meta.clientName || '[Client name not supplied]',
    giwRef: gtp.meta.projectReference || '[Reference not supplied]',
    councilName: gtp.meta.council.name,
    architect: '[Architect not supplied]',
    date: formatDateShort(gtp.meta.generatedDate),
    developmentTypeLabel: gtp.meta.developmentTypeLabel,
    generatedDateLong: formatDateLong(gtp.meta.generatedDate),
    generatedDateShort: formatDateShort(gtp.meta.generatedDate),
    indicativeWalkability: gtp.transport.indicativeWalkability,
    summary: gtp.summary,
    introduction: gtp.introduction,
    subjectSiteNarrative: gtp.subjectSiteNarrative,
    transportNarrative: gtp.transportNarrative,
    policyNarrative: gtp.policyNarrative,
    gtpIntro: gtp.gtpIntro,
    monitoringAndReporting: gtp.monitoringAndReporting,
    draftBanner: gtp.draftBanner,
    sourcesOfInformation: gtp.sourcesOfInformation,
    targets: gtp.targets.map((t) => ({
      text: t.sourced ? t.text : `${t.text} [indicative — not council-sourced]`,
    })),
    trainStops: joinStops(gtp.transport.train, gtp.transport.searchRadiusM, 'train station'),
    trainDistances: joinDistances(gtp.transport.train),
    tramStops: joinStops(gtp.transport.tram, gtp.transport.searchRadiusM, 'tram stop'),
    tramDistances: joinDistances(gtp.transport.tram),
    busStops: joinStops(gtp.transport.bus, gtp.transport.searchRadiusM, 'bus stop'),
    busDistances: joinDistances(gtp.transport.bus),
    hasCarSharePods: gtp.transport.carShare.length > 0,
    carSharePods: gtp.transport.carShare.map((c) => ({
      name: c.name,
      distanceLabel: c.distanceLabel,
      walkMinutes: c.walkMinutes,
    })),
  };

  for (const [category, tag] of Object.entries(ACTION_CATEGORY_TAGS)) {
    const items = gtp.actionsByCategory[category] || [];
    data[tag] = items.map((item) => ({
      text: item.priority ? `[Priority] ${item.text}` : item.text,
    }));
  }

  return data;
}

export function renderGtpDocx(gtp: GtpContent, siteImage: SiteContextImage): Buffer {
  const templateBuffer = readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(templateBuffer);
  const scaledHeight = Math.round((SITE_IMAGE_DISPLAY_WIDTH * siteImage.height) / siteImage.width);
  const imageModule = new ImageModule({
    // Not `centered: true` — that expands the raw {%siteImage} tag to
    // consume its whole enclosing <w:p>, which fails to compile because
    // that paragraph also holds the {#hasSiteImage}/{^hasSiteImage}
    // markers ("Raw tag not in paragraph"). Centring is done on the
    // placeholder paragraph itself instead — see
    // templates/build-template.py's process_site_image_placeholder.
    centered: false,
    getImage: () => siteImage.buffer || BLANK_PNG,
    getSize: () => [SITE_IMAGE_DISPLAY_WIDTH, scaledHeight],
  });
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, modules: [imageModule] });

  try {
    doc.render(toTemplateData(gtp, siteImage));
  } catch (error) {
    const details =
      error && typeof error === 'object' && 'properties' in error
        ? JSON.stringify((error as { properties?: { errors?: unknown[] } }).properties?.errors ?? error)
        : String(error);
    throw new GtpError('DOCX_RENDER_FAILED', `Failed to generate the .docx file: ${details}`, 500);
  }

  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}
