'use client'

import { useState } from 'react'
import type { Check } from '@/lib/checks'

const ICONS = { fail: '✕', warn: '!', pass: '✓' }

export default function Checks({ checks }: { checks: Check[] }) {
  const [showPassed, setShowPassed] = useState(false)
  const issues = checks.filter((c) => c.level !== 'pass')
  const fails = issues.filter((c) => c.level === 'fail').length
  const warns = issues.length - fails
  const passed = checks.length - issues.length
  const visible = showPassed ? checks : issues

  return (
    <section className="checks" aria-label="Inbox check">
      <header className="checks__head">
        <h2 className="checks__title">Inbox check</h2>
        <div className="checks__pills">
          {fails > 0 && <span className="pill pill--fail">{fails} to fix</span>}
          {warns > 0 && <span className="pill pill--warn">{warns} to review</span>}
          {!issues.length && <span className="pill pill--pass">Reads like a personal email</span>}
        </div>
        <button type="button" className="link-button" onClick={() => setShowPassed((v) => !v)}>
          {showPassed ? 'Hide passed' : `Show ${passed} passed`}
        </button>
      </header>
      {visible.length > 0 && (
        <ul className="checks__list">
          {visible.map((c) => (
            <li key={`${c.level}:${c.label}`} className={`check check--${c.level}`}>
              <span className="check__icon" aria-hidden>
                {ICONS[c.level]}
              </span>
              <div>
                <p className="check__label">{c.label}</p>
                {c.detail && <p className="check__detail">{c.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
