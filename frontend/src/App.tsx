import { useState } from 'react';
import { GtpForm } from './GtpForm';
import { GtpReview } from './GtpReview';
import { generateGtp, exportDocx, ApiError } from './api';
import type { GtpContent, GtpRequest } from './types';

type Screen = { kind: 'form' } | { kind: 'review'; gtp: GtpContent; mockMode: boolean };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'form' });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleGenerate(request: GtpRequest) {
    setGenerating(true);
    setGenerateError(null);
    try {
      const { gtp, mockMode } = await generateGtp(request);
      setScreen({ kind: 'review', gtp, mockMode });
    } catch (e) {
      setGenerateError(e instanceof ApiError ? e.message : 'Something went wrong generating the draft — try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleExport(gtp: GtpContent) {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportDocx(gtp);
      const filename = `GTP-Draft-${gtp.meta.address.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.docx`;
      downloadBlob(blob, filename);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'Export failed — try again.');
    } finally {
      setExporting(false);
    }
  }

  if (screen.kind === 'review') {
    return (
      <div className="app-shell">
        <GtpReview
          gtp={screen.gtp}
          mockMode={screen.mockMode}
          onExport={handleExport}
          exporting={exporting}
          exportError={exportError}
          onStartOver={() => setScreen({ kind: 'form' })}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <GtpForm onSubmit={handleGenerate} submitting={generating} error={generateError} />
    </div>
  );
}
