import { useState } from 'react';
import { api } from '../api';

export default function IntegrationsPage() {
  const [csv, setCsv] = useState('');
  const [consent, setConsent] = useState(false);
  const [useApi, setUseApi] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://localhost:3001');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const importLeads = async () => {
    if (!consent) {
      setMessage('Confirm consent before importing.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await api<{ imported: number; skipped: number }>('/integrations/arenarama/import-leads', {
        method: 'POST',
        body: JSON.stringify({
          csv: useApi ? undefined : csv,
          apiUrl: useApi ? apiUrl : undefined,
          consentConfirmed: true,
        }),
      });
      setMessage(`Imported ${res.imported} leads from Arenarama CRM. Skipped ${res.skipped}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Arenarama CRM Import</h1>
      <p className="muted mb-4">
        Pull housing-client leads from Arenarama ERP into Reach contacts. Phone/WhatsApp, stage, and services are mapped to tags.
      </p>

      {message && (
        <div className={`alert ${message.includes('Imported') ? 'alert-success' : 'alert-warning'} mb-4`}>
          {message}
        </div>
      )}

      <div className="card mb-4">
        <h2 className="section-title">Import method</h2>
        <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input type="radio" checked={!useApi} onChange={() => setUseApi(false)} />
          CSV export from Arenarama CRM
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="radio" checked={useApi} onChange={() => setUseApi(true)} />
          Live API (Arenarama running on localhost:3001)
        </label>

        {!useApi ? (
          <div className="form-group">
            <label>CRM export CSV</label>
            <textarea
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="id,name,phone,whatsapp,stage,services&#10;..."
            />
          </div>
        ) : (
          <div className="form-group">
            <label>Arenarama API URL</label>
            <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Requires authenticated session. Set ARENARAMA_API_COOKIE in API .env if needed.
            </p>
          </div>
        )}

        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I confirm these CRM leads have consented to WhatsApp outreach
        </label>

        <button type="button" className="btn btn-accent" onClick={importLeads} disabled={loading}>
          {loading ? 'Importing…' : 'Import leads'}
        </button>
      </div>

      <div className="card">
        <h2 className="section-title">Field mapping</h2>
        <table>
          <thead>
            <tr><th>CRM field</th><th>Reach field</th></tr>
          </thead>
          <tbody>
            <tr><td>phone / whatsapp / mobile</td><td>phoneE164</td></tr>
            <tr><td>name</td><td>name</td></tr>
            <tr><td>stage</td><td>tag: stage:&#123;value&#125;</td></tr>
            <tr><td>services</td><td>tags + customFields</td></tr>
            <tr><td>id</td><td>crmLeadId</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
