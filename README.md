# FixMate – Backend

## Project Name
**FixMate – Smart Repair Service Platform**

## Purpose
FixMate is a repair service booking platform that connects customers with technicians for repairing smartphones, laptops, air conditioners and other home appliances.

This repository contains the backend REST API built with TypeScript, Express.js and MongoDB Native Driver.

## Live URL
- Backend API: `https://fixmate-server-snowy.vercel.app/api` (example, update with your Vercel)
- Frontend: `https://fixmate-psi.vercel.app` (example)

Local: `http://localhost:8000/api` and `http://localhost:3000`

## Admin Credentials
- **Current Admin (production DB):** `admin@epyra.com` — role `admin`, manually provisioned, password privately configured in the database and **not** a published default credential. Public self-registration as admin blocked via `databaseHooks` + watcher.
- **Technician (seeded, default password `Password123!` hashed with BetterAuth scrypt):** `technician.seed1@fixmate.dev`, `technician.seed2@fixmate.dev`, `mobarak@epyra.com`
- **Customer (seeded, default password `Password123!`):** `customer.seed1@fixmate.dev`, `customer.seed2@fixmate.dev`

Deleted Admin accounts: `admin1@epyra.com` and `smithadmin@epyra.com` are no longer present.

*Public signup only customer|technician, even crafted role:admin forced to customer. Admin remains valid role for manually provisioned accounts like `admin@epyra.com`.*

## Key Features Implemented
- BetterAuth opaque-session authentication (not JWT): `authMiddleware` verifies the `session` collection token + expiresAt, strict dev bypass requires `NODE_ENV=development && ALLOW_USERID_BEARER=true`, production blocks Bearer userId, cookie fallback for `credentials:include`. No JWT is issued or verified; no in-repo assignment spec mandates JWT (see frontend README "Authentication Model").
- Role middlewares per Challenge 2: `verifyToken` 401, `verifyCustomer/Technician/Admin` 403, ownership via customerId/technicianId filters.
- Security: `escapeRegExp` fixes ReDoS 9 places, `/api/status` admin-only, health minimal, CORS prod-only trusted origins (CLIENT_URL comma-separated), security headers nosniff/DENY/CSP/HSTS, rate limit 100/15min general 20/15min sensitive (custom in-memory, recommend helmet/express-rate-limit + Redis for prod), JSON limit 100kb separate from 5MB multer.
- Data compatibility: `user` collection singular reuse BetterAuth, serviceMode mapping Home Visit→doorstep, Shop Drop-off→workshop, both inclusive, category alias AC→Air Conditioner TV→Television Laptop→Laptop & PC, paymentStatus unpaid→pending alias, additive snapshots technicianName/Email on service, serviceTitle/serviceImage/category/technicianName/Email/customerPhone on booking, stripeSessionId alias sessionId + snapshots on payment, no collection rename.
- Image upload: `POST /api/upload/image` requireAuth, multer memory 5MB, MIME whitelist jpeg/png/webp/gif, extension whitelist, magic numbers JPEG FF D8 FF PNG 89 50 4E 47 etc, size>0 <=5MB, IMGBB_API_KEY placeholder check, timeout 30s, URL validation, returns url/displayUrl/deleteUrl.
- Booking workflow: atomic `findOneAndUpdate` filters `customerId+status=requested` for cancel, `technicianId+status=requested` for accept etc, ALLOWED_TRANSITIONS map, ACTIVE_STATUSES duplicate prevention via partial unique index `customerId+serviceId` where status active, finalAmount>0 on complete.
- Payment: amount from DB `finalAmount ?? basePrice`, Stripe Checkout Session `success_url` contains `{CHECKOUT_SESSION_ID}`, verify via `stripe.checkout.sessions.retrieve` checks `payment_status=paid`, updates booking `paymentStatus paid` only after verified, duplicate prevented via unique `bookingId` index + `sessionId` unique sparse + already_paid check + webhook idempotency, webhook signature `stripe.webhooks.constructEvent`, mock fail-closed in production 503.

## Technology Stack
- Node.js 24, TypeScript 7.0, Express 5.3, MongoDB Native Driver 7.9
- Zod 4.6, Stripe 23.2, Multer 2.5, cookie-parser, cors, dotenv
- Custom utils: escape-regexp, mapping (serviceMode, paymentStatus, category alias), rate-limit in-memory, security-headers manual

## Installed Packages

**Main dependencies:**
- `express` – Backend server and API routing.
- `mongodb` – MongoDB database connection.
- `cors` – CORS restricted to trusted origins only, credentials true.
- `dotenv` – Environment variables.
- `cookie-parser` – BetterAuth session cookie parsing.
- `stripe` – Checkout Session + webhook signature verification.
- `multer` – Memory storage image upload 5MB.
- `zod` – Validation for all controllers.

**Dev dependencies:**
- `typescript`, `@types/*`, `tsx`, `@noble/hashes` for scrypt.

**Missing recommended (manual implemented, recommend install for prod):**
- `helmet` – security headers (currently manual)
- `express-rate-limit` – rate limiting (currently custom in-memory)

Install plan: `npm install helmet express-rate-limit` then replace manual middlewares with `helmet()` and `rateLimit({windowMs, max, standardHeaders:true, legacyHeaders:false})` with Redis store for Vercel.

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file (see `.env.example` for names only, never commit real secrets):

```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
DB_NAME=fixmatedb
CLIENT_URL=http://localhost:3000
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=usd
IMGBB_API_KEY=your_imgbb_key
ALLOW_USERID_BEARER=false
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

`CLIENT_URL` can be comma-separated list for production: `https://fixmate-psi.vercel.app,https://fixmate-server-snowy.vercel.app`

## Run Locally

```bash
npm run dev # tsx watch src/server.ts
```

## Build

```bash
npm run build # tsc
```

## Start Production Server

```bash
npm start # node dist/server.js
```

## Database Collections

- `user` (physical, logical `users` per assignment — BetterAuth stores in `user` singular, reuse to avoid duplicate, alias `USERS="user"`)
- `services` — technician has many, linked `technicianId` + denormalized `technicianName/Email`
- `bookings` — customer has many via `customerId` + `customerEmail`, technician many via `technicianId` + `technicianEmail`, service many via `serviceId` + snapshots `serviceTitle/serviceImage/category`
- `payments` — one booking max one payment via unique `bookingId`, linked `bookingId`, snapshots `serviceTitle/customerName/Email/technicianName/Email`, `sessionId` + `stripeSessionId` alias unique sparse, `transactionId` unique sparse
- BetterAuth internal: `session`, `account`, `verification` (not counted in 4, auto-created)

Indexes: `user_role`, `services_technicianId`, `services_approvalStatus`, `services_public_visibility`, `services_text`, `bookings_customer_service_active_uidx` partial unique active, `payments_bookingId_uidx` unique, `payments_sessionId_uidx` unique sparse, etc idempotent via `ensureIndexes`.

## API Routes (Challenge 2 naming)

- Public: `GET /`, `GET /api/health` minimal, `GET /api/services`, `GET /api/services/:id`
- Protected admin diagnostics: `GET /api/status` → `verifyToken, verifyAdmin`
- `POST /api/bookings, PATCH /api/bookings/:id/cancel, GET /api/bookings/my-bookings, POST /api/payments/create-checkout-session` → `verifyToken, verifyCustomer`
- `POST /api/services, PUT /api/services/:id, DELETE /api/services/:id, PATCH /api/services/:id/availability, GET /api/bookings/assigned, PATCH /api/bookings/:id/*` → `verifyToken, verifyTechnician`
- `GET /api/users, GET /api/users/:id, PATCH /api/users/:id/role, GET /api/services/admin/pending, GET /api/services/admin/all, PATCH /api/services/:id/approval, GET /api/bookings/admin/all, GET /api/payments/admin/transactions` → `verifyToken, verifyAdmin`
- `PATCH /api/users/profile, GET /api/users/me, GET /api/users/profile` → `verifyToken`
- `POST /api/upload/image` → `verifyToken` + `uploadRateLimiter` 20/15min

## Seed Data

`npm run seed` repeatable upsert, preserves existing, prevents duplicates via email/seedId:

- 2+ technicians: `technician.seed1@fixmate.dev`, `technician.seed2@fixmate.dev`, plus existing `mobarak@epyra.com`
- 2+ customers: `customer.seed1@fixmate.dev`, `customer.seed2@fixmate.dev`, plus `robart@epyra.com`
- 12+ approved & available services across 7 categories: Smartphone, Laptop & PC, Air Conditioner, Refrigerator, Television, Washing Machine, Electrical Appliances — each with unique Unsplash/ImgBB image
- 8 bookings: requested, accepted, in-progress, completed pending (for Pay Now), completed paid (with payment), rejected, cancelled
- 2+ payments: pending and paid, consistent with completed bookings only

Final counts after seed: Users >=4, Technicians >=3, Services >=12 approved, Bookings 8 statuses, Payments 2.

## Final Completion Notes (Assignment 09)
- No backend code changes were required for the final completion pass: the existing public services endpoint (approved + available filtering, `limit`/`sortBy`/`sortOrder`) already supports the dynamic homepage, and the existing booking-detail endpoint with ownership checks already supports the tracking page. All completion edits are frontend-only.
- Payment fail-closed behavior: when `STRIPE_SECRET_KEY` is missing or a placeholder, checkout creation returns 503 in production (`NODE_ENV=production`); development uses a mock checkout session. Real Stripe verification and webhook delivery require production credentials and are NOT VERIFIED.
- Image upload requires a real `IMGBB_API_KEY`; with a placeholder key, uploads fail with a clear error and are NOT VERIFIED against the live provider.

## Author
**Faisal Ahmed** — FixMate Phase 1-7 implementation: auth security, backend hardening, image upload, denormalization, booking detail/edit, search/filter/sort URL persistence, role middleware, payment fail-closed.

## Deployment
- Frontend Vercel: env `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MONGODB_URI`
- Backend Vercel: env `MONGODB_URI`, `DB_NAME`, `CLIENT_URL` comma-separated trusted, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IMGBB_API_KEY`, `ALLOW_USERID_BEARER=false`, `NODE_ENV=production`
- `vercel.json` build `npm run build`, functions `api/index.ts` include `dist/**`, rewrites all to `/api`
- Health `/api/health` public minimal for uptime checks, status admin-only diagnostics.
