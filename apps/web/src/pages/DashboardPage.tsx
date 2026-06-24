import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Dashboard {
  contacts: { total: number; optedIn: number; optedOut: number };
  campaigns: { active: number; recent: { id: string; name: string; status: string }[] };
  inbox: { unread: number };
  performance: { totalSent: number; deliveryRate: number; readRate: number };
  whatsapp: { connected: boolean; webhookVerified: boolean };
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>('/analytics/dashboard').then(setData).catch(console.error);
  }, []);

  if (!data) return <p>Loading dashboard…</p>;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {!data.whatsapp.connected && (
        <div className="alert alert-warning mb-4">
          WhatsApp is not connected. <Link to="/setup">Complete setup</Link> to start sending campaigns.
        </div>
      )}

      <div className="grid-4 mb-4">
        <div className="card stat-card">
          <div className="stat-value">{data.contacts.total}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.contacts.optedIn}</div>
          <div className="stat-label">Opted in</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.inbox.unread}</div>
          <div className="stat-label">Unread conversations</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{data.campaigns.active}</div>
          <div className="stat-label">Active campaigns</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Campaign performance</h2>
          <p><strong>{data.performance.totalSent}</strong> messages sent</p>
          <p>Delivery rate: <strong>{data.performance.deliveryRate}%</strong></p>
          <p>Read rate: <strong>{data.performance.readRate}%</strong></p>
          <p className="muted">Opted out: {data.contacts.optedOut}</p>
        </div>
        <div className="card">
          <h2 className="section-title">Recent campaigns</h2>
          {data.campaigns.recent.length === 0 ? (
            <p className="muted">No campaigns yet. <Link to="/campaigns">Create one</Link></p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {data.campaigns.recent.map((c) => (
                <li key={c.id}>
                  <Link to={`/campaigns/${c.id}`}>{c.name}</Link> — {c.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
