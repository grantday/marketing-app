import { useEffect, useState } from 'react';
import { api } from '../api';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: string;
  stepsJson: string;
  active: boolean;
  _count?: { enrollments: number };
}

interface Template {
  id: string;
  metaName: string;
  bodyPreview: string;
  status: string;
}

interface ChatbotRule {
  id: string;
  name: string;
  keyword: string;
  matchType: string;
  responseBody: string;
  menuOptionsJson: string;
  priority: number;
  handoffAfter: boolean;
  active: boolean;
}

interface CannedReply {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

type StepDraft =
  | { type: 'delay'; days?: number; hours?: number; minutes?: number }
  | { type: 'send_template'; templateId: string; variableMapping?: Record<string, string> }
  | { type: 'add_tag'; tag: string }
  | { type: 'handoff' };

const TRIGGER_TYPES = [
  { value: 'InboundKeyword', label: 'Inbound keyword' },
  { value: 'TagAdded', label: 'Tag added' },
  { value: 'CrmStage', label: 'CRM stage change' },
  { value: 'Manual', label: 'Manual enrollment' },
  { value: 'DripStart', label: 'Drip (manual start)' },
];

export default function AutomationsPage() {
  const [tab, setTab] = useState<'workflows' | 'chatbot' | 'canned'>('workflows');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pipelineTemplates, setPipelineTemplates] = useState<Workflow[]>([]);
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const [wfForm, setWfForm] = useState({
    name: '',
    description: '',
    triggerType: 'InboundKeyword',
    triggerKeyword: '',
    triggerTag: '',
    triggerStage: '',
    steps: [] as StepDraft[],
    active: true,
  });

  const [ruleForm, setRuleForm] = useState({
    name: '',
    keyword: '',
    matchType: 'contains',
    responseBody: '',
    handoffAfter: false,
    active: true,
  });

  const [cannedForm, setCannedForm] = useState({ title: '', body: '', shortcut: '' });

  const load = () => {
    api<Workflow[]>('/workflows').then(setWorkflows).catch(() => {});
    api<Workflow[]>('/workflows/templates').then(setPipelineTemplates).catch(() => {});
    api<Template[]>('/templates').then(setTemplates).catch(() => {});
    api<ChatbotRule[]>('/automations/chatbot-rules').then(setRules).catch(() => {});
    api<CannedReply[]>('/automations/canned-replies').then(setCanned).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const saveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const triggerConfig: Record<string, string> = {};
    if (wfForm.triggerType === 'InboundKeyword') triggerConfig.keyword = wfForm.triggerKeyword;
    if (wfForm.triggerType === 'TagAdded') triggerConfig.tag = wfForm.triggerTag;
    if (wfForm.triggerType === 'CrmStage') triggerConfig.stage = wfForm.triggerStage;

    const payload = {
      name: wfForm.name,
      description: wfForm.description || undefined,
      triggerType: wfForm.triggerType,
      triggerConfig,
      stepsJson: wfForm.steps,
      active: wfForm.active,
    };

    try {
      if (editing) {
        await api(`/workflows/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/workflows', { method: 'POST', body: JSON.stringify(payload) });
      }
      setWfForm({ name: '', description: '', triggerType: 'InboundKeyword', triggerKeyword: '', triggerTag: '', triggerStage: '', steps: [], active: true });
      setEditing(null);
      load();
      setMsg('Workflow saved.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const editWorkflow = (wf: Workflow) => {
    const cfg = JSON.parse(wf.triggerConfig || '{}');
    const steps = JSON.parse(wf.stepsJson || '[]') as StepDraft[];
    setWfForm({
      name: wf.name,
      description: wf.description || '',
      triggerType: wf.triggerType,
      triggerKeyword: cfg.keyword || '',
      triggerTag: cfg.tag || '',
      triggerStage: cfg.stage || '',
      steps,
      active: wf.active,
    });
    setEditing(wf.id);
    setTab('workflows');
  };

  const clonePipeline = async (tplId: string) => {
    await api('/workflows', {
      method: 'POST',
      body: JSON.stringify({ fromTemplateId: tplId, name: `Copy — ${pipelineTemplates.find((t) => t.id === tplId)?.name}` }),
    });
    load();
    setMsg('Pipeline template cloned. Edit trigger and template IDs as needed.');
  };

  const addStep = (type: StepDraft['type']) => {
    if (type === 'delay') setWfForm((f) => ({ ...f, steps: [...f.steps, { type: 'delay', days: 0, hours: 0, minutes: 30 }] }));
    if (type === 'send_template') setWfForm((f) => ({ ...f, steps: [...f.steps, { type: 'send_template', templateId: templates[0]?.id || '' }] }));
    if (type === 'add_tag') setWfForm((f) => ({ ...f, steps: [...f.steps, { type: 'add_tag', tag: '' }] }));
    if (type === 'handoff') setWfForm((f) => ({ ...f, steps: [...f.steps, { type: 'handoff' }] }));
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/automations/chatbot-rules', { method: 'POST', body: JSON.stringify(ruleForm) });
    setRuleForm({ name: '', keyword: '', matchType: 'contains', responseBody: '', handoffAfter: false, active: true });
    load();
  };

  const saveCanned = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/automations/canned-replies', {
      method: 'POST',
      body: JSON.stringify({ ...cannedForm, shortcut: cannedForm.shortcut || undefined }),
    });
    setCannedForm({ title: '', body: '', shortcut: '' });
    load();
  };

  return (
    <div>
      <h1 className="page-title">Automations</h1>
      <p className="muted mb-4">Workflows, chatbot rules, and team canned replies.</p>

      {msg && <div className="alert alert-info mb-4">{msg}</div>}

      <div className="mb-4" style={{ display: 'flex', gap: '0.5rem' }}>
        {(['workflows', 'chatbot', 'canned'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t)}
          >
            {t === 'workflows' ? 'Workflows' : t === 'chatbot' ? 'Chatbot' : 'Canned replies'}
          </button>
        ))}
      </div>

      {tab === 'workflows' && (
        <>
          {pipelineTemplates.length > 0 && (
            <div className="card mb-4">
              <h2 className="section-title">Pipeline templates</h2>
              <p className="muted">Pre-built construction journeys — clone and customize.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {pipelineTemplates.map((t) => (
                  <button key={t.id} type="button" className="btn btn-ghost" onClick={() => clonePipeline(t.id)}>
                    Clone: {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card mb-4">
            <h2 className="section-title">{editing ? 'Edit workflow' : 'New workflow'}</h2>
            <form onSubmit={saveWorkflow}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Name</label>
                  <input value={wfForm.name} onChange={(e) => setWfForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Trigger</label>
                  <select value={wfForm.triggerType} onChange={(e) => setWfForm((f) => ({ ...f, triggerType: e.target.value }))}>
                    {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              {wfForm.triggerType === 'InboundKeyword' && (
                <div className="form-group">
                  <label>Keyword</label>
                  <input value={wfForm.triggerKeyword} onChange={(e) => setWfForm((f) => ({ ...f, triggerKeyword: e.target.value }))} placeholder="PRICING" />
                </div>
              )}
              {wfForm.triggerType === 'TagAdded' && (
                <div className="form-group">
                  <label>Tag</label>
                  <input value={wfForm.triggerTag} onChange={(e) => setWfForm((f) => ({ ...f, triggerTag: e.target.value }))} placeholder="stage:Building" />
                </div>
              )}
              {wfForm.triggerType === 'CrmStage' && (
                <div className="form-group">
                  <label>CRM stage</label>
                  <input value={wfForm.triggerStage} onChange={(e) => setWfForm((f) => ({ ...f, triggerStage: e.target.value }))} placeholder="Compliant" />
                </div>
              )}

              <h3 className="section-title mt-4">Steps</h3>
              {wfForm.steps.map((step, i) => (
                <div key={i} className="card" style={{ marginBottom: '0.5rem', padding: '0.75rem' }}>
                  <strong>Step {i + 1}: {step.type}</strong>
                  {step.type === 'delay' && (
                    <div className="grid-3 mt-2">
                      <input type="number" min={0} value={step.days ?? 0} onChange={(e) => {
                        const steps = [...wfForm.steps];
                        (steps[i] as { days: number }).days = Number(e.target.value);
                        setWfForm((f) => ({ ...f, steps }));
                      }} placeholder="Days" />
                      <input type="number" min={0} value={step.hours ?? 0} onChange={(e) => {
                        const steps = [...wfForm.steps];
                        (steps[i] as { hours: number }).hours = Number(e.target.value);
                        setWfForm((f) => ({ ...f, steps }));
                      }} placeholder="Hours" />
                      <input type="number" min={0} value={step.minutes ?? 0} onChange={(e) => {
                        const steps = [...wfForm.steps];
                        (steps[i] as { minutes: number }).minutes = Number(e.target.value);
                        setWfForm((f) => ({ ...f, steps }));
                      }} placeholder="Minutes" />
                    </div>
                  )}
                  {step.type === 'send_template' && (
                    <select className="mt-2" value={step.templateId} onChange={(e) => {
                      const steps = [...wfForm.steps];
                      (steps[i] as { templateId: string }).templateId = e.target.value;
                      setWfForm((f) => ({ ...f, steps }));
                    }}>
                      {templates.filter((t) => t.status === 'Approved').map((t) => (
                        <option key={t.id} value={t.id}>{t.metaName}</option>
                      ))}
                    </select>
                  )}
                  {step.type === 'add_tag' && (
                    <input className="mt-2" value={step.tag} onChange={(e) => {
                      const steps = [...wfForm.steps];
                      (steps[i] as { tag: string }).tag = e.target.value;
                      setWfForm((f) => ({ ...f, steps }));
                    }} placeholder="Tag name" />
                  )}
                  <button type="button" className="btn btn-ghost mt-2" onClick={() => setWfForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))}>
                    Remove
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => addStep('delay')}>+ Delay</button>
                <button type="button" className="btn btn-ghost" onClick={() => addStep('send_template')}>+ Send template</button>
                <button type="button" className="btn btn-ghost" onClick={() => addStep('add_tag')}>+ Add tag</button>
                <button type="button" className="btn btn-ghost" onClick={() => addStep('handoff')}>+ Handoff to agent</button>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem' }}>
                <input type="checkbox" checked={wfForm.active} onChange={(e) => setWfForm((f) => ({ ...f, active: e.target.checked }))} />
                Active
              </label>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} workflow</button>
              {editing && (
                <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => { setEditing(null); setWfForm({ name: '', description: '', triggerType: 'InboundKeyword', triggerKeyword: '', triggerTag: '', triggerStage: '', steps: [], active: true }); }}>
                  Cancel
                </button>
              )}
            </form>
          </div>

          <div className="card">
            <h2 className="section-title">Active workflows</h2>
            <table>
              <thead><tr><th>Name</th><th>Trigger</th><th>Enrollments</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td><code>{w.triggerType}</code></td>
                    <td>{w._count?.enrollments ?? 0}</td>
                    <td>{w.active ? <span className="chip chip-success">Active</span> : <span className="chip chip-default">Off</span>}</td>
                    <td><button type="button" className="btn btn-ghost" onClick={() => editWorkflow(w)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'chatbot' && (
        <>
          <div className="card mb-4">
            <h2 className="section-title">New chatbot rule</h2>
            <form onSubmit={saveRule} className="grid-2">
              <div className="form-group"><label>Name</label><input value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group"><label>Keyword</label><input value={ruleForm.keyword} onChange={(e) => setRuleForm((f) => ({ ...f, keyword: e.target.value }))} required /></div>
              <div className="form-group">
                <label>Match</label>
                <select value={ruleForm.matchType} onChange={(e) => setRuleForm((f) => ({ ...f, matchType: e.target.value }))}>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                  <option value="starts_with">Starts with</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Response</label>
                <textarea value={ruleForm.responseBody} onChange={(e) => setRuleForm((f) => ({ ...f, responseBody: e.target.value }))} required rows={3} />
              </div>
              <label style={{ display: 'flex', gap: 8 }}>
                <input type="checkbox" checked={ruleForm.handoffAfter} onChange={(e) => setRuleForm((f) => ({ ...f, handoffAfter: e.target.checked }))} />
                Hand off to human after reply
              </label>
              <button type="submit" className="btn btn-primary">Add rule</button>
            </form>
          </div>
          <div className="card">
            <h2 className="section-title">Rules</h2>
            <table>
              <thead><tr><th>Name</th><th>Keyword</th><th>Match</th><th>Active</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td><code>{r.keyword}</code></td>
                    <td>{r.matchType}</td>
                    <td>{r.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'canned' && (
        <>
          <div className="card mb-4">
            <h2 className="section-title">New canned reply</h2>
            <form onSubmit={saveCanned} className="grid-2">
              <div className="form-group"><label>Title</label><input value={cannedForm.title} onChange={(e) => setCannedForm((f) => ({ ...f, title: e.target.value }))} required /></div>
              <div className="form-group"><label>Shortcut</label><input value={cannedForm.shortcut} onChange={(e) => setCannedForm((f) => ({ ...f, shortcut: e.target.value }))} placeholder="/thanks" /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Body</label>
                <textarea value={cannedForm.body} onChange={(e) => setCannedForm((f) => ({ ...f, body: e.target.value }))} required rows={3} />
              </div>
              <button type="submit" className="btn btn-primary">Add snippet</button>
            </form>
          </div>
          <div className="card">
            <h2 className="section-title">Snippets</h2>
            <table>
              <thead><tr><th>Title</th><th>Shortcut</th><th>Preview</th></tr></thead>
              <tbody>
                {canned.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.shortcut || '—'}</td>
                    <td className="muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
