const { createClient } = require('@supabase/supabase-js')
const bcrypt = require('bcryptjs')
const {
  TEST_ENTITY,
  TEST_WHOLESALER,
  TEST_CATEGORY,
  TEST_PRODUCTS,
  TEST_WHOLESALER_PRODUCTS,
  TEST_USERS,
  TEST_ORDERS,
  TEST_KHATA_ACCOUNTS,
  TEST_RETAILER_WHOLESALER,
  TEST_WHOLESALER_KHATA,
  TEST_RIDER,
  TEST_BATCHES,
} = require('./test-data')

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E seeding.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function seedDatabase() {
  const supabase = getAdminClient()

  // ── 0. Fix JWT claims hook (write to app_metadata, not claims) ────
  const hookSql = `
    CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
    RETURNS JSONB AS $$
    DECLARE
      app_metadata  JSONB;
      profile RECORD;
    BEGIN
      SELECT entity_id, role, sub_role, permissions
      INTO profile
      FROM user_profiles
      WHERE id = (event->>'user_id')::UUID;

      IF profile IS NULL THEN
        RETURN event;
      END IF;

      app_metadata := event->'app_metadata';
      app_metadata := jsonb_set(app_metadata, '{entity_id}',  to_jsonb(profile.entity_id::TEXT));
      app_metadata := jsonb_set(app_metadata, '{role}',        to_jsonb(profile.role));
      app_metadata := jsonb_set(app_metadata, '{sub_role}',    to_jsonb(profile.sub_role));
      app_metadata := jsonb_set(app_metadata, '{permissions}', to_jsonb(profile.permissions));

      RETURN jsonb_set(event, '{app_metadata}', app_metadata);
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `

  // Note: We can't execute DDL via the client, so this is a no-op
  // The migration needs to be applied via Supabase dashboard or CLI
  console.log('[DB Seed] NOTE: Migration 030 needs to be applied to fix JWT claims location')

  // ── 1. Upsert entity ───────────────────────────────────────────
  const { error: entityErr } = await supabase
    .from('entities')
    .upsert(TEST_ENTITY, { onConflict: 'id' })

  if (entityErr) {
    console.error('[DB Seed] Entity upsert failed:', entityErr.message)
    throw entityErr
  }

  // ── 2. Upsert products ─────────────────────────────────────────
  // Strip `category` from product rows (used only for product_categories junction)
  const productRows = TEST_PRODUCTS.map(({ category, ...rest }) => rest)
  const { error: productsErr } = await supabase
    .from('products')
    .upsert(productRows, { onConflict: 'id' })

  if (productsErr) {
    console.error('[DB Seed] Products upsert failed:', productsErr.message)
    throw productsErr
  }

  // ── 2b. Upsert product_categories for marketplace grouping ────
  // Collect unique category names and build lookup
  const categoryNames = [...new Set(TEST_PRODUCTS.map(p => p.category).filter(Boolean))]
  const { data: existingCats } = await supabase
    .from('categories')
    .select('id, name')

  // Upsert any missing categories
  const missingCats = categoryNames.filter(name => !existingCats?.some(c => c.name === name))
  if (missingCats.length > 0) {
    const { error: catErr } = await supabase
      .from('categories')
      .upsert(missingCats.map(name => ({ name })), { onConflict: 'name' })
    if (catErr) {
      console.error('[DB Seed] Categories upsert failed:', catErr.message)
      throw catErr
    }
  }

  // Build category name → id map
  const { data: allCats } = await supabase.from('categories').select('id, name')
  const catMap = Object.fromEntries((allCats ?? []).map(c => [c.name, c.id]))

  // Build product_categories junction rows
  const prodCatRows = TEST_PRODUCTS
    .filter(p => p.category && catMap[p.category])
    .map(p => ({ product_id: p.id, category_id: catMap[p.category] }))

  if (prodCatRows.length > 0) {
    const { error: pcErr } = await supabase
      .from('product_categories')
      .upsert(prodCatRows, { onConflict: 'product_id,category_id' })
    if (pcErr) {
      console.error('[DB Seed] Product categories upsert failed:', pcErr.message)
      throw pcErr
    }
  }

  // ── 3. Upsert orders (keep items JSONB, use schema field names) ──
  const orders = TEST_ORDERS.map((order) => order)

  const { error: ordersErr } = await supabase
    .from('orders')
    .upsert(orders, { onConflict: 'id' })

  if (ordersErr) {
    console.error('[DB Seed] Orders upsert failed:', ordersErr.message)
    throw ordersErr
  }

  // ── 4. Upsert order items (map test data to schema columns) ─────
  const orderItems = TEST_ORDERS.flatMap((order, oIdx) =>
    order.items.map((item, idx) => {
      const seq = oIdx * 10 + idx + 1
      const suffix = String(seq).padStart(4, '0')
      return {
        id: `00000000-0000-4000-8000-00000005${suffix}`,
        order_id: order.id,
        product_id: item.product_id,
        sku: item.sku,
        name: item.name,
        quantity: item.qty,
        unit_price: item.rate,
        discount: item.discount || 0,
        gst_5: item.gst_5,
        total: item.total,
        status: 'ACTIVE',
      }
    })
  )

  const { error: itemsErr } = await supabase
    .from('order_items')
    .upsert(orderItems, { onConflict: 'id' })

  if (itemsErr) {
    console.error('[DB Seed] Order items upsert failed:', itemsErr.message)
    throw itemsErr
  }

  // ── 5. Upsert khata accounts ───────────────────────────────────
  const { error: khataErr } = await supabase
    .from('khata_accounts')
    .upsert(TEST_KHATA_ACCOUNTS, { onConflict: 'id' })

  if (khataErr) {
    console.error('[DB Seed] Khata accounts upsert failed:', khataErr.message)
    throw khataErr
  }

  // ── 6. Create/update auth users and build ID map ───────────────
  const authIdMap = {} // email → actual auth user ID

  for (const user of TEST_USERS) {
    const { data, error: authErr } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        phone: TEST_ENTITY.whatsapp_no,
      },
      app_metadata: {
        role: user.role,
        sub_role: user.sub_role,
        entity_id: user.entity_id,
        permissions: user.permissions,
      },
    })

    if (authErr) {
      // "already registered" — try to look up via signIn to get the ID
      if (authErr.message?.includes('already been registered')) {
        console.log(`[DB Seed] User ${user.email} already exists, looking up via profile...`)
        // The user_profiles table should have the ID from a previous seed
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('role', user.role)
          .eq('sub_role', user.sub_role)
          .eq('entity_id', user.entity_id)
          .maybeSingle()

        if (profile) {
          authIdMap[user.email] = profile.id
          // Update password + metadata
          await supabase.auth.admin.updateUserById(profile.id, {
            password: user.password,
            user_metadata: {
              phone: TEST_ENTITY.whatsapp_no,
            },
            app_metadata: {
              role: user.role,
              sub_role: user.sub_role,
              entity_id: user.entity_id,
              permissions: user.permissions,
            },
          })
          console.log(`[DB Seed] Updated existing user ${user.email} (${profile.id})`)
          continue
        }
      }
      console.error(`[DB Seed] Auth user creation failed for ${user.email}:`, authErr.message || authErr.code)
      throw authErr
    }
    authIdMap[user.email] = data.user.id
  }

  // ── 7. Upsert user profiles using actual auth IDs ──────────────
  const profiles = TEST_USERS.map((user) => ({
    id: authIdMap[user.email],
    entity_id: user.entity_id,
    role: user.role,
    sub_role: user.sub_role,
    permissions: user.permissions,
    full_name: user.sub_role.charAt(0) + user.sub_role.slice(1).toLowerCase(),
  }))

  const { error: profileErr } = await supabase
    .from('user_profiles')
    .upsert(profiles, { onConflict: 'id' })

  if (profileErr) {
    console.error('[DB Seed] User profiles upsert failed:', profileErr.message)
    throw profileErr
  }

  // ── 8. Upsert wholesaler entity ─────────────────────────────────────
  const { error: wholeErr } = await supabase
    .from('entities')
    .upsert(TEST_WHOLESALER, { onConflict: 'id' })

  if (wholeErr) {
    console.error('[DB Seed] Wholesaler entity upsert failed:', wholeErr.message)
    throw wholeErr
  }

  // ── 9. Upsert category ────────────────────────────────────────────
  const { error: catErr } = await supabase
    .from('categories')
    .upsert(TEST_CATEGORY, { onConflict: 'id' })

  if (catErr) {
    console.error('[DB Seed] Category upsert failed:', catErr.message)
    throw catErr
  }

  // ── 10. Upsert retailer-wholesaler connection ─────────────────────
  const { error: connErr } = await supabase
    .from('retailer_wholesalers')
    .upsert(TEST_RETAILER_WHOLESALER, { onConflict: 'retailer_id,wholesaler_id,category_id' })

  if (connErr) {
    console.error('[DB Seed] Retailer-wholesaler connection upsert failed:', connErr.message)
    throw connErr
  }

  // ── 11. Upsert wholesaler products ─────────────────────────────────
  const wholesaleProdRows = TEST_WHOLESALER_PRODUCTS.map(({ category, ...rest }) => rest)
  const { error: wProdErr } = await supabase
    .from('products')
    .upsert(wholesaleProdRows, { onConflict: 'id' })

  if (wProdErr) {
    console.error('[DB Seed] Wholesaler products upsert failed:', wProdErr.message)
    throw wProdErr
  }

  // ── 12. Upsert wholesaler-retailer khata account ────────────────────
  const { error: wKhataErr } = await supabase
    .from('khata_accounts')
    .upsert(TEST_WHOLESALER_KHATA, { onConflict: 'id' })

  if (wKhataErr) {
    console.error('[DB Seed] Wholesaler khata upsert failed:', wKhataErr.message)
    throw wKhataErr
  }

  // ── 13. Upsert product batches ────────────────────────────────────────
  const { error: batchErr } = await supabase
    .from('product_batches')
    .upsert(TEST_BATCHES, { onConflict: 'id' })

  if (batchErr) {
    console.error('[DB Seed] Product batches upsert failed:', batchErr.message)
    throw batchErr
  }

  // ── 14. Seed test rider ──────────────────────────────────────────────
  // Create auth user for rider login
  const riderEmail = 'rider@teststore.bt'
  const riderPassword = 'TestRider@2026'
  let riderAuthId = null

  const { data: riderAuthData, error: riderAuthErr } = await supabase.auth.admin.createUser({
    email: riderEmail,
    password: riderPassword,
    email_confirm: true,
  })

  if (riderAuthErr) {
    if (riderAuthErr.message?.includes('already been registered')) {
      const { data: existingRider } = await supabase
        .from('riders')
        .select('auth_user_id')
        .eq('whatsapp_no', TEST_RIDER.phone)
        .maybeSingle()
      if (existingRider?.auth_user_id) {
        riderAuthId = existingRider.auth_user_id
        await supabase.auth.admin.updateUserById(riderAuthId, { password: riderPassword })
      }
    } else {
      console.error('[DB Seed] Rider auth user creation failed:', riderAuthErr.message)
      throw riderAuthErr
    }
  } else {
    riderAuthId = riderAuthData.user.id
  }

  // Hash the PIN
  const pinHash = await bcrypt.hash(TEST_RIDER.pin, 10)

  const { error: riderErr } = await supabase
    .from('riders')
    .upsert({
      id: TEST_RIDER.id,
      name: TEST_RIDER.name,
      whatsapp_no: TEST_RIDER.phone,
      pin_hash: pinHash,
      is_active: TEST_RIDER.is_active,
      is_available: true,
      current_order_id: null,
      auth_user_id: riderAuthId,
      auth_email: riderEmail,
      auth_password: riderPassword,
    }, { onConflict: 'id' })

  if (riderErr) {
    console.error('[DB Seed] Rider upsert failed:', riderErr.message)
    throw riderErr
  }

  console.log(
    `[DB Seed] Seeded: 1 retailer, 1 wholesaler, 1 category, ${TEST_PRODUCTS.length} retailer products, ${TEST_WHOLESALER_PRODUCTS.length} wholesaler products, ${TEST_ORDERS.length} orders, ${TEST_KHATA_ACCOUNTS.length} consumer khata + 1 B2B khata, ${TEST_USERS.length} users, ${profiles.length} profiles, ${TEST_BATCHES.length} batches, 1 rider`
  )
  console.log('[DB Seed] Auth ID map:', JSON.stringify(authIdMap, null, 2))

  // ── Apply RLS policy for retailers to read connected wholesalers ───────
  const { error: policyError } = await supabase.rpc('exec_sql', { sql: `
    DROP POLICY IF EXISTS "retailer_read_connected_wholesalers" ON entities;

    CREATE POLICY "retailer_read_connected_wholesalers" ON entities
      FOR SELECT USING (
        auth_role() = 'RETAILER' AND id IN (
          SELECT wholesaler_id FROM retailer_wholesalers
          WHERE retailer_id = auth_entity_id() AND active = TRUE
        )
      );
  ` })

  if (policyError) {
    console.error('[DB Seed] Failed to create RLS policy:', policyError)
    // Fallback: try direct SQL via DDL
    console.log('[DB Seed] NOTE: Run migration 031 to allow retailers to read connected wholesaler entities')
  } else {
    console.log('[DB Seed] Applied RLS policy for retailer_wholesaler connections')
  }
}

module.exports = { seedDatabase }
