# Axura Engine

The core API backend for the Axura mechanical warranty insurance platform. All portals (Dealer, Ops) consume this service — it is the single source of truth for business logic.

## What it does

Axura Engine exposes a REST API that handles:

- **Vehicle assessment** — classifies vehicles as RED / AMBER / GREEN using two independent engines:
  - **OBD2 engine** — processes diagnostic scan data from the CarCheck mobile app
  - **ESI engine** — processes Bosch KTS ESI[tronic] PDF workshop reports
- **Policy management** — creates and manages insurance policies (numbered `AX-YYYY-NNNN`)
- **Premium calculation** — pricing engine based on base rate × risk multipliers
- **Dealer management** — B2B dealer companies and their agent accounts
- **User & role management** — internal staff accounts with permission-based access control
- **Rule configuration** — versioned assessment rule sets with simulation support
- **File handling** — ESI PDF upload and storage via Cloudflare R2 (presigned URLs)
- **Email delivery** — transactional emails via Resend
- **PDF generation** — policy documents rendered server-side

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 |
| Database | NeonDB (PostgreSQL serverless) |
| Storage | Cloudflare R2 |
| Auth | Custom JWT (jose) |
| PDF parsing | unpdf |
| PDF generation | @react-pdf/renderer |
| Email | Resend |
| VIN decode | NHTSA API |
| Deployment | Vercel |

Runs on **port 3100** in dev and production.

## Prerequisites

- Node.js 20+
- A NeonDB project (PostgreSQL connection string)
- Cloudflare R2 bucket (for ESI PDF storage)
- Resend account (for email)

## Environment variables

Create a `.env.local` file in this directory:

```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
```

## Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

The API will be available at `http://localhost:3100`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3100 |
| `npm run build` | Build for production |
| `npm run start` | Start production server on port 3100 |
| `npm run migrate` | Run all pending DB migrations |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript check without emitting |

## API overview

All endpoints are under `/api`. Every endpoint except `/api/health` requires a valid JWT in the `Authorization: Bearer <token>` header.

| Route | Description |
|---|---|
| `GET /api/health` | Health check (public) |
| `GET/POST /api/vehicles` | Vehicle registry |
| `GET /api/vehicles/[vin]` | Vehicle by VIN |
| `POST /api/assessments/obd` | Submit OBD2 scan for assessment |
| `POST /api/assessments/esi` | Submit ESI PDF for assessment |
| `GET /api/assessments/[id]` | Assessment result |
| `GET/POST /api/policies` | Policy list / create |
| `GET /api/policies/[id]` | Policy detail |
| `GET /api/policies/[id]/preview` | Policy PDF preview |
| `GET/POST /api/dealers` | Dealer list / create |
| `GET /api/dealers/[id]` | Dealer detail |
| `GET/POST /api/users` | User list / create |
| `GET /api/users/[id]` | User detail |
| `GET/POST /api/roles` | Role list / create |
| `GET /api/roles/[id]` | Role detail |
| `GET /api/rules/[version]` | Rule config by version |
| `GET /api/rules/active` | Currently active rule config |
| `POST /api/rules/simulate` | Simulate assessment against a rule config |
| `POST /api/esi-files/upload-url` | Get presigned R2 upload URL |

## Authentication

The engine uses JWT-based auth. Tokens carry a `sub` (subject), a list of `permissions`, and optionally a `dealerId` for dealer-scoped tokens. The middleware injects these as request headers (`x-auth-sub`, `x-auth-permissions`, `x-auth-dealer-id`) so route handlers can read them without re-parsing the token.

## Database migrations

Migrations live in `lib/db/migrations/` and are numbered sequentially (`000_`, `001_`, ...). Running `npm run migrate` applies all unapplied migrations in order.

Migration files:

| File | Contents |
|---|---|
| `000_extensions.sql` | PostgreSQL extensions |
| `001_users_auth.sql` | Internal user accounts |
| `002_permissions.sql` | Permissions & roles |
| `003_vehicles.sql` | Vehicle registry |
| `004_assessments.sql` | OBD2 and ESI assessments |
| `005_policies.sql` | Insurance policies |
| `006_rule_configs.sql` | Versioned rule sets |
| `007_audit_log.sql` | Audit trail |
| `008_seed_permissions.sql` | Default permission seed data |

## Assessment verdicts

Both engines return one of three verdicts:

- **GREEN** — vehicle is eligible for warranty insurance
- **AMBER** — eligible with conditions or reduced coverage
- **RED** — not eligible

Each verdict includes a list of reasons and supporting details.
