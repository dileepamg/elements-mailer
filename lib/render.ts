import { LOGO_URL } from './templates'
import type { Draft, Recipient, RenderedEmail, Signature } from './types'

// One renderer is shared by the live preview and the send API, so what you see
// is exactly what goes out.
//
// The HTML deliberately looks like something typed into Gmail: a bare fragment
// (a doctype, <head> and <title> are what newsletter templates have), no
// banners, buttons or background colours, and unstyled links. Formatting in
// the body is limited to what a person would do by hand:
//   blank line → new paragraph     "- " → bullet     **bold**
//   [label](https://…) → link      bare https:// URLs are linked automatically
//   {{firstName}}, {{company|fallback}} → filled per recipient

export const VARIABLES = [
  { token: '{{firstName|there}}', label: 'First name' },
  { token: '{{name}}', label: 'Full name' },
  { token: '{{company|your business}}', label: 'Company' },
  { token: '{{myFirstName}}', label: 'My first name' },
] as const

export const VARIABLE_KEYS = ['firstName', 'name', 'company', 'email', 'myName', 'myFirstName'] as const

export const VARIABLE_RE = /\{\{\s*([a-zA-Z]+)\s*(?:\|([^}]*))?\}\}/g

const FONT = 'Arial,Helvetica,sans-serif'
const TEXT = '#222222'
const PARAGRAPH = 'margin:0 0 14px;'

// Signature: neutral greys only, so it reads as a person's sign-off rather than a banner.
const SIG_INK = '#111111'
const SIG_MUTED = '#6b7280'
const SIG_RULE = '#e5e7eb'

const HONORIFIC_RE = /^(mr|mrs|ms|miss|dr|prof|rev)\.?$/i
const BULLET_RE = /^\s*[-*•]\s+/
const INLINE_RE =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])/g

export function renderEmail(draft: Draft, signature: Signature, recipient: Recipient): RenderedEmail {
  const vars = variablesFor(recipient, signature)
  const fill = (s: string) => fillVariables(s, vars)

  const subject = tidyLine(fill(draft.subject))
  const greeting = tidyLine(fill(draft.greeting))
  const body = toBlocks(fill(draft.body))
  const signOff = fill(draft.signOff).trim()
  const sig = signatureLines(signature)

  const html: string[] = []
  if (greeting) html.push(`<p style="${PARAGRAPH}">${inlineHtml(greeting)}</p>`)
  for (const block of body) html.push(blockHtml(block))
  html.push(signatureHtml(signOff, sig, signature))

  const text: string[] = []
  if (greeting) text.push(inlineText(greeting))
  for (const block of body) text.push(block.map((line) => inlineText(line.replace(BULLET_RE, '- '))).join('\n'))
  text.push(signOff)
  text.push([sig.name, sig.role, sig.contactText].filter(Boolean).join('\n'))

  return {
    subject,
    html: wrapHtml(html.join('\n')),
    text: text.filter(Boolean).join('\n\n') + '\n',
  }
}

export function variablesFor(recipient: Recipient, signature: Signature): Record<string, string> {
  return {
    firstName: firstNameOf(recipient.name),
    name: recipient.name.trim(),
    company: recipient.company.trim(),
    email: recipient.email,
    myName: signature.name.trim(),
    myFirstName: firstNameOf(signature.name),
  }
}

export function fillVariables(input: string, vars: Record<string, string>): string {
  return input.replace(VARIABLE_RE, (match, key: string, fallback?: string) => {
    if (!(key in vars)) return match
    return vars[key] || (fallback ?? '').trim()
  })
}

export function firstNameOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words.find((w) => !HONORIFIC_RE.test(w)) ?? ''
  // Only fix case when it's clearly unformatted ("kamal", "KAMAL").
  if (first === first.toLowerCase() || first === first.toUpperCase()) {
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }
  return first
}

export function formatAddress(name: string, email: string): string {
  const clean = name.replace(/["\\\r\n]/g, '').trim()
  if (!clean) return email
  // Quote only when the name has characters that are special in an address.
  return /[(),.:;<>@[\]]/.test(clean) ? `"${clean}" <${email}>` : `${clean} <${email}>`
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}$/i.test(email)
}

export function websiteParts(website: string): { href: string; label: string } | null {
  const trimmed = website.trim()
  if (!trimmed) return null
  return {
    href: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    label: trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
  }
}

/** Every link a recipient would see in the body: markdown links and bare URLs. */
export function bodyLinks(body: string): string[] {
  return [...body.matchAll(INLINE_RE)].map((m) => m[2] ?? m[4]).filter((url): url is string => Boolean(url))
}

/** Collapses the gap a blank variable leaves behind: "Hi ," → "Hi,". */
function tidyLine(line: string): string {
  return line.replace(/\s+/g, ' ').replace(/ ([,.!?;:])/g, '$1').trim()
}

function toBlocks(body: string): string[][] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').map((line) => line.trimEnd()))
    .filter((lines) => lines.some((line) => line.trim()))
}

function blockHtml(lines: string[]): string {
  // A block can mix a lead-in line with bullets right under it.
  const runs: { bullet: boolean; lines: string[] }[] = []
  for (const line of lines) {
    const bullet = BULLET_RE.test(line)
    const last = runs.at(-1)
    if (last && last.bullet === bullet) last.lines.push(line)
    else runs.push({ bullet, lines: [line] })
  }
  return runs
    .map((run, i) => {
      if (run.bullet) {
        const items = run.lines.map((l) => `<li style="margin:0 0 4px;">${inlineHtml(l.replace(BULLET_RE, ''))}</li>`)
        return `<ul style="margin:0 0 14px;padding-left:24px;">${items.join('')}</ul>`
      }
      const margin = runs[i + 1]?.bullet ? 'margin:0 0 6px;' : PARAGRAPH
      return `<p style="${margin}">${run.lines.map(inlineHtml).join('<br>')}</p>`
    })
    .join('\n')
}

function inlineHtml(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const [whole, label, href, bold, url] = m
    out += escapeHtml(text.slice(last, m.index))
    if (href) out += link(href, label)
    else if (bold) out += `<strong>${escapeHtml(bold)}</strong>`
    else out += link(url, url)
    last = m.index + whole.length
  }
  return out + escapeHtml(text.slice(last))
}

function inlineText(text: string): string {
  return text.replace(INLINE_RE, (_whole, label?: string, href?: string, bold?: string, url?: string) => {
    if (href) {
      const target = href.replace(/^mailto:/, '')
      return label === href || label === target ? target : `${label} (${target})`
    }
    return bold ?? url ?? ''
  })
}

function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
}

interface SignatureLines {
  name: string
  role: string
  phone: string
  website: { href: string; label: string } | null
  contactText: string
}

function signatureLines(signature: Signature): SignatureLines {
  const website = websiteParts(signature.website)
  const phone = signature.phone.trim()
  return {
    name: signature.name.trim(),
    role: [signature.title.trim(), signature.company.trim()].filter(Boolean).join(' · '),
    phone,
    website,
    contactText: [phone, website?.label].filter(Boolean).join(' · '),
  }
}

function signatureHtml(signOff: string, sig: SignatureLines, signature: Signature): string {
  const websiteLink = sig.website
    ? `<a href="${escapeHtml(sig.website.href)}" style="color:${SIG_INK};text-decoration:none;">${escapeHtml(sig.website.label)}</a>`
    : ''
  const contact = [escapeHtml(sig.phone), websiteLink].filter(Boolean).join(`&nbsp;&nbsp;&middot;&nbsp;&nbsp;`)
  const details = [
    sig.name && `<div style="font-size:15px;line-height:22px;font-weight:bold;color:${SIG_INK};">${escapeHtml(sig.name)}</div>`,
    sig.role && `<div>${escapeHtml(sig.role)}</div>`,
    contact && `<div style="padding-top:4px;">${contact}</div>`,
  ]
    .filter(Boolean)
    .join('\n')
  const detailStyle = `font-family:${FONT};font-size:13px;line-height:20px;color:${SIG_MUTED};`
  const closing = signOff ? `<p style="margin:0 0 16px;">${inlineHtml(signOff)}</p>` : ''

  if (signature.style === 'photo') {
    const photo = signature.photo || LOGO_URL
    return [
      closing,
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`,
      `<tr>`,
      `<td style="vertical-align:middle;padding:0 16px 0 0;"><img src="${escapeHtml(photo)}" width="56" height="56" alt="${escapeHtml(sig.name)}" style="display:block;width:56px;height:56px;border:0;border-radius:50%;object-fit:cover;"></td>`,
      `<td style="vertical-align:middle;padding:2px 0 2px 16px;border-left:1px solid ${SIG_RULE};${detailStyle}">`,
      details,
      `</td>`,
      `</tr>`,
      `</table>`,
    ].join('\n')
  }

  return `${closing}\n<div style="${detailStyle}">\n${details}\n</div>`
}

/** A bare fragment, the way Gmail and Outlook send what you type. */
function wrapHtml(content: string): string {
  return `<div dir="ltr" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${TEXT};">
${content}
</div>`
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
