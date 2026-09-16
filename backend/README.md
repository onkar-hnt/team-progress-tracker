# Backend

**.NET 10** (`net10.0` in [`Directory.Build.props`](Directory.Build.props)) solution:
[`TeamProgressTracker.slnx`](TeamProgressTracker.slnx). Six HTTP hosts — a **YARP API Gateway** plus
five domain services — share one **SQL Server** database with separate schemas. Each service follows
**Clean Architecture** with the dependency rule: **Api → Application → Domain**, with
**Infrastructure** implementing persistence and cross-schema readers.

---

## Services and ports

| Host | Port | Responsibility |
| --- | --- | --- |
| **ApiGateway** | **5100** | YARP reverse proxy to `/api/*`, JWT validation, **`ProfileActiveGateMiddleware`**, aggregated Swagger |
| **Identity.Api** | **5101** | Sign-in, JWT issuance, `/api/auth/*`, account provisioning and lifecycle (`/api/accounts/*`) |
| **Team.Api** | **5102** | Roster: developers, mentors, projects, mentor assignments |
| **Work.Api** | **5103** | Tasks, daily updates, feedback, change log, recycle bin; retention background worker |
| **Notifications.Api** | **5104** | Inbox, read state, notification preferences |
| **Reporting.Api** | **5105** | Read-only reports and admin usage (`/api/reports/*`, `/api/usage`) |

Kestrel binds via **`Urls`** in each project's [`appsettings.json`](src/Services/Identity/Identity.Api/appsettings.json)
(e.g. `http://localhost:5101`). [`scripts/run-all.ps1`](scripts/run-all.ps1) uses
`dotnet run --no-launch-profile`, so **`launchSettings.json` ports are ignored** when using the script.

Health: **`GET /health`** on every host.

---

## Clean Architecture layering

```
Api  →  Application  →  Domain
         ↑
Infrastructure (EF Core, SQL gateways, publishers)
```

- **Domain** — entities and invariants; no infrastructure references
- **Application** — use cases, validators, orchestration (including rules ported from the former Postgres triggers)
- **Infrastructure** — `DbContext`, migrations, `SqlRosterGateway`, `SqlTeamDirectory`, `SqlWorkEntryReader`, …
- **Api** — controllers, DI, `Program.cs`

---

## BuildingBlocks

Under [`src/BuildingBlocks/`](src/BuildingBlocks/):

| Project | Holds |
| --- | --- |
| **SharedKernel** | `AccessScope`, `DomainRules`, `Db` schema names, domain exceptions, `Entity` |
| **Contracts** | DTOs, `ApiResponse`, `UpdatePayload`, gateway interfaces |
| **Common** | `ServiceDefaults`, JWT/CORS/Swagger setup, `ExceptionHandlingMiddleware`, validation filter |
| **Persistence** | EF interceptors (`AuditInterceptor`, `ChangeHistoryInterceptor`) |

---

## SQL Server

Default connection string (committed in `appsettings.json`):

`Server=localhost\SQLEXPRESS01;Database=TeamProgressTracker;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True`

Schemas: **`identity`**, **`team`**, **`work`**, **`notify`**. Reporting has no tables; it queries across schemas.

### Local secrets (never commit)

Copy [`appsettings.Local.example.json`](appsettings.Local.example.json) to **`appsettings.Local.json`** next to:

- `src/ApiGateway/`
- each `src/Services/*/*.Api/` project

Or use [`/.env.example`](.env.example) → **`backend/.env`** with `Jwt__SigningKey`, `ConnectionStrings__DefaultConnection`, `Seed__AdminPassword`, etc.

Committed **`Jwt:SigningKey`** is empty; startup fails until a local override is set (`ServiceDefaults.AddAppDefaults`).

---

## EF Core migrations

Migrations live in each service's **Infrastructure** project. Run from **`backend/`** (install once:
`dotnet tool install --global dotnet-ef`).

**Add** (example Work):

```powershell
dotnet ef migrations add DescribeYourChange `
  --project src/Services/Work/Work.Infrastructure/Work.Infrastructure.csproj `
  --startup-project src/Services/Work/Work.Api/Work.Api.csproj
```

**Apply** (all four writers):

```powershell
dotnet ef database update `
  --project src/Services/Identity/Identity.Infrastructure/Identity.Infrastructure.csproj `
  --startup-project src/Services/Identity/Identity.Api/Identity.Api.csproj

dotnet ef database update `
  --project src/Services/Team/Team.Infrastructure/Team.Infrastructure.csproj `
  --startup-project src/Services/Team/Team.Api/Team.Api.csproj

dotnet ef database update `
  --project src/Services/Work/Work.Infrastructure/Work.Infrastructure.csproj `
  --startup-project src/Services/Work/Work.Api/Work.Api.csproj

dotnet ef database update `
  --project src/Services/Notifications/Notifications.Infrastructure/Notifications.Infrastructure.csproj `
  --startup-project src/Services/Notifications/Notifications.Api/Notifications.Api.csproj
```

Reporting has **no** EF context or migrations.

### `Database:MigrateOnStartup`

| Source | Typical value |
| --- | --- |
| `appsettings.json` | `false` |
| `appsettings.Development.json` | `true` for Identity, Team, Work, Notifications |

With **`ASPNETCORE_ENVIRONMENT=Development`**, [`run-all.ps1`](scripts/run-all.ps1) migrates and seeds on startup without manual `dotnet ef database update`.

---

## Seed data and development credentials

**Identity** ([`IdentitySeeder`](src/Services/Identity/Identity.Infrastructure/IdentitySeeder.cs)) — when no profile exists for **`Seed:AdminEmail`** (default **`admin@handt.ai`**) and **`Seed:AdminPassword`** is set:

- Creates administrator with display name **`Seed:AdminName`** (default **Administrator**)
- **`MustChangePassword = false`** for the seeded admin

**Team** ([`TeamSeeder`](src/Services/Team/Team.Infrastructure/TeamSeeder.cs)) — when **`team.Developers`** is empty:

- Mentors **`MEN001`**, **`MEN002`** (Alex Rivera, Jordan Lee)
- Projects **`PRJ001`–`PRJ003`**
- Developers **`DEV001`–`DEV006`** with `@handt.ai` emails (no logins until provisioned)

**Work** — sample tasks and daily updates when **`work.Tasks`** is empty and Team has developers.

**Smoke test** ([`scripts/smoke-test.ps1`](scripts/smoke-test.ps1)) signs in as **`admin@handt.ai`** with password **`Admin@1234`** — that password is **not** in the repo; set **`Seed:AdminPassword`** locally to match if you use the script.

---

## Running the stack

From **`backend/`** (PowerShell 7 recommended):

| Script | Purpose |
| --- | --- |
| [`run-all.ps1`](scripts/run-all.ps1) | Start Identity → Team → Work → Notifications → Reporting → Gateway; wait for `/health`; logs in `logs/` |
| [`stop-all.ps1`](scripts/stop-all.ps1) | Stop processes named `Identity.Api`, `Team.Api`, `Work.Api`, `Notifications.Api`, `Reporting.Api`, `ApiGateway` |
| [`smoke-test.ps1`](scripts/smoke-test.ps1) | End-to-end checks through **`http://localhost:5100`** |

**Single service** (uses `Urls` in that project's `appsettings.json`):

```powershell
dotnet run --project src/Services/Identity/Identity.Api
```

**Build and test**:

```powershell
dotnet build TeamProgressTracker.slnx
dotnet test TeamProgressTracker.slnx
```

---

## Swagger

| Host | Swagger UI |
| --- | --- |
| Gateway (combined) | http://localhost:5100/swagger |
| Identity | http://localhost:5101/swagger |
| Team | http://localhost:5102/swagger |
| Work | http://localhost:5103/swagger |
| Notifications | http://localhost:5104/swagger |
| Reporting | http://localhost:5105/swagger |

Gateway proxies OpenAPI JSON at `/swagger/identity/swagger.json`, … `/swagger/reporting/swagger.json`
(see [`src/ApiGateway/appsettings.json`](src/ApiGateway/appsettings.json) **ReverseProxy** routes).

Authorize with **`data.accessToken`** from **POST /api/auth/login** (Bearer added by Swagger UI).

---

## API response contract

JSON envelope on every response:

```json
{ "message": "…", "status": 200, "data": { } }
```

Numeric **`status`** matches the HTTP status code. Failures do not expose stack traces
([`ExceptionHandlingMiddleware`](src/BuildingBlocks/Common/ExceptionHandlingMiddleware.cs)).

| Case | HTTP |
| --- | --- |
| `ValidationFailedException` | 400 |
| `UnauthenticatedException` / invalid JWT | 401 |
| `ForbiddenException`, deactivated profile (gateway gate) | 403 |
| `NotFoundException` | 404 |
| `ConflictException` | 409 |
| `OperationCanceledException` | 408 |
| Unhandled | 500 |

Full route tables: [../API.md](../API.md).

---

## Authentication and authorization

1. **Identity** issues JWT (`Jwt:Issuer`, `Jwt:Audience`, shared **`Jwt:SigningKey`**, default lifetime **480** minutes).
2. Claims include role, `profile_id`, optional developer/mentor ids, `must_change_password`.
3. Each service validates the token; **`ICurrentUser`** / **`AccessScope`** restrict data (admin unrestricted; mentor assigned developers; developer self only).
4. ASP.NET policies **`AppPolicies.Admin`** and **`AppPolicies.Privileged`** guard selected endpoints.
5. **Gateway** — after JWT validation, **`ProfileActiveGateMiddleware`** reads **`identity.Profiles.Status`** (cached **`ProfileActiveGate:StatusCacheSeconds`**, default **60**) and returns **403** for **inactive** profiles.

---

## Tests

| Project | Contents |
| --- | --- |
| [`tests/Backend.UnitTests`](tests/Backend.UnitTests) | Unit tests for domain rules, validators, synchronizers, etc. |
| [`tests/Backend.IntegrationTests`](tests/Backend.IntegrationTests) | HTTP workflow tests against real service hosts and SQL Server |

`dotnet test TeamProgressTracker.slnx` discovers and runs both. Integration tests require database and JWT configuration (see test infrastructure under `tests/Backend.IntegrationTests/Infrastructure/`). There is **no** frontend test project in this repository.

---

## Related documentation

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — bounded contexts, gateway, trigger porting
- [../DATABASE.md](../DATABASE.md) — table reference
- [../DEVELOPMENT.md](../DEVELOPMENT.md) — configuration order, troubleshooting
- [../frontend/README.md](../frontend/README.md) — how the SPA calls the gateway
