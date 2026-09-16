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

## Tests and frontend checks

Backend (from `backend/`):

```powershell
dotnet test TeamProgressTracker.slnx
```

Frontend (from `frontend/`):

```powershell
npm run typecheck
npm run lint
npm run build
```

There is no `npm test` script.

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

`.github/workflows/checks.yml` runs frontend typecheck and lint on pull requests.

`.github/workflows/deploy.yml` publishes the frontend to GitHub Pages and requires
**`VITE_API_BASE_URL`** (HTTPS or same-origin path) as a repository variable or secret. The backend
is not part of that workflow — point the variable at your hosted gateway before relying on Pages
deploy.
