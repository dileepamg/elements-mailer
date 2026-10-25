export interface Draft {
  subject: string
  greeting: string
  body: string
  signOff: string
}

export interface Template extends Draft {
  id: string
  name: string
  description: string
}

export type SignatureStyle = 'text' | 'photo'

export interface SendOptions {
  /** Send only the plain-text version: no formatting, links or photo. */
  plainText: boolean
  /** Add a List-Unsubscribe header. Gmail reads it as bulk mail. */
  unsubscribeHeader: boolean
}

/** The From line: what the recipient's inbox shows as the sender. */
export interface Sender {
  name: string
  email: string
}

export interface Signature {
  name: string
  title: string
  company: string
  phone: string
  website: string
  /** Image URL for the "photo" style. Empty means the From address's Gravatar. */
  photo: string
  style: SignatureStyle
}

export interface Recipient {
  email: string
  name: string
  company: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}
