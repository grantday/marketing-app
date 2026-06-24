import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, downloadApi } from '../api';import { useEventStream } from '../hooks/useEventStream';

interface Recipient {
  id: string;
  status: string;
  variantLabel: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  contact: { name: string | null; phoneE164: string };
}

interface AbTestInfo {
  enabled?: boolean;
  winner?: 'A' | 'B' | null;
  rateA?: number;
  rateB?: number;
  winnerMetric?: string;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  abTestJson?: AbTestInfo | null;
  template: { metaName: string; bodyPreview: string };  list: { name: string };
  stats: {
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  };
  recipients: Recipient[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function statusChip(s: string) {
  const map: Record<string, string> = {
    Queued: 'chip-default',
    Sent: 'chip-info',
    Delivered: 'chip-primary',
    Read: 'chip-success',
    Failed: 'chip-danger',
    Skipped: 'chip-warning',
  };
  return <span className={`chip ${map[s] || 'chip-default'}`}>{s}</span>;
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    if (id) api<CampaignDetail>(`/campaigns/${id}?page=${page}&limit=50`).then(setCampaign);
  }, [id, page]);

  useEffect(() => { load(); }, [load]);
  useEventStream(load);

  const action = async (path: string) => {
    await api(`/campaigns/${id}/${path}`, { method: 'POST' });
    load();
  };

  if (!campaign) return <p>Loading…</p>;

  return (
    <div>
      <Link to="/campaigns">← Campaigns</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="muted">{campaign.template.metaName} → {campaign.list.name}</p>
        </div>
        <div className="gap-4">
          {campaign.status === 'Sending' && (
            <button type="button" className="btn btn-ghost" onClick={() => action('pause')}>Pause</button>
          )}
          {campaign.status === 'Paused' && (
            <button type="button" className="btn btn-primary" onClick={() => action('resume')}>Resume</button>
          )}
          {['Draft', 'Scheduled', 'Sending', 'Paused'].includes(campaign.status) && (
            <button type="button" className="btn btn-danger" onClick={() => action('cancel')}>Cancel</button>
          )}
          <a className="btn btn-accent" href="#" onClick={(e) => { e.preventDefault(); downloadApi(`/campaigns/${id}/export`, `campaign-${id}.csv`); }}>
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid-4 mb-4">
        <div className="card stat-card">
          <div className="stat-value">{campaign.stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{campaign.stats.sent}</div>
          <div className="stat-label">Sent</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{campaign.stats.delivered}</div>
          <div className="stat-label">Delivered</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{campaign.stats.read}</div>
          <div className="stat-label">Read</div>
        </div>
      </div>

      <p>
        Status: <strong>{campaign.status}</strong>
        {' · '}
        Failed: {campaign.stats.failed} · Skipped: {campaign.stats.skipped}
      </p>

      {campaign.abTestJson?.enabled && (
        <div className="card mb-4">
          <h2 className="section-title">A/B test</h2>
          {campaign.abTestJson.winner ? (
            <p>
              Winner: <strong>Variant {campaign.abTestJson.winner}</strong>
              {' '}({campaign.abTestJson.winnerMetric ?? 'read'} rate — A: {campaign.abTestJson.rateA ?? 0}%, B: {campaign.abTestJson.rateB ?? 0}%)
            </p>
          ) : (
            <p className="muted">Test in progress — winner is picked automatically when the campaign completes.</p>
          )}
        </div>
      )}

      <div className="card table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Phone</th>
              {campaign.abTestJson?.enabled && <th>Variant</th>}
              <th>Status</th>
              <th>Sent</th>
              <th>Delivered</th>
              <th>Read</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {campaign.recipients.map((r) => (
              <tr key={r.id}>
                <td>{r.contact.name || '—'}</td>
                <td><code>{r.contact.phoneE164}</code></td>
                {campaign.abTestJson?.enabled && <td><span className="chip chip-info">{r.variantLabel ?? 'A'}</span></td>}
                <td>{statusChip(r.status)}</td>
                <td className="muted">{r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}</td>
                <td className="muted">{r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : '—'}</td>
                <td className="muted">{r.readAt ? new Date(r.readAt).toLocaleString() : '—'}</td>
                <td className="muted">{r.errorMessage || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaign.pagination.pages > 1 && (
          <div className="gap-4 mt-4" style={{ display: 'flex', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="muted">Page {page} of {campaign.pagination.pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= campaign.pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
