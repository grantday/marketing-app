export type WorkflowStep =
  | { type: 'delay'; days?: number; hours?: number; minutes?: number }
  | { type: 'send_template'; templateId: string; variableMapping?: Record<string, string> }
  | { type: 'branch_keyword'; branches: { keyword: string; gotoStep: number }[]; defaultStep?: number }
  | { type: 'add_tag'; tag: string }
  | { type: 'assign_agent'; mode: 'round_robin' }
  | { type: 'handoff' };

export type TriggerType =
  | 'InboundKeyword'
  | 'TagAdded'
  | 'CrmStage'
  | 'Manual'
  | 'DripStart';

export function parseSteps(json: string): WorkflowStep[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseTriggerConfig(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function delayMs(step: Extract<WorkflowStep, { type: 'delay' }>): number {
  const d = (step.days ?? 0) * 86400000;
  const h = (step.hours ?? 0) * 3600000;
  const m = (step.minutes ?? 0) * 60000;
  return d + h + m;
}
