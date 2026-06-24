import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyWebhookChallenge, handleWebhookPayload } from '../services/whatsapp/index.js';
import { verifyMetaWebhookSignature } from '../lib/webhook.js';

const router = Router();

router.get('/whatsapp', (req, res) => {
  const challenge = verifyWebhookChallenge(
    req.query['hub.mode'] as string,
    req.query['hub.verify_token'] as string,
    req.query['hub.challenge'] as string,
  );
  if (challenge) return res.status(200).send(challenge);
  res.status(403).send('Forbidden');
});

export async function handleWhatsAppWebhookPost(req: Request, res: Response): Promise<void> {
  const appSecret = process.env.META_APP_SECRET;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (appSecret && rawBody) {
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) {
      res.status(401).send('Invalid signature');
      return;
    }
  }

  const payload = req.body;
  await prisma.webhookEvent.create({
    data: { payload: JSON.stringify(payload) },
  });

  try {
    await handleWebhookPayload(payload);
  } catch (e) {
    console.error('Webhook processing error:', e);
  }

  res.status(200).send('EVENT_RECEIVED');
}

export default router;
