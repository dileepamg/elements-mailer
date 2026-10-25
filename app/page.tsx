import { connection } from 'next/server'
import Mailer from '@/components/Mailer'

export default async function Page() {
  // Read env at request time rather than baking it in at build.
  await connection()

  return <Mailer canSend={Boolean(process.env.RESEND_API_KEY)} />
}
