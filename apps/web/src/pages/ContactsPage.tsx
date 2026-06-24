import { useEffect, useState } from 'react';
import { api } from '../api';

interface Contact {
  id: string;
  phoneE164: string;
  email: string | null;
  name: string | null;
  tags: string[];
  optInStatus: string;
  source: string | null;
  engagementScore: number;
}

interface TimelineItem {
  id: string;
  channel: string;
  direction: string;
  body: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

function statusChip(status: string) {
  const map: Record<string, string> = {
    OptedIn: 'chip-success',
    OptedOut: 'chip-danger',
    Unknown: 'chip-default',
  };
  return <span className={`chip ${map[status] || 'chip-default'}`}>{status}</span>;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [csv, setCsv] = useState('');
  const [consent, setConsent] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ phone: '', email: '', name: '', optInStatus: 'Unknown' });
  const [message, setMessage] = useState('');
  const [timelineContact, setTimelineContact] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  const load = () => {
    const q = search ? `&q=${encodeURIComponent(search)}` : '';
    api<{ items: Contact[]; pagination: { page: number; pages: number; total: number } }>(
      `/contacts?page=${page}&limit=50${q}`,
    ).then((res) => {
      setContacts(res.items);
      setPages(res.pagination.pages);
    });
  };

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => { load(); }, [search, page]);

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        phoneE164: form.phone,
        email: form.email || undefined,
        name: form.name,
        optInStatus: form.optInStatus,
      }),
    });
    setForm({ phone: '', email: '', name: '', optInStatus: 'Unknown' });
    load();
  };

  const importCsv = async () => {
    if (!consent) {
      setMessage('You must confirm consent before importing.');
      return;
    }
    const res = await api<{ imported: number; skipped: number }>('/contacts/import', {
      method: 'POST',
      body: JSON.stringify({ csv, consentConfirmed: true, defaultOptIn: 'Unknown' }),
    });
    setMessage(`Imported ${res.imported}, skipped ${res.skipped}`);
    setShowImport(false);
    setCsv('');
    load();
  };

  const optOut = async (id: string) => {
    await api(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ optInStatus: 'OptedOut' }),
    });
    load();
  };

  const showTimeline = async (c: Contact) => {
    setTimelineContact(c);
    const res = await api<{ items: TimelineItem[] }>(`/contacts/${c.id}/timeline`);
    setTimeline(res.items);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Contacts</h1>
        <button type="button" className="btn btn-accent" onClick={() => setShowImport(!showImport)}>
          Import CSV
        </button>
      </div>

      {message && <div className="alert alert-info mb-4">{message}</div>}

      {showImport && (
        <div className="card mb-4">
          <h2 className="section-title">Import contacts</h2>
          <p className="muted">CSV columns: phone, whatsapp, name, stage, services</p>
          <div className="form-group">
            <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="phone,name,stage&#10;+263771234567,Tendai,Compliant" />
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I confirm these contacts have consented to receive WhatsApp messages
          </label>
          <button type="button" className="btn btn-primary" onClick={importCsv}>Import</button>
        </div>
      )}

      <div className="card mb-4">
        <h2 className="section-title">Add contact</h2>
        <form onSubmit={addContact} className="gap-4" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="form-group" style={{ minWidth: 120, margin: 0 }}>
            <label>Opt-in</label>
            <select value={form.optInStatus} onChange={(e) => setForm((f) => ({ ...f, optInStatus: e.target.value }))}>
              <option value="Unknown">Unknown</option>
              <option value="OptedIn">OptedIn</option>
              <option value="OptedOut">OptedOut</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      </div>

      <div className="form-group">
        <input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Score</th>
              <th>Tags</th>
              <th>Opt-in</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.name || '—'}</td>
                <td><code>{c.phoneE164}</code></td>
                <td className="muted">{c.email || '—'}</td>
                <td><span className="chip chip-info">{c.engagementScore ?? 0}</span></td>
                <td>{c.tags.join(', ') || '—'}</td>
                <td>{statusChip(c.optInStatus)}</td>
                <td className="muted">{c.source || '—'}</td>
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', marginRight: 4 }} onClick={() => showTimeline(c)}>
                    Timeline
                  </button>
                  {c.optInStatus !== 'OptedOut' && (
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => optOut(c.id)}>
                      Opt out
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="gap-4 mt-4" style={{ display: 'flex', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="muted">Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {timelineContact && (
        <div className="card mt-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="section-title">Timeline — {timelineContact.name || timelineContact.phoneE164}</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setTimelineContact(null)}>Close</button>
          </div>
          <p className="muted">Unified WhatsApp, email, SMS, and campaign touchpoints</p>
          {timeline.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            timeline.map((t) => (
              <div key={t.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span className="chip chip-default">{t.channel}</span>
                <span className="chip chip-default" style={{ marginLeft: 4 }}>{t.direction}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>{new Date(t.createdAt).toLocaleString()}</span>
                <div style={{ marginTop: 4 }}>{t.body}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
