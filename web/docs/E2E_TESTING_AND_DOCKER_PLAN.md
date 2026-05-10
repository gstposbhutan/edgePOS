# E2E Testing + Docker — NEXUS BHUTAN

## Context

The app has zero test infrastructure and zero Docker configuration. We need:
1. **Dockerize everything** — Next.js POS, WhatsApp gateway, logistics bridge, sync worker
2. **E2E tests** — Playwright covering all user flows (V1-V7, C1-C5, system) plus auth (sign up/in, log in/out)

**Stack**: Next.js 16 (React 19), Supabase for auth+DB, 3 Hono-style Express microservices (tsx/TypeScript), WhatsApp gateway on :3001, logistics bridge on :3002, sync worker (background).

---

## Part A: Docker

### File Structure

```
Dockerfile                    # Next.js POS terminal (multi-stage build)
.dockerignore
services/whatsapp-gateway/Dockerfile
services/logistics-bridge/Dockerfile
services/sync-worker/Dockerfile
docker-compose.yml            # All services + Supabase local
docker-compose.test.yml       # Test overrides (Playwright, seed DB)
```

### 1. Root `Dockerfile` (Next.js POS)

Multi-stage build:
- **Stage 1 (deps)**: `node:20-alpine`, copy package.json + package-lock.json, `npm ci`
- **Stage 2 (builder)**: Copy source, `npm run build` (Next.js standalone output)
- **Stage 3 (runner)**: `node:20-alpine`, copy standalone output + public + static assets, expose 3000, `CMD ["node", "server.js"]`

Uses Next.js `output: 'standalone'` for minimal image size.

### 2. Service Dockerfiles (whatsapp-gateway, logistics-bridge, sync-worker)

Same pattern for each:
- **Stage 1 (deps)**: `node:20-alpine`, `npm ci`
- **Stage 2 (builder)**: Copy src, `npm run build` (tsc)
- **Stage 3 (runner)**: Copy dist + node_modules, expose port, `CMD ["node", "dist/index.js"]`

### 3. `docker-compose.yml`

```yaml
services:
  desktop:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [whatsapp-gateway]

  whatsapp-gateway:
    build: ./services/whatsapp-gateway
    ports: ["3001:3001"]
    env_file: ./services/whatsapp-gateway/.env

  logistics-bridge:
    build: ./services/logistics-bridge
    ports: ["3002:3002"]
    env_file: ./services/logistics-bridge/.env

  sync-worker:
    build: ./services/sync-worker
    env_file: ./services/sync-worker/.env

  # Supabase local (via official CLI image or supabase/supabase)
  supabase-db:
    image: supabase/postgres:15.6.1
    ports: ["54322:5432"]
    environment:
      POSTGRES_PASSWORD: "postgres"
    volumes:
      - supabase-db-data:/var/lib/postgresql/data

volumes:
  supabase-db-data:
```

### 4. `docker-compose.test.yml`

Overlay for test runs:
- Starts Playwright container alongside the app
- Seeds DB before tests
- Uses `.env.test`

---

## Part B: E2E Testing

### File Structure

```
e2e/
├── fixtures/
│   ├── test-data.js              # Seed data constants
│   ├── db-seed.js                # Supabase seed functions
│   └── db-cleanup.js             # Truncate between runs
├── mocks/
│   ├── meta-api-mock.js          # Intercept Meta Cloud API
│   └── gemini-vision-mock.js     # Intercept Gemini OCR
├── page-objects/
│   ├── base-page.js              # Shared helpers
│   ├── login-page.js
│   ├── pos-page.js
│   ├── cart-panel.js
│   ├── payment-scanner-modal.js
│   ├── customer-id-modal.js
│   ├── stock-gate-modal.js
│   ├── orders-list-page.js
│   ├── order-detail-page.js
│   ├── inventory-page.js
│   ├── adjust-stock-modal.js
│   ├── scan-bill-modal.js
│   ├── khata-list-page.js
│   ├── khata-detail-page.js
│   ├── create-account-modal.js
│   ├── record-payment-modal.js
│   └── shop-page.js
├── setup/
│   ├── global-setup.js           # Seed DB, start mocks
│   ├── global-teardown.js        # Cleanup
│   └── auth-setup.js             # Create users, save sessions
├── specs/
│   ├── v1-auth.spec.js
│   ├── v2-pos-sale.spec.js
│   ├── v3-order-management.spec.js
│   ├── v4-inventory.spec.js
│   ├── v5-photo-to-stock.spec.js
│   ├── v6-khata-credit.spec.js
│   ├── v7-stock-alerts.spec.js
│   ├── c1-marketplace.spec.js
│   ├── c2-whatsapp-ordering.spec.js
│   ├── c3-whatsapp-otp.spec.js
│   ├── c4-whatsapp-receipt.spec.js
│   ├── c5-whatsapp-credit-alerts.spec.js
│   └── system-order-state-machine.spec.js
└── storage/
    ├── retailer-auth.json
    ├── manager-auth.json
    └── owner-auth.json
```

### Playwright Config (`playwright.config.js`)

- Base URL: `http://localhost:3000`
- WebServer: `next dev` (or Docker container)
- 3 projects: retailer (CASHIER), manager (MANAGER), owner (OWNER) with stored auth states
- Timezone: `Asia/Thimphu`
- Screenshots + traces on failure only
- Timeout: 60s per test, 15s expect timeout
- Retries: 2 on CI, 0 locally

### Auth Setup Strategy

1. `supabase.auth.admin.createUser()` — create 3 test users with role claims in app_metadata
2. Sign in via UI → save storage state for each project
3. Test users: `test-cashier@nexus.bt`, `test-manager@nexus.bt`, `test-owner@nexus.bt`

### Mocking Strategy

- **Meta Cloud API** + **Gemini Vision**: Playwright `page.route()` intercept at browser level
- **WhatsApp gateway**: Run real gateway in Docker (it calls mocked Meta API)
- **Logistics bridge**: Run real service in Docker, mock only Toofan/Rider external APIs

### Test Data

Fixed UUIDs for deterministic assertions:
- 1 test entity (Test Store, RETAILER)
- 10 products (various stock levels: normal, low, zero)
- 6 pre-seeded orders (COMPLETED, CONFIRMED, DELIVERED, CANCELLED, REFUND_REQUESTED, DRAFT)
- 3 khata accounts (active with balance, active zero balance, frozen)

### Spec Summary

| Spec | Key Tests |
|------|-----------|
| **v1-auth** | Email sign in/out, wrong creds, password toggle, session persistence, WhatsApp OTP, tab switching |
| **v2-pos-sale** | Product grid, cart CRUD, GST calc, 5 payment methods, payment scanner, stock gate, checkout, credit limit |
| **v3-order-management** | List/filters/search, order detail, cancel (stock restored), refund partial/full, approve |
| **v4-inventory** | Stock table, search/filter, adjust stock (RESTOCK/LOSS/DAMAGED/TRANSFER), movement history |
| **v5-photo-to-stock** | Upload bill → mocked OCR → draft review → confirm → inventory updated |
| **v6-khata-credit** | Create account, ledger, record payment, adjust balance (OWNER), freeze/unfreeze, permissions |
| **v7-stock-alerts** | Low/zero stock detection, alert banners, WhatsApp notification |
| **c1-marketplace** | Store page, categories, products, WhatsApp links, 404 for bad slug |
| **c2-whatsapp-ordering** | Webhook parses orders, fuzzy match, DRAFT creation, rate limiting |
| **c3-whatsapp-otp** | Send OTP, verify, rate limit, lockout, expiry |
| **c4-whatsapp-receipt** | Receipt after checkout, payload correct, status updated |
| **c5-whatsapp-credit-alerts** | Pre-due, due today, overdue 3d/30d, monthly reminders |
| **system-order-state-machine** | All valid status transitions, stock restoration, status logs |

---

## Build Order

### Phase 1: Docker Infrastructure (7 files)
1. `next.config.js` — add `output: 'standalone'`
2. `.dockerignore`
3. `Dockerfile` (Next.js POS)
4. `services/whatsapp-gateway/Dockerfile`
5. `services/logistics-bridge/Dockerfile`
6. `services/sync-worker/Dockerfile`
7. `docker-compose.yml`

### Phase 2: Test Infrastructure (7 files)
8. Install `@playwright/test`
9. `playwright.config.js`
10. `e2e/fixtures/test-data.js`
11. `e2e/setup/global-setup.js`
12. `e2e/setup/global-teardown.js`
13. `e2e/setup/auth-setup.js`
14. `e2e/fixtures/db-seed.js` + `db-cleanup.js`

### Phase 3: Auth Tests (3 files)
15. `e2e/page-objects/base-page.js`
16. `e2e/page-objects/login-page.js`
17. `e2e/specs/v1-auth.spec.js`

### Phase 4: POS Sale Tests (7 files)
18. `e2e/page-objects/pos-page.js`
19. `e2e/page-objects/cart-panel.js`
20. `e2e/page-objects/payment-scanner-modal.js`
21. `e2e/page-objects/customer-id-modal.js`
22. `e2e/page-objects/stock-gate-modal.js`
23. `e2e/specs/v2-pos-sale.spec.js`

### Phase 5: Order Tests (3 files)
24. `e2e/page-objects/orders-list-page.js`
25. `e2e/page-objects/order-detail-page.js`
26. `e2e/specs/v3-order-management.spec.js`

### Phase 6: Inventory Tests (5 files)
27. `e2e/page-objects/inventory-page.js`
28. `e2e/page-objects/adjust-stock-modal.js`
29. `e2e/page-objects/scan-bill-modal.js`
30. `e2e/specs/v4-inventory.spec.js`
31. `e2e/specs/v5-photo-to-stock.spec.js`
32. `e2e/specs/v7-stock-alerts.spec.js`

### Phase 7: Khata Tests (5 files)
33. `e2e/page-objects/khata-list-page.js`
34. `e2e/page-objects/khata-detail-page.js`
35. `e2e/page-objects/create-account-modal.js`
36. `e2e/page-objects/record-payment-modal.js`
37. `e2e/specs/v6-khata-credit.spec.js`

### Phase 8: Consumer + System Tests (7 files)
38. `e2e/page-objects/shop-page.js`
39. `e2e/specs/c1-marketplace.spec.js`
40. `e2e/specs/c2-whatsapp-ordering.spec.js`
41. `e2e/specs/c3-whatsapp-otp.spec.js`
42. `e2e/specs/c4-whatsapp-receipt.spec.js`
43. `e2e/specs/c5-whatsapp-credit-alerts.spec.js`
44. `e2e/specs/system-order-state-machine.spec.js`

---

## package.json additions

```json
{
  "devDependencies": {
    "@playwright/test": "^1.52.0"
  },
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:v1": "playwright test e2e/specs/v1-auth",
    "test:e2e:v2": "playwright test e2e/specs/v2-pos-sale",
    "test:e2e:v3": "playwright test e2e/specs/v3-order-management",
    "test:e2e:v4": "playwright test e2e/specs/v4-inventory",
    "test:e2e:v5": "playwright test e2e/specs/v5-photo-to-stock",
    "test:e2e:v6": "playwright test e2e/specs/v6-khata-credit",
    "test:e2e:v7": "playwright test e2e/specs/v7-stock-alerts",
    "test:e2e:consumer": "playwright test e2e/specs/c*",
    "test:e2e:system": "playwright test e2e/specs/system-*",
    "test:e2e:report": "playwright show-report",
    "docker:build": "docker compose build",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "docker:test": "docker compose -f docker-compose.yml -f docker-compose.test.yml up --abort-on-container-exit"
  }
}
```

---

## Verification

1. `docker compose build` — all images build
2. `docker compose up -d` — all services start
3. `curl localhost:3000` — POS terminal responds
4. `curl localhost:3001/health` — WhatsApp gateway responds
5. `curl localhost:3002/health` — Logistics bridge responds
6. `npx playwright install` — Chromium downloaded
7. `npm run test:e2e` — all specs pass
8. `npm run test:e2e:report` — HTML report
