import { useState } from 'react';
import type { DevelopmentType, GtpRequest } from './types';
import { DEVELOPMENT_TYPE_OPTIONS } from './types';

interface Props {
  onSubmit: (request: GtpRequest) => void;
  submitting: boolean;
  error: string | null;
}

export function GtpForm({ onSubmit, submitting, error }: Props) {
  const [address, setAddress] = useState('');
  const [developmentType, setDevelopmentType] = useState<DevelopmentType>('residential');
  const [scale, setScale] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectReference, setProjectReference] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      address: address.trim(),
      developmentType,
      scale: scale.trim() || undefined,
      siteDescription: siteDescription.trim() || undefined,
      clientName: clientName.trim() || undefined,
      projectReference: projectReference.trim() || undefined,
    });
  }

  return (
    <form className="gtp-form" onSubmit={handleSubmit}>
      <h1>GIW Green Travel Plan generator</h1>
      <p className="lede">
        Generates a draft Green Travel Plan from a site address and a few development details. The result is a
        starting point for a consultant to review, not a finished document — see the draft banner in the exported
        file.
      </p>

      <label>
        Site address <span className="required">*</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="1 Swan Street, Richmond VIC 3121"
          required
        />
      </label>

      <label>
        Development type <span className="required">*</span>
        <select value={developmentType} onChange={(e) => setDevelopmentType(e.target.value as DevelopmentType)}>
          {DEVELOPMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Scale
        <input type="text" value={scale} onChange={(e) => setScale(e.target.value)} placeholder="e.g. 120 dwellings, 8 storeys" />
      </label>

      <label>
        Site description (optional)
        <textarea
          value={siteDescription}
          onChange={(e) => setSiteDescription(e.target.value)}
          placeholder="Any additional context about the current site, e.g. existing use, notable constraints"
          rows={3}
        />
      </label>

      <div className="form-row">
        <label>
          Client name (optional)
          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </label>
        <label>
          Project reference (optional)
          <input type="text" value={projectReference} onChange={(e) => setProjectReference(e.target.value)} placeholder="GIW00000" />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={submitting || !address.trim()}>
        {submitting ? 'Generating…' : 'Generate draft GTP'}
      </button>
    </form>
  );
}
