import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface OnboardingState {
  step: number;
  completed: boolean;
  steps: { id: number; title: string; description: string; done: boolean; current: boolean }[];
  checks: { waConnected: boolean; contactCount: number; campaignCount: number };
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [orgName, setOrgName] = useState('');

  const load = () => api<OnboardingState>('/onboarding').then(setState);

  useEffect(() => { load(); }, []);

  const advance = async (step: number) => {
    await api('/onboarding', { method: 'PATCH', body: JSON.stringify({ step, orgName: orgName || undefined }) });
    await load();
  };

  const finish = async () => {
    await api('/onboarding/complete', { method: 'POST' });
    navigate('/');
  };

  if (!state) return <p>Loading…</p>;
  if (state.completed) {
    navigate('/');
    return null;
  }

  const step = state.step;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 className="page-title">Welcome to Reach</h1>
      <p className="muted mb-4">Complete these steps to send your first WhatsApp campaign.</p>

      <div className="wizard-steps mb-4">
        {state.steps.map((s) => (
          <span key={s.id} className={`wizard-step ${s.current ? 'active' : s.done ? 'done' : ''}`}>
            {s.title}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="card">
          <h2 className="section-title">Confirm your organization</h2>
          <div className="form-group">
            <label>Organization name</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Your company name" />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => advance(1)}>Continue</button>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2 className="section-title">Connect WhatsApp</h2>
          <p className="muted mb-4">Link your Meta Business account via embedded signup or manual token entry.</p>
          <div className="gap-4">
            <Link to="/setup" className="btn btn-accent">Open WhatsApp Setup</Link>
            <button type="button" className="btn btn-ghost" onClick={() => advance(2)} disabled={!state.checks.waConnected}>
              {state.checks.waConnected ? 'Continue' : 'Connect first, then continue'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2 className="section-title">Add contacts</h2>
          <p className="muted mb-4">Import from CRM or add contacts manually ({state.checks.contactCount} so far).</p>
          <div className="gap-4">
            <Link to="/contacts" className="btn btn-accent">Manage contacts</Link>
            <Link to="/integrations" className="btn btn-ghost">CRM import</Link>
            <button type="button" className="btn btn-primary" onClick={() => advance(3)} disabled={state.checks.contactCount === 0}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2 className="section-title">Send your first campaign</h2>
          <p className="muted mb-4">
            Create a list, pick an approved template, and launch ({state.checks.campaignCount} campaigns created).
          </p>
          <div className="gap-4">
            <Link to="/campaigns" className="btn btn-accent">Create campaign</Link>
            <button type="button" className="btn btn-primary" onClick={finish}>
              Finish onboarding
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
