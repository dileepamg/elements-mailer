'use client'

import { useMemo, useState } from 'react'
import type { Recipient, RenderedEmail } from '@/lib/types'

interface Props {
  email: RenderedEmail
  from: { name: string; email: string }
  recipient: Recipient
  recipients: Recipient[]
  /** Only the plain-text version is being sent, so that's all there is to show. */
  plainText: boolean
  onSelectRecipient: (email: string) => void
}

export default function Preview({ email, from, recipient, recipients, plainText, onSelectRecipient }: Props) {
  const [chosenView, setView] = useState<'html' | 'text'>('html')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const view = plainText ? 'text' : chosenView

  // The email is a bare HTML fragment. The page around it is preview-only:
  // links open in a new tab, and the padding stands in for the reading pane.
  const srcDoc = useMemo(
    () =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">` +
      `<style>body{margin:0;padding:4px 24px 32px}</style></head><body>${email.html}</body></html>`,
    [email.html],
  )
  const fromName = from.name || from.email || 'You'

  return (
    <div className="preview">
      <div className="preview__toolbar">
        <div className="segmented segmented--sm" role="group" aria-label="Format">
          <button
            type="button"
            aria-pressed={view === 'html'}
            disabled={plainText}
            title={plainText ? 'Sending as plain text only' : undefined}
            onClick={() => setView('html')}
          >
            Email
          </button>
          <button type="button" aria-pressed={view === 'text'} onClick={() => setView('text')}>
            Plain text
          </button>
        </div>
        <div className="segmented segmented--sm" role="group" aria-label="Screen size">
          <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
            Desktop
          </button>
          <button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
            Mobile
          </button>
        </div>
        <label className="preview__as">
          <span>Preview as</span>
          <select
            className="input"
            value={recipient.email}
            disabled={!recipients.length}
            onChange={(e) => onSelectRecipient(e.target.value)}
          >
            {recipients.length ? (
              recipients.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.name ? `${r.name} · ${r.email}` : r.email}
                </option>
              ))
            ) : (
              <option value={recipient.email}>Sample: {recipient.name}</option>
            )}
          </select>
        </label>
      </div>

      <article className="mail" data-device={device}>
        <header className="mail__head">
          <h3 className="mail__subject">{email.subject || '(no subject)'}</h3>
          <div className="mail__meta">
            <span className="avatar" aria-hidden>
              {fromName.charAt(0).toUpperCase()}
            </span>
            <div className="mail__who">
              <div className="mail__from">
                <strong>{fromName}</strong>
                {from.email && <span className="mail__addr">&lt;{from.email}&gt;</span>}
              </div>
              <div className="mail__to">to {recipient.email}</div>
            </div>
            <span className="mail__time">now</span>
          </div>
        </header>
        {view === 'html' ? (
          <iframe
            className="mail__frame"
            title="Email preview"
            srcDoc={srcDoc}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <pre className="mail__text">{email.text}</pre>
        )}
      </article>
    </div>
  )
}
