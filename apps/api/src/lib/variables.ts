import { parseJsonObject } from './phone.js';

export interface ContactForVars {
  name: string | null;
  phoneE164: string;
  tags: string;
  customFields: string;
  crmLeadId: string | null;
}

/** Resolve campaign variable mapping to Meta template parameter values per contact */
export function resolveTemplateVariables(
  contact: ContactForVars,
  mapping: Record<string, string>,
): string[] {
  const keys = Object.keys(mapping).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => resolveVariableToken(contact, mapping[k] ?? ''));
}

function resolveVariableToken(contact: ContactForVars, token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return '';

  // Field reference: contact.name, contact.phone, contact.crmLeadId, contact.customFields.stage
  if (trimmed.startsWith('contact.')) {
    const path = trimmed.slice('contact.'.length);
    const custom = parseJsonObject(contact.customFields);
    if (path === 'name') return contact.name ?? '';
    if (path === 'phone') return contact.phoneE164;
    if (path === 'crmLeadId') return contact.crmLeadId ?? '';
    if (path.startsWith('customFields.')) {
      const key = path.slice('customFields.'.length);
      const val = custom[key];
      return val != null ? String(val) : '';
    }
    return '';
  }

  // Legacy {{field}} syntax
  const m = trimmed.match(/^\{\{(.+)\}\}$/);
  if (m) return resolveVariableToken(contact, `contact.${m[1]}`);

  return trimmed;
}

export const VARIABLE_FIELD_OPTIONS = [
  { value: 'contact.name', label: 'Contact name' },
  { value: 'contact.phone', label: 'Phone number' },
  { value: 'contact.crmLeadId', label: 'CRM lead ID' },
  { value: 'contact.customFields.stage', label: 'CRM stage' },
  { value: 'contact.customFields.services', label: 'CRM services' },
] as const;
