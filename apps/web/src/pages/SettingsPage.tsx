import { useEffect, useState } from 'react';
import { api } from '../api';

function TeamRow({
  user,
  onSave,
}: {
  user: TeamUser;
  onSave: (id: string, skills: string, languages: string) => void;
}) {
  const [skills, setSkills] = useState((user.skills ?? []).join(', '));
  const [languages, setLanguages] = useState((user.languages ?? []).join(', '));

  return (
    <tr>
      <td>{user.fullName}</td>
      <td>{user.email}</td>
      <td>{user.role}</td>
      <td><input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="sales, support" style={{ width: '100%' }} /></td>
      <td><input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es" style={{ width: '100%' }} /></td>
      <td><button type="button" className="btn btn-ghost" onClick={() => onSave(user.id, skills, languages)}>Save</button></td>
    </tr>
  );
}

interface TeamUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  active: boolean;
  skills?: string[];
  languages?: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  createdAt: string;
  user: { fullName: string } | null;
  details: string;
}

export default function SettingsPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [strictOptIn, setStrictOptIn] = useState(true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [outsideHoursMessage, setOutsideHoursMessage] = useState('');
  const [crmApiUrl, setCrmApiUrl] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [csatEnabled, setCsatEnabled] = useState(false);
  const [csatPrompt, setCsatPrompt] = useState('Rate your experience 1-5 (reply with a number)');
  const [slaFirstResponse, setSlaFirstResponse] = useState(60);
  const [messageRetentionDays, setMessageRetentionDays] = useState(365);
  const [businessHours, setBusinessHours] = useState({ mon: { start: '08:00', end: '17:00' }, sat: { closed: true }, sun: { closed: true } });
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'Agent' });
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [resellerMode, setResellerMode] = useState(false);

  useEffect(() => {
    api<TeamUser[]>('/users').then(setUsers).catch(() => {});
    api<AuditEntry[]>('/analytics/audit').then(setAudit).catch(() => {});
    api<{
      subdomain: string | null;
      customDomain: string | null;
      whiteLabel: { brandName?: string; logoUrl?: string; resellerMode?: boolean };
    }>('/branding').then((b) => {
      setSubdomain(b.subdomain || '');
      setCustomDomain(b.customDomain || '');
      setBrandName(b.whiteLabel?.brandName || '');
      setLogoUrl(b.whiteLabel?.logoUrl || '');
      setResellerMode(!!b.whiteLabel?.resellerMode);
    }).catch(() => {});
    api<{
      strictOptIn: boolean;
      autoAssignEnabled: boolean;
      outsideHoursMessage: string | null;
      crmApiUrl: string | null;
      businessHoursJson: string;
      emailFromAddress: string | null;
      emailProviderJson: string;
      smsProviderJson: string;
      aiEnabled: boolean;
      csatEnabled: boolean;
      csatPrompt: string | null;
      slaFirstResponseMinutes: number;
      messageRetentionDays: number;
    }>('/settings').then((s) => {
      setStrictOptIn(s.strictOptIn);
      setAutoAssignEnabled(s.autoAssignEnabled);
      setOutsideHoursMessage(s.outsideHoursMessage || '');
      setCrmApiUrl(s.crmApiUrl || '');
      setEmailFrom(s.emailFromAddress || '');
      setAiEnabled(s.aiEnabled);
      setCsatEnabled(s.csatEnabled);
      setCsatPrompt(s.csatPrompt || 'Rate your experience 1-5 (reply with a number)');
      setSlaFirstResponse(s.slaFirstResponseMinutes);
      setMessageRetentionDays(s.messageRetentionDays);
      try {
        const ep = JSON.parse(s.emailProviderJson || '{}');
        if (ep.apiKey) setResendApiKey(ep.apiKey);
        const sp = JSON.parse(s.smsProviderJson || '{}');
        if (sp.accountSid) setTwilioSid(sp.accountSid);
        if (sp.authToken) setTwilioToken(sp.authToken);
        if (sp.fromNumber) setTwilioFrom(sp.fromNumber);
      } catch { /* ignore */ }
      try {
        const bh = JSON.parse(s.businessHoursJson || '{}');
        if (bh.mon) setBusinessHours(bh);
      } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  const toggleStrictOptIn = async () => {
    const next = !strictOptIn;
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ strictOptIn: next }) });
    setStrictOptIn(next);
  };

  const saveAutomationSettings = async () => {
    await api('/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        autoAssignEnabled,
        outsideHoursMessage: outsideHoursMessage || null,
        crmApiUrl: crmApiUrl || null,
        businessHoursJson: businessHours,
        emailFromAddress: emailFrom || null,
        emailProviderJson: { provider: 'resend', apiKey: resendApiKey || undefined },
        smsProviderJson: {
          provider: 'twilio',
          accountSid: twilioSid || undefined,
          authToken: twilioToken || undefined,
          fromNumber: twilioFrom || undefined,
        },
        aiEnabled,
        csatEnabled,
        csatPrompt: csatPrompt || null,
        slaFirstResponseMinutes: slaFirstResponse,
        messageRetentionDays,
      }),
    });
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/users', { method: 'POST', body: JSON.stringify(form) });
    setForm({ email: '', password: '', fullName: '', role: 'Agent' });
    api<TeamUser[]>('/users').then(setUsers);
  };

  const updateAgentRouting = async (userId: string, skills: string, languages: string) => {
    await api(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        languages: languages.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    api<TeamUser[]>('/users').then(setUsers);
  };

  const saveBranding = async () => {
    await api('/branding', {
      method: 'PATCH',
      body: JSON.stringify({
        subdomain: subdomain || null,
        customDomain: customDomain || null,
        whiteLabel: { brandName, logoUrl, resellerMode },
        resellerMode,
      }),
    });
  };

  return (
    <div>
      <h1 className="page-title">Team & Settings</h1>

      <div className="card mb-4">
        <h2 className="section-title">Compliance</h2>
        <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={strictOptIn} onChange={toggleStrictOptIn} />
          <span>
            <strong>Strict opt-in</strong> — only send campaigns to contacts marked OptedIn.
            When enabled, Unknown contacts are blocked (recommended for Meta compliance).
          </span>
        </label>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Inbox automation</h2>
        <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <input type="checkbox" checked={autoAssignEnabled} onChange={(e) => setAutoAssignEnabled(e.target.checked)} />
          <span><strong>Round-robin auto-assign</strong> — new conversations assigned to agents in rotation.</span>
        </label>
        <div className="form-group">
          <label>Outside business hours message</label>
          <textarea value={outsideHoursMessage} onChange={(e) => setOutsideHoursMessage(e.target.value)} rows={2} placeholder="Thanks for messaging. We're closed — we'll reply next business day." />
        </div>
        <div className="form-group">
          <label>CRM API URL (Arenarama)</label>
          <input value={crmApiUrl} onChange={(e) => setCrmApiUrl(e.target.value)} placeholder="http://localhost:3001" />
        </div>
        <p className="muted">Business hours: Mon–Fri 08:00–17:00 (edit JSON in API for full schedule).</p>
        <button type="button" className="btn btn-primary" onClick={saveAutomationSettings}>Save automation settings</button>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">White-label & domains</h2>
        <p className="muted mb-4">Custom subdomain and branding for agency reseller mode (Enterprise).</p>
        <div className="grid-2">
          <div className="form-group">
            <label>Subdomain</label>
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="yourco" />
            <span className="muted">→ {subdomain || 'yourco'}.reach.app</span>
          </div>
          <div className="form-group">
            <label>Custom domain</label>
            <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.yourco.com" />
          </div>
          <div className="form-group">
            <label>Brand name</label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Logo URL</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <input type="checkbox" checked={resellerMode} onChange={(e) => setResellerMode(e.target.checked)} />
          <span><strong>Agency reseller mode</strong> — hide &quot;Powered by Reach&quot; for client-facing views.</span>
        </label>
        <button type="button" className="btn btn-primary" onClick={saveBranding}>Save branding</button>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Email & SMS channels</h2>
        <p className="muted">Configure Resend (email) and Twilio (SMS) for cross-channel campaigns and fallbacks.</p>
        <div className="grid-2">
          <div className="form-group">
            <label>Email from address</label>
            <input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="noreply@yourdomain.com" />
          </div>
          <div className="form-group">
            <label>Resend API key</label>
            <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_…" />
          </div>
          <div className="form-group">
            <label>Twilio Account SID</label>
            <input value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Twilio Auth Token</label>
            <input type="password" value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Twilio from number</label>
            <input value={twilioFrom} onChange={(e) => setTwilioFrom(e.target.value)} placeholder="+1…" />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={saveAutomationSettings}>Save channel settings</button>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">AI & SLA</h2>
        <label style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
          <span><strong>AI knowledge bot</strong> — answers from Knowledge Base when chatbot rules don&apos;t match. Requires OPENAI_API_KEY on server.</span>
        </label>
        <label style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={csatEnabled} onChange={(e) => setCsatEnabled(e.target.checked)} />
          <span><strong>CSAT survey</strong> — send rating prompt when agent resolves a conversation.</span>
        </label>
        <div className="form-group"><label>CSAT prompt</label><input value={csatPrompt} onChange={(e) => setCsatPrompt(e.target.value)} /></div>
        <div className="grid-2">
          <div className="form-group"><label>First response SLA (minutes)</label><input type="number" value={slaFirstResponse} onChange={(e) => setSlaFirstResponse(Number(e.target.value))} /></div>
          <div className="form-group"><label>Message retention (days)</label><input type="number" value={messageRetentionDays} onChange={(e) => setMessageRetentionDays(Number(e.target.value))} /></div>
        </div>
        <button type="button" className="btn btn-primary" onClick={saveAutomationSettings}>Save AI & SLA settings</button>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Team members</h2>
        <p className="muted mb-4">Skills and languages drive intelligent routing (e.g. assign Spanish-speaking sales leads).</p>
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Skills</th><th>Languages</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <TeamRow key={u.id} user={u} onSave={updateAgentRouting} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mb-4">
        <h2 className="section-title">Add user</h2>
        <form onSubmit={addUser} className="grid-2">
          <div className="form-group">
            <label>Full name</label>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="Admin">Admin</option>
              <option value="Marketer">Marketer</option>
              <option value="Agent">Agent</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Add user</button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">Audit log</h2>
        <p className="muted">Opt-outs, imports, campaign sends, and WhatsApp connection events.</p>
        <table>
          <thead>
            <tr><th>Time</th><th>Action</th><th>User</th></tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td className="muted">{new Date(a.createdAt).toLocaleString()}</td>
                <td><code>{a.action}</code></td>
                <td>{a.user?.fullName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
