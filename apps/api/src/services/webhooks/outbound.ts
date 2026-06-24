import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { parseJsonArray } from '../../lib/phone.js';

export type WebhookEventType =
  | 'contact.created'
  | 'message.inbound'
  | 'message.outbound'
  | 'contact.opt_out'
  | 'campaign.completed';

export async function dispatchWebhooks(
  organizationId: string,
  event: WebhookEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await prisma.outboundWebhook.findMany({
    where: { organizationId, active: true },
  });

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  for (const hook of hooks) {
    const events = parseJsonArray(hook.events);
    if (events.length && !events.includes(event) && !events.includes('*')) continue;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Reach-Webhook/1.0',
        'X-Reach-Event': event,
      };
      if (hook.secret) {
        const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
        headers['X-Reach-Signature'] = sig;
      }

      const res = await fetch(hook.url, { method: 'POST', headers, body });
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event,
          payload: body,
          statusCode: res.status,
          success: res.ok,
        },
      });
    } catch {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event,
          payload: body,
          success: false,
        },
      });
    }
  }
}
