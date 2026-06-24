import { useEffect, useState } from 'react';
import { api } from '../api';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
}

interface TrackedLink {
  id: string;
  code: string;
  title: string | null;
  destinationUrl: string;
  clickCount: number;
  shortUrl: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [linkForm, setLinkForm] = useState({ title: '', destinationUrl: '' });
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState('');
  const [whForm, setWhForm] = useState({ name: '', url: '', events: 'message.inbound,contact.created,campaign.completed' });

  const load = () => {
    api<ApiKey[]>('/developer/api-keys').then(setKeys).catch(() => {});
    api<Webhook[]>('/developer/webhooks').then(setWebhooks).catch(() => {});
    api<TrackedLink[]>('/links').then(setLinks).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    const res = await api<{ key: string }>('/developer/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: newKeyName }),
    });
    setCreatedKey(res.key);
    setNewKeyName('');
    load();
  };

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/developer/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: whForm.name,
        url: whForm.url,
        events: whForm.events.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    setWhForm({ name: '', url: '', events: whForm.events });
    load();
  };

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/links', {
      method: 'POST',
      body: JSON.stringify(linkForm),
    });
    setLinkForm({ title: '', destinationUrl: '' });
    load();
  };

  const baseUrl = window.location.origin.replace('5174', '3002');

  return (
    <div>
      <h1 className="page-title">Developer & Integrations</h1>
      <p className="muted mb-4">API keys, outbound webhooks, and Zapier/Make connections.</p>

      <div className="card mb-4">
        <h2 className="section-title">Public API</h2>
        <p className="muted">Base URL: <code>{baseUrl}/api/v1</code></p>
        <p className="muted">Auth: <code>Authorization: Bearer reach_…</code> or <code>X-API-Key</code> header</p>
        <ul className="muted" style={{ marginTop: '0.5rem' }}>
          <li><code>GET /contacts</code> — list contacts</li>
          <li><code>POST /contacts</code> — create/upsert contact</li>
          <li><code>GET /contacts/:id/timeline</code> — unified WhatsApp + email + SMS timeline</li>
          <li><code>GET /messages/recent</code> — recent inbound messages</li>
        </ul>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Zapier / Make</h2>
        <p className="muted">Polling trigger (inbound messages):</p>
        <code style={{ display: 'block', padding: '0.5rem', background: 'var(--surface)' }}>
          GET {baseUrl}/api/v1/zapier/triggers/inbound-message?since=ISO_DATE
        </code>
        <p className="muted mt-2">Actions:</p>
        <ul className="muted">
          <li><code>POST /api/v1/zapier/actions/create-contact</code></li>
          <li><code>POST /api/v1/zapier/actions/start-campaign</code></li>
        </ul>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">API keys</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name" />
          <button type="button" className="btn btn-primary" onClick={createKey} disabled={!newKeyName}>Create key</button>
        </div>
        {createdKey && (
          <div className="alert alert-warning mb-4">
            Copy now — shown once: <code>{createdKey}</code>
          </div>
        )}
        <table>
          <thead><tr><th>Name</th><th>Prefix</th><th>Last used</th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td><code>{k.keyPrefix}…</code></td>
                <td className="muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Tracked links</h2>
        <p className="muted mb-4">Short links with click analytics — use in WhatsApp messages for campaign attribution.</p>
        <form onSubmit={createLink} className="grid-2 mb-4">
          <div className="form-group"><label>Title (optional)</label><input value={linkForm.title} onChange={(e) => setLinkForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div className="form-group"><label>Destination URL</label><input type="url" value={linkForm.destinationUrl} onChange={(e) => setLinkForm((f) => ({ ...f, destinationUrl: e.target.value }))} required /></div>
          <button type="submit" className="btn btn-primary">Create link</button>
        </form>
        <table>
          <thead><tr><th>Title</th><th>Short URL</th><th>Clicks</th></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td>{l.title || '—'}</td>
                <td><code>{l.shortUrl}</code></td>
                <td>{l.clickCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="section-title">Outbound webhooks</h2>
        <form onSubmit={createWebhook} className="grid-2 mb-4">
          <div className="form-group"><label>Name</label><input value={whForm.name} onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="form-group"><label>URL</label><input type="url" value={whForm.url} onChange={(e) => setWhForm((f) => ({ ...f, url: e.target.value }))} required /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Events (comma-separated)</label>
            <input value={whForm.events} onChange={(e) => setWhForm((f) => ({ ...f, events: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary">Add webhook</button>
        </form>
        <table>
          <thead><tr><th>Name</th><th>URL</th><th>Events</th><th>Active</th></tr></thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.url}</td>
                <td>{w.events.join(', ')}</td>
                <td>{w.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
