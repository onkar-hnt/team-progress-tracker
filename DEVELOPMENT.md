# Development

Day-to-day work on Team Progress Tracker: layout, running processes, configuration, migrations,
tests, and common failures.

---

## Repository layout

```
team-progress-tracker/
  backend/
    TeamProgressTracker.slnx
    Directory.Build.props          net10.0, shared analyser settings
    appsettings.Local.example.json  copy per host (git-ignored locally)
    Dockerfile                      one image definition for all six hosts
    docker-compose.yml              SQL Server + services + gateway, ports 5100-5105
    .env.example → .env             compose values and container configuration
    scripts/                        run-all, stop-all, smoke-test
    src/
      ApiGateway/                   YARP, Swagger aggregation, profile gate
      BuildingBlocks/               Contracts, Common, Persistence, SharedKernel
      Services/
        Identity/   Team/   Work/   Notifications/   Reporting/
          *.Api/      HTTP hosts
          *.Application/
          *.Domain/
          *.Infrastructure/         EF, migrations, SQL gateways
    tests/
      Backend.UnitTests/
      Backend.IntegrationTests/
    logs/                             created by run-all.ps1
  frontend/                           React 19 + TypeScript (Vite)
    src/
      app/          routing, providers, GlobalApiFeedback
      features/     screens
      hooks/        React Query hooks, access scope
      services/
        api/          single HTTP client → gateway (endpoints in config/api)
        auth/         session, permissions, access-scope
        data-provider/   seam; http/ implementation
      config/       app.config.ts, api/endpoints.ts, api/http.config.ts
    vitest.config.ts                tests beside their subject as *.test.ts
    .env.example → .env.local
```

---

## Running backend and frontend together

| Process | Port | Talks to |
| --- | --- | --- |
| Vite (`npm run dev`) | 5173 or 5174 | `VITE_API_BASE_URL` (default **5100**) |
| ApiGateway | **5100** | Proxies to 5101–5105 |
| Identity.Api | 5101 | SQL Server |
| Team.Api | 5102 | SQL Server |
| Work.Api | 5103 | SQL Server + retention worker |
| Notifications.Api | 5104 | SQL Server |
| Reporting.Api | 5105 | SQL Server (read-only queries) |

The browser **never** calls 5101–5105 directly in normal use; only the gateway origin appears in
`frontend/src/config/app.config.ts` (from **`VITE_API_BASE_URL`**).

Start everything:

```powershell
cd d:\Projects\team-progress-tracker\backend
pwsh ./scripts/run-all.ps1
```

```powershell
cd d:\Projects\team-progress-tracker\frontend
npm run dev
```

Stop backend:

```powershell
cd d:\Projects\team-progress-tracker\backend
pwsh ./scripts/stop-all.ps1
```

**Order matters on first boot**: Identity (admin) → Team (roster) → Work (needs developers).
`run-all.ps1` starts Identity and Team before Work.

---

## Backend scripts (`backend/scripts/`)

| Script | Purpose |
| --- | --- |
| `run-all.ps1` | Starts gateway + five services with `ASPNETCORE_ENVIRONMENT=Development`, `--no-launch-profile`, waits on `/health` |
| `stop-all.ps1` | Stops processes named `Identity.Api`, `Team.Api`, `Work.Api`, `Notifications.Api`, `Reporting.Api`, `ApiGateway` |
| `smoke-test.ps1` | Signs in as admin, provisions users, checks scope, work rules, notifications, change log, recycle bin, reports via **5100** |

---

## Running in containers

`backend/docker-compose.yml` runs SQL Server, the five services and the gateway on the **same
ports** as `run-all.ps1`, so nothing in the frontend changes.

```powershell
cd backend
copy .env.example .env
docker compose up --build
```

`.env` must carry `Jwt__SigningKey`, `Seed__AdminPassword` and `MSSQL_SA_PASSWORD`; compose stops
with a message naming whichever is missing rather than starting a stack nobody can sign in to.
The SQL Server password has to satisfy its own policy — 8 characters or more from three of upper,
lower, digit and symbol.

| Detail | How it works |
| --- | --- |
| Image | One [`backend/Dockerfile`](backend/Dockerfile) for all six hosts, with `PROJECT` and `APP_DLL` as build arguments |
| Start order | `depends_on` on each other's health: SQL Server → Identity → Team → Work → Reporting, with Notifications before Work |
| Health | Every service answers `/health`; the image checks it with curl, which is what `depends_on: service_healthy` waits for |
| Schema | `Database__MigrateOnStartup=true` on the four services that own one, so a fresh volume becomes a working database |
| Gateway | Cluster destinations are overridden to `http://identity:8080` and friends, because `appsettings.json` names the ports of a local run |
| Data | The `sqlserver-data` volume survives `docker compose down`; add `-v` to discard it |

**This is a runnable stack, not a production deployment.** It speaks plain HTTP, signs in to SQL
Server as `sa`, and migrates on startup. A real environment wants TLS at the edge, a database
account per service with rights to its own schema, and migrations applied as a deliberate step
rather than by whichever replica starts first.

---

## Tests and frontend checks

Backend (from `backend/`):

```powershell
dotnet test TeamProgressTracker.slnx
```

Unit tests run anywhere. The integration tests need SQL Server: they create
**`TeamProgressTracker_IntegrationTests`** on the instance in
`tests/Backend.IntegrationTests/Infrastructure/TestConfiguration.cs` and refuse to run against the
application's own database, so a run cannot leave rows in what you are developing against.

| Variable | Use |
| --- | --- |
| `INTEGRATION_TEST_DATABASE` | Another database name on the same instance |
| `INTEGRATION_TEST_CONNECTION` | A whole connection string, for another server — what CI passes |

A server that is still starting is waited for, up to 90 seconds, rather than failing the first
test.

Frontend (from `frontend/`):

```powershell
npm run typecheck
npm run lint
npm test          # watches; `npm test -- --run` for a single pass
npm run build
```

Vitest covers the API client and the services under it — the envelope and error mapping, the
session and its expiry, retries and what is never retried, offline and timeout, and the access
scope the screens use to hide what a person cannot reach. Tests sit beside what they test as
`*.test.ts`, and run in Node unless the file asks for jsdom with a `@vitest-environment` docblock.

---

## Adding a migration

1. Change the **Domain** / `DbContext` in the owning service's Infrastructure project.
2. From `backend/`:

```powershell
dotnet ef migrations add DescribeYourChange `
  --project src/Services/Work/Work.Infrastructure/Work.Infrastructure.csproj `
  --startup-project src/Services/Work/Work.Api/Work.Api.csproj
```

3. Apply:

```powershell
dotnet ef database update `
  --project src/Services/Work/Work.Infrastructure/Work.Infrastructure.csproj `
  --startup-project src/Services/Work/Work.Api/Work.Api.csproj
```

Or restart under Development with `Database:MigrateOnStartup: true` for that service.

Reporting has no EF context migrations.

---

## Configuration

Resolution order (each API host and the gateway):

1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. **`appsettings.Local.json`** (optional, **git-ignored** — copy from `backend/appsettings.Local.example.json`)
4. Environment variables (`Jwt__SigningKey`, `ConnectionStrings__DefaultConnection`, `Seed__AdminPassword`, …)
5. User secrets (if configured on the project)

### Secrets — never commit

| Location | Contains |
| --- | --- |
| `**/appsettings.Local.json` | JWT signing key, admin seed password, connection overrides |
| `backend/.env` (from `backend/.env.example`) | Same keys as env vars |
| User secrets | Optional local overrides |

Committed `appsettings.json` files use an **empty** `Jwt:SigningKey`; the app **throws on startup**
until `appsettings.Local.json` or `Jwt__SigningKey` is set (`ServiceDefaults.AddAppDefaults`).

### Important settings

| Key | Where | Meaning |
| --- | --- | --- |
| `Urls` | each host | Kestrel bind (5100–5105) |
| `ConnectionStrings:DefaultConnection` | all writers + gateway (gate) | SQL Server |
| `Jwt:*` | all hosts | Must match across services |
| `Cors:AllowedOrigins` | gateway + services | `http://localhost:5173`, `5174` |
| `Database:MigrateOnStartup` | services | `true` in Development for Identity/Team/Work/Notifications |
| `Seed:AdminEmail`, `Seed:AdminPassword`, `Seed:AdminName` | Identity Development | Bootstrap admin |
| `ProfileActiveGate:StatusCacheSeconds` | gateway (+ Identity for warning text) | Default **60** |
| `Retention:*` | Work | Background purge interval (**6** h), batch sizes **500** |
| `Usage:MaxDatabaseBytes` | Reporting | Default **10737418240** (10 GB) for Usage screen |

`Properties/launchSettings.json` ports (e.g. 5258) are **not** used when you run via `run-all.ps1`
(`--no-launch-profile`); **`appsettings.json` `Urls`** win.

---

## Seed data and credentials

**Identity** (`IdentitySeeder`): creates **`admin@handt.ai`** when no profile with that email exists
and **`Seed:AdminPassword`** is configured. Display name from **`Seed:AdminName`** (default
"Administrator"). Seeded admin is **not** forced to change password.

**Team** (`TeamSeeder`): 2 mentors, 3 projects, 6 developers with emails `@handt.ai`, mentor
assignments and project membership — only when **`team.Developers`** is empty.

**Work** (`WorkSeeder`): tasks, daily updates, feedback — only when **`work.Tasks`** is empty and
Team has developers.

**Smoke test** expects administrator password **`Admin@1234`**; that is not in the repository —
set it in your local `Seed:AdminPassword`.

Provisioning flow (also in smoke-test): temporary password from API → sign in with
`mustChangePassword` → `POST /api/auth/change-password`.

---

## Frontend environment (`.env.local`)

See `frontend/.env.example`. All **`VITE_*`** values are public in the bundle.

| Variable | Role |
| --- | --- |
| `VITE_API_BASE_URL` | Gateway origin (default `http://localhost:5100`) |
| `VITE_AUTH_MODE` | `api`, `entra`, or `local`; blank = auto (api, then entra) |
| `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID` | Microsoft SSO |
| `VITE_ADMIN_*` | Offline `local` mode only |

Auth provider selection lives in `frontend/src/services/auth/` (API JWT is the normal path).

### HTTP client (centralised)

All API paths are listed in **`frontend/src/config/api/endpoints.ts`**. The single client in
**`frontend/src/services/api/api-client.ts`** attaches the bearer token, parses the
`{ message, status, data }` envelope, applies a **20s** timeout and **GET** retries (max **3**
attempts, backoff **400ms** / **1600ms** on statuses 408, 429, 502, 503, 504), and refuses to send
while **`navigator.onLine`** is false. Globally owned failures are announced from
**`api-failure.ts`** and shown once via **`GlobalApiFeedback`**. Feature code should use
**`toFeatureMessage`** so a second snackbar does not repeat the same outage. See
[frontend/README.md](frontend/README.md).

---

## Diagnosing common failures

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Backend exits on start | Missing JWT key | `appsettings.Local.json` or `Jwt__SigningKey` |
| SQL connection errors | Wrong instance | `SQLEXPRESS01` vs your instance name in connection string |
| Login works, nothing else | Gateway down or wrong URL | `VITE_API_BASE_URL`, `run-all` health lines |
| 401 on all API calls | No/expired token | Sign in again; JWT lifetime **480** minutes |
| 403 after deactivating user | Expected; cache window | Up to **`ProfileActiveGate:StatusCacheSeconds`** |
| CORS error in browser | Origin not allowed | Use 5173/5174 or add origin in `Cors:AllowedOrigins` |
| Empty roster / no work seed | Migrations or order | Team before Work; check `backend/logs/*.err.log` |
| Port already in use | Previous run | `stop-all.ps1` or kill stray `dotnet` hosts |
| `dotnet ef` not found | Tool missing | `dotnet tool install --global dotnet-ef` |
| Integration tests fail | DB/JWT not configured | Test host setup in `Backend.IntegrationTests` |

---

## GitHub Actions

`.github/workflows/checks.yml` runs three jobs on pull requests and on pushes to any branch but
`main`:

| Job | Does |
| --- | --- |
| **Frontend** | `npm ci`, typecheck, lint, `vitest --run`, then a build with no API configured |
| **Backend** | `dotnet build`, then `dotnet test` — unit and integration — against a SQL Server service container, with `INTEGRATION_TEST_CONNECTION` pointing at it |
| **Container image** | Builds the Identity image from `backend/Dockerfile`; nothing is pushed |

The backend job uses a throwaway SQL Server, so the password in the workflow guards nothing beyond
that runner. The frontend build runs without `VITE_API_BASE_URL` deliberately: it proves the bundle
does not need one at build time.

`.github/workflows/deploy.yml` publishes the frontend to GitHub Pages and requires
**`VITE_API_BASE_URL`** (HTTPS or same-origin path) as a repository variable or secret. The backend
is not part of that workflow — point the variable at your hosted gateway before relying on Pages
deploy.
