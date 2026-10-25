# elements-mailer

A private tool for sending personal, one-to-one emails to opted-in contacts through [Resend](https://resend.com). Built with Next.js 16 for Vercel. There's no database: the sender, signature and template edits are saved in your browser.

## Setup

In Resend:

1. Add and verify `elementslanka.com` under Domains, using the DNS records it shows.
2. Turn off open and click tracking in the domain settings.
3. Create an API key with sending access.

The From address you use in the app must be on the verified domain, and it needs a mailbox or forwarder so replies reach you.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Resend API key |
| `APP_PASSWORD` | yes | Login password. The site is locked in production without it. |
| `APP_USERNAME` | no | If set, the login needs this username too |
| `REPLY_TO` | no | Where replies go, if not the From address |
| `UNSUBSCRIBE_EMAIL` | no | Where unsubscribe requests go, if the unsubscribe option is on |

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill it in
pnpm dev                     # https://localhost:3000 (pnpm dev:http for plain HTTP)
```

## Deploy

Import the repo in Vercel, add the environment variables above, and deploy.
