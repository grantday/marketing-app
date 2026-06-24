import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VARIABLE_FIELD_OPTIONS } from '@reach/shared';
import { api } from '../api';

interface Campaign {
  id: string;
  name: string;
  status: string;
  template: { metaName: string };
  list: { name: string };
  createdAt: string;
}

interface Template {
  id: string;
  metaName: string;
  status: string;
  variableCount: number;
  bodyPreview: string;
}

interface List {
  id: string;
  name: string;
  memberCount: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    listId: '',
    variables: {} as Record<string, string>,
    scheduledAt: '',
    sendMode: 'now' as 'now' | 'schedule',
    emailFallback: false,
    abTestEnabled: false,
    abTemplateB: '',
  });

  const load = () => api<Campaign[]>('/campaigns').then(setCampaigns);

  useEffect(() => {
    load();
    api<Template[]>('/templates').then(setTemplates);
    api<List[]>('/lists').then(setLists);
  }, []);

  const selectedTemplate = templates.find((t) => t.id === form.templateId);

  const createAndSend = async () => {
    const payload: Record<string, unknown> = {
      name: form.name,
      templateId: form.templateId,
      listId: form.listId,
      variableMapping: form.variables,
    };
    if (form.sendMode === 'schedule' && form.scheduledAt) {
      payload.scheduledAt = new Date(form.scheduledAt).toISOString();
    }
    if (form.abTestEnabled && form.abTemplateB) {
      payload.abTest = {
        enabled: true,
        variantA: { templateId: form.templateId },
        variantB: { templateId: form.abTemplateB },
        splitPercent: 50,
        winnerMetric: 'read',
      };
    }
    if (form.emailFallback) {
      payload.channelStrategy = {
        primary: 'whatsapp',
        fallback: {
          channel: 'email',
          afterHours: 48,
          emailSubject: `Follow-up: ${form.name}`,
          emailBody: '<p>We tried reaching you on WhatsApp. Please reply when you can.</p>',
        },
      };
    }

    const campaign = await api<{ id: string }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await api(`/campaigns/${campaign.id}/prepare`, { method: 'POST' });
    await api(`/campaigns/${campaign.id}/send`, { method: 'POST' });
    setShowWizard(false);
    setStep(0);
    setForm({ name: '', templateId: '', listId: '', variables: {}, scheduledAt: '', sendMode: 'now', emailFallback: false, abTestEnabled: false, abTemplateB: '' });
    load();
  };

  const statusChip = (s: string) => {
    const map: Record<string, string> = {
      Draft: 'chip-default',
      Scheduled: 'chip-info',
      Sending: 'chip-primary',
      Completed: 'chip-success',
      Failed: 'chip-danger',
      Paused: 'chip-warning',
      Cancelled: 'chip-default',
    };
    return <span className={`chip ${map[s] || 'chip-default'}`}>{s}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Campaigns</h1>
        <button type="button" className="btn btn-accent" onClick={() => setShowWizard(true)}>
          New campaign
        </button>
      </div>

      {showWizard && (
        <div className="card mb-4">
          <div className="wizard-steps">
            {['Details', 'Template', 'Audience', 'Variables', 'Review'].map((label, i) => (
              <span key={label} className={`wizard-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
                {i + 1}. {label}
              </span>
            ))}
          </div>

          {step === 0 && (
            <div>
              <div className="form-group">
                <label>Campaign name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <button type="button" className="btn btn-primary" disabled={!form.name} onClick={() => setStep(1)}>Next</button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="alert alert-info mb-4">
                Use approved templates only. Marketing content must use MARKETING category templates per Meta policy.
              </div>
              <div className="form-group">
                <label>Template</label>
                <select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value, variables: {} }))}>
                  <option value="">Select…</option>
                  {templates.filter((t) => t.status === 'Approved').map((t) => (
                    <option key={t.id} value={t.id}>{t.metaName} ({t.variableCount} vars)</option>
                  ))}
                </select>
              </div>
              {selectedTemplate && <p className="muted">{selectedTemplate.bodyPreview}</p>}
              <div className="gap-4">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button type="button" className="btn btn-primary" disabled={!form.templateId} onClick={() => setStep(2)}>Next</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="form-group">
                <label>Audience list</label>
                <select value={form.listId} onChange={(e) => setForm((f) => ({ ...f, listId: e.target.value }))}>
                  <option value="">Select…</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.memberCount} members)</option>
                  ))}
                </select>
              </div>
              <div className="gap-4">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn btn-primary" disabled={!form.listId} onClick={() => setStep(3)}>Next</button>
              </div>
            </div>
          )}

          {step === 3 && selectedTemplate && (
            <div>
              <p className="muted">Map each template variable to a contact field or static text.</p>
              {Array.from({ length: selectedTemplate.variableCount }, (_, i) => {
                const key = String(i + 1);
                const val = form.variables[key] ?? '';
                const isField = val.startsWith('contact.');
                return (
                  <div className="form-group" key={i}>
                    <label>Variable {i + 1}</label>
                    <div className="grid-2">
                      <select
                        value={isField ? val : '__static__'}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((f) => ({
                            ...f,
                            variables: {
                              ...f.variables,
                              [key]: v === '__static__' ? '' : v,
                            },
                          }));
                        }}
                      >
                        <option value="__static__">Static text</option>
                        {VARIABLE_FIELD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {!isField && (
                        <input
                          placeholder="Static value for all contacts"
                          value={val}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            variables: { ...f.variables, [key]: e.target.value },
                          }))}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedTemplate.variableCount === 0 && <p className="muted">No variables in this template.</p>}
              <div className="gap-4">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
                <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>Next</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="section-title">Review & send</h2>
              <p><strong>{form.name}</strong></p>
              <p>Template: {selectedTemplate?.metaName}</p>
              <p>List: {lists.find((l) => l.id === form.listId)?.name}</p>
              <div className="form-group mt-4">
                <label>When to send</label>
                <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="radio"
                    checked={form.sendMode === 'now'}
                    onChange={() => setForm((f) => ({ ...f, sendMode: 'now' }))}
                  />
                  Send immediately after prepare
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="radio"
                    checked={form.sendMode === 'schedule'}
                    onChange={() => setForm((f) => ({ ...f, sendMode: 'schedule' }))}
                  />
                  Schedule for
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    disabled={form.sendMode !== 'schedule'}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  />
                </label>
              </div>
              <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={form.abTestEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, abTestEnabled: e.target.checked }))}
                />
                <span>
                  <strong>A/B test</strong> — split audience 50/50 between two templates; winner picked by read rate after send.
                </span>
              </label>
              {form.abTestEnabled && (
                <div className="form-group mb-4">
                  <label>Variant B template</label>
                  <select value={form.abTemplateB} onChange={(e) => setForm((f) => ({ ...f, abTemplateB: e.target.value }))}>
                    <option value="">Select variant B…</option>
                    {templates.filter((t) => t.status === 'Approved' && t.id !== form.templateId).map((t) => (
                      <option key={t.id} value={t.id}>{t.metaName}</option>
                    ))}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={form.emailFallback}
                  onChange={(e) => setForm((f) => ({ ...f, emailFallback: e.target.checked }))}
                />
                <span>
                  <strong>Cross-channel fallback</strong> — if WhatsApp is unread after 48 hours, send email to contacts with an email address (requires Resend configured in Settings).
                </span>
              </label>
              <div className="alert alert-warning mb-4">
                Opted-out contacts will be skipped automatically. Ensure all recipients have consented.
              </div>
              <div className="gap-4">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
                <button type="button" className="btn btn-accent" onClick={createAndSend}>Prepare & send</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowWizard(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Template</th>
              <th>List</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/campaigns/${c.id}`}>{c.name}</Link></td>
                <td>{c.template.metaName}</td>
                <td>{c.list.name}</td>
                <td>{statusChip(c.status)}</td>
                <td className="muted">{new Date(c.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
