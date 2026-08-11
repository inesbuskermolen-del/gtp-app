# GIW Green Travel Plan generator

Generates a draft Green Travel Plan (GTP) — matching GIW Environmental
Solutions' branded `.docx` template — from a site address and a few
development details. It geocodes the address, matches it to a Victorian
council (LGA) via real boundary polygons, pulls nearby transport
infrastructure from OpenStreetMap, tunes the action checklist and targets to
that council's published transport priorities, and lets a consultant review
and edit the draft in the browser before exporting.

**This produces a first-draft starting point, not a finished document.**
Every exported `.docx` carries a draft banner and distinguishes
council-sourced targets from indicative placeholders — see
[Known limitations](#known-limitations) before relying on it for a real
submission.

## Project structure

```
backend/            Node + TypeScript + Express + Prisma API
  src/
    geocode.ts          Nominatim address -> lat/lon/suburb, cached
    overpass.ts          Overpass API -> nearby transport/cycling infra, cached
    lga/                 ABS LGA boundary polygons + point-in-polygon council matching
    councilLookup.ts     polygon match -> suburb-list fallback -> generic
    gtpGenerator.ts       combines everything into the GTP content structure
    docx/
      template.docx         the docxtemplater merge-tag version of GIW's real template
      fillTemplate.ts        renders GTP content into that template
    server.ts             Express API
  data/
    councils.json         council priority profiles (6 detailed + 1 generic fallback)
    actions.json           base action checklist, tagged by category
  test/                  Vitest unit + live-API integration tests
frontend/            React + TypeScript + Vite — form, editable review screen, export
templates/
  source-template.docx  unmodified copy of GIW's real template (provenance reference)
  build-template.py     regenerates backend/src/docx/template.docx from the source
```

## Running it

```bash
# Backend
cd backend
npm install
cp .env.example .env
npm run prisma:migrate   # first time only — creates the local SQLite cache db
npm run demo              # mock data, no network — http://localhost:3001
npm start                 # live Nominatim/Overpass calls (via `npm run dev` for watch mode)

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env      # VITE_API_BASE, defaults to http://localhost:3001
npm run dev                # http://localhost:5173
```

No API keys are required — geocoding (Nominatim) and transport data
(Overpass) are both free, public OpenStreetMap services.

## Testing

```bash
cd backend
npm test        # unit tests: council/LGA matching, action weighting, docx export
npm run test:live   # hits real Nominatim + Overpass for a handful of real addresses
```

## How to add a new council profile

Only 6 of ~31 metro Melbourne councils have a detailed, sourced transport-
priority profile (Yarra, Melbourne, Port Phillip, Stonnington, Boroondara,
Merri-bek); every other address falls back to the generic, state-wide
Clause 18 (Transport) profile. To add one:

1. Research that council's current transport strategy / climate action plan
   (their own published PDFs — search "`<council name>` transport strategy"
   or check their website's strategies & policies section).
2. Add an entry to `backend/data/councils.json` following the shape of an
   existing "detailed" entry: `visionStatement`, `strategicPriorities`,
   `quantifiedTargets` (mark anything not an explicit published number as
   directional, not numeric), `sourceDocuments` (title + URL — every
   priority/target must be traceable to a real source), `actionWeights` (one
   multiplier 0.5–2.0 per category in `actionCategories`, higher = more
   emphasis), `policyNarrative` (2–4 sentences summarising what a GTP in this
   council should emphasise and why).
3. Set `lgaNames` to the exact ABS LGA name(s) this council corresponds to —
   check `backend/src/lga/boundaries.geojson`'s `lga_name` property or query
   the ABS ArcGIS service directly (see below) to get the exact spelling.
4. Keep `suburbs` populated too — it's the fallback used only when a point
   doesn't land inside any loaded LGA polygon (rare: outside Victoria, or a
   coastline/data-gap edge case).
5. Add a `generatedNote`-style comment noting when you researched it —
   councils republish transport strategies every few years, so profiles go
   stale. Re-verify before relying on an old profile.

## How the docx export works

`backend/src/docx/template.docx` is **not** hand-written — it's generated
from GIW's real template (`templates/source-template.docx`) by
`templates/build-template.py`, which replaces the template's bracketed
placeholders (`[Project Address]`, `[Client]`, etc.) and boilerplate
narrative paragraphs with [docxtemplater](https://docxtemplater.com/) merge
tags, converts the action-checklist and transport tables into loop
templates, and inserts a draft-disclaimer banner and a live car-share-pods
table. `backend/src/docx/fillTemplate.ts` then fills that template with the
generated `GtpContent` at request time.

**If GIW sends an updated template:**

1. Replace `templates/source-template.docx` with the new file.
2. Re-run `python templates/build-template.py` (needs `python-docx` —
   `pip install python-docx`).
3. Read the script's console output for `WARNING:` lines — they mean a
   placeholder/paragraph/table the script expects to find has moved or
   changed wording, and the corresponding line in `build-template.py` needs
   updating to match.
4. Re-run the backend test suite (`npm test`, specifically
   `docxExport.test.ts`) and generate a real draft to eyeball before
   trusting the new template.

This approach (docxtemplater filling the *actual* template) was chosen over
recreating the template from scratch with the `docx` npm package because it
guarantees pixel-perfect fidelity — including the two-section header/footer
split and the branded Flexicar/GoGet/GreenShareCar car-share callouts —
without hand-matching GIW's styling. The tradeoff: structural changes to the
source template (not just wording) require updating `build-template.py`'s
paragraph/table-index assumptions, not just re-running it blind.

## Known limitations

- **Only 6 councils have a detailed profile.** Every other Victorian
  address gets the generic Clause 18 fallback, clearly flagged in the
  output as `lga-matched-no-detailed-profile` (real LGA identified, no
  researched priorities yet) or `no-match-generic-fallback` (couldn't
  place it in a Victorian LGA at all — e.g. outside Victoria).
- **LGA boundaries are ABS ASGS2024 (CC BY 4.0), not VicMap Admin.** Both
  are reasonable authoritative sources; ABS's was used because it's
  queryable without an API key via their public ArcGIS FeatureServer. LGA
  boundaries and council names/amalgamations do change — re-fetch
  `backend/src/lga/boundaries.geojson` periodically (see comment at the top
  of `backend/src/lga/boundaries.ts` for the exact query used).
- **No strict OOXML schema validator was available in this build
  environment.** Validation here means: docxtemplater renders without
  error, every XML part in the output zip parses as well-formed XML
  (checked in `docxExport.test.ts`), and a real Word open was NOT
  performed as part of this build — do that before trusting a new template
  version or a structural `build-template.py` change.
- **OSM transport/cycling/car-share coverage is inconsistent** — good in
  inner suburbs, patchier further out. `overpass.ts` surfaces a live
  lookup failure honestly (`_error` field, rendered as a "confirm manually"
  note) rather than showing zero results as if that were confirmed.
- **No Walk Score® integration** — the "indicative walkability" figure is
  this tool's own rough OSM-density proxy, explicitly labelled as such
  everywhere it appears. Wiring up a real Walk Score/Google Places key
  would be a feature flag on top of `overpass.ts`, not built here.
- **Action-category section order is fixed** to match the original
  template's layout (Walking, Cycling, End of Trip, Public Transport,
  Carpooling & Car Share, Car Parking, Travel for Work, Management) rather
  than reordering whole sections by council emphasis — within each section,
  items are council-weighted and the top-scoring ones are flagged
  `[Priority]`, but the *category order itself* doesn't move. Reordering
  sections would need restructuring the merge template beyond what this
  build did.
- **No persisted draft history.** Review/edit happens in browser state
  between "Generate" and "Export .docx" — there's no save-and-resume across
  sessions. The Prisma/SQLite (dev) database that exists is only used to
  cache Nominatim/Overpass responses.

## Deployment

Matches GIW's existing `esd-review-portal` pattern: frontend on GitHub
Pages, backend on Render. See `render.yaml` (backend + Postgres) and
`.github/workflows/deploy-frontend.yml` (frontend). Both are prepared but
not deployed as part of this build — deploying requires GIW's GitHub/Render
account access.

To switch the backend's Prisma datasource from local SQLite to Render
Postgres for production: edit `backend/prisma/schema.prisma`'s `provider`
to `"postgresql"`, point `DATABASE_URL` at the Render instance, and re-run
`npm run prisma:migrate`.
