/// <reference path="../pb_data/types.d.ts" />

// Mirror a cloud store user into the local PocketBase `users` auth collection using
// the SAME bcrypt hash (GoTrue and PocketBase both use bcrypt), so one owner-set
// password works on web AND this terminal — no plaintext ever reaches the terminal.
//
// PocketBase's records API only accepts a plaintext password (which it would re-hash),
// so we create/find the record normally (valid tokenKey etc.) and then overwrite the
// stored hash directly via a raw query. Superuser-only; the desktop bootstrap calls it
// with the local superuser token.
routerAdd("POST", "/api/custom/sync-user", (e) => {
  const body = e.requestInfo().body || {}
  const email = String(body.email || "").toLowerCase().trim()
  const role = ["owner", "manager", "cashier"].includes(body.role) ? body.role : "cashier"
  const name = String(body.name || "")
  const hash = String(body.password_hash || "")

  if (!email || !hash) {
    return e.json(400, { error: "email and password_hash are required" })
  }

  let rec = null
  try {
    rec = $app.findFirstRecordByFilter("users", "email = {:email}", { email })
  } catch (_) {
    rec = null
  }

  if (!rec) {
    const col = $app.findCollectionByNameOrId("users")
    rec = new Record(col)
    rec.set("email", email)
    rec.setPassword($security.randomString(32)) // placeholder; overwritten with the synced hash below
  }
  rec.set("name", name)
  rec.set("role", role)
  rec.set("verified", true)
  $app.save(rec)

  // Overwrite the freshly-hashed placeholder with the cloud's bcrypt hash.
  $app.db()
    .newQuery("UPDATE users SET password = {:hash} WHERE id = {:id}")
    .bind({ hash: hash, id: rec.id })
    .execute()

  return e.json(200, { id: rec.id, email: email, role: role })
}, $apis.requireSuperuserAuth())
