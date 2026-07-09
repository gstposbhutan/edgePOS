#!/usr/bin/env node
// Seed N test riders (default 20) via the Supabase admin API so GoTrue can
// resolve each user on login. Idempotent: skips a rider whose whatsapp_no
// already exists, and reuses an existing auth user for the same email.
//
//   Run (from web/):  node scripts/seed-riders.js [count]
//
// Config resolves from env, falling back to values parsed out of .env.docker.
// SUPABASE_URL defaults to the host-reachable kong (127.0.0.1:8000) because the
// in-container URL (http://kong:8000) does not resolve on the host.
//
// All seeded riders share:  PIN 1234  ·  password Rider@2026
// Phones:  +975 1780 00NN   ·   emails:  riderNN@demo.bt

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── config resolution ─────────────────────────────────────────────────────────
function fromEnvFile(key) {
  try {
    const txt = readFileSync(join(__dirname, '..', '.env.docker'), 'utf8')
    const line = txt.split('\n').find((l) => l.startsWith(key + '='))
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

const SUPABASE_URL =
  process.env.SEED_SUPABASE_URL || 'http://127.0.0.1:8000' // host-reachable kong
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || fromEnvFile('SUPABASE_SERVICE_ROLE_KEY')

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (env or .env.docker).')
  process.exit(1)
}

const COUNT = Math.max(1, parseInt(process.argv[2] || '20', 10))
const PIN = '1234'
const PASSWORD = 'Rider@2026'

const NAMES = [
  'Karma Wangchuk', 'Sonam Dorji', 'Tashi Phuntsho', 'Pema Tshering',
  'Ugyen Namgay', 'Jigme Dorji', 'Kinley Wangmo', 'Tshering Choki',
  'Namgay Dema', 'Sangay Tenzin', 'Phuntsho Gyeltshen', 'Dechen Zangmo',
  'Yeshey Lhamo', 'Nima Rinzin', 'Rinzin Norbu', 'Gyeltshen Dorji',
  'Chencho Dorji', 'Dorji Wangdi', 'Kezang Choden', 'Sithar Dolma',
]

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// find an existing auth user by email (admin API has no getByEmail; page through)
async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
}

async function seedOne(i) {
  const nn = String(i).padStart(2, '0')
  const name = NAMES[(i - 1) % NAMES.length] + (i > NAMES.length ? ` ${Math.ceil(i / NAMES.length)}` : '')
  const phone = `+975178000${nn}`
  const email = `rider${nn}@demo.bt`

  // already seeded? (by phone)
  const { data: existing } = await supabase
    .from('riders').select('id').eq('whatsapp_no', phone).maybeSingle()
  if (existing) return { phone, name, status: 'skip (exists)' }

  // create or reuse the auth user
  let authUserId
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { role: 'RIDER', email_verified: true, name },
  })
  if (created?.user) {
    authUserId = created.user.id
  } else if (createErr && /already|registered|exists/i.test(createErr.message)) {
    const found = await findAuthUserByEmail(email)
    if (!found) throw new Error(`email taken but user not found: ${email}`)
    authUserId = found.id
  } else {
    throw new Error(createErr?.message || 'createUser failed')
  }

  const pin_hash = await bcrypt.hash(PIN, 10)
  const { error: insErr } = await supabase.from('riders').insert({
    name, whatsapp_no: phone, pin_hash,
    auth_user_id: authUserId, auth_email: email, auth_password: PASSWORD,
    is_active: true, is_available: true, current_order_id: null,
  })
  if (insErr) throw new Error(insErr.message)
  return { phone, name, status: 'created' }
}

async function run() {
  console.log(`Seeding ${COUNT} riders → ${SUPABASE_URL}`)
  let created = 0, skipped = 0, failed = 0
  for (let i = 1; i <= COUNT; i++) {
    try {
      const r = await seedOne(i)
      if (r.status === 'created') created++; else skipped++
      console.log(`  ${r.phone}  ${r.name.padEnd(22)} ${r.status}`)
    } catch (e) {
      failed++
      console.error(`  rider ${i}: FAILED — ${e.message}`)
    }
  }
  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed.`)
  console.log(`Login at /rider/login — phone +975178000NN, PIN ${PIN}.`)
}

run()
