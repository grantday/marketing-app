import { decryptToken } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
}

export async function getWhatsAppConfig(organizationId: string, phoneNumberId?: string): Promise<WhatsAppConfig | null> {
  const account = phoneNumberId
    ? await prisma.whatsAppAccount.findFirst({
        where: { organizationId, phoneNumberId, active: true },
      })
    : await prisma.whatsAppAccount.findFirst({
        where: { organizationId, active: true, isPrimary: true },
      }) ??
      (await prisma.whatsAppAccount.findFirst({
        where: { organizationId, active: true },
        orderBy: { createdAt: 'asc' },
      }));
  if (!account?.active) return null;
  return {
    accessToken: decryptToken(account.accessTokenEnc),
    phoneNumberId: account.phoneNumberId,
    wabaId: account.wabaId,
  };
}

async function graphFetch(
  config: WhatsAppConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GRAPH}/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
}

export async function sendTemplateMessage(
  config: WhatsAppConfig,
  to: string,
  templateName: string,
  language: string,
  variables: string[] = [],
): Promise<{ wamid: string }> {
  const phone = to.replace(/^\+/, '');
  const components =
    variables.length > 0
      ? [
          {
            type: 'body',
            parameters: variables.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined;

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  };

  const res = await graphFetch(config, `${config.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string; code: number } };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `WhatsApp API error ${res.status}`);
  }
  return { wamid: data.messages?.[0]?.id ?? '' };
}

export async function sendSessionMessage(
  config: WhatsAppConfig,
  to: string,
  text: string,
): Promise<{ wamid: string }> {
  const phone = to.replace(/^\+/, '');
  const res = await graphFetch(config, `${config.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `WhatsApp API error ${res.status}`);
  return { wamid: data.messages?.[0]?.id ?? '' };
}

export async function sendMediaMessage(
  config: WhatsAppConfig,
  to: string,
  mediaUrl: string,
  caption?: string,
  mediaType: 'image' | 'document' = 'image',
): Promise<{ wamid: string }> {
  const phone = to.replace(/^\+/, '');
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: phone,
    type: mediaType,
    [mediaType]: { link: mediaUrl, ...(caption ? { caption } : {}) },
  };
  const res = await graphFetch(config, `${config.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `WhatsApp API error ${res.status}`);
  return { wamid: data.messages?.[0]?.id ?? '' };
}

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: { type: string; text?: string }[];
}

export async function syncTemplatesFromMeta(
  organizationId: string,
  config: WhatsAppConfig,
): Promise<number> {
  const res = await graphFetch(
    config,
    `${config.wabaId}/message_templates?limit=100&fields=name,language,status,category,components`,
  );
  const data = (await res.json()) as { data?: MetaTemplate[]; error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? 'Failed to sync templates');

  let count = 0;
  for (const t of data.data ?? []) {
    const bodyComp = t.components?.find((c) => c.type === 'BODY');
    const bodyPreview = bodyComp?.text ?? '';
    const varCount = (bodyPreview.match(/\{\{\d+\}\}/g) ?? []).length;
    const status =
      t.status === 'APPROVED' ? 'Approved' : t.status === 'REJECTED' ? 'Rejected' : 'Pending';

    await prisma.messageTemplate.upsert({
      where: {
        organizationId_metaName_language: {
          organizationId,
          metaName: t.name,
          language: t.language,
        },
      },
      create: {
        organizationId,
        metaName: t.name,
        language: t.language,
        category: t.category,
        bodyPreview,
        componentsJson: JSON.stringify(t.components ?? []),
        status,
        variableCount: varCount,
        syncedAt: new Date(),
      },
      update: {
        category: t.category,
        bodyPreview,
        componentsJson: JSON.stringify(t.components ?? []),
        status,
        variableCount: varCount,
        syncedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export function verifyWebhookChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'reach-webhook-verify';
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

export async function handleWebhookPayload(payload: unknown): Promise<void> {
  const body = payload as {
    entry?: {
      changes?: {
        value?: {
          messaging_product?: string;
          metadata?: { phone_number_id?: string };
          statuses?: {
            id: string;
            status: string;
            timestamp: string;
            errors?: { code: number; title: string }[];
          }[];
          messages?: {
            from: string;
            id: string;
            timestamp: string;
            type: string;
            text?: { body: string };
            image?: { id: string; caption?: string };
            document?: { id: string; filename?: string; caption?: string };
            audio?: { id: string };
            referral?: {
              source_type?: string;
              source_id?: string;
              source_url?: string;
              headline?: string;
              ctwa_clid?: string;
            };
          }[];
        };
      }[];
    }[];
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const account = await prisma.whatsAppAccount.findFirst({
        where: { phoneNumberId, active: true },
      });
      if (!account) continue;

      const orgId = account.organizationId;

      for (const status of value.statuses ?? []) {
        await handleStatusUpdate(orgId, status);
      }

      for (const msg of value.messages ?? []) {
        const channel =
          value.messaging_product === 'instagram'
            ? 'instagram'
            : value.messaging_product === 'messenger'
              ? 'messenger'
              : 'whatsapp';
        await handleInboundMessage(orgId, msg, channel);
      }
    }
  }
}

async function handleStatusUpdate(
  organizationId: string,
  status: { id: string; status: string; errors?: { code: number; title: string }[] },
): Promise<void> {
  const map: Record<string, string> = {
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
  };
  const newStatus = map[status.status] ?? status.status;

  const recipient = await prisma.campaignRecipient.findFirst({
    where: { wamid: status.id },
  });
  if (recipient) {
    const data: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'Sent') data.sentAt = new Date();
    if (newStatus === 'Delivered') data.deliveredAt = new Date();
    if (newStatus === 'Read') data.readAt = new Date();
    if (newStatus === 'Failed') {
      data.errorCode = String(status.errors?.[0]?.code ?? '');
      data.errorMessage = status.errors?.[0]?.title ?? 'Delivery failed';
    }
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data });
    if (newStatus === 'Read') {
      const { adjustEngagementScore } = await import('../scoring/index.js');
      await adjustEngagementScore(recipient.contactId, 'campaign_read');
    }
  }

  const message = await prisma.message.findFirst({ where: { wamid: status.id } });
  if (message) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: newStatus },
    });
  }
}

async function handleInboundMessage(
  organizationId: string,
  msg: {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string };
    document?: { id: string; filename?: string; caption?: string };
    audio?: { id: string };
    referral?: {
      source_type?: string;
      source_id?: string;
      source_url?: string;
      headline?: string;
      ctwa_clid?: string;
    };
  },
  channel = 'whatsapp',
): Promise<void> {
  const { handleOptOutKeyword } = await import('./compliance.js');
  const phone = '+' + msg.from.replace(/\D/g, '');
  let body = msg.text?.body ?? '';
  let mediaUrl: string | null = null;

  if (msg.type === 'image' && msg.image) {
    body = msg.image.caption ?? '[Image]';
    mediaUrl = `meta://${msg.image.id}`;
  } else if (msg.type === 'document' && msg.document) {
    body = msg.document.caption ?? `[Document: ${msg.document.filename ?? 'file'}]`;
    mediaUrl = `meta://${msg.document.id}`;
  } else if (msg.type === 'audio' && msg.audio) {
    body = '[Voice note]';
    mediaUrl = `meta://${msg.audio.id}`;
  }

  let contact = await prisma.contact.findUnique({
    where: { organizationId_phoneE164: { organizationId, phoneE164: phone } },
  });
  const isNewContact = !contact;
  if (!contact) {
    contact = await prisma.contact.create({
      data: { organizationId, phoneE164: phone, optInStatus: 'Unknown', source: 'whatsapp_inbound' },
    });
    const { dispatchWebhooks } = await import('../webhooks/outbound.js');
    await dispatchWebhooks(organizationId, 'contact.created', {
      contactId: contact.id,
      phoneE164: phone,
      source: msg.referral ? 'ctwa' : 'whatsapp_inbound',
    });
  }

  if (body && (await handleOptOutKeyword(organizationId, contact.id, body))) {
    return;
  }

  let conversation = await prisma.conversation.findUnique({
    where: { organizationId_contactId: { organizationId, contactId: contact.id } },
  });
  if (!conversation) {
    const sessionUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const referralSource = msg.referral?.source_type === 'ad' ? 'ctwa' : msg.referral?.source_type ?? null;
    conversation = await prisma.conversation.create({
      data: {
        organizationId,
        contactId: contact.id,
        unreadCount: 1,
        sessionOpenUntil: sessionUntil,
        referralSource,
        ctwaClid: msg.referral?.ctwa_clid ?? null,
        channel,
      },
    });
    const { routeInboundConversation } = await import('../routing/index.js');
    await routeInboundConversation(organizationId, conversation.id, body);
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        unreadCount: { increment: 1 },
        lastMessageAt: new Date(),
        sessionOpenUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'Inbound',
      type: msg.type,
      body,
      mediaUrl,
      wamid: msg.id,
      status: 'Delivered',
    },
  });

  const { logActivity } = await import('../activity/index.js');
  const { adjustEngagementScore } = await import('../scoring/index.js');
  await logActivity({
    organizationId,
    contactId: contact.id,
    channel: 'whatsapp',
    direction: 'inbound',
    body,
    metadata: {
      messageId: msg.id,
      referral: msg.referral ?? null,
      ctwaClid: msg.referral?.ctwa_clid ?? null,
      isNewContact,
    },
    relatedId: conversation.id,
  });
  await adjustEngagementScore(contact.id, 'inbound_message');

  // CSAT: if conversation was resolved and awaiting score, parse 1–5 reply
  if (conversation.resolvedAt && conversation.csatScore == null && body.trim()) {
    const scoreMatch = body.trim().match(/^([1-5])(?:\s*(.*))?$/s);
    if (scoreMatch) {
      const score = Number(scoreMatch[1]);
      const comment = scoreMatch[2]?.trim() || null;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { csatScore: score, csatComment: comment },
      });
      const config = await getWhatsAppConfig(organizationId);
      const thanks = 'Thank you for your feedback!';
      if (config) {
        await sendSessionMessage(config, contact.phoneE164, thanks);
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'Outbound',
            type: 'text',
            body: thanks,
            status: 'Sent',
          },
        });
      }
      const { eventBus } = await import('../../lib/events.js');
      eventBus.emitEvent({ type: 'inbox.updated', organizationId, conversationId: conversation.id });
      return;
    }
  }

  await prisma.campaignRecipient.updateMany({
    where: {
      contactId: contact.id,
      status: { in: ['Sent', 'Delivered', 'Read'] },
      repliedAt: null,
    },
    data: { repliedAt: new Date() },
  });

  const { dispatchWebhooks } = await import('../webhooks/outbound.js');
  await dispatchWebhooks(organizationId, 'message.inbound', {
    contactId: contact.id,
    conversationId: conversation.id,
    body,
    phoneE164: contact.phoneE164,
    referral: msg.referral ?? null,
  });

  if (contact.crmLeadId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    const { pushCrmComment } = await import('../crm/sync.js');
    const prefix = mediaUrl ? '[Media] ' : '';
    await pushCrmComment(contact.crmLeadId, `${prefix}${body}`, { apiUrl: org?.crmApiUrl });
  }

  const ctx = {
    organizationId,
    contactId: contact.id,
    conversationId: conversation.id,
    body,
  };

  const chatbotState = (() => {
    try {
      return JSON.parse(conversation.chatbotState || '{}') as { handoff?: boolean };
    } catch {
      return {};
    }
  })();

  if (!chatbotState.handoff) {
    const { isWithinBusinessHours, getOutsideHoursMessage } = await import('../inbox/businessHours.js');
    const withinHours = await isWithinBusinessHours(organizationId);
    if (!withinHours) {
      const msgText = await getOutsideHoursMessage(organizationId);
      if (msgText) {
        const config = await getWhatsAppConfig(organizationId);
        if (config) {
          await sendSessionMessage(config, contact.phoneE164, msgText);
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              direction: 'Outbound',
              type: 'text',
              body: msgText,
              status: 'Sent',
            },
          });
        }
      }
    } else {
      const {
        processChatbotRules,
        tryWorkflowKeywordBranch,
        tryTriggerWorkflows,
      } = await import('../chatbot/index.js');
      await tryWorkflowKeywordBranch(organizationId, contact.id, body);
      const handled = await processChatbotRules(ctx);
      if (!handled) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (org?.aiEnabled && body) {
          const { answerFromKnowledge } = await import('../ai/index.js');
          const ai = await answerFromKnowledge(organizationId, body, conversation.id);
          if (ai.answer && !ai.escalated) {
            const config = await getWhatsAppConfig(organizationId);
            if (config) {
              await sendSessionMessage(config, contact.phoneE164, ai.answer);
              await prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  direction: 'Outbound',
                  type: 'text',
                  body: ai.answer,
                  status: 'Sent',
                },
              });
            }
          } else if (ai.escalated) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { chatbotState: JSON.stringify({ handoff: true }) },
            });
          }
        } else {
          await tryTriggerWorkflows(ctx);
        }
      }
    }
  }

  const { eventBus } = await import('../../lib/events.js');
  eventBus.emitEvent({ type: 'inbox.updated', organizationId, conversationId: conversation.id });
}
