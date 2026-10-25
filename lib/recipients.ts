import { isValidEmail } from './render'
import type { Recipient } from './types'

export interface ParsedRecipients {
  recipients: Recipient[]
  invalid: string[]
  duplicates: number
}

/**
 * Accepts one recipient per line, in whatever shape a list usually comes in:
 *   kamal@abc.lk
 *   Kamal Perera <kamal@abc.lk>
 *   kamal@abc.lk, Kamal Perera, ABC Holdings
 *   Kamal Perera <tab> kamal@abc.lk <tab> ABC Holdings   (pasted from a sheet)
 * The email can be in any column; the other columns are read as name, then company.
 */
export function parseRecipients(input: string): ParsedRecipients {
  const recipients: Recipient[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicates = 0

  let first = true
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const isFirst = first
    first = false

    const recipient = parseLine(line)
    if (!recipient) {
      // Quietly skip a header row like "Name, Email, Company".
      if (!(isFirst && /email/i.test(line) && !line.includes('@'))) invalid.push(line)
      continue
    }
    if (seen.has(recipient.email)) {
      duplicates++
      continue
    }
    seen.add(recipient.email)
    recipients.push(recipient)
  }

  return { recipients, invalid, duplicates }
}

function parseLine(line: string): Recipient | null {
  const angle = line.match(/^(.*?)<([^>]+)>(.*)$/)
  const angleEmail = angle?.[2].trim().toLowerCase() ?? ''
  if (angle && isValidEmail(angleEmail)) {
    const email = angleEmail
    const company = cells(angle[3])[0] ?? ''
    return { email, name: unquote(angle[1].replace(/[,;\t]\s*$/, '')), company }
  }

  const parts = cells(line)
  const index = parts.findIndex((p) => isValidEmail(p))
  if (index === -1) return null
  const rest = parts.filter((_, i) => i !== index)
  return { email: parts[index].toLowerCase(), name: rest[0] ?? '', company: rest[1] ?? '' }
}

function cells(text: string): string[] {
  return text
    .split(/\t|;|,/)
    .map(unquote)
    .filter(Boolean)
}

function unquote(text: string): string {
  return text.trim().replace(/^["']|["']$/g, '').trim()
}
