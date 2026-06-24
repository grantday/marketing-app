import { useEffect, useState } from 'react';
import { api } from '../api';

interface StatusResponse {
  status: string;
  version: string;
  latencyMs: number;
  checks: Record<string, string>;
  tenants: number;
  timestamp: string;
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="login-page">
      <div className="card" style={{ maxWidth: 520, width: '100%' }}>
        <h1 className="page-title">Reach Status</h1>
        {!status && <p className="muted">Loading…</p>}
        {status && (
          <>
            <p>
              Overall:{' '}
              <span className={`chip ${status.status === 'operational' ? 'chip-success' : 'chip-warning'}`}>
                {status.status}
              </span>
            </p>
            <table className="mt-4">
              <tbody>
                {Object.entries(status.checks).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td><code>{v}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted mt-4" style={{ fontSize: '0.85rem' }}>
              v{status.version} · {status.tenants} tenants · {status.latencyMs}ms · {new Date(status.timestamp).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
