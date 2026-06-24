import { prisma } from '../../lib/prisma.js';

interface DayHours {
  start?: string;
  end?: string;
  closed?: boolean;
}

interface BusinessHours {
  timezone?: string;
  mon?: DayHours;
  tue?: DayHours;
  wed?: DayHours;
  thu?: DayHours;
  fri?: DayHours;
  sat?: DayHours;
  sun?: DayHours;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseHours(json: string): BusinessHours {
  try {
    return JSON.parse(json) as BusinessHours;
  } catch {
    return {};
  }
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export async function isWithinBusinessHours(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return true;
  const bh = parseHours(org.businessHoursJson);
  if (!bh.mon && !bh.tue) return true;

  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const day = bh[dayKey];
  if (!day || day.closed) return false;
  if (!day.start || !day.end) return true;

  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= parseTime(day.start) && mins < parseTime(day.end);
}

export async function getOutsideHoursMessage(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  return org?.outsideHoursMessage ?? null;
}
