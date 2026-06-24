import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'arenarama' },
    create: { name: 'Arenarama', slug: 'arenarama' },
    update: {},
  });

  const passwordHash = await hashPassword('ChangeMe!2026');

  await prisma.user.upsert({
    where: { email: 'sales@arenarama.local' },
    create: {
      organizationId: org.id,
      email: 'sales@arenarama.local',
      passwordHash,
      fullName: 'Sales Manager',
      role: 'Admin',
      emailVerified: true,
    },
    update: { emailVerified: true },
  });

  await prisma.user.upsert({
    where: { email: 'agent@arenarama.local' },
    create: {
      organizationId: org.id,
      email: 'agent@arenarama.local',
      passwordHash,
      fullName: 'Sales Agent',
      role: 'Agent',
      emailVerified: true,
      skillsJson: '["sales", "support"]',
      languagesJson: '["en"]',
    },
    update: {
      emailVerified: true,
      skillsJson: '["sales", "support"]',
      languagesJson: '["en"]',
    },
  });

  const list = await prisma.contactList.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      organizationId: org.id,
      name: 'All Opted-In Contacts',
      description: 'Default audience — opted-in contacts only',
      optInOnly: true,
    },
    update: {},
  });

  const sampleContacts = [
    { phone: '+263771234567', name: 'Tendai Moyo' },
    { phone: '+263772345678', name: 'Rudo Chikwanha' },
    { phone: '+263773456789', name: 'Farai Ndlovu' },
  ];

  for (const s of sampleContacts) {
    const contact = await prisma.contact.upsert({
      where: {
        organizationId_phoneE164: { organizationId: org.id, phoneE164: s.phone },
      },
      create: {
        organizationId: org.id,
        phoneE164: s.phone,
        name: s.name,
        optInStatus: 'OptedIn',
        source: 'seed',
        tags: '[]',
      },
      update: {},
    });
    await prisma.contactListMember.upsert({
      where: { listId_contactId: { listId: list.id, contactId: contact.id } },
      create: { listId: list.id, contactId: contact.id },
      update: {},
    });
  }

  console.log('Seed complete. Logins: sales@arenarama.local / agent@arenarama.local — password ChangeMe!2026');

  const pipelineSteps = JSON.stringify([
    { type: 'delay', days: 0, hours: 0, minutes: 5 },
    { type: 'add_tag', tag: 'journey:started' },
    { type: 'handoff' },
  ]);

  await prisma.workflow.upsert({
    where: { id: '00000000-0000-4000-8000-000000000010' },
    create: {
      id: '00000000-0000-4000-8000-000000000010',
      organizationId: org.id,
      name: 'NonCompliant → Follow-up',
      description: 'Tag and hand off when lead is non-compliant',
      triggerType: 'CrmStage',
      triggerConfig: JSON.stringify({ stage: 'NonCompliant' }),
      stepsJson: pipelineSteps,
      active: false,
      isTemplate: true,
    },
    update: {},
  });

  await prisma.workflow.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      organizationId: org.id,
      name: 'Compliant → Welcome drip',
      description: 'Day 0 welcome, day 3 check-in (configure template steps)',
      triggerType: 'CrmStage',
      triggerConfig: JSON.stringify({ stage: 'Compliant' }),
      stepsJson: JSON.stringify([
        { type: 'add_tag', tag: 'stage:Compliant' },
        { type: 'delay', days: 3, hours: 0, minutes: 0 },
        { type: 'handoff' },
      ]),
      active: false,
      isTemplate: true,
    },
    update: {},
  });

  await prisma.chatbotRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000020' },
    create: {
      id: '00000000-0000-4000-8000-000000000020',
      organizationId: org.id,
      name: 'Pricing menu',
      keyword: 'PRICING',
      matchType: 'contains',
      responseBody: 'Thanks for your interest! Our team can share a quote.\n\nReply:\n1. Residential\n2. Commercial\n3. Speak to agent',
      menuOptionsJson: '[]',
      priority: 10,
      handoffAfter: false,
      active: true,
    },
    update: {},
  });

  await prisma.cannedReply.upsert({
    where: { id: '00000000-0000-4000-8000-000000000030' },
    create: {
      id: '00000000-0000-4000-8000-000000000030',
      organizationId: org.id,
      title: 'Thanks',
      body: 'Thank you for reaching out! A team member will assist you shortly.',
      shortcut: '/thanks',
    },
    update: {},
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      businessHoursJson: JSON.stringify({
        mon: { start: '08:00', end: '17:00' },
        tue: { start: '08:00', end: '17:00' },
        wed: { start: '08:00', end: '17:00' },
        thu: { start: '08:00', end: '17:00' },
        fri: { start: '08:00', end: '17:00' },
        sat: { closed: true },
        sun: { closed: true },
      }),
      outsideHoursMessage: "Thanks for messaging Arenarama. We're outside business hours (Mon–Fri 8am–5pm). We'll reply on the next working day.",
      crmApiUrl: 'http://localhost:3001',
      aiEnabled: true,
      onboardingDoneAt: new Date(),
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      csatEnabled: true,
      csatPrompt: 'How was your experience? Reply 1 (poor) to 5 (excellent).',
      slaFirstResponseMinutes: 60,
      slaResolutionMinutes: 1440,
    },
  });

  await prisma.knowledgeArticle.upsert({
    where: { id: '00000000-0000-4000-8000-000000000040' },
    create: {
      id: '00000000-0000-4000-8000-000000000040',
      organizationId: org.id,
      title: 'Pricing overview',
      content: 'Our construction compliance services start from consultation packages. Contact sales for a custom quote based on project stage and services needed.',
      tags: '["pricing", "sales"]',
      active: true,
    },
    update: {},
  });

  await prisma.knowledgeArticle.upsert({
    where: { id: '00000000-0000-4000-8000-000000000041' },
    create: {
      id: '00000000-0000-4000-8000-000000000041',
      organizationId: org.id,
      title: 'Business hours',
      content: 'We are open Monday to Friday, 8am to 5pm. Messages outside hours receive an auto-reply and we respond on the next business day.',
      tags: '["hours", "support"]',
      active: true,
    },
    update: {},
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
