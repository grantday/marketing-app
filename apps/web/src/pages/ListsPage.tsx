import { useEffect, useState } from 'react';
import { api } from '../api';

interface List {
  id: string;
  name: string;
  description: string | null;
  filterTags: string[];
  optInOnly: boolean;
  memberCount: number;
}

interface ListContact {
  id: string;
  name: string | null;
  phoneE164: string;
  optInStatus: string;
}

interface ListDetail {
  id: string;
  name: string;
  contacts: ListContact[];
}

interface ContactOption {
  id: string;
  name: string | null;
  phoneE164: string;
}

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listDetail, setListDetail] = useState<ListDetail | null>(null);
  const [allContacts, setAllContacts] = useState<ContactOption[]>([]);
  const [addContactIds, setAddContactIds] = useState('');
  const [form, setForm] = useState({ name: '', description: '', optInOnly: true, filterTags: '' });

  const loadLists = () => api<List[]>('/lists').then(setLists);

  useEffect(() => { loadLists(); }, []);

  useEffect(() => {
    if (selectedListId) {
      api<ListDetail>(`/lists/${selectedListId}`).then(setListDetail);
    } else setListDetail(null);
  }, [selectedListId]);

  const openMembers = async (id: string) => {
    setSelectedListId(id);
    const res = await api<{ items: ContactOption[] }>('/contacts?limit=200');
    setAllContacts(res.items);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.filterTags.split(',').map((t) => t.trim()).filter(Boolean);
    await api('/lists', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        optInOnly: form.optInOnly,
        filterTags: tags,
      }),
    });
    setForm({ name: '', description: '', optInOnly: true, filterTags: '' });
    loadLists();
  };

  const buildFromFilter = async (id: string) => {
    const res = await api<{ count: number }>(`/lists/${id}/build-from-filter`, { method: 'POST' });
    alert(`Built list with ${res.count} contacts`);
    loadLists();
    if (selectedListId === id) openMembers(id);
  };

  const addMembers = async () => {
    if (!selectedListId || !addContactIds.trim()) return;
    const contactIds = addContactIds.split(/[,;\s]+/).filter(Boolean);
    await api(`/lists/${selectedListId}/members`, {
      method: 'POST',
      body: JSON.stringify({ contactIds }),
    });
    setAddContactIds('');
    openMembers(selectedListId);
    loadLists();
  };

  const removeMember = async (contactId: string) => {
    if (!selectedListId) return;
    await api(`/lists/${selectedListId}/members/${contactId}`, { method: 'DELETE' });
    openMembers(selectedListId);
    loadLists();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this list?')) return;
    await api(`/lists/${id}`, { method: 'DELETE' });
    if (selectedListId === id) setSelectedListId(null);
    loadLists();
  };

  return (
    <div>
      <h1 className="page-title">Contact Lists</h1>
      <p className="muted mb-4">Audiences for campaigns. Manage members or build from tag filters.</p>

      <div className="grid-2">
        <div>
          <div className="card mb-4">
            <h2 className="section-title">Create list</h2>
            <form onSubmit={create}>
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Filter tags (comma-separated)</label>
                <input value={form.filterTags} onChange={(e) => setForm((f) => ({ ...f, filterTags: e.target.value }))} placeholder="stage:Compliant" />
              </div>
              <button type="submit" className="btn btn-accent">Create list</button>
            </form>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Members</th><th></th></tr>
              </thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id} style={{ background: selectedListId === l.id ? '#eff6ff' : undefined }}>
                    <td><strong>{l.name}</strong></td>
                    <td>{l.memberCount}</td>
                    <td>
                      <button type="button" className="btn btn-ghost" onClick={() => openMembers(l.id)}>Members</button>
                      <button type="button" className="btn btn-ghost" onClick={() => buildFromFilter(l.id)}>Build</button>
                      <button type="button" className="btn btn-ghost" onClick={() => remove(l.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">{listDetail ? `${listDetail.name} — members` : 'Select a list'}</h2>
          {listDetail && (
            <>
              <div className="form-group">
                <label>Add contact IDs (comma-separated)</label>
                <textarea
                  rows={2}
                  value={addContactIds}
                  onChange={(e) => setAddContactIds(e.target.value)}
                  placeholder="uuid1, uuid2 or pick from below"
                />
                <button type="button" className="btn btn-primary mt-4" onClick={addMembers}>Add members</button>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Quick add — click a contact:</p>
              <div style={{ maxHeight: 120, overflow: 'auto', marginBottom: '1rem' }}>
                {allContacts.slice(0, 30).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn btn-ghost"
                    style={{ margin: '2px', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    onClick={() => setAddContactIds((ids) => (ids ? `${ids},${c.id}` : c.id))}
                  >
                    {c.name || c.phoneE164}
                  </button>
                ))}
              </div>
              <table>
                <thead><tr><th>Name</th><th>Phone</th><th>Opt-in</th><th></th></tr></thead>
                <tbody>
                  {listDetail.contacts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name || '—'}</td>
                      <td><code>{c.phoneE164}</code></td>
                      <td>{c.optInStatus}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" onClick={() => removeMember(c.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
