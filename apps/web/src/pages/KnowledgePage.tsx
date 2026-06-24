import { useEffect, useState } from 'react';
import { api } from '../api';

interface Article {
  id: string;
  title: string;
  content: string;
  tags: string[];
  active: boolean;
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [form, setForm] = useState({ title: '', content: '', tags: '' });
  const [testQ, setTestQ] = useState('');
  const [testA, setTestA] = useState('');

  const load = () => api<Article[]>('/knowledge').then(setArticles).catch(() => {});

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    });
    setForm({ title: '', content: '', tags: '' });
    load();
  };

  const testBot = async () => {
    const res = await api<{ answer: string; escalated: boolean }>('/ai/test', {
      method: 'POST',
      body: JSON.stringify({ question: testQ }),
    });
    setTestA(res.escalated ? `[Escalate] ${res.answer}` : res.answer);
  };

  return (
    <div>
      <h1 className="page-title">Knowledge Base</h1>
      <p className="muted mb-4">FAQ articles power the AI knowledge bot. Enable AI in Team settings.</p>

      <div className="card mb-4">
        <h2 className="section-title">Add article</h2>
        <form onSubmit={save}>
          <div className="form-group"><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
          <div className="form-group"><label>Content</label><textarea rows={5} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} required /></div>
          <div className="form-group"><label>Tags (comma-separated)</label><input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="pricing, compliance" /></div>
          <button type="submit" className="btn btn-primary">Save article</button>
        </form>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Test AI bot</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} value={testQ} onChange={(e) => setTestQ(e.target.value)} placeholder="Ask a question…" />
          <button type="button" className="btn btn-primary" onClick={testBot} disabled={!testQ}>Test</button>
        </div>
        {testA && <div className="alert alert-info mt-4">{testA}</div>}
      </div>

      <div className="card">
        <h2 className="section-title">Articles ({articles.length})</h2>
        <table>
          <thead><tr><th>Title</th><th>Tags</th><th>Active</th></tr></thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.tags.join(', ')}</td>
                <td>{a.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
