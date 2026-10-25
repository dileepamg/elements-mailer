import { gravatarUrl } from '@/lib/gravatar'
import { formatAddress, isValidEmail, renderEmail } from '@/lib/render'
import type { Draft, Recipient, Sender, SendOptions, Signature } from '@/lib/types'

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const BATCH_SIZE = 100 // Resend's limit per batch request
const MAX_RECIPIENTS = 1000

interface SendRequest {
  draft: Draft
  from: Sender
  signature: Signature
  recipients: Recipient[]
  options: SendOptions
  /** Send to this address instead of the recipients (test sends). */
  to?: string
}

interface SendResult {
  email: string
  ok: boolean
  error?: string
}

export async function POST(request: Request) {
  // Browsers attach Basic Auth credentials automatically, so make sure the
  // request really comes from this app's own page.
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host')) return fail(403, 'Cross-origin request blocked')
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail(415, 'Expected JSON')

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return fail(500, 'RESEND_API_KEY needs to be set')

  let payload: SendRequest | string
  try {
    payload = readPayload(await request.json())
  } catch {
    return fail(400, 'Invalid JSON')
  }
  if (typeof payload === 'string') return fail(400, payload)

  const { draft, from, recipients, options, to } = payload
  const signature: Signature = {
    ...payload.signature,
    photo: payload.signature.photo || (await gravatarUrl(from.email)),
  }
  const replyTo = process.env.REPLY_TO?.trim()
  // When on, mail clients show an "Unsubscribe" link next to the sender; it sends
  // a plain email to this address, so remove the person from your list by hand.
  const unsubscribeTo = process.env.UNSUBSCRIBE_EMAIL?.trim() || replyTo || from.email

  // Every recipient still gets their own email, addressed only to them.
  const emails = recipients.map((recipient) => {
    const { subject, html, text } = renderEmail(draft, signature, recipient)
    return {
      from: formatAddress(from.name, from.email),
      to: [to ? to : formatAddress(recipient.name, recipient.email)],
      subject,
      text,
      ...(!options.plainText && { html }),
      ...(replyTo && { reply_to: replyTo }),
      ...(options.unsubscribeHeader && {
        headers: { 'List-Unsubscribe': `<mailto:${unsubscribeTo}?subject=Unsubscribe>` },
      }),
    }
  })

  const results: SendResult[] = []
  let stopped: string | undefined
  for (let start = 0; start < emails.length; start += BATCH_SIZE) {
    const chunk = recipients.slice(start, start + BATCH_SIZE)
    const failure = stopped ? { error: stopped, fatal: true } : await sendBatch(apiKey, emails.slice(start, start + BATCH_SIZE))
    for (const r of chunk) results.push(failure ? { email: r.email, ok: false, error: failure.error } : { email: r.email, ok: true })
    if (failure?.fatal) stopped = failure.error
  }

  const sent = results.filter((r) => r.ok).length
  return Response.json({ ok: sent === results.length, sent, results }, { status: sent ? 200 : 502 })
}

/** Sends one batch, which Resend accepts or rejects as a whole. Returns null on success. */
async function sendBatch(apiKey: string, emails: object[]): Promise<{ error: string; fatal: boolean } | null> {
  let response: Response
  try {
    response = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(emails),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return { error: 'Could not reach Resend', fatal: false }
  }
  const result = await response.json().catch(() => null)
  if (response.ok && Array.isArray(result?.data)) return null
  return {
    error: String(result?.message ?? `Resend returned ${response.status}`),
    // A bad key, unverified domain or used-up quota would fail every later batch too.
    fatal: response.status === 401 || response.status === 403 || /quota/.test(String(result?.name)),
  }
}

function fail(status: number, error: string) {
  return Response.json({ ok: false, sent: 0, error, results: [] }, { status })
}

function readPayload(input: unknown): SendRequest | string {
  if (!isObject(input)) return 'Missing payload'
  const { draft: d, from: f, signature: s, recipients: rs, to } = input
  if (!isObject(d) || !isObject(f) || !isObject(s) || !Array.isArray(rs)) return 'Missing draft, sender, signature or recipients'
  if (!rs.length) return 'No recipients'
  if (rs.length > MAX_RECIPIENTS) return `At most ${MAX_RECIPIENTS} recipients per send`

  try {
    const draft: Draft = {
      subject: text(d.subject, 300, 'subject'),
      greeting: text(d.greeting, 300, 'greeting'),
      body: text(d.body, 20_000, 'body'),
      signOff: text(d.signOff, 200, 'sign-off'),
    }
    const from: Sender = {
      name: text(f.name, 120, 'From name').trim(),
      email: text(f.email, 320, 'From address').trim(),
    }
    if (!isValidEmail(from.email)) return 'Enter a valid From address'
    if (s.style !== 'text' && s.style !== 'photo') return 'Invalid signature style'
    const signature: Signature = {
      name: text(s.name, 200, 'signature name'),
      title: text(s.title, 200, 'signature title'),
      company: text(s.company, 200, 'signature company'),
      phone: text(s.phone, 200, 'signature phone'),
      website: text(s.website, 200, 'signature website'),
      photo: text(s.photo, 1000, 'photo URL').trim(),
      style: s.style,
    }
    if (signature.photo && !/^https:\/\/\S+$/i.test(signature.photo)) return 'The photo URL must start with https://'
    const recipients: Recipient[] = rs.map((r) => {
      if (!isObject(r)) throw new Error('Invalid recipient')
      const recipient = {
        email: text(r.email, 320, 'recipient email'),
        name: text(r.name, 200, 'recipient name'),
        company: text(r.company, 200, 'recipient company'),
      }
      if (!isValidEmail(recipient.email)) throw new Error(`Invalid recipient email: ${recipient.email}`)
      return recipient
    })
    if (to !== undefined && (typeof to !== 'string' || !isValidEmail(to))) return 'Invalid test address'
    const o = isObject(input.options) ? input.options : {}
    const options: SendOptions = { plainText: o.plainText === true, unsubscribeHeader: o.unsubscribeHeader === true }
    return { draft, from, signature, recipients, options, to }
  } catch (e) {
    return (e as Error).message
  }
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}`)
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
