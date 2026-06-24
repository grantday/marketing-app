/** Normalize phone to E.164-ish format */
export function normalizePhone(raw: string, defaultCountry = '263'): string {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && defaultCountry) {
    digits = defaultCountry + digits.slice(1);
  }
  if (!digits.startsWith('+')) digits = '+' + digits;
  else digits = '+' + digits.replace(/^\+/, '');
  return digits.startsWith('++') ? digits.slice(1) : digits;
}

export function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}
