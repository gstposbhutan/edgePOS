import PocketBase from "pocketbase";

// Seed the three role users the gating spec logs in as. Idempotent — safe to re-run.
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
const PASS = "testpass123";
const USERS: Array<{ email: string; role: "owner" | "manager" | "cashier" }> = [
  { email: "cashier@test.local", role: "cashier" },
  { email: "manager@test.local", role: "manager" },
  { email: "owner@test.local", role: "owner" },
];

export default async function globalSetup() {
  const pb = new PocketBase(PB_URL);
  await pb.collection("_superusers").authWithPassword("admin@pos.local", "admin12345");
  for (const u of USERS) {
    try {
      await pb.collection("users").getFirstListItem(`email="${u.email}"`);
    } catch {
      await pb.collection("users").create({
        email: u.email,
        password: PASS,
        passwordConfirm: PASS,
        name: `${u.role} tester`,
        role: u.role,
      });
    }
  }
  console.log(`[global-setup] role users ready on ${PB_URL}`);
}
