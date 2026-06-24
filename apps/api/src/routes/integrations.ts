import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { normalizePhone, stringifyJson } from '../lib/phone.js';
import { writeAudit } from '../lib/audit.js';

const router = Router();

interface CrmLead {
  id: string;
  name?: string;
  phone?: string;
  stage?: string;
  services?: string[];
}

router.post('/arenarama/import-leads', requireAuth, async (req, res) => {
  const { csv, apiUrl, consentConfirmed } = req.body as {
    csv?: string;
    apiUrl?: string;
    consentConfirmed?: boolean;
  };

  if (!consentConfirmed) {
    return res.status(400).json({
      error: 'Confirm consent before importing CRM leads for WhatsApp outreach',
    });
  }

  const orgId = req.user!.organizationId;
  let leads: CrmLead[] = [];

  if (csv) {
    const { parseCsv, pickField } = await import('../lib/csv.js');
    const rows = parseCsv(csv);
    leads = rows.map((row) => ({
      id: pickField(row, 'id', 'leadid'),
      name: pickField(row, 'name', 'fullname'),
      phone: pickField(row, 'phone', 'whatsapp', 'mobile'),
      stage: pickField(row, 'stage'),
      services: pickField(row, 'services')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }));
  } else {
    const baseUrl = apiUrl || process.env.ARENARAMA_API_URL || 'http://localhost:3001';
    const cookie = process.env.ARENARAMA_API_COOKIE;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;

    try {
      const response = await fetch(`${baseUrl}/api/crm/leads`, { headers });
      if (!response.ok) {
        return res.status(400).json({
          error: `Arenarama API returned ${response.status}. Export CSV instead or set ARENARAMA_API_COOKIE.`,
        });
      }
      const data = (await response.json()) as CrmLead[] | { leads?: CrmLead[] };
      leads = Array.isArray(data) ? data : (data.leads ?? []);
    } catch (e) {
      return res.status(400).json({
        error: `Cannot reach Arenarama API: ${e instanceof Error ? e.message : 'unknown'}`,
      });
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const lead of leads) {
    const phone = normalizePhone(lead.phone ?? '');
    if (!phone) {
      skipped++;
      continue;
    }
    const tags: string[] = [];
    if (lead.stage) tags.push(`stage:${lead.stage}`);
    if (lead.services?.length) tags.push(...lead.services);

    await prisma.contact.upsert({
      where: { organizationId_phoneE164: { organizationId: orgId, phoneE164: phone } },
      create: {
        organizationId: orgId,
        phoneE164: phone,
        name: lead.name ?? null,
        tags: stringifyJson(tags),
        optInStatus: 'Unknown',
        consentedAt: new Date(),
        source: 'arenarama_crm',
        crmLeadId: lead.id || null,
        customFields: stringifyJson({ stage: lead.stage, services: lead.services }),
      },
      update: {
        name: lead.name ?? undefined,
        crmLeadId: lead.id || undefined,
        tags: tags.length ? stringifyJson(tags) : undefined,
      },
    });
    imported++;
  }

  await writeAudit(orgId, 'arenarama.import', {
    userId: req.user!.userId,
    details: { imported, skipped },
  });

  res.json({ imported, skipped });
});

export default router;
