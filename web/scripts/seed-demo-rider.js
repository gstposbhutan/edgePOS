#!/usr/bin/env node
// Run: node scripts/seed-demo-rider.js
// Creates the demo rider via the Supabase admin API (not raw SQL)
// so GoTrue can correctly resolve the user on login.
//
// Credentials: +97517999001 / PIN 1234

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL     || 'http://127.0.0.1:55221'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY    || ''

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const RIDER_EMAIL    = 'rider@demo.bt'
const RIDER_PASSWORD = 'Rider@2026'
const RIDER_PHONE    = '+97517999001'
const RIDER_PIN      = '1234'
const RIDER_NAME     = 'Demo Rider'

async function run() {
  console.log('Seeding demo rider...')

  // Check if already exists
  const { data: existing } = await supabase
    .from('riders')
    .select('id, auth_email')
    .eq('whatsapp_no', RIDER_PHONE)
    .single()

  if (existing) {
    console.log('Demo rider already exists:', existing.id)
    return
  }

  // Create auth user via admin API (GoTrue-compatible)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email:          RIDER_EMAIL,
    password:       RIDER_PASSWORD,
    email_confirm:  true,
    user_metadata:  { role: 'RIDER', email_verified: true },
  })

  if (authError || !authData?.user) {
    console.error('Failed to create auth user:', authError?.message)
    process.exit(1)
  }

  console.log('Auth user created:', authData.user.id)

  // Hash PIN
  const pinHash = await bcrypt.hash(RIDER_PIN, 10)

  // Insert rider row
  const { data: rider, error: riderError } = await supabase
    .from('riders')
    .insert({
      name:          RIDER_NAME,
      whatsapp_no:   RIDER_PHONE,
      pin_hash:      pinHash,
      auth_user_id:  authData.user.id,
      auth_email:    RIDER_EMAIL,
      auth_password: RIDER_PASSWORD,
      is_active:     true,
      is_available:  true,
    })
    .select('id, name')
    .single()

  if (riderError) {
    console.error('Failed to insert rider:', riderError.message)
    // Clean up auth user
    await supabase.auth.admin.deleteUser(authData.user.id)
    process.exit(1)
  }

  console.log('Demo rider seeded:', rider.id, rider.name)
  console.log('  Login: /rider/login')
  console.log('  Phone:', RIDER_PHONE)
  console.log('  PIN:  ', RIDER_PIN)
}

run()
