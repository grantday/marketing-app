import { useEffect, useState } from 'react';
import { api } from '../api';

interface WaStatus {
  connected: boolean;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  webhookVerified?: boolean;
  webhookVerifyToken?: string;
  webhookUrl?: string;
  hasToken?: boolean;
}

const EMPTY_FORM = {
  accessToken: '',
  phoneNumberId: '',
  wabaId: '',
  displayPhone: '',
};

export default function SetupPage() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showEditor, setShowEditor] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId: string; configured: boolean; docsUrl: string } | null>(null);

  const load = async () => {
    const data = await api<WaStatus>('/setup/whatsapp');
    setStatus(data);
    if (data.connected) {
      setForm({
        accessToken: '',
        phoneNumberId: data.phoneNumberId ?? '',
        wabaId: data.wabaId ?? '',
        displayPhone: data.displayPhone ?? '',
      });
    }
  };

  useEffect(() => { load().catch(console.error); }, []);

  useEffect(() => {
    api<{ appId: string; configId: string; configured: boolean; docsUrl: string }>('/setup/meta/embedded-config')
      .then(setMetaConfig)
      .catch(() => {});
  }, []);

  const launchEmbeddedSignup = () => {
    if (!metaConfig?.configured) {
      setError('Set META_APP_ID and META_EMBEDDED_CONFIG_ID in server environment.');
      return;
    }
    const w = window as Window & { FB?: { login: (cb: (r: unknown) => void, opts: Record<string, unknown>) => void } };
    if (!w.FB) {
      setError('Facebook SDK not loaded. Add your Meta App ID to enable embedded signup, or use manual setup below.');
      return;
    }
    w.FB.login(
      (response: unknown) => {
        setMessage('Embedded signup completed — paste received credentials below or check Meta Business Manager.');
        console.log('Meta embedded signup response:', response);
        setShowEditor(true);
      },
      {
        config_id: metaConfig.configId,
        response_type: 'code',
        override_default_response_type: true,
      },
    );
  };

  useEffect(() => {
    if (!metaConfig?.appId) return;
    const id = 'facebook-jssdk';
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const w = window as Window & { fbAsyncInit?: () => void; FB?: { init: (o: Record<string, unknown>) => void } };
      w.fbAsyncInit = () => w.FB?.init({ appId: metaConfig.appId, cookie: true, xfbml: true, version: 'v21.0' });
    };
    document.body.appendChild(script);
  }, [metaConfig?.appId]);

  const phoneWillChange =
    status?.connected &&
    status.phoneNumberId &&
    form.phoneNumberId.trim() !== '' &&
    form.phoneNumberId.trim() !== status.phoneNumberId;

  const openEditor = () => {
    setShowEditor(true);
    setError('');
    setMessage('');
    if (status?.connected) {
      setForm({
        accessToken: '',
        phoneNumberId: status.phoneNumberId ?? '',
        wabaId: status.wabaId ?? '',
        displayPhone: status.displayPhone ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  };

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (phoneWillChange) {
      const ok = window.confirm(
        'You are changing the WhatsApp phone number ID.\n\n' +
          '• Outbound messages will use the new number\n' +
          '• Webhook verification will be reset\n' +
          '• 24-hour reply sessions with contacts restart on the new number\n\n' +
          'Continue?',
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      await api('/setup/whatsapp', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: form.accessToken.trim() || undefined,
          phoneNumberId: form.phoneNumberId.trim(),
          wabaId: form.wabaId.trim(),
          displayPhone: form.displayPhone.trim() || undefined,
        }),
      });
      setMessage(
        phoneWillChange
          ? 'Phone number and credentials updated. Re-verify your webhook in Meta, then sync templates.'
          : 'Credentials saved. Templates synced from Meta.',
      );
      setForm((f) => ({ ...f, accessToken: '' }));
      setShowEditor(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const syncTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ count: number }>('/setup/whatsapp/sync-templates', { method: 'POST' });
      setMessage(`Synced ${res.count} templates from Meta.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const testSend = async () => {
    setLoading(true);
    setError('');
    try {
      await api('/setup/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({ to: testPhone, message: 'Hello from Reach!' }),
      });
      setMessage('Test message sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setLoading(false);
    }
  };

  const markWebhookVerified = async () => {
    await api('/setup/whatsapp/verify-webhook', { method: 'POST' });
    await load();
    setMessage('Webhook marked as verified.');
  };

  return (
    <div>
      <h1 className="page-title">WhatsApp Setup</h1>
      <p className="muted mb-4">
        Connect or change your Meta WhatsApp Cloud API credentials — access token, phone number ID, and WABA ID.
      </p>

      {message && <div className="alert alert-success mb-4">{message}</div>}
      {error && <div className="alert alert-warning mb-4">{error}</div>}

      <div className="card mb-4">
        <h2 className="section-title">Meta Embedded Signup (recommended)</h2>
        <p className="muted mb-4">
          Official flow to connect WhatsApp Business without copying tokens manually.
          {metaConfig?.configured ? ' Click below to launch Meta\'s embedded signup.' : ' Configure META_APP_ID and META_EMBEDDED_CONFIG_ID on the server first.'}
        </p>
        <div className="gap-4">
          <button type="button" className="btn btn-accent" onClick={launchEmbeddedSignup} disabled={!metaConfig?.configured}>
            Launch embedded signup
          </button>
          {metaConfig?.docsUrl && (
            <a className="btn btn-ghost" href={metaConfig.docsUrl} target="_blank" rel="noreferrer">Meta docs</a>
          )}
        </div>
      </div>

      {status?.connected && !showEditor && (
        <div className="card mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 className="section-title">Current connection</h2>
              <p><span className="chip chip-success">Connected</span></p>
            </div>
            <button type="button" className="btn btn-accent" onClick={openEditor}>
              Change token or phone number
            </button>
          </div>

          <div className="grid-2 mt-4">
            <div>
              <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.8rem' }}>Display phone</p>
              <p style={{ margin: 0, fontWeight: 600 }}>{status.displayPhone || '—'}</p>
            </div>
            <div>
              <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.8rem' }}>Access token</p>
              <p style={{ margin: 0 }}><span className="chip chip-primary">Configured</span> <span className="muted">(hidden)</span></p>
            </div>
            <div>
              <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.8rem' }}>Phone number ID</p>
              <p style={{ margin: 0 }}><code>{status.phoneNumberId}</code></p>
            </div>
            <div>
              <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.8rem' }}>WABA ID</p>
              <p style={{ margin: 0 }}><code>{status.wabaId}</code></p>
            </div>
          </div>

          <p className="mt-4">
            Webhook:{' '}
            {status.webhookVerified ? (
              <span className="chip chip-success">Verified</span>
            ) : (
              <span className="chip chip-warning">Needs verification</span>
            )}
          </p>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Webhook URL: <code>{status.webhookUrl || '/api/webhooks/whatsapp'}</code><br />
            Verify token: <code>{status.webhookVerifyToken}</code>
          </p>

          <div className="gap-4 mt-4">
            <button type="button" className="btn btn-primary" onClick={syncTemplates} disabled={loading}>
              Sync templates
            </button>
            {!status.webhookVerified && (
              <button type="button" className="btn btn-ghost" onClick={markWebhookVerified}>
                Mark webhook verified
              </button>
            )}
          </div>
        </div>
      )}

      {(!status?.connected || showEditor) && (
        <div className="card mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              {status?.connected ? 'Change credentials' : 'Connect WhatsApp'}
            </h2>
            {status?.connected && (
              <button type="button" className="btn btn-ghost" onClick={() => setShowEditor(false)}>
                Cancel
              </button>
            )}
          </div>

          {phoneWillChange && (
            <div className="alert alert-warning mb-4">
              Phone number ID is changing from <code>{status?.phoneNumberId}</code> to{' '}
              <code>{form.phoneNumberId}</code>. Webhook verification will reset after save.
            </div>
          )}

          <form onSubmit={saveCredentials}>
            <div className="form-group">
              <label>
                Permanent access token
                {status?.connected && (
                  <span className="muted" style={{ fontWeight: 400 }}> — leave blank to keep current token</span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={form.accessToken}
                  onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                  placeholder={status?.connected ? 'Enter only if replacing token' : 'EAAxxxx…'}
                  required={!status?.connected}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Phone number ID</label>
                <input
                  value={form.phoneNumberId}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                  placeholder="From Meta → WhatsApp → API Setup"
                  required
                />
                <p className="muted" style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                  Meta ID for the business phone — not the customer&apos;s number
                </p>
              </div>
              <div className="form-group">
                <label>WABA ID</label>
                <input
                  value={form.wabaId}
                  onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))}
                  placeholder="WhatsApp Business Account ID"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Display phone (optional)</label>
              <input
                value={form.displayPhone}
                onChange={(e) => setForm((f) => ({ ...f, displayPhone: e.target.value }))}
                placeholder="+263 77 123 4567"
              />
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                Human-readable label shown in Reach — your actual WhatsApp business number
              </p>
            </div>

            <button type="submit" className="btn btn-accent" disabled={loading}>
              {loading ? 'Saving…' : status?.connected ? 'Save new credentials' : 'Connect WhatsApp'}
            </button>
          </form>
        </div>
      )}

      {status?.connected && (
        <div className="card mb-4">
          <h2 className="section-title">Test send (session message)</h2>
          <p className="muted">Only works within 24h of an inbound message from the recipient.</p>
          <div className="form-group">
            <label>Test phone (E.164)</label>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+263771234567" />
          </div>
          <button type="button" className="btn btn-ghost" onClick={testSend} disabled={loading || !testPhone}>
            Send test
          </button>
        </div>
      )}

      <div className="card">
        <h2 className="section-title">Where to find these in Meta</h2>
        <ol>
          <li><strong>Access token</strong> — Meta Business Settings → System users → Generate token (whatsapp_business_messaging)</li>
          <li><strong>Phone number ID</strong> — Meta Developer App → WhatsApp → API Setup → Phone number ID</li>
          <li><strong>WABA ID</strong> — Same page, WhatsApp Business Account ID</li>
          <li>Configure webhook URL + verify token in the Meta app, then mark verified here</li>
        </ol>
      </div>
    </div>
  );
}
