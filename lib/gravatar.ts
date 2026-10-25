import { LOGO_URL } from './templates'

const GRAVATAR_PREFIX = 'https://gravatar.com/avatar/'

/**
 * The picture set on gravatar.com for this address. Gravatar falls back to the
 * Elements mark when there isn't one, so the image never breaks. Uses Web
 * Crypto, so it runs the same in the browser and on the server.
 */
export async function gravatarUrl(email: string): Promise<string> {
  const address = email.trim().toLowerCase()
  if (!address) return LOGO_URL
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address))
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${GRAVATAR_PREFIX}${hash}?s=112&d=${encodeURIComponent(LOGO_URL)}`
}

export function isGravatarUrl(url: string): boolean {
  return url.startsWith(GRAVATAR_PREFIX)
}
