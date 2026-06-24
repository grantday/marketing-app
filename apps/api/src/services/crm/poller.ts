import { prisma } from '../../lib/prisma.js';
import { parseJsonObject } from '../../lib/phone.js';
import { onCrmStageChange } from '../chatbot/index.js';

const stageCache = new Map<string, Map<string, string>>();

export async function pollCrmStageChanges(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { crmApiUrl: { not: null } },
    select: { id: true, crmApiUrl: true },
  });

  const { fetchCrmLeads } = await import('./sync.js');

  for (const org of orgs) {
    const leads = await fetchCrmLeads({ apiUrl: org.crmApiUrl });
    if (!org.id) continue;

    let cache = stageCache.get(org.id);
    if (!cache) {
      cache = new Map();
      stageCache.set(org.id, cache);
    }

    for (const lead of leads) {
      if (!lead.id || !lead.stage) continue;

      const prev = cache.get(lead.id);
      cache.set(lead.id, lead.stage);

      if (prev !== undefined && prev !== lead.stage) {
        const contact = await prisma.contact.findFirst({
          where: { organizationId: org.id, crmLeadId: lead.id },
        });
        if (contact) {
          const custom = parseJsonObject(contact.customFields);
          custom.stage = lead.stage;
          await prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: JSON.stringify(custom) },
          });
          await onCrmStageChange(org.id, contact.id, lead.stage);
        }
      }
    }
  }
}
