import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

const MAX_ATTEMPTS = 3
const MOCK_OTP = '123456' // Universal OTP for demo/testing

// Helper: Sync role from user_profiles to user metadata
async function syncUserRole(supabase, authUserId) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', authUserId)
    .single()

  if (profile) {
    await supabase.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        ...(profile.role && { role: profile.role })
      }
    })
  }
}

export async function POST(request) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'Phone number and 6-digit OTP required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const isMockMode = process.env.MOCK_WHATSAPP === 'true'

    // MOCK MODE: Accept universal OTP
    if (isMockMode && otp === MOCK_OTP) {
      console.log(`[MOCK WhatsApp VERIFY] Phone: ${phone}, OTP: ${otp} - AUTHENTICATED`)

      // Look up user by WhatsApp phone
      let { data: entity } = await supabase
        .from('entities')
        .select('id, name')
        .eq('whatsapp_no', phone)
        .single()

      console.log('[LOGIN] Entity lookup result:', entity)

      let authUserId = null
      let authUserEmail = null
      let tempPassword = null

      // Auto-create customer account if not exists
      if (!entity) {
        console.log(`[AUTO-SIGNUP] Creating new customer for phone: ${phone}`)

        // Generate unique email with timestamp to avoid conflicts
        const tempEmail = `customer_${Date.now()}@example.com`
        // Generate a more reliable password (min 10 chars, letters + numbers)
        tempPassword = 'TempPass' + Math.random().toString(36).substring(2, 10) + Date.now().toString().substring(0, 6)

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true,
        })

        console.log('[AUTO-SIGNUP] Auth user create result:', authData?.user?.id, authError)

        if (authError || !authData.user) {
          console.error('Failed to create auth user:', authError)
          return NextResponse.json(
            { error: 'Failed to create account: ' + (authError?.message || 'Unknown error') },
            { status: 500 }
          )
        }

        authUserId = authData.user.id
        authUserEmail = authData.user.email
        console.log('[AUTO-SIGNUP] Auth user ID:', authUserId, 'Email:', authUserEmail, 'Password:', tempPassword, 'Pwd Length:', tempPassword?.length)

        // Create entity
        const { data: newEntity, error: entityError } = await supabase
          .from('entities')
          .insert({
            id: authUserId,
            name: `Customer ${phone.slice(-4)}`,
            whatsapp_no: phone,
            role: 'CUSTOMER',
            is_active: true,
          })
          .select('id, name')
          .single()

        console.log('[AUTO-SIGNUP] Entity create result:', newEntity, entityError)

        if (entityError || !newEntity) {
          console.error('Failed to create entity:', entityError)
          // Cleanup auth user
          await supabase.auth.admin.deleteUser(authUserId)
          return NextResponse.json(
            { error: 'Failed to create account: ' + (entityError?.message || 'Unknown error') },
            { status: 500 }
          )
        }

        // Create user_profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: authUserId,
            entity_id: newEntity.id,
            role: 'CUSTOMER',
            sub_role: 'CUSTOMER',
            full_name: newEntity.name,
          })

        if (profileError) {
          console.error('Failed to create profile:', profileError)
          return NextResponse.json(
            { error: 'Failed to create account.' },
            { status: 500 }
          )
        }

        entity = newEntity
      } else {
        // Existing entity - find the auth user
        console.log('[LOGIN] Found existing entity:', entity.id, entity.name)

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('entity_id', entity.id)
          .limit(1)
          .single()

        console.log('[LOGIN] Profile lookup result:', profile, profileError)

        // If entity exists but has no profile, create the profile and auth user
        if (!profile) {
          console.log('[LOGIN] Orphaned entity found, creating auth user and profile...')

          const tempEmail = `customer_${Date.now()}@example.com`
          tempPassword = 'TempPass' + Math.random().toString(36).substring(2, 10) + Date.now().toString().substring(0, 6)

          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: tempEmail,
            password: tempPassword,
            email_confirm: true,
          })

          if (authError || !authData.user) {
            console.error('Failed to create auth user for orphaned entity:', authError)
            return NextResponse.json(
              { error: 'Failed to create account: ' + (authError?.message || 'Unknown error') },
              { status: 500 }
            )
          }

          authUserId = authData.user.id
          authUserEmail = authData.user.email

          // Create user_profile for existing entity
          const { error: profileCreateError } = await supabase
            .from('user_profiles')
            .insert({
              id: authUserId,
              entity_id: entity.id,
              role: 'CUSTOMER',
              sub_role: 'CUSTOMER',
              full_name: entity.name,
            })

          if (profileCreateError) {
            console.error('Failed to create profile for orphaned entity:', profileCreateError)
            return NextResponse.json(
              { error: 'Failed to create account: ' + profileCreateError.message },
              { status: 500 }
            )
          }

          // Update the user with phone metadata and role
          await supabase.auth.admin.updateUserById(authUserId, {
            user_metadata: {
              phone: phone,
              phone_verified: true,
              role: 'CUSTOMER'
            }
          })

          console.log('[LOGIN] Created auth user and profile for orphaned entity')
        } else {
          authUserId = profile.id

          // Sync role from user_profiles to user metadata for existing users
          await syncUserRole(supabase, authUserId)

          const { data: { users } } = await supabase.auth.admin.listUsers()
          const authUser = users.find(u => u.id === authUserId)
          if (!authUser) {
            return NextResponse.json(
              { error: 'Authentication account not found.' },
              { status: 404 }
            )
          }
          authUserEmail = authUser.email
        }
      }

      // Update the user with phone metadata and role FIRST
      await supabase.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          phone: phone,
          phone_verified: true,
          role: 'CUSTOMER'
        }
      })

      // Then generate magic link to obtain session (so tokens are fresh)
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: authUserEmail,
        })

      if (linkError || !linkData) {
        console.error('Generate link failed:', linkError)
        return NextResponse.json(
          { error: 'Failed to create session.' },
          { status: 500 }
        )
      }

      const tokens = {
        access_token: linkData.properties.access_token,
        refresh_token: linkData.properties.refresh_token,
        expires_at: linkData.properties.expires_at,
      }
      console.log('[MOCK VERIFY] Generated tokens:', { ...tokens, access_token: tokens.access_token?.substring(0, 20) + '...' })

      // Verify the user was created correctly
      const { data: { user: verifiedUser }, error: verifyError } = await supabase.auth.admin.getUserById(authUserId)
      console.log('[MOCK VERIFY] User verification:', verifiedUser?.id, verifyError)

      if (verifyError || !verifiedUser) {
        console.error('[MOCK VERIFY] User verification failed after creation')
        return NextResponse.json(
          { error: 'Failed to verify user account' },
          { status: 500 }
        )
      }

      // Return temp credentials for client-side sign in (new users)
      // Or magic link tokens (existing users)
      if (tempPassword) {
        console.log('[MOCK VERIFY] Returning temp credentials for new user')
        return NextResponse.json({
          success: true,
          needs_signin: true,
          email: authUserEmail,
          temp_password: tempPassword,
        })
      } else {
        console.log('[MOCK VERIFY] Returning magic link tokens for existing user')
        return NextResponse.json({
          success: true,
          access_token: linkData.properties.access_token,
          refresh_token: linkData.properties.refresh_token,
          expires_at: linkData.properties.expires_at,
        })
      }
    }

    // PRODUCTION MODE: Verify against stored OTP hash
    // Find the most recent unused, non-expired OTP for this phone
    const { data: otpRecord, error: fetchError } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: 'OTP expired or not found. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check max attempts
    if (otpRecord.attempt_count >= MAX_ATTEMPTS) {
      await supabase
        .from('whatsapp_otps')
        .update({ used: true })
        .eq('id', otpRecord.id)

      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new OTP.' },
        { status: 400 }
      )
    }

    // Verify OTP
    const valid = await bcrypt.compare(otp, otpRecord.otp_hash)

    if (!valid) {
      await supabase
        .from('whatsapp_otps')
        .update({ attempt_count: otpRecord.attempt_count + 1 })
        .eq('id', otpRecord.id)

      const remaining = MAX_ATTEMPTS - otpRecord.attempt_count - 1
      return NextResponse.json(
        { error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
        { status: 400 }
      )
    }

    // Mark OTP as used
    await supabase
      .from('whatsapp_otps')
      .update({ used: true })
      .eq('id', otpRecord.id)

    // Look up user by WhatsApp phone
    // entities.whatsapp_no stores the business phone
    // For login, we match against user_profiles or entities
    let { data: entity } = await supabase
      .from('entities')
      .select('id, name')
      .eq('whatsapp_no', phone)
      .single()

    let authUserId = null
    let authUserEmail = null
    let tempPassword = null

    // Auto-create customer account if not exists
    if (!entity) {
      console.log(`[AUTO-SIGNUP] Creating new customer for phone: ${phone}`)

      // Create auth user first
      const tempEmail = `customer_${Date.now()}@example.com`
      // Generate a more reliable password (min 10 chars, letters + numbers)
      tempPassword = 'TempPass' + Math.random().toString(36).substring(2, 10) + Date.now().toString().substring(0, 6)

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: tempEmail,
        password: tempPassword,
        email_confirm: true,
      })

      if (authError || !authData.user) {
        console.error('Failed to create auth user:', authError)
        return NextResponse.json(
          { error: 'Failed to create account.' },
          { status: 500 }
        )
      }

      authUserId = authData.user.id
      authUserEmail = authData.user.email

      // Create entity
      const { data: newEntity, error: entityError } = await supabase
        .from('entities')
        .insert({
          id: authUserId,
          name: `Customer ${phone.slice(-4)}`,
          whatsapp_no: phone,
          role: 'CUSTOMER',
          is_active: true,
        })
        .select('id, name')
        .single()

      if (entityError || !newEntity) {
        console.error('Failed to create entity:', entityError)
        // Cleanup auth user
        await supabase.auth.admin.deleteUser(authUserId)
        return NextResponse.json(
          { error: 'Failed to create account.' },
          { status: 500 }
        )
      }

      // Create user_profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authUserId,
          entity_id: newEntity.id,
          role: 'CUSTOMER',
          sub_role: 'CUSTOMER',
          full_name: newEntity.name,
        })
        .select('id')
        .single()

      if (profileError) {
        console.error('Failed to create profile:', profileError)
        return NextResponse.json(
          { error: 'Failed to create account: ' + profileError.message },
          { status: 500 }
        )
      }

      console.log('[AUTO-SIGNUP] Created profile:', profileData)

      entity = newEntity
    } else {
      // Existing entity - find the auth user
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('entity_id', entity.id)
        .limit(1)
        .single()

      if (!profile) {
        return NextResponse.json(
          { error: 'No user account linked to this phone number.' },
          { status: 404 }
        )
      }

      authUserId = profile.id

      // Sync role from user_profiles to user metadata for existing users
      await syncUserRole(supabase, authUserId)

      const { data: { users } } = await supabase.auth.admin.listUsers()
      const authUser = users.find(u => u.id === authUserId)
      if (!authUser) {
        return NextResponse.json(
          { error: 'Authentication account not found.' },
          { status: 404 }
        )
      }
      authUserEmail = authUser.email
    }

    // Update the user with phone metadata and role FIRST
    await supabase.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        phone: phone,
        phone_verified: true,
        role: 'CUSTOMER'
      }
    })

    // Then generate magic link to obtain session (so tokens are fresh)
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: authUserEmail,
      })

    if (linkError || !linkData) {
      console.error('Generate link failed:', linkError)
      return NextResponse.json(
        { error: 'Failed to create session.' },
        { status: 500 }
      )
    }

    // For production with real OTP, we still need to handle session creation
    // For now, return temp credentials for client-side sign in
    if (tempPassword) {
      return NextResponse.json({
        success: true,
        needs_signin: true,
        email: authUserEmail,
        temp_password: tempPassword,
      })
    }

    // For existing users without temp password, use magic link approach
    return NextResponse.json({
      success: true,
      access_token: linkData.properties.access_token,
      refresh_token: linkData.properties.refresh_token,
      expires_at: linkData.properties.expires_at,
    })
  } catch (err) {
    console.error('WhatsApp verify OTP error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    )
  }
}
