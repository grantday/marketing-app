const DEFAULT_URL = process.env.ARENARAMA_API_URL || 'http://localhost:3001';

export async function pushCrmComment(
  crmLeadId: string,
  body: string,
  opts: { apiUrl?: string | null; cookie?: string } = {},
): Promise<boolean> {
  const base = opts.apiUrl || DEFAULT_URL;
  const cookie = opts.cookie || process.env.ARENARAMA_API_COOKIE || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (cookie) headers.Cookie = cookie;

  try {
    const res = await fetch(`${base}/api/crm/leads/${crmLeadId}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body, type: 'Note' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchCrmLeads(opts: { apiUrl?: string | null; cookie?: string } = {}): Promise<
  { id: string; stage?: string; phone?: string }[]
> {
  const base = opts.apiUrl || DEFAULT_URL;
  const cookie = opts.cookie || process.env.ARENARAMA_API_COOKIE || '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;

  try {
    const res = await fetch(`${base}/api/crm/leads`, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as { id: string; stage?: string; phone?: string }[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
