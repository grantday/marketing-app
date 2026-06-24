import { useEffect, useState } from 'react';
import { api } from '../api';

interface Template {
  id: string;
  metaName: string;
  language: string;
  category: string | null;
  bodyPreview: string;
  status: string;
  variableCount: number;
  syncedAt: string | null;
}

function statusChip(s: string) {
  const map: Record<string, string> = {
    Approved: 'chip-success',
    Pending: 'chip-warning',
    Rejected: 'chip-danger',
  };
  return <span className={`chip ${map[s] || 'chip-default'}`}>{s}</span>;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [submitForm, setSubmitForm] = useState({ name: '', bodyText: '', category: 'MARKETING' });
  const [submitMsg, setSubmitMsg] = useState('');

  const load = () => api<Template[]>('/templates').then(setTemplates);
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await api('/templates/sync', { method: 'POST' });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const submitToMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMsg('');
    try {
      await api('/templates/submit', { method: 'POST', body: JSON.stringify(submitForm) });
      setSubmitMsg('Submitted for Meta review. Sync after approval.');
      setSubmitForm({ name: '', bodyText: '', category: 'MARKETING' });
      await load();
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Message Templates</h1>
        <button type="button" className="btn btn-primary" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync from Meta'}
        </button>
      </div>
      <p className="muted mb-4">
        Templates must be approved in Meta Business Manager before use in campaigns.
        Marketing messages require MARKETING category templates outside the 24-hour window.
      </p>

      <div className="card mb-4">
        <h2 className="section-title">Submit new template to Meta</h2>
        <form onSubmit={submitToMeta} className="grid-2">
          <div className="form-group"><label>Name</label><input value={submitForm.name} onChange={(e) => setSubmitForm((f) => ({ ...f, name: e.target.value }))} required placeholder="welcome_offer" /></div>
          <div className="form-group">
            <label>Category</label>
            <select value={submitForm.category} onChange={(e) => setSubmitForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Body text</label>
            <textarea rows={3} value={submitForm.bodyText} onChange={(e) => setSubmitForm((f) => ({ ...f, bodyText: e.target.value }))} required placeholder="Hello {{1}}, thanks for contacting us." />
          </div>
          <button type="submit" className="btn btn-accent">Submit to Meta</button>
        </form>
        {submitMsg && <p className="muted mt-2">{submitMsg}</p>}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Language</th>
              <th>Category</th>
              <th>Status</th>
              <th>Variables</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr><td colSpan={6} className="muted">No templates. Connect WhatsApp and sync.</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td><code>{t.metaName}</code></td>
                  <td>{t.language}</td>
                  <td>{t.category || '—'}</td>
                  <td>{statusChip(t.status)}</td>
                  <td>{t.variableCount}</td>
                  <td style={{ maxWidth: 300 }} className="muted">{t.bodyPreview}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
