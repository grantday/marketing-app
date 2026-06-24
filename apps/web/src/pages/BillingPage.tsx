import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  contactLimit: number;
  messageLimit: number;
  description: string;
  stripeEnabled: boolean;
}

interface Usage {
  plan: string;
  planName: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialActive: boolean;
  contactCount: number;
  contactLimit: number;
  messagesUsed: number;
  messageLimit: number;
  stripeConfigured: boolean;
}

export default function BillingPage() {
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState('');

  const load = () => {
    api<{ plans: Plan[] }>('/billing/plans').then((r) => setPlans(r.plans));
    api<Usage>('/billing/usage').then(setUsage);
  };

  useEffect(() => { load(); }, []);

  const checkout = async (planId: string) => {
    setLoading(planId);
    try {
      const res = await api<{ url?: string; devMode?: boolean }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      if (res.url) window.location.href = res.url;
      else {
        alert('Dev mode: plan applied without Stripe.');
        load();
      }
    } finally {
      setLoading('');
    }
  };

  const portal = async () => {
    const res = await api<{ url?: string; devMode?: boolean }>('/billing/portal', { method: 'POST' });
    if (res.url) window.location.href = res.url;
    else alert('Stripe not configured — billing portal unavailable in dev mode.');
  };

  return (
    <div>
      <h1 className="page-title">Billing & usage</h1>
      {params.get('success') && <div className="alert alert-info mb-4">Subscription updated successfully.</div>}
      {params.get('canceled') && <div className="alert alert-warning mb-4">Checkout canceled.</div>}

      {usage && (
        <div className="card mb-4">
          <h2 className="section-title">Current plan: {usage.planName}</h2>
          <div className="grid-3">
            <div><span className="muted">Contacts</span><div><strong>{usage.contactCount}</strong> / {usage.contactLimit}</div></div>
            <div><span className="muted">Messages (period)</span><div><strong>{usage.messagesUsed}</strong> / {usage.messageLimit}</div></div>
            <div><span className="muted">Status</span><div><strong>{usage.subscriptionStatus}</strong></div></div>
          </div>
          {usage.trialActive && usage.trialEndsAt && (
            <p className="muted mt-4">Trial ends {new Date(usage.trialEndsAt).toLocaleDateString()}</p>
          )}
          {usage.stripeConfigured && usage.plan !== 'trial' && (
            <button type="button" className="btn btn-ghost mt-4" onClick={portal}>Manage subscription</button>
          )}
        </div>
      )}

      <div className="grid-3">
        {plans.filter((p) => p.id !== 'trial').map((p) => (
          <div key={p.id} className="card">
            <h3>{p.name}</h3>
            <p className="stat-value">${p.priceMonthly}<span style={{ fontSize: '0.9rem' }}>/mo</span></p>
            <p className="muted">{p.description}</p>
            <ul className="muted" style={{ fontSize: '0.85rem' }}>
              <li>{p.contactLimit.toLocaleString()} contacts</li>
              <li>{p.messageLimit.toLocaleString()} messages/mo</li>
            </ul>
            <button
              type="button"
              className="btn btn-accent mt-4"
              disabled={loading === p.id || usage?.plan === p.id}
              onClick={() => checkout(p.id)}
            >
              {usage?.plan === p.id ? 'Current plan' : loading === p.id ? 'Loading…' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
