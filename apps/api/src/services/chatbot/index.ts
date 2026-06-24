import { prisma } from '../../lib/prisma.js';
import { stringifyJson } from '../../lib/phone.js';
import { getWhatsAppConfig, sendSessionMessage } from '../whatsapp/index.js';

export interface InboundContext {
  organizationId: string;
  contactId: string;
  conversationId: string;
  body: string;
}

export async function processChatbotRules(ctx: InboundContext): Promise<boolean> {
  const rules = await prisma.chatbotRule.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    orderBy: { priority: 'desc' },
  });

  const text = ctx.body.trim().toUpperCase();
  if (!text) return false;

  for (const rule of rules) {
    const kw = rule.keyword.trim().toUpperCase();
    let match = false;
    if (rule.matchType === 'equals') match = text === kw;
    else if (rule.matchType === 'starts_with') match = text.startsWith(kw);
    else match = text.includes(kw);

    if (!match) continue;

    let response = rule.responseBody;
    try {
      const menu = JSON.parse(rule.menuOptionsJson) as { label: string; reply: string }[];
      if (menu.length) {
        response += '\n\n' + menu.map((m, i) => `${i + 1}. ${m.label}`).join('\n');
      }
    } catch {
      /* ignore */
    }

    const config = await getWhatsAppConfig(ctx.organizationId);
    const contact = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
    if (config && contact) {
      await sendSessionMessage(config, contact.phoneE164, response);
      await prisma.message.create({
        data: {
          conversationId: ctx.conversationId,
          direction: 'Outbound',
          type: 'text',
          body: response,
          status: 'Sent',
        },
      });
    }

    if (rule.handoffAfter) {
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { chatbotState: stringifyJson({ handoff: true }) },
      });
    }
    return true;
  }
  return false;
}

export async function tryWorkflowKeywordBranch(
  organizationId: string,
  contactId: string,
  body: string,
): Promise<void> {
  const text = body.trim().toUpperCase();
  const enrollments = await prisma.workflowEnrollment.findMany({
    where: { contactId, status: 'Waiting' },
    include: { workflow: true },
  });

  const { parseSteps } = await import('../../lib/workflow/types.js');

  for (const en of enrollments) {
    const steps = parseSteps(en.workflow.stepsJson);
    const step = steps[en.currentStepIndex];
    if (!step || step.type !== 'branch_keyword') continue;

    let goto = step.defaultStep ?? en.currentStepIndex + 1;
    for (const b of step.branches) {
      if (text.includes(b.keyword.toUpperCase())) {
        goto = b.gotoStep;
        break;
      }
    }

    await prisma.workflowEnrollment.update({
      where: { id: en.id },
      data: { status: 'Active', currentStepIndex: goto, nextRunAt: new Date() },
    });
  }
}

export async function tryTriggerWorkflows(ctx: InboundContext): Promise<void> {
  const text = ctx.body.trim().toUpperCase();
  const workflows = await prisma.workflow.findMany({
    where: { organizationId: ctx.organizationId, active: true, triggerType: 'InboundKeyword' },
  });

  const { parseTriggerConfig } = await import('../../lib/workflow/types.js');
  const { enrollContact } = await import('../workflow/engine.js');

  for (const wf of workflows) {
    const cfg = parseTriggerConfig(wf.triggerConfig);
    const kw = (cfg.keyword ?? '').toUpperCase();
    if (!kw || !text.includes(kw)) continue;
    await enrollContact(wf.id, ctx.contactId);
  }
}

export async function onTagAdded(organizationId: string, contactId: string, tag: string): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId, active: true, triggerType: 'TagAdded' },
  });
  const { parseTriggerConfig } = await import('../../lib/workflow/types.js');
  const { enrollContact } = await import('../workflow/engine.js');

  for (const wf of workflows) {
    const cfg = parseTriggerConfig(wf.triggerConfig);
    if (cfg.tag === tag) await enrollContact(wf.id, contactId);
  }
}

export async function onCrmStageChange(
  organizationId: string,
  contactId: string,
  stage: string,
): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId, active: true, triggerType: 'CrmStage' },
  });
  const { parseTriggerConfig } = await import('../../lib/workflow/types.js');
  const { enrollContact } = await import('../workflow/engine.js');

  for (const wf of workflows) {
    const cfg = parseTriggerConfig(wf.triggerConfig);
    if (cfg.stage === stage) await enrollContact(wf.id, contactId);
  }
}
