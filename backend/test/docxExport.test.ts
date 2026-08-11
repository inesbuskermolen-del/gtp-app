import { describe, expect, it } from 'vitest';
import JSZip from 'pizzip';
import { XMLValidator } from 'fast-xml-parser';
import { renderGtpDocx } from '../src/docx/fillTemplate.js';
import { generateGtpContent } from '../src/gtpGenerator.js';
import { findCouncilForLocation } from '../src/councilLookup.js';
import type { GeocodeResult, TransportSummary } from '../src/types.js';

function sampleGtp() {
  const geocode: GeocodeResult = {
    lat: -37.8226,
    lon: 144.993,
    displayName: '1 Swan Street, Richmond VIC 3121',
    suburb: 'Richmond',
    postcode: '3121',
    state: 'Victoria',
    raw: {},
    _source: 'test fixture',
  };
  const transport: TransportSummary = {
    searchRadiusM: 1200,
    train: [{ name: 'Richmond Station', distanceM: 450, distanceLabel: '450m', walkMinutes: 6, tags: {} }],
    tram: [],
    bus: [],
    carShare: [{ name: 'GoGet Pod', distanceM: 300, distanceLabel: '300m', walkMinutes: 4, tags: {} }],
    cyclingInfraCount: 12,
    indicativeWalkability: 72,
    _source: 'test fixture',
  };
  const councilMatch = findCouncilForLocation(geocode, geocode.suburb);
  return generateGtpContent(
    { address: '1 Swan Street, Richmond VIC 3121', developmentType: 'mixedUse', scale: '120 dwellings, 8 storeys' },
    geocode,
    councilMatch,
    transport
  );
}

describe('renderGtpDocx', () => {
  it('renders without throwing and produces a valid docx zip', () => {
    const gtp = sampleGtp();
    const buffer = renderGtpDocx(gtp);
    expect(buffer.length).toBeGreaterThan(10_000);

    const zip = new JSZip(buffer);
    expect(zip.file('word/document.xml')).not.toBeNull();
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
  });

  it('leaves no unrendered {tag} placeholders in the output document', () => {
    const gtp = sampleGtp();
    const buffer = renderGtpDocx(gtp);
    const zip = new JSZip(buffer);
    const documentXml = zip.file('word/document.xml')!.asText();
    // Collapse across XML tags the way Word visually renders text, then
    // check for leftover mustache-style tags.
    const visibleText = documentXml.replace(/<[^>]+>/g, '');
    expect(visibleText).not.toMatch(/\{[a-zA-Z#/^.][^}]*\}/);
  });

  it('produces well-formed XML for every part in the generated docx', () => {
    const gtp = sampleGtp();
    const buffer = renderGtpDocx(gtp);
    const zip = new JSZip(buffer);
    const xmlParts = Object.keys(zip.files).filter((name) => name.endsWith('.xml') || name.endsWith('.rels'));
    expect(xmlParts.length).toBeGreaterThan(10);
    for (const name of xmlParts) {
      const content = zip.file(name)!.asText();
      const result = XMLValidator.validate(content);
      expect(result, `${name} should be well-formed XML`).toBe(true);
    }
  });

  it('renders each target and each source-of-information item as its own separate paragraph', () => {
    // Regression test: docxtemplater only repeats-as-separate-paragraphs
    // when the {#loop}/{/loop} markers are on their own paragraphs,
    // distinct from the {text} paragraph — putting all three in one
    // paragraph silently concatenates every item into one run with no
    // separator (caught during the end-to-end walkthrough, fixed in
    // templates/build-template.py's convert_to_loop_paragraph).
    const gtp = sampleGtp();
    expect(gtp.targets.length).toBeGreaterThan(1);
    const buffer = renderGtpDocx(gtp);
    const zip = new JSZip(buffer);
    const documentXml = zip.file('word/document.xml')!.asText();
    const paragraphTexts = [...documentXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
      m[0].replace(/<[^>]+>/g, '')
    );
    for (const target of gtp.targets) {
      // toTemplateData appends this suffix to unsourced targets — match
      // what actually gets rendered, not the raw GtpContent text.
      const expectedText = target.sourced ? target.text : `${target.text} [indicative — not council-sourced]`;
      const matches = paragraphTexts.filter((t) => t.trim() === expectedText.trim());
      expect(matches.length, `target "${expectedText}" should be its own paragraph`).toBe(1);
    }
  });

  it('includes the draft banner text so exports never look more authoritative than they are', () => {
    const gtp = sampleGtp();
    const buffer = renderGtpDocx(gtp);
    const zip = new JSZip(buffer);
    const documentXml = zip.file('word/document.xml')!.asText();
    expect(documentXml).toContain('AUTOMATICALLY GENERATED DRAFT');
  });
});
