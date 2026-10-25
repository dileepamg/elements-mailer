import { SAMPLE_RECIPIENT } from './templates'
import { bodyLinks, isValidEmail, renderEmail, VARIABLE_KEYS, VARIABLE_RE } from './render'
import type { Draft, Recipient, Sender, SendOptions, Signature } from './types'

export type CheckLevel = 'fail' | 'warn' | 'pass'

export interface Check {
  level: CheckLevel
  label: string
  detail?: string
}

// Phrases that content filters (and people) associate with marketing blasts.
const TRIGGER_PHRASES = [
  'act now', 'apply now', 'buy now', 'call now', 'order now', 'click here', 'click below',
  'limited time', 'offer expires', 'special offer', 'exclusive deal', 'special promotion',
  'best price', 'lowest price', 'cheap', 'discount', 'risk-free', 'risk free', 'no obligation',
  'no cost', '100%', 'guarantee', 'guaranteed', 'winner', 'congratulations', 'cash', 'earn money',
  'make money', 'double your', 'increase your sales', 'dear friend', 'once in a lifetime', 'urgent',
  "don't miss", 'miss out', 'amazing', 'incredible', 'for free', 'free trial', 'free consultation',
  'not spam', '$$$',
]
const TRIGGER_RE = new RegExp(
  `(?<!\\w)(${TRIGGER_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?!\\w)`,
  'gi',
)
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|shorturl\.at|tiny\.cc)\//i
const SHOUTING_RE = /\b[A-Z]{4,}\b/g
const ACRONYMS = new Set(['HTML', 'HTTP', 'HTTPS'])
const EMOJI_RE = /\p{Extended_Pictographic}/u
const PLACEHOLDER_RE = /\[[^\]\n]+\](?!\()/g
const GENERIC_GREETING_RE = /\bdear (sir|madam|sir\/madam|customer|friend|valued)/i
const LARGE_BATCH = 40
const RESEND_FREE_DAILY = 100
const LONG_EMAIL_WORDS = 120
const BULLET_LINE_RE = /^\s*[-*•]\s+/m

export function runChecks(
  draft: Draft,
  from: Sender,
  signature: Signature,
  recipients: Recipient[],
  options: SendOptions,
): Check[] {
  const checks: Check[] = []
  const all = [draft.subject, draft.greeting, draft.body, draft.signOff].join('\n')

  // Template integrity: things that would visibly break the email.
  const unknown = unique([...all.matchAll(VARIABLE_RE)].map((m) => m[1]).filter((k) => !isVariableKey(k)))
  if (unknown.length) {
    checks.push({
      level: 'fail',
      label: `Unknown variable ${unknown.map((k) => `{{${k}}}`).join(', ')}`,
      detail: `Available: ${VARIABLE_KEYS.map((k) => `{{${k}}}`).join(', ')}`,
    })
  }
  const placeholders = unique(all.match(PLACEHOLDER_RE) ?? [])
  if (placeholders.length) {
    checks.push({
      level: 'fail',
      label: 'Fill in the [placeholders] before sending',
      detail: placeholders.map((p) => truncate(p, 60)).join(' · '),
    })
  }

  // Subject.
  const subject = renderEmail(draft, signature, recipients[0] ?? SAMPLE_RECIPIENT).subject
  const subjectIssues = checkSubject(subject)
  checks.push(...subjectIssues)
  if (subject && !subjectIssues.length) checks.push({ level: 'pass', label: 'Subject reads like a normal email' })

  // Greeting.
  if (/\{\{\s*(firstName|name)\b/.test(draft.greeting)) {
    checks.push({ level: 'pass', label: 'Greeting uses their name' })
  } else if (GENERIC_GREETING_RE.test(draft.greeting)) {
    checks.push({ level: 'warn', label: 'Greeting sounds like a mass mailing', detail: 'Try "Hi {{firstName|there}},".' })
  } else {
    checks.push({ level: 'warn', label: 'Greeting isn’t personalised', detail: 'Add {{firstName}} so each person sees their own name.' })
  }

  // Body.
  const words = draft.body.trim().split(/\s+/).filter(Boolean).length
  if (!words) checks.push({ level: 'fail', label: 'The email body is empty' })
  else if (words > LONG_EMAIL_WORDS) {
    checks.push({
      level: 'warn',
      label: `Long for a personal email (${words} words)`,
      detail: `Gmail tends to file longer, pitch-style emails under Promotions. Aim for under ${LONG_EMAIL_WORDS} words.`,
    })
  } else checks.push({ level: 'pass', label: `Good length (${words} words)` })

  // Promotions-tab signals: people writing to one person ask things and don't use lists.
  if (words && !draft.body.includes('?')) {
    checks.push({
      level: 'warn',
      label: 'No question in the email',
      detail: 'Ending with a simple question reads like a conversation and invites a reply, which helps it reach Primary.',
    })
  }
  if (BULLET_LINE_RE.test(draft.body)) {
    checks.push({
      level: 'warn',
      label: 'Bullet points',
      detail: 'Lists are typical of marketing emails. A sentence or two reads as more personal.',
    })
  }

  const links = bodyLinks(draft.body)
  if (links.some((l) => SHORTENERS.test(l))) {
    checks.push({ level: 'warn', label: 'Link shortener in the body', detail: 'Shortened links are a strong spam signal. Use the full URL.' })
  }
  if (links.length > 2) {
    checks.push({ level: 'warn', label: `${links.length} links in the body`, detail: 'Keep it to one or two. A personal email rarely has more.' })
  } else {
    checks.push({ level: 'pass', label: links.length ? `${links.length} link${links.length > 1 ? 's' : ''} in the body` : 'No links in the body' })
  }

  const exclamations = (draft.body.match(/!/g) ?? []).length
  if (exclamations > 1) checks.push({ level: 'warn', label: `${exclamations} exclamation marks`, detail: 'One at most keeps the tone calm and personal.' })

  const shouting = unique((all.match(SHOUTING_RE) ?? []).filter((w) => !ACRONYMS.has(w)))
  if (shouting.length) checks.push({ level: 'warn', label: 'Words in ALL CAPS', detail: shouting.join(', ') })

  const triggers = unique((all.match(TRIGGER_RE) ?? []).map((t) => t.toLowerCase()))
  if (triggers.length) {
    checks.push({ level: 'warn', label: 'Salesy phrases spam filters notice', detail: triggers.map((t) => `“${t}”`).join(', ') })
  } else {
    checks.push({ level: 'pass', label: 'No spammy phrases' })
  }

  // Sender and signature.
  if (!isValidEmail(from.email.trim())) {
    checks.push({ level: 'fail', label: 'Enter a valid From address', detail: 'It must be on your domain verified in Resend.' })
  }
  if (!from.name.trim()) {
    checks.push({ level: 'warn', label: 'No From name', detail: 'A person’s name, like “Amaya Silva from Elements”, reads as personal.' })
  }
  if (signature.name.trim()) {
    checks.push({ level: 'pass', label: 'Signed by a person' })
  } else {
    checks.push({ level: 'warn', label: 'Add a name to the signature' })
  }
  if (signature.style === 'photo' && !options.plainText) {
    checks.push({
      level: 'warn',
      label: 'Photo in the signature',
      detail: 'Images are a common Promotions signal. Switch the signature to “Text only” if emails land there.',
    })
  }

  // Delivery options.
  if (options.unsubscribeHeader) {
    checks.push({
      level: 'warn',
      label: 'Unsubscribe header is on',
      detail: 'Gmail reads it as bulk mail, which can push emails into Promotions. One-to-one emails usually leave it off.',
    })
  }
  if (options.plainText) checks.push({ level: 'pass', label: 'Sending as plain text' })

  // Recipients.
  for (const key of requiredVariables(all)) {
    const missing = recipients.filter((r) => !valueFor(r, key)).length
    if (missing) {
      checks.push({
        level: 'warn',
        label: `${missing} recipient${missing > 1 ? 's have' : ' has'} no ${key === 'company' ? 'company' : 'name'}`,
        detail: `{{${key}}} has no fallback, so it will be blank. Write it as {{${key}|something}}.`,
      })
    }
  }
  if (recipients.length > LARGE_BATCH) {
    checks.push({
      level: 'warn',
      label: `Large batch (${recipients.length} people)`,
      detail:
        recipients.length > RESEND_FREE_DAILY
          ? `Resend’s free plan stops at ${RESEND_FREE_DAILY} emails a day (tests count too). On a newly verified domain, build up gradually anyway.`
          : 'On a newly verified domain, send around 20–30 a day and build up over a few weeks.',
    })
  }

  if (!options.plainText) checks.push({ level: 'pass', label: 'Plain-text version sent alongside HTML' })

  const order: Record<CheckLevel, number> = { fail: 0, warn: 1, pass: 2 }
  return checks.sort((a, b) => order[a.level] - order[b.level])
}

function checkSubject(subject: string): Check[] {
  if (!subject) return [{ level: 'fail', label: 'Add a subject line' }]
  const issues: Check[] = []
  if (subject.split(/\s+/).length <= 2) {
    issues.push({
      level: 'warn',
      label: 'Very short subject',
      detail: 'Two-word subjects like “Quick question” are typical of sales templates. Say what the email is about in 4–8 words.',
    })
  }
  if (subject.length > 60) issues.push({ level: 'warn', label: `Subject is long (${subject.length} characters)`, detail: 'Short, plain subjects look personal.' })
  if (subject.includes('!')) issues.push({ level: 'warn', label: 'Exclamation mark in the subject' })
  if (/^\s*(re|fw|fwd)\s*:/i.test(subject)) issues.push({ level: 'warn', label: 'Subject pretends to be a reply or forward', detail: 'Filters and people both treat this as a trick.' })
  if (EMOJI_RE.test(subject)) issues.push({ level: 'warn', label: 'Emoji in the subject' })
  if (/\bfree\b/i.test(subject)) issues.push({ level: 'warn', label: '“Free” in the subject' })
  return issues
}

/** Variables used without a |fallback, which can render blank. */
function requiredVariables(text: string): ('firstName' | 'name' | 'company')[] {
  const keys = new Set<'firstName' | 'name' | 'company'>()
  for (const m of text.matchAll(VARIABLE_RE)) {
    const key = m[1]
    if (m[2] === undefined && (key === 'firstName' || key === 'name' || key === 'company')) keys.add(key)
  }
  // firstName and name come from the same column, so report them once.
  if (keys.has('firstName')) keys.delete('name')
  return [...keys]
}

function valueFor(r: Recipient, key: 'firstName' | 'name' | 'company'): string {
  return key === 'company' ? r.company.trim() : r.name.trim()
}

function isVariableKey(key: string): boolean {
  return (VARIABLE_KEYS as readonly string[]).includes(key)
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
