export const OPT_IN_STATUS = ['OptedIn', 'OptedOut', 'Unknown'] as const;
export type OptInStatus = (typeof OPT_IN_STATUS)[number];

export const USER_ROLES = ['Admin', 'Marketer', 'Agent'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CAMPAIGN_STATUS = ['Draft', 'Scheduled', 'Sending', 'Completed', 'Failed', 'Paused', 'Cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];

export const RECIPIENT_STATUS = ['Queued', 'Sent', 'Delivered', 'Read', 'Failed', 'Skipped'] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUS)[number];

export const TEMPLATE_STATUS = ['Pending', 'Approved', 'Rejected'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUS)[number];

export const MESSAGE_DIRECTION = ['Inbound', 'Outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTION)[number];

export const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'CANCEL'];

export const VARIABLE_FIELD_OPTIONS = [
  { value: 'contact.name', label: 'Contact name' },
  { value: 'contact.phone', label: 'Phone number' },
  { value: 'contact.crmLeadId', label: 'CRM lead ID' },
  { value: 'contact.customFields.stage', label: 'CRM stage' },
  { value: 'contact.customFields.services', label: 'CRM services' },
] as const;
