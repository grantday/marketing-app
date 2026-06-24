import { parseJsonArray, parseJsonObject } from './phone.js';

export interface SegmentRule {
  operator: 'AND' | 'OR';
  tags?: string[];
  minEngagementScore?: number;
  maxEngagementScore?: number;
  crmStages?: string[];
  optInStatus?: string[];
  hasEmail?: boolean;
}

export interface ContactForSegment {
  tags: string;
  engagementScore: number;
  optInStatus: string;
  email: string | null;
  customFields: string;
}

export function parseSegmentRules(json: string): SegmentRule {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as SegmentRule) : { operator: 'AND', tags: [] };
  } catch {
    return { operator: 'AND', tags: [] };
  }
}

export function contactMatchesSegment(contact: ContactForSegment, rules: SegmentRule): boolean {
  const tags = parseJsonArray(contact.tags);
  const custom = parseJsonObject(contact.customFields);
  const stage = String(custom.stage ?? '');

  const checks: boolean[] = [];

  if (rules.tags?.length) {
    if (rules.operator === 'AND') {
      checks.push(rules.tags.every((t) => tags.includes(t)));
    } else {
      checks.push(rules.tags.some((t) => tags.includes(t)));
    }
  }

  if (rules.crmStages?.length) {
    checks.push(rules.crmStages.includes(stage));
  }

  if (rules.minEngagementScore != null) {
    checks.push(contact.engagementScore >= rules.minEngagementScore);
  }
  if (rules.maxEngagementScore != null) {
    checks.push(contact.engagementScore <= rules.maxEngagementScore);
  }

  if (rules.optInStatus?.length) {
    checks.push(rules.optInStatus.includes(contact.optInStatus));
  }

  if (rules.hasEmail === true) {
    checks.push(!!contact.email);
  }
  if (rules.hasEmail === false) {
    checks.push(!contact.email);
  }

  if (checks.length === 0) return true;
  return rules.operator === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
}

export function filterContactsBySegment<T extends ContactForSegment>(
  contacts: T[],
  rules: SegmentRule,
): T[] {
  return contacts.filter((c) => contactMatchesSegment(c, rules));
}
