const SECTIONS = [
  {
    title: 'Getting started',
    items: [
      { q: 'How do I connect WhatsApp?', a: 'Go to WhatsApp Setup. Use Meta Embedded Signup (recommended) or paste your access token, phone number ID, and WABA ID from Meta Business Manager.' },
      { q: 'What is the 24-hour session window?', a: 'After a contact messages you, you can send free-form session messages for 24 hours. Outside that window, use approved templates for outbound marketing.' },
      { q: 'How does opt-in work?', a: 'Enable Strict opt-in in Settings. Only contacts with OptedIn status receive campaigns. Contacts can opt out anytime by sending STOP.' },
    ],
  },
  {
    title: 'Campaigns & templates',
    items: [
      { q: 'Why must templates be approved?', a: 'Meta requires pre-approved message templates for business-initiated conversations. Sync templates from Meta after connecting WhatsApp.' },
      { q: 'What is A/B testing?', a: 'Split your audience between two templates. Reach picks the winner by read or reply rate when the campaign completes.' },
      { q: 'Cross-channel fallback?', a: 'If WhatsApp is unread after 48 hours, Reach can email contacts who have an email address (requires Resend in Settings).' },
    ],
  },
  {
    title: 'API & integrations',
    items: [
      { q: 'Public API base URL', a: 'Use /api/v1 with a Bearer API key from Developer settings. Endpoints include contacts, timeline, and Zapier triggers.' },
      { q: 'Webhooks', a: 'Configure outbound webhooks in Developer to receive message.inbound, contact.created, and campaign.completed events.' },
      { q: 'CRM import', a: 'Integrations page imports leads from Arenarama ERP. Two-way sync pushes inbox messages as CRM comments when configured.' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { q: 'Trial limits', a: 'New accounts get 14 days free with 500 contacts and 2,000 messages. Upgrade anytime from Billing.' },
      { q: 'What counts as a message?', a: 'Each successful outbound campaign template send counts toward your monthly message quota.' },
    ],
  },
];

export default function HelpPage() {
  return (
    <div>
      <h1 className="page-title">Help & documentation</h1>
      <p className="muted mb-4">Guides for your team. API reference is in Developer settings.</p>

      {SECTIONS.map((section) => (
        <div key={section.title} className="card mb-4">
          <h2 className="section-title">{section.title}</h2>
          {section.items.map((item) => (
            <div key={item.q} style={{ marginBottom: '1rem' }}>
              <strong>{item.q}</strong>
              <p className="muted" style={{ marginTop: '0.25rem' }}>{item.a}</p>
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <h2 className="section-title">Meta policy checklist</h2>
        <ul>
          <li>Only message contacts who opted in</li>
          <li>Use MARKETING category templates for promotions</li>
          <li>Honor STOP / opt-out immediately</li>
          <li>Verify webhook in WhatsApp Setup</li>
          <li>Keep complaint rate low — monitor Reports & Compliance</li>
        </ul>
      </div>
    </div>
  );
}
