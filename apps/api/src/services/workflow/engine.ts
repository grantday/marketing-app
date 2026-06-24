import { prisma } from '../../lib/prisma.js';
import { parseJsonArray, stringifyJson } from '../../lib/phone.js';
import { parseSteps, delayMs } from '../../lib/workflow/types.js';
import { getWhatsAppConfig, sendTemplateMessage } from '../whatsapp/index.js';
import { canSendToContact } from '../whatsapp/compliance.js';
import { resolveTemplateVariables } from '../../lib/variables.js';
import { assignRoundRobin } from '../inbox/assign.js';
import { parseJsonObject } from '../../lib/phone.js';
import { workflowQueue } from '../../lib/workflow/queue.js';

export async function enrollContact(workflowId: string, contactId: string): Promise<void> {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf?.active) return;

  const existing = await prisma.workflowEnrollment.findUnique({
    where: { workflowId_contactId: { workflowId, contactId } },
  });
  if (existing && existing.status !== 'Completed' && existing.status !== 'Cancelled') return;

  const enrollment = await prisma.workflowEnrollment.upsert({
    where: { workflowId_contactId: { workflowId, contactId } },
    create: {
      workflowId,
      contactId,
      status: 'Active',
      currentStepIndex: 0,
      nextRunAt: new Date(),
    },
    update: {
      status: 'Active',
      currentStepIndex: 0,
      nextRunAt: new Date(),
      stepState: '{}',
    },
  });

  await workflowQueue.add('step', { enrollmentId: enrollment.id }, { delay: 0 });
}

export async function processEnrollmentStep(enrollmentId: string): Promise<void> {
  const enrollment = await prisma.workflowEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { workflow: true, contact: true },
  });
  if (!enrollment || enrollment.status === 'Completed' || enrollment.status === 'Cancelled') return;

  const steps = parseSteps(enrollment.workflow.stepsJson);
  if (enrollment.currentStepIndex >= steps.length) {
    await prisma.workflowEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'Completed', nextRunAt: null },
    });
    return;
  }

  const step = steps[enrollment.currentStepIndex];
  const orgId = enrollment.workflow.organizationId;
  const contact = enrollment.contact;

  if (step.type === 'delay') {
    const ms = delayMs(step);
    const nextAt = new Date(Date.now() + ms);
    await prisma.workflowEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'Active', nextRunAt: nextAt },
    });
    await workflowQueue.add('step', { enrollmentId }, { delay: ms });
    return;
  }

  if (step.type === 'branch_keyword') {
    await prisma.workflowEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'Waiting', nextRunAt: null },
    });
    return;
  }

  if (step.type === 'send_template') {
    const allowed = await canSendToContact(orgId, contact.id);
    if (!allowed) {
      await prisma.workflowEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'Cancelled', nextRunAt: null },
      });
      return;
    }

    const template = await prisma.messageTemplate.findFirst({
      where: { id: step.templateId, organizationId: orgId, status: 'Approved' },
    });
    if (!template) {
      await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
      return;
    }

    const config = await getWhatsAppConfig(orgId);
    if (!config) {
      await prisma.workflowEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'Cancelled', nextRunAt: null },
      });
      return;
    }

    const mapping = step.variableMapping ?? {};
    const vars = resolveTemplateVariables(contact, mapping);
    try {
      await sendTemplateMessage(config, contact.phoneE164, template.metaName, template.language, vars);
    } catch (e) {
      console.error('Workflow template send failed:', e);
    }
    await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
    return;
  }

  if (step.type === 'add_tag') {
    const tags = parseJsonArray(contact.tags);
    if (!tags.includes(step.tag)) {
      tags.push(step.tag);
      await prisma.contact.update({
        where: { id: contact.id },
        data: { tags: stringifyJson(tags) },
      });
      const { onTagAdded } = await import('../chatbot/index.js');
      await onTagAdded(orgId, contact.id, step.tag);
    }
    await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
    return;
  }

  if (step.type === 'assign_agent') {
    let conversation = await prisma.conversation.findUnique({
      where: { organizationId_contactId: { organizationId: orgId, contactId: contact.id } },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { organizationId: orgId, contactId: contact.id },
      });
    }
    if (step.mode === 'round_robin') {
      await assignRoundRobin(orgId, conversation.id);
    }
    await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
    return;
  }

  if (step.type === 'handoff') {
    let conversation = await prisma.conversation.findUnique({
      where: { organizationId_contactId: { organizationId: orgId, contactId: contact.id } },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { organizationId: orgId, contactId: contact.id },
      });
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { chatbotState: stringifyJson({ handoff: true }) },
    });
    await assignRoundRobin(orgId, conversation.id);
    await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
    return;
  }

  await advanceStep(enrollmentId, enrollment.currentStepIndex + 1);
}

async function advanceStep(enrollmentId: string, nextIndex: number): Promise<void> {
  const enrollment = await prisma.workflowEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { workflow: true },
  });
  if (!enrollment) return;

  const steps = parseSteps(enrollment.workflow.stepsJson);
  if (nextIndex >= steps.length) {
    await prisma.workflowEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'Completed', currentStepIndex: nextIndex, nextRunAt: null },
    });
    return;
  }

  await prisma.workflowEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'Active', currentStepIndex: nextIndex, nextRunAt: new Date() },
  });
  await workflowQueue.add('step', { enrollmentId }, { delay: 0 });
}

export async function pollDueEnrollments(): Promise<void> {
  const due = await prisma.workflowEnrollment.findMany({
    where: {
      status: 'Active',
      nextRunAt: { lte: new Date() },
    },
    take: 50,
  });
  for (const en of due) {
    await workflowQueue.add('step', { enrollmentId: en.id }, { delay: 0 });
  }
}
