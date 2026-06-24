import { useEffect, useState } from 'react';
import { api, downloadApi } from '../api';

interface SlaReport {
  conversations: number;
  avgFirstResponseMin: number | null;
  avgResolutionMin: number | null;
  slaBreached: number;
  slaBreachRate: number;
  avgCsat: number | null;
  leaderboard: { name: string; handled: number; avgFirstResponseMin: number; slaBreached: number }[];
}

interface Compliance {
  contacts: { total: number; optedIn: number; optedOut: number; unknown: number; optInRate: number };
  complaints: { id: string; message: string; createdAt: string }[];
  optOutsLast30d: number;
  metaChecklist: { item: string; ok: boolean }[];
  ai: { botTotal: number; botResolved: number; resolutionRate: number };
}

export default function ReportsPage() {
  const [sla, setSla] = useState<SlaReport | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);

  useEffect(() => {
    api<SlaReport>('/reports/sla').then(setSla).catch(() => {});
    api<Compliance>('/reports/compliance').then(setCompliance).catch(() => {});
  }, []);

  const exportSla = async () => {
    try {
      await downloadApi('/reports/sla/export', 'reach-sla-report.csv');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    }
  };

  return (
    <div>
      <h1 className="page-title">Reports & Compliance</h1>
      <p className="muted mb-4">SLA performance, agent leaderboard, Meta compliance checklist, and AI bot metrics.</p>

      {sla && (
        <div className="card mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="section-title">SLA (30 days)</h2>
            <button type="button" className="btn btn-ghost" onClick={exportSla}>Export CSV</button>
          </div>
          <div className="grid-3 mb-4">
            <div><span className="muted">Conversations</span><div><strong>{sla.conversations}</strong></div></div>
            <div><span className="muted">Avg first response</span><div><strong>{sla.avgFirstResponseMin ?? '—'} min</strong></div></div>
            <div><span className="muted">Avg resolution</span><div><strong>{sla.avgResolutionMin ?? '—'} min</strong></div></div>
            <div><span className="muted">SLA breaches</span><div><strong className={sla.slaBreachRate > 10 ? 'text-danger' : ''}>{sla.slaBreached} ({sla.slaBreachRate}%)</strong></div></div>
            <div><span className="muted">Avg CSAT</span><div><strong>{sla.avgCsat ?? '—'}</strong></div></div>
          </div>
          <h3 className="section-title">Agent leaderboard</h3>
          <table>
            <thead><tr><th>Agent</th><th>Handled</th><th>Avg FRT (min)</th><th>SLA breached</th></tr></thead>
            <tbody>
              {sla.leaderboard.map((a) => (
                <tr key={a.name}>
                  <td>{a.name}</td>
                  <td>{a.handled}</td>
                  <td>{a.avgFirstResponseMin}</td>
                  <td>{a.slaBreached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compliance && (
        <div className="card mb-4">
          <h2 className="section-title">Compliance dashboard</h2>
          <div className="grid-3 mb-4">
            <div><span className="muted">Opt-in rate</span><div><strong>{compliance.contacts.optInRate}%</strong></div></div>
            <div><span className="muted">Opt-outs (30d)</span><div><strong>{compliance.optOutsLast30d}</strong></div></div>
            <div><span className="muted">AI bot resolution</span><div><strong>{compliance.ai.resolutionRate}%</strong> ({compliance.ai.botResolved}/{compliance.ai.botTotal})</div></div>
          </div>
          <h3 className="section-title">Meta policy checklist</h3>
          <ul>
            {compliance.metaChecklist.map((c) => (
              <li key={c.item} style={{ marginBottom: 4 }}>
                {c.ok ? '✓' : '✗'} {c.item}
              </li>
            ))}
          </ul>
          {compliance.complaints.length > 0 && (
            <>
              <h3 className="section-title mt-4">Recent complaints</h3>
              <table>
                <thead><tr><th>Time</th><th>Message</th></tr></thead>
                <tbody>
                  {compliance.complaints.map((c) => (
                    <tr key={c.id}>
                      <td className="muted">{new Date(c.createdAt).toLocaleString()}</td>
                      <td>{c.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
