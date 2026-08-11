import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geocodeAddress } from './geocode.js';
import { getTransportInfrastructure } from './overpass.js';
import { findCouncilForLocation, listCouncils } from './councilLookup.js';
import { generateGtpContent, type GtpContent } from './gtpGenerator.js';
import { renderGtpDocx } from './docx/fillTemplate.js';
import { GtpError } from './errors.js';
import type { GtpRequest } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Frontend is deployed separately (GitHub Pages) from this API (Render), so
// browser requests are always cross-origin — restrict to the configured
// frontend origin(s) rather than defaulting to allow-all in production.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));

const MOCK = process.env.GTP_MOCK_DATA === '1';

const VALID_DEV_TYPES = new Set(['residential', 'mixedUse', 'commercialOffice', 'retail', 'education', 'industrial']);

function parseGtpRequest(body: unknown): GtpRequest {
  const b = (body || {}) as Record<string, unknown>;
  const address = typeof b.address === 'string' ? b.address.trim() : '';
  const developmentType = typeof b.developmentType === 'string' ? b.developmentType : '';
  if (!address) throw new GtpError('MISSING_ADDRESS', 'address is required', 400);
  if (!VALID_DEV_TYPES.has(developmentType)) {
    throw new GtpError('INVALID_DEVELOPMENT_TYPE', `developmentType must be one of: ${[...VALID_DEV_TYPES].join(', ')}`, 400);
  }
  return {
    address,
    developmentType: developmentType as GtpRequest['developmentType'],
    scale: typeof b.scale === 'string' ? b.scale : undefined,
    siteDescription: typeof b.siteDescription === 'string' ? b.siteDescription : undefined,
    clientName: typeof b.clientName === 'string' ? b.clientName : undefined,
    projectReference: typeof b.projectReference === 'string' ? b.projectReference : undefined,
  };
}

async function buildGtp(req: GtpRequest): Promise<GtpContent> {
  const geocode = await geocodeAddress(req.address);
  const councilMatch = findCouncilForLocation(geocode, geocode.suburb);
  const transport = await getTransportInfrastructure(geocode.lat, geocode.lon);
  return generateGtpContent(req, geocode, councilMatch, transport);
}

app.get('/api/councils', (_req, res) => {
  res.json({ mockMode: MOCK, councils: listCouncils() });
});

app.post('/api/generate', async (req, res) => {
  try {
    const gtpRequest = parseGtpRequest(req.body);
    const gtp = await buildGtp(gtpRequest);
    res.json({ mockMode: MOCK, gtp });
  } catch (e) {
    const err = e instanceof GtpError ? e : new GtpError('INTERNAL_ERROR', e instanceof Error ? e.message : 'Unknown error', 500);
    res.status(err.status).json({ error: err.message, code: err.code });
  }
});

// Renders whatever GtpContent the client sends — this is the export step of
// the "review/edit before export" flow: the frontend calls /api/generate
// first, lets the consultant edit the result, then posts the (possibly
// edited) content here rather than us silently regenerating and exporting.
app.post('/api/generate/docx', async (req, res) => {
  try {
    const gtp = req.body?.gtp as GtpContent | undefined;
    if (!gtp || !gtp.meta) {
      throw new GtpError('MISSING_GTP', 'Request body must include the { gtp } content to export (call /api/generate first).', 400);
    }
    const buffer = renderGtpDocx(gtp);
    const filename = `GTP-Draft-${(gtp.meta.address || 'site').replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    const err = e instanceof GtpError ? e : new GtpError('INTERNAL_ERROR', e instanceof Error ? e.message : 'Unknown error', 500);
    res.status(err.status).json({ error: err.message, code: err.code });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'dist')));
}

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`GIW GTP generator listening on http://localhost:${PORT} ${MOCK ? '[DEMO/MOCK DATA MODE]' : '[LIVE DATA MODE]'}`);
  });
}

export { app };
