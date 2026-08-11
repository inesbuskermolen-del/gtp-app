import { useMemo, useState } from 'react';
import type { GtpContent, TransportItem } from './types';
import { ACTION_CATEGORY_LABELS } from './types';

interface Props {
  gtp: GtpContent;
  mockMode: boolean;
  onExport: (gtp: GtpContent) => void;
  exporting: boolean;
  exportError: string | null;
  onStartOver: () => void;
}

type ActionState = Record<string, { text: string; included: boolean }[]>;

function transportRows(items: TransportItem[], radiusM: number, emptyLabel: string) {
  if (!items.length) {
    return <p className="muted">No {emptyLabel} identified within the {radiusM}m search radius — confirm manually.</p>;
  }
  return (
    <table className="transport-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Distance</th>
          <th>Walk time</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t, i) => (
          <tr key={i}>
            <td>{t.name}</td>
            <td>{t.distanceLabel}</td>
            <td>~{t.walkMinutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GtpReview({ gtp, mockMode, onExport, exporting, exportError, onStartOver }: Props) {
  const [summary, setSummary] = useState(gtp.summary);
  const [introduction, setIntroduction] = useState(gtp.introduction);
  const [subjectSiteNarrative, setSubjectSiteNarrative] = useState(gtp.subjectSiteNarrative);
  const [policyNarrative, setPolicyNarrative] = useState(gtp.policyNarrative);
  const [monitoringAndReporting, setMonitoringAndReporting] = useState(gtp.monitoringAndReporting);
  const [targets, setTargets] = useState(gtp.targets.map((t) => ({ ...t })));
  const [actions, setActions] = useState<ActionState>(() => {
    const init: ActionState = {};
    for (const [cat, items] of Object.entries(gtp.actionsByCategory)) {
      init[cat] = items.map((item) => ({ text: item.priority ? `[Priority] ${item.text}` : item.text, included: true }));
    }
    return init;
  });

  const categories = useMemo(() => Object.keys(gtp.actionsByCategory), [gtp.actionsByCategory]);

  function updateTargetText(index: number, text: string) {
    setTargets((prev) => prev.map((t, i) => (i === index ? { ...t, text } : t)));
  }

  function updateActionText(category: string, index: number, text: string) {
    setActions((prev) => ({
      ...prev,
      [category]: prev[category].map((a, i) => (i === index ? { ...a, text } : a)),
    }));
  }

  function toggleAction(category: string, index: number) {
    setActions((prev) => ({
      ...prev,
      [category]: prev[category].map((a, i) => (i === index ? { ...a, included: !a.included } : a)),
    }));
  }

  function handleExport() {
    const edited: GtpContent = {
      ...gtp,
      summary,
      introduction,
      subjectSiteNarrative,
      policyNarrative,
      monitoringAndReporting,
      targets: targets.map((t) => ({ ...t, text: t.text })),
      actionsByCategory: Object.fromEntries(
        Object.entries(actions).map(([cat, items]) => [
          cat,
          items.filter((a) => a.included).map((a) => ({ category: cat, text: a.text.replace(/^\[Priority\]\s*/, ''), score: 0, priority: a.text.startsWith('[Priority]') })),
        ])
      ),
    };
    onExport(edited);
  }

  return (
    <div className="gtp-review">
      {mockMode && <p className="banner banner-info">Demo mode — this draft was built from a recorded fixture, not live data.</p>}
      <div className="review-header">
        <div>
          <h1>{gtp.meta.address}</h1>
          <p className="muted">
            Proposed {gtp.meta.developmentTypeLabel} development{gtp.meta.scale ? ` — ${gtp.meta.scale}` : ''}
          </p>
        </div>
        <button type="button" className="secondary" onClick={onStartOver}>
          Start over
        </button>
      </div>

      <div className="banner banner-draft">
        AUTOMATICALLY GENERATED DRAFT — review and edit every section below before exporting. Nothing here has been
        checked by a qualified consultant.
      </div>

      <section>
        <h2>Council match</h2>
        <p>
          <strong>{gtp.meta.council.name}</strong> ({gtp.meta.council.profileDepth === 'detailed' ? 'detailed profile' : 'generic Clause 18 fallback'})
          {gtp.meta.matchedLgaName ? ` — matched via LGA boundary: ${gtp.meta.matchedLgaName}` : ''}
        </p>
        <p className="muted">Match confidence: {gtp.meta.matchConfidence}</p>
        {gtp.meta.matchConfidence !== 'lga-polygon-matched' && (
          <p className="warning">
            This address wasn't matched via a real LGA boundary polygon — double-check the council before relying on
            its priorities.
          </p>
        )}
      </section>

      <section>
        <h2>Summary</h2>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} />
      </section>

      <section>
        <h2>Introduction</h2>
        <textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} rows={5} />
      </section>

      <section>
        <h2>Subject Site</h2>
        <textarea value={subjectSiteNarrative} onChange={(e) => setSubjectSiteNarrative(e.target.value)} rows={4} />
      </section>

      <section>
        <h2>Existing Transport Infrastructure</h2>
        {gtp.transport._error && <p className="warning">{gtp.transport._error}</p>}
        <h3>Train</h3>
        {transportRows(gtp.transport.train, gtp.transport.searchRadiusM, 'train station')}
        <h3>Tram</h3>
        {transportRows(gtp.transport.tram, gtp.transport.searchRadiusM, 'tram stop')}
        <h3>Bus</h3>
        {transportRows(gtp.transport.bus, gtp.transport.searchRadiusM, 'bus stop')}
        <h3>Car Share</h3>
        {transportRows(gtp.transport.carShare, gtp.transport.searchRadiusM, 'car share pod')}
        <p className="muted">
          {gtp.transport.cyclingInfraCount} mapped cycling-related way(s) within {gtp.transport.searchRadiusM}m. Indicative
          walkability (this tool's own OSM-based proxy, not the commercial Walk Score® product): {gtp.transport.indicativeWalkability}/100.
        </p>
      </section>

      <section>
        <h2>Relevant Policies &amp; Planning</h2>
        <textarea value={policyNarrative} onChange={(e) => setPolicyNarrative(e.target.value)} rows={10} />
      </section>

      <section>
        <h2>Targets</h2>
        {targets.map((t, i) => (
          <div key={i} className="target-row">
            <textarea value={t.text} onChange={(e) => updateTargetText(i, e.target.value)} rows={2} />
            <span className={`tag ${t.sourced ? 'tag-sourced' : 'tag-indicative'}`}>{t.sourced ? t.source : 'indicative'}</span>
          </div>
        ))}
      </section>

      <section>
        <h2>Actions</h2>
        <p className="muted">
          Grouped and ordered by base action-library category; items are weighted by {gtp.meta.council.name}'s transport
          priorities. Uncheck anything not relevant to this development.
        </p>
        {categories.map((cat) => (
          <div key={cat} className="action-category">
            <h3>{ACTION_CATEGORY_LABELS[cat] || cat}</h3>
            {actions[cat].map((a, i) => (
              <label key={i} className="action-item">
                <input type="checkbox" checked={a.included} onChange={() => toggleAction(cat, i)} />
                <input
                  type="text"
                  value={a.text}
                  onChange={(e) => updateActionText(cat, i, e.target.value)}
                  disabled={!a.included}
                />
              </label>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2>Monitoring and Reporting</h2>
        <textarea value={monitoringAndReporting} onChange={(e) => setMonitoringAndReporting(e.target.value)} rows={4} />
      </section>

      {exportError && <p className="error">{exportError}</p>}

      <button type="button" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export .docx'}
      </button>
    </div>
  );
}
