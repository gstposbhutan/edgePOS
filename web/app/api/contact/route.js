import { NextResponse } from 'next/server'
import { sendEmail, emailConfigured } from '@/lib/email/notify'

export const runtime = 'nodejs'

// Public contact / demo-request form. Emails the submission to the support inbox
// (CONTACT_TO) when email is configured; always records it in the server log so a
// message is never silently lost.
export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const message = String(body.message || '').trim()
  const org = String(body.org || '').trim()

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Name, email and message are required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 })
  }

  // Delivered to the Innovates Bhutan inbox (override with CONTACT_TO).
  const to = process.env.CONTACT_TO || 'bhutaninnovates@gmail.com'
  const subject = `Pelbu enquiry from ${name}`
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    org ? `Business: ${org}` : null,
    '',
    message,
  ].filter(Boolean).join('\n')

  console.log(`[contact] ${name} <${email}>${org ? ` (${org})` : ''}: ${message.slice(0, 200)}`)

  if (to && emailConfigured()) {
    await sendEmail(to, subject, text)
  }

  return NextResponse.json({ ok: true })
}
