import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  orgName: z.string().min(2).max(80),
  fullName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const contactCreateSchema = z.object({
  phoneE164: z.string().min(8),
  email: z.string().email().optional(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  optInStatus: z.enum(['OptedIn', 'OptedOut', 'Unknown']).optional(),
  source: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const contactListCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  filterTags: z.array(z.string()).optional(),
  optInOnly: z.boolean().optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().uuid(),
  listId: z.string().uuid(),
  variableMapping: z.record(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  channelStrategy: z
    .object({
      primary: z.string().optional(),
      fallback: z
        .object({
          channel: z.enum(['email', 'sms']).optional(),
          afterHours: z.number().optional(),
          emailSubject: z.string().optional(),
          emailBody: z.string().optional(),
          smsBody: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  abTest: z
    .object({
      enabled: z.boolean().optional(),
      variantA: z.object({ templateId: z.string().uuid() }).optional(),
      variantB: z.object({ templateId: z.string().uuid() }).optional(),
      splitPercent: z.number().min(1).max(99).optional(),
      winnerMetric: z.enum(['read', 'reply']).optional(),
    })
    .optional(),
});

export const whatsappSetupSchema = z.object({
  accessToken: z.string().min(10),
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1),
  displayPhone: z.string().optional(),
});

/** Update flow: leave accessToken blank to keep the existing token */
export const whatsappUpdateSchema = z.object({
  accessToken: z.string().optional(),
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1),
  displayPhone: z.string().optional(),
});

export const inboxReplySchema = z.object({
  body: z.string().min(1).max(4096),
});
