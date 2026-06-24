import { useEffect, useState, useCallback } from 'react';

import { api } from '../api';

import { useEventStream } from '../hooks/useEventStream';



interface ConvoItem {

  id: string;

  contact: { id: string; name: string | null; phoneE164: string; tags: string[]; optInStatus: string };

  lastMessage: { body: string; direction: string } | null;

  lastMessageAt: string;

  unreadCount: number;

  sessionOpen: boolean;

  assignedUser: { fullName: string } | null;

}



interface Message {

  id: string;

  direction: string;

  body: string;

  mediaUrl: string | null;

  createdAt: string;

  status: string;

}



interface Note {

  id: string;

  body: string;

  userId: string;

  createdAt: string;

}



interface ConvoDetail {

  id: string;

  contact: { id: string; name: string | null; phoneE164: string; tags: string[]; optInStatus: string; customFields: Record<string, unknown> };

  messages: Message[];

  notes: Note[];

  sessionOpen: boolean;

  assignedUser: { id: string; fullName: string } | null;

}



interface TeamUser {

  id: string;

  fullName: string;

}



interface CannedReply {

  id: string;

  title: string;

  body: string;

}



export default function InboxPage() {

  const [conversations, setConversations] = useState<ConvoItem[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ConvoDetail | null>(null);

  const [reply, setReply] = useState('');

  const [mediaUrl, setMediaUrl] = useState('');

  const [noteText, setNoteText] = useState('');

  const [users, setUsers] = useState<TeamUser[]>([]);

  const [canned, setCanned] = useState<CannedReply[]>([]);

  const [error, setError] = useState('');
  const [aiAssist, setAiAssist] = useState<{ suggestion: string; sentiment: string; summary: string } | null>(null);



  const loadList = useCallback(() => {

    api<{ items: ConvoItem[] }>('/inbox/conversations?limit=50').then((r) => setConversations(r.items));

  }, []);



  useEffect(() => {

    loadList();

    api<TeamUser[]>('/users').then(setUsers).catch(() => setUsers([]));

    api<CannedReply[]>('/automations/canned-replies').then(setCanned).catch(() => setCanned([]));

  }, [loadList]);



  useEventStream(loadList);



  useEffect(() => {

    if (!selectedId) {

      setDetail(null);

      return;

    }

    api<ConvoDetail>(`/inbox/conversations/${selectedId}`).then(setDetail);

    loadList();

  }, [selectedId]);



  const sendReply = async () => {

    if (!selectedId || (!reply.trim() && !mediaUrl.trim())) return;

    setError('');

    try {

      await api(`/inbox/conversations/${selectedId}/reply`, {

        method: 'POST',

        body: JSON.stringify({ body: reply, mediaUrl: mediaUrl.trim() || undefined }),

      });

      setReply('');

      setMediaUrl('');

      const d = await api<ConvoDetail>(`/inbox/conversations/${selectedId}`);

      setDetail(d);

      loadList();

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Send failed');

    }

  };



  const addNote = async () => {

    if (!selectedId || !noteText.trim()) return;

    await api(`/inbox/conversations/${selectedId}/notes`, {

      method: 'POST',

      body: JSON.stringify({ body: noteText }),

    });

    setNoteText('');

    const d = await api<ConvoDetail>(`/inbox/conversations/${selectedId}`);

    setDetail(d);

  };



  const insertCanned = (body: string) => setReply((r) => (r ? `${r}\n${body}` : body));



  const assign = async (userId: string) => {

    if (!selectedId) return;

    await api(`/inbox/conversations/${selectedId}/assign`, {

      method: 'PATCH',

      body: JSON.stringify({ userId: userId || null }),

    });

    const d = await api<ConvoDetail>(`/inbox/conversations/${selectedId}`);

    setDetail(d);

  };

  const loadAiAssist = async () => {
    if (!selectedId) return;
    const res = await api<{ suggestion: string; sentiment: string; summary: string }>(`/ai/assist/${selectedId}`, { method: 'POST' });
    setAiAssist(res);
  };

  const resolveConvo = async () => {
    if (!selectedId) return;
    await api(`/inbox/conversations/${selectedId}/resolve`, { method: 'POST' });
    const d = await api<ConvoDetail>(`/inbox/conversations/${selectedId}`);
    setDetail(d);
    loadList();
  };

  return (

    <div>

      <h1 className="page-title">Shared Inbox</h1>

      <p className="muted mb-4">Reply within 24 hours of the last inbound message. Contacts can opt out by sending STOP.</p>



      <div className="inbox-layout">

        <div className="inbox-list">

          {conversations.length === 0 ? (

            <p className="muted" style={{ padding: '1rem' }}>No conversations yet.</p>

          ) : (

            conversations.map((c) => (

              <div

                key={c.id}

                className={`convo-item ${selectedId === c.id ? 'active' : ''} ${c.unreadCount > 0 ? 'unread' : ''}`}

                onClick={() => setSelectedId(c.id)}

                onKeyDown={(e) => e.key === 'Enter' && setSelectedId(c.id)}

                role="button"

                tabIndex={0}

              >

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>

                  <strong>{c.contact.name || c.contact.phoneE164}</strong>

                  {c.unreadCount > 0 && <span className="chip chip-info">{c.unreadCount}</span>}

                </div>

                <div className="muted" style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>

                  {c.lastMessage?.body || '—'}

                </div>

              </div>

            ))

          )}

        </div>



        <div className="inbox-thread">

          {!detail ? (

            <div style={{ padding: '2rem', textAlign: 'center' }} className="muted">Select a conversation</div>

          ) : (

            <>

              <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>

                <strong>{detail.contact.name || detail.contact.phoneE164}</strong>

                {detail.sessionOpen ? (

                  <span className="chip chip-success" style={{ marginLeft: 8 }}>Session open</span>

                ) : (

                  <span className="chip chip-warning" style={{ marginLeft: 8 }}>Session closed — use campaign</span>

                )}

              </div>

              <div className="messages">

                {detail.messages.map((m) => (

                  <div key={m.id} className={`msg ${m.direction === 'Inbound' ? 'msg-inbound' : 'msg-outbound'}`}>

                    {m.mediaUrl && (

                      <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>

                        {m.mediaUrl.startsWith('http') ? (

                          <a href={m.mediaUrl} target="_blank" rel="noreferrer">View media</a>

                        ) : (

                          <span>Media attached</span>

                        )}

                      </div>

                    )}

                    {m.body}

                    <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 4 }}>

                      {new Date(m.createdAt).toLocaleString()} · {m.status}

                    </div>

                  </div>

                ))}

                {(detail.notes ?? []).map((n) => (

                  <div key={n.id} className="msg" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>

                    <em>Internal note</em>

                    <div>{n.body}</div>

                    <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{new Date(n.createdAt).toLocaleString()}</div>

                  </div>

                ))}

              </div>

              {error && <div className="alert alert-warning" style={{ margin: '0 1rem' }}>{error}</div>}

              <div className="reply-box">

                {canned.length > 0 && (

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>

                    {canned.map((c) => (

                      <button key={c.id} type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => insertCanned(c.body)}>

                        {c.title}

                      </button>

                    ))}

                  </div>

                )}

                <textarea

                  value={reply}

                  onChange={(e) => setReply(e.target.value)}

                  placeholder={detail.sessionOpen ? 'Type a reply…' : 'Session closed — cannot send free-form messages'}

                  disabled={!detail.sessionOpen}

                />

                <input

                  type="url"

                  value={mediaUrl}

                  onChange={(e) => setMediaUrl(e.target.value)}

                  placeholder="Media URL (optional)"

                  disabled={!detail.sessionOpen}

                  style={{ marginTop: 8 }}

                />

                <button type="button" className="btn btn-primary" onClick={sendReply} disabled={!detail.sessionOpen || (!reply.trim() && !mediaUrl.trim())}>

                  Send

                </button>

              </div>

            </>

          )}

        </div>



        <div className="inbox-sidebar">

          {detail && (

            <>

              <h3 className="section-title">Contact</h3>

              <p><code>{detail.contact.phoneE164}</code></p>

              <p>Opt-in: <strong>{detail.contact.optInStatus}</strong></p>

              {detail.contact.tags.length > 0 && (

                <p>Tags: {detail.contact.tags.map((t) => <span key={t} className="chip chip-default" style={{ marginRight: 4 }}>{t}</span>)}</p>

              )}

              <h3 className="section-title mt-4">Assign to</h3>

              <select

                value={detail.assignedUser?.id || ''}

                onChange={(e) => assign(e.target.value)}

              >

                <option value="">Unassigned</option>

                {users.map((u) => (

                  <option key={u.id} value={u.id}>{u.fullName}</option>

                ))}

              </select>

              <h3 className="section-title mt-4">AI assist</h3>
              <button type="button" className="btn btn-ghost" onClick={loadAiAssist}>Suggest reply</button>
              {aiAssist && (
                <div className="mt-2" style={{ fontSize: '0.85rem' }}>
                  <p><span className="chip chip-info">{aiAssist.sentiment}</span></p>
                  <p className="muted">{aiAssist.summary}</p>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setReply(aiAssist.suggestion)}>Use suggestion</button>
                </div>
              )}
              <button type="button" className="btn btn-accent mt-4" onClick={resolveConvo}>Resolve & send CSAT</button>

              <h3 className="section-title mt-4">Internal note</h3>

              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Not sent to contact" />

              <button type="button" className="btn btn-ghost mt-2" onClick={addNote} disabled={!noteText.trim()}>Save note</button>

            </>

          )}

        </div>

      </div>

    </div>

  );

}

