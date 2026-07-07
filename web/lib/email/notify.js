// Transactional email via the SendGrid API (restricted mail.send key). Server-only.
// Used for order receipts (to customers with a real email) + vendor order/stock alerts.

const API = 'https://api.sendgrid.com/v3/mail/send'
const KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL || 'noreply@app.pelbu.com'
const FROM_NAME = process.env.NOTIFY_FROM_NAME || 'Pelbu'

export function emailConfigured() {
  return !!KEY && !KEY.startsWith('replace')
}

// Customers auto-created via WhatsApp OTP get a placeholder address (customer_…@example.com);
// staff seeds are @nexus.bt. Only send to addresses that look like real, reachable inboxes.
export function isRealEmail(e) {
  if (!e || typeof e !== 'string') return false
  const s = e.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false
  // Exclude placeholders: WhatsApp temp (@example.com), staff seeds (@nexus.bt), and the meaningful-
  // but-fake phone-based customer addresses (@customer.pelbu.bt).
  return !/(@example\.com$|@nexus\.bt$|@customer\.pelbu\.bt$|@temp\.|\.local$|^noreply@)/.test(s)
}

/** Fire-and-forget email; silently skips when unconfigured or the address isn't real. */
export async function sendEmail(to, subject, text, html) {
  try {
    if (!emailConfigured() || !isRealEmail(to)) return { skipped: true }
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    console.error('[email/notify] send failed:', err.message)
    return { ok: false, error: err.message }
  }
}

/** Resolve an entity's contact email (owner for shops; the customer themselves for customers). */
export async function entityContactEmail(supabase, entityId) {
  try {
    if (!entityId) return null
    const { data: profs } = await supabase
      .from('user_profiles').select('id, sub_role').eq('entity_id', entityId).limit(5)
    const chosen = (profs || []).find(p => p.sub_role === 'OWNER') || (profs || [])[0]
    const authId = chosen?.id || entityId   // customers: entity id === auth id
    const { data } = await supabase.auth.admin.getUserById(authId)
    return data?.user?.email || null
  } catch { return null }
}

/**
 * Deliver a notification to an entity: ALWAYS write it in-app, and email it only if that entity has
 * opted in (email_notifications_enabled) and has a real address. Auth emails don't use this.
 */
export async function notifyEntity(supabase, entityId, { type, title, body = null, link = null }) {
  if (!entityId) return
  try {
    await supabase.from('notifications').insert({ entity_id: entityId, type, title, body, link })
    // Email is per-user: send to each user of this entity who opted in (+ has a real address).
    const { data: profs } = await supabase
      .from('user_profiles').select('id').eq('entity_id', entityId).eq('email_notifications_enabled', true)
    for (const p of (profs || [])) {
      const { data } = await supabase.auth.admin.getUserById(p.id)
      const email = data?.user?.email
      if (email && isRealEmail(email)) await sendEmail(email, title, body || title)
    }
  } catch (err) {
    console.error('[notifyEntity]', err.message)
  }
}

/** Resolve a shop entity's owner login email (their real inbox), for vendor alerts. */
export async function entityOwnerEmail(supabase, entityId) {
  try {
    if (!entityId) return null
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('entity_id', entityId)
      .eq('sub_role', 'OWNER')
      .limit(1)
      .maybeSingle()
    if (!prof?.id) return null
    const { data } = await supabase.auth.admin.getUserById(prof.id)
    return data?.user?.email || null
  } catch {
    return null
  }
}
