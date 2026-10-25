'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Checks from './Checks'
import Preview from './Preview'
import { runChecks } from '@/lib/checks'
import { parseRecipients } from '@/lib/recipients'
import { gravatarUrl, isGravatarUrl } from '@/lib/gravatar'
import { isValidEmail, renderEmail, VARIABLES } from '@/lib/render'
import { DEFAULT_FROM, DEFAULT_SIGNATURE, LOGO_URL, SAMPLE_RECIPIENT, TEMPLATES } from '@/lib/templates'
import type { Draft, Recipient, Sender, SendOptions, Signature, SignatureStyle, Template } from '@/lib/types'

type FieldKey = keyof Draft
type Status = { state: 'sending' | 'sent' | 'failed'; error?: string }

interface SendResponse {
  ok: boolean
  sent: number
  error?: string
  results: { email: string; ok: boolean; error?: string }[]
}

interface Props {
  canSend: boolean
}

// Template edits, the sender and signature are kept in this browser only. Recipients are not saved.
const STORAGE_KEY = 'elements-mailer:v1'

// Older saves used 'simple' / 'logo'.
const normaliseStyle = (style: unknown): SignatureStyle =>
  style === 'photo' || style === 'logo' ? 'photo' : 'text'

const draftOf = ({ subject, greeting, body, signOff }: Template): Draft => ({ subject, greeting, body, signOff })

const sameDraft = (a: Draft, b: Draft) =>
  a.subject === b.subject && a.greeting === b.greeting && a.body === b.body && a.signOff === b.signOff

export default function Mailer({ canSend }: Props) {
  const [activeId, setActiveId] = useState(TEMPLATES[0].id)
  const [edits, setEdits] = useState<Record<string, Draft>>({})
  const [from, setFrom] = useState<Sender>(DEFAULT_FROM)
  const [signature, setSignature] = useState<Signature>(DEFAULT_SIGNATURE)
  const [gravatar, setGravatar] = useState(LOGO_URL)
  const [recipientsText, setRecipientsText] = useState('')
  const [previewEmail, setPreviewEmail] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState<Status | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [options, setOptions] = useState<SendOptions>({ plainText: false, unsubscribeHeader: false })
  const [loaded, setLoaded] = useState(false)

  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const lastField = useRef<FieldKey>('body')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved?.v === 1) {
        if (TEMPLATES.some((t) => t.id === saved.activeId)) setActiveId(saved.activeId)
        if (saved.edits) setEdits(saved.edits)
        if (saved.from) setFrom((f) => ({ ...f, ...saved.from }))
        if (saved.signature) {
          const photo = String(saved.signature.photo ?? '')
          setSignature((s) => ({
            ...s,
            ...saved.signature,
            style: normaliseStyle(saved.signature.style),
            // Older saves stored the resolved Gravatar; empty now means "use Gravatar".
            photo: isGravatarUrl(photo) ? '' : photo,
          }))
        }
        if (saved.testEmail) setTestEmail(saved.testEmail)
        if (saved.collapsed) setCollapsed(saved.collapsed)
        if (saved.options) setOptions((o) => ({ ...o, ...saved.options }))
      }
    } catch {
      // Storage unavailable (private window etc.): start from defaults.
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: 1, activeId, edits, from, signature, testEmail, collapsed, options }),
      )
    } catch {}
  }, [loaded, activeId, edits, from, signature, testEmail, collapsed, options])

  // Resolve the From address's Gravatar for the preview (the server does the same when sending).
  useEffect(() => {
    let current = true
    gravatarUrl(from.email)
      .then((url) => current && setGravatar(url))
      .catch(() => current && setGravatar(LOGO_URL))
    return () => {
      current = false
    }
  }, [from.email])

  useEffect(() => {
    if (!isSending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isSending])

  const template = TEMPLATES.find((t) => t.id === activeId) ?? TEMPLATES[0]
  const draft = useMemo(() => edits[template.id] ?? draftOf(template), [edits, template])
  const parsed = useMemo(() => parseRecipients(recipientsText), [recipientsText])
  const { recipients } = parsed
  const previewRecipient = recipients.find((r) => r.email === previewEmail) ?? recipients[0] ?? SAMPLE_RECIPIENT
  const rendered = useMemo(
    () => renderEmail(draft, { ...signature, photo: signature.photo.trim() || gravatar }, previewRecipient),
    [draft, signature, gravatar, previewRecipient],
  )
  const checks = useMemo(
    () => runChecks(draft, from, signature, recipients, options),
    [draft, from, signature, recipients, options],
  )
  const fromValid = isValidEmail(from.email.trim())

  const blocked = checks.some((c) => c.level === 'fail')
  const isEdited = (t: Template) => t.id in edits && !sameDraft(edits[t.id], draftOf(t))

  function section(id: string) {
    return {
      collapsed: Boolean(collapsed[id]),
      onToggle: () => setCollapsed((c) => ({ ...c, [id]: !c[id] })),
    }
  }

  function updateDraft(key: FieldKey, value: string) {
    setEdits((prev) => ({ ...prev, [template.id]: { ...(prev[template.id] ?? draftOf(template)), [key]: value } }))
  }

  function resetTemplate() {
    setEdits(({ [template.id]: _, ...rest }) => rest)
  }

  function insertVariable(token: string) {
    const key = lastField.current
    const el = fieldRefs.current[key]
    const value = draft[key]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    updateDraft(key, value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function draftField(key: FieldKey) {
    return {
      value: draft[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateDraft(key, e.target.value),
      onFocus: () => (lastField.current = key),
      ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
        fieldRefs.current[key] = el
      },
    }
  }

  function updateSignature<K extends keyof Signature>(key: K, value: Signature[K]) {
    setSignature((s) => ({ ...s, [key]: value }))
  }

  async function send(list: Recipient[], to?: string): Promise<SendResponse> {
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, from, signature, recipients: list, options, to }),
      })
      const data = await res.json().catch(() => null)
      if (data && Array.isArray(data.results)) return data
      return { ok: false, sent: 0, error: `Request failed (${res.status})`, results: [] }
    } catch {
      return { ok: false, sent: 0, error: 'Network error. Check your connection and try again.', results: [] }
    }
  }

  async function sendTest() {
    setTestStatus({ state: 'sending' })
    const result = await send([previewRecipient], testEmail.trim())
    setTestStatus(
      result.ok ? { state: 'sent' } : { state: 'failed', error: result.error ?? result.results[0]?.error },
    )
  }

  // Sends to everyone in the list right away: one request, and each person
  // still gets their own email. Sending again sends to everyone again.
  async function sendAll() {
    const list = recipients
    setConfirming(false)
    setNotice(null)
    setIsSending(true)
    setStatuses(Object.fromEntries(list.map((r) => [r.email, { state: 'sending' } as Status])))

    const result = await send(list)
    const byEmail = new Map(result.results.map((r) => [r.email, r]))
    setStatuses(
      Object.fromEntries(
        list.map((r) => {
          const outcome = byEmail.get(r.email)
          const status: Status = outcome?.ok
            ? { state: 'sent' }
            : { state: 'failed', error: outcome?.error ?? result.error }
          return [r.email, status]
        }),
      ),
    )
    const failed = list.length - result.sent
    setNotice(
      result.sent
        ? { ok: !failed, text: `Sent to ${result.sent} of ${list.length}${failed ? `. ${failed} failed, see the list above.` : '.'}` }
        : { ok: false, text: `Nothing was sent: ${result.error ?? result.results[0]?.error ?? 'unknown error'}` },
    )
    setIsSending(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/elements-logo.png" alt="Elements" width={141} height={24} />
          <span className="brand__divider" aria-hidden />
          <span className="brand__product">Mailer</span>
        </div>
        <div className="sender">
          {canSend ? (
            <>
              <span className="sender__label">Sending as</span>
              <span className="sender__value">{from.name ? `${from.name} <${from.email}>` : from.email}</span>
            </>
          ) : (
            <span className="sender__warn">Sending is off. Set RESEND_API_KEY.</span>
          )}
        </div>
      </header>

      <main className="workspace">
        <div className="editor">
          <fieldset className="editor__fields" disabled={isSending}>
            <Card
              step="01"
              title="Message"
              summary={`${template.name}${isEdited(template) ? ' (edited)' : ''}`}
              {...section('message')}
              action={
                isEdited(template) && (
                  <button type="button" className="link-button" onClick={resetTemplate}>
                    Reset to original
                  </button>
                )
              }
            >
              <div className="templates" role="tablist" aria-label="Templates">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    className="template"
                    aria-selected={t.id === template.id}
                    onClick={() => setActiveId(t.id)}
                  >
                    <span className="template__name">
                      {t.name}
                      {isEdited(t) && <span className="template__edited">Edited</span>}
                    </span>
                    <span className="template__desc">{t.description}</span>
                  </button>
                ))}
              </div>

              <Field label="Subject">
                <input className="input" {...draftField('subject')} />
              </Field>
              <Field label="Greeting">
                <input className="input" {...draftField('greeting')} />
              </Field>
              <Field label="Body">
                <textarea className="input input--body" rows={12} {...draftField('body')} />
              </Field>
              <Field label="Sign-off">
                <input className="input" {...draftField('signOff')} />
              </Field>

              <div className="vars">
                <span className="vars__label">Insert</span>
                {VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    className="chip"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertVariable(v.token)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="hint">
                Leave a blank line for a new paragraph. Start a line with <code>-</code> for a bullet. Use <code>**bold**</code>{' '}
                and <code>[text](https://…)</code> for links. <code>{'{{company|your business}}'}</code> uses the text after{' '}
                <code>|</code> when a recipient has no company. Edits are saved in this browser.
              </p>
            </Card>

            <Card
              step="02"
              title="Sender & signature"
              summary={from.name ? `${from.name} <${from.email}>` : from.email}
              {...section('sender')}
            >
              <div className="grid2">
                <Field label="From name">
                  <input
                    className="input"
                    placeholder="Amaya Silva from Elements"
                    value={from.name}
                    onChange={(e) => setFrom((f) => ({ ...f, name: e.target.value }))}
                  />
                </Field>
                <Field label="From address">
                  <input
                    className="input"
                    type="email"
                    placeholder="amaya@elementslanka.com"
                    value={from.email}
                    onChange={(e) => setFrom((f) => ({ ...f, email: e.target.value }))}
                  />
                </Field>
              </div>
              <p className="hint">
                What the inbox shows as the sender. The address must be on your domain verified in Resend, and should
                have a real mailbox (or a forwarder) so replies reach you.
              </p>

              <div className="divider" />

              <div className="subhead">
                <span className="subhead__title">Signature</span>
                <div className="segmented segmented--sm" role="radiogroup" aria-label="Signature style">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={signature.style === 'text'}
                    onClick={() => updateSignature('style', 'text')}
                  >
                    Text only
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={signature.style === 'photo'}
                    onClick={() => updateSignature('style', 'photo')}
                  >
                    With photo
                  </button>
                </div>
              </div>
              <div className="grid2">
                <Field label="Name">
                  <input className="input" value={signature.name} onChange={(e) => updateSignature('name', e.target.value)} />
                </Field>
                <Field label="Title">
                  <input
                    className="input"
                    placeholder="e.g. Client Partner"
                    value={signature.title}
                    onChange={(e) => updateSignature('title', e.target.value)}
                  />
                </Field>
                <Field label="Company">
                  <input className="input" value={signature.company} onChange={(e) => updateSignature('company', e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input
                    className="input"
                    placeholder="+94 77 123 4567"
                    value={signature.phone}
                    onChange={(e) => updateSignature('phone', e.target.value)}
                  />
                </Field>
                <Field label="Website" wide>
                  <input className="input" value={signature.website} onChange={(e) => updateSignature('website', e.target.value)} />
                </Field>
                {signature.style === 'photo' && (
                  <Field label="Photo URL (optional)" wide>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://… (leave empty to use Gravatar)"
                      value={signature.photo}
                      onChange={(e) => updateSignature('photo', e.target.value)}
                    />
                  </Field>
                )}
              </div>
              <p className="hint">
                <code>{'{{myFirstName}}'}</code> in the message is the first word of the signature name.
                {signature.style === 'photo' &&
                  ` With no photo URL, the photo is the Gravatar for ${from.email || 'the From address'}, or the Elements mark until one is set at gravatar.com. A photo URL must be public and start with https://.`}
              </p>
            </Card>

            <Card
              step="03"
              title="Recipients"
              {...section('recipients')}
              action={<span className="count">{recipients.length ? `${recipients.length} ready` : 'None yet'}</span>}
            >
              <Field label="One per line: email, name, company (name and company are optional)">
                <textarea
                  className="input input--list"
                  rows={4}
                  spellCheck={false}
                  placeholder={'kamal@lankatea.lk, Kamal Perera, Lanka Tea Co.\nNimali Silva <nimali@example.com>\nhello@company.lk'}
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                />
              </Field>
              {parsed.invalid.length > 0 && (
                <p className="error-text">
                  Couldn’t find an email address on {parsed.invalid.length} line{parsed.invalid.length > 1 ? 's' : ''}:{' '}
                  {parsed.invalid.slice(0, 3).join(' · ')}
                  {parsed.invalid.length > 3 && ' …'}
                </p>
              )}
              {parsed.duplicates > 0 && (
                <p className="hint">
                  Skipped {parsed.duplicates} duplicate{parsed.duplicates > 1 ? 's' : ''}.
                </p>
              )}
              {recipients.length > 0 && (
                <ul className="rlist">
                  {recipients.map((r) => {
                    const status = statuses[r.email]
                    return (
                      <li key={r.email}>
                        <button
                          type="button"
                          className="rrow"
                          aria-current={r.email === previewRecipient.email}
                          onClick={() => setPreviewEmail(r.email)}
                          title="Preview as this person"
                        >
                          <StatusIcon status={status} />
                          <span className="rrow__who">
                            <span className="rrow__name">{r.name || r.email}</span>
                            {r.name && <span className="rrow__email">{r.email}</span>}
                          </span>
                          <span className="rrow__company">{r.company}</span>
                        </button>
                        {status?.state === 'failed' && <p className="rrow__error">{status.error}</p>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </fieldset>

          <Card step="04" title="Send" {...section('send')}>
            <div className="field">
              <label className="field__label" htmlFor="test-email">
                Send a test to yourself first
              </label>
              <div className="test-row">
                <input
                  id="test-email"
                  className="input"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@elementslanka.com"
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={
                    !canSend || isSending || !fromValid || !isValidEmail(testEmail.trim()) || testStatus?.state === 'sending'
                  }
                  onClick={sendTest}
                >
                  {testStatus?.state === 'sending' ? 'Sending…' : 'Send test'}
                </button>
              </div>
              <p className="hint">
                Uses {previewRecipient.name || previewRecipient.email}’s details. Open it in Gmail and Outlook before sending
                to everyone.
              </p>
              {testStatus?.state === 'sent' && <p className="ok-text">Test sent. Check the inbox, and the spam folder too.</p>}
              {testStatus?.state === 'failed' && <p className="error-text">{testStatus.error}</p>}
            </div>

            <div className="divider" />

            <div className="options">
              <label className="option">
                <input
                  type="checkbox"
                  checked={options.plainText}
                  onChange={(e) => setOptions((o) => ({ ...o, plainText: e.target.checked }))}
                />
                <span>
                  <span className="option__label">Send as plain text</span>
                  <span className="option__hint">
                    No formatting, links or photo, exactly like a typed email. The surest way into Primary.
                  </span>
                </span>
              </label>
              <label className="option">
                <input
                  type="checkbox"
                  checked={options.unsubscribeHeader}
                  onChange={(e) => setOptions((o) => ({ ...o, unsubscribeHeader: e.target.checked }))}
                />
                <span>
                  <span className="option__label">Add an unsubscribe link in the inbox</span>
                  <span className="option__hint">
                    Gmail treats this as bulk mail and may file it under Promotions. Leave off for one-to-one emails.
                  </span>
                </span>
              </label>
            </div>

            <p className="hint">
              Everyone in the list is sent their own email at once, addressed only to them. You can send to the same
              list as many times as you like.
            </p>

            {confirming ? (
              <div className="confirm">
                <p>
                  Send {recipients.length} email{recipients.length > 1 ? 's' : ''} from {from.email}?
                </p>
                <div className="confirm__actions">
                  <button type="button" className="btn btn--primary" onClick={sendAll}>
                    Yes, send {recipients.length}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={!canSend || blocked || !recipients.length || isSending}
                onClick={() => setConfirming(true)}
              >
                {isSending
                  ? 'Sending…'
                  : recipients.length
                    ? `Send to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`
                    : 'Add recipients to send'}
              </button>
            )}

            {blocked && recipients.length > 0 && (
              <p className="error-text">Fix the items marked in red in the inbox check first.</p>
            )}
            {notice && <p className={notice.ok ? 'notice notice--ok' : 'notice notice--error'}>{notice.text}</p>}
          </Card>
        </div>

        <div className="viewer">
          <Checks checks={checks} />
          <Preview
            email={rendered}
            from={from}
            recipient={previewRecipient}
            recipients={recipients}
            plainText={options.plainText}
            onSelectRecipient={setPreviewEmail}
          />
        </div>
      </main>
    </div>
  )
}

function Card({
  step,
  title,
  summary,
  action,
  collapsed,
  onToggle,
  children,
}: {
  step: string
  title: string
  /** Shown beside the title while the section is collapsed. */
  summary?: string
  action?: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const bodyId = useId()
  return (
    <section className="card" data-collapsed={collapsed || undefined}>
      <header className="card__head">
        <h2 className="card__title">
          {/* The whole header row is clickable; see .card__toggle::after. */}
          <button type="button" className="card__toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={onToggle}>
            <span className="card__step">{step}</span>
            <span className="card__name">{title}</span>
            {collapsed && summary && <span className="card__summary">{summary}</span>}
          </button>
        </h2>
        {action && <div className="card__action">{action}</div>}
        <svg className="card__chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </header>
      <div className="card__collapse" id={bodyId} inert={collapsed}>
        <div className="card__inner">
          <div className="card__body">{children}</div>
        </div>
      </div>
    </section>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? 'field field--wide' : 'field'}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

const STATUS_LABELS = { idle: 'Not sent', sending: 'Sending', sent: 'Sent', failed: 'Failed' }

function StatusIcon({ status }: { status?: Status }) {
  const state = status?.state ?? 'idle'
  return (
    <span className={`status status--${state}`} role="img" aria-label={STATUS_LABELS[state]}>
      {state === 'sent' ? '✓' : state === 'failed' ? '✕' : null}
    </span>
  )
}
