import type { Recipient, Sender, Signature, Template } from './types'

// The "e" mark, used as the signature photo when the persona has none. It has
// to be publicly reachable by the recipient's mail client, so it points at
// elements.lk rather than this (password protected) app.
export const LOGO_URL = 'https://elements.lk/wp-content/uploads/2026/07/cropped-site-icon-192x192.png'

// The persona emails go out as. Everything here is editable in the app.
export const DEFAULT_FROM: Sender = {
  name: 'Amaya Silva from Elements',
  email: 'amaya@elementslanka.com',
}

export const DEFAULT_SIGNATURE: Signature = {
  name: 'Amaya Silva',
  title: 'Client Partner',
  company: 'Elements Sri Lanka',
  phone: '',
  website: 'elements.lk',
  photo: '',
  style: 'text',
}

// Used for the preview until real recipients are added.
export const SAMPLE_RECIPIENT: Recipient = {
  email: 'kamal@example.com',
  name: 'Kamal Perera',
  company: 'Lanka Tea Co.',
}

export const TEMPLATES: Template[] = [
  {
    id: 'introduction',
    name: 'Introduction',
    description: 'First hello to a new prospect',
    subject: 'A quick hello from {{myFirstName}} at Elements',
    greeting: 'Hi {{firstName|there}},',
    body: `I'm {{myFirstName}} from Elements. We build websites and custom software for businesses here in Sri Lanka.

Is there anything on your website, or in how your team works day to day, that you've been meaning to sort out? If so, I'd be glad to share a couple of ideas.

Either way, you can just reply here. It comes straight to me.`,
    signOff: 'Best,',
  },
  {
    id: 'website-feedback',
    name: 'Website feedback',
    description: 'Point out something specific on their site',
    subject: 'Something I noticed on your website',
    greeting: 'Hi {{firstName|there}},',
    body: `I had a look at your website this week and noticed [something specific, e.g. it takes a while to load on mobile].

That's usually a quick fix, and it can make a real difference to how many people get in touch.

Would it help if I sent over a couple of suggestions?`,
    signOff: 'Thanks,',
  },
  {
    id: 'follow-up',
    name: 'Follow-up',
    description: 'Gentle nudge a few days later',
    subject: 'Following up on my last email',
    greeting: 'Hi {{firstName|there}},',
    body: `Just checking you saw my last email.

Would a quick chat about your website be useful, or is now not the right time? Either answer is fine, just let me know.`,
    signOff: 'Thanks,',
  },
  {
    id: 'quick-question',
    name: 'Quick question',
    description: 'Short note asking for the right person',
    subject: 'Who looks after the website at {{company|your company}}?',
    greeting: 'Hi {{firstName|there}},',
    body: `Who looks after the website and digital side of things at {{company|your company}}?

We help businesses around Sri Lanka with websites, custom software and digital marketing, and I'd like to share a couple of ideas with the right person.

If that's you, would you be open to a quick chat?`,
    signOff: 'Cheers,',
  },
]
