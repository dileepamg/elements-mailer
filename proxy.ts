import { NextResponse, type NextRequest } from 'next/server'

// Everything except robots.txt sits behind HTTP Basic Auth. Crawlers can read
// robots.txt (which disallows everything) but never see a page.
export const config = {
  matcher: ['/((?!robots.txt).*)'],
}

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD
  // Optional: when set, the username must match too. Otherwise any username works.
  const username = process.env.APP_USERNAME?.trim()

  if (!password) {
    if (process.env.NODE_ENV === 'development') return NextResponse.next()
    return new NextResponse('APP_PASSWORD is not configured.', { status: 503, headers: NOINDEX })
  }

  const supplied = suppliedCredentials(request)
  // Compare both parts every time, so the response time doesn't reveal which one was wrong.
  const userOk = !username || safeEqual(supplied.user, username)
  const passOk = safeEqual(supplied.pass, password)
  if (userOk && passOk) return NextResponse.next()

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Elements Mailer", charset="UTF-8"', ...NOINDEX },
  })
}

function suppliedCredentials(request: NextRequest): { user: string; pass: string } {
  const none = { user: '', pass: '' }
  const [scheme, encoded] = (request.headers.get('authorization') ?? '').split(' ')
  if (scheme !== 'Basic' || !encoded) return none
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const colon = decoded.indexOf(':')
    if (colon === -1) return none
    return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) }
  } catch {
    return none
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
