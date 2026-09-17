# Team Progress Tracker

A team's daily work in one place: what each developer did, what they are assigned, what is
blocking them, and what their mentor has said about it.

The **React 19** frontend in [`frontend/`](frontend/) talks to a **.NET 10** backend in
[`backend/`](backend/): five domain services (Identity, Team, Work, Notifications, Reporting)
behind a **YARP API gateway**, one **SQL Server** database, and schemas `identity`, `team`, `work`,
and `notify`. Access is enforced in the services (JWT and application rules), not in the browser
alone.

---

## Main features

- **Daily updates** — developers log progress, blockers, and hours; entries link to tasks and projects.
- **Tasks** — assignment, status, due dates, and effort synced from daily work.
- **Feedback** — mentors comment on developers' work; threaded conversation per task.
- **Team roster** — employees, mentors, projects, and mentor–developer assignments.
- **Reports** — team, developer, and project totals over a date range (privileged roles).
- **Notifications** — inbox and per-type mute preferences.
- **Change log and recycle bin** — audit trail and soft-delete restore within retention.
- **Administration** — provision logins from the roster, reset passwords, deactivate accounts, usage (admin).

---

## Roles

| Role | Purpose |
| --- | --- |
| **Administrator** | Full visibility: roster, work, logins, reports, usage. Seeded via Identity (`Seed:AdminEmail`). |
| **Mentor** | Developers assigned in `team.MentorAssignments`, their tasks, work, feedback, and team reports. |
| **Developer** | Own tasks, daily updates, feedback about them, and personal reports. |

Role comes from **`identity.Profiles.Role`** at sign-in (JWT). Roster employees and mentors have
**no logins** until an admin or mentor provisions them. UI rules are described in
[`frontend/src/docs/Access-Control.md`](frontend/src/docs/Access-Control.md).

---

## Architecture (high level)

```
React (frontend/)  →  API Gateway :5100  →  Identity | Team | Work | Notifications | Reporting
                                                      ↓
                                            SQL Server (TeamProgressTracker)
```

The browser calls **only the gateway**; individual service ports are for development and Swagger.
Detail: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Repository structure

```
.github/          CI: frontend typecheck, lint, build; GitHub Pages deploy (frontend only)
backend/          .NET solution, gateway, services, tests, scripts
frontend/         React + TypeScript (Vite), npm package and source
ARCHITECTURE.md   Bounded contexts, gateway, auth model
DATABASE.md       Schemas, tables, migrations
API.md            HTTP routes and envelope
DEVELOPMENT.md    Day-to-day setup, configuration, troubleshooting
```

Further reading: [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md).

---

## Prerequisites

- **.NET 10 SDK**
- **Node.js 22+** and npm
- **SQL Server Express** on instance **`SQLEXPRESS01`** (Windows authentication is the default in
  committed settings)
- **PowerShell** — backend scripts are written for **PowerShell 7** (`pwsh`); `dotnet` commands work
  in Windows PowerShell 5.1 as well

---

## First run (end to end)

### 1. Backend

Ensure SQL Server is running and the instance name matches the connection string. Copy
[`backend/appsettings.Local.example.json`](backend/appsettings.Local.example.json) to
**`appsettings.Local.json`** beside the gateway and each `*.Api` project (see
[DEVELOPMENT.md](DEVELOPMENT.md)). Set at least **`Jwt:SigningKey`** (32+ characters, **the same
value everywhere**) and **`Seed:AdminPassword`** for the bootstrap administrator.

From the repository root:

```powershell
cd backend
pwsh ./scripts/run-all.ps1
```

In **Development**, services apply their own migrations and seed data on startup (Identity → Team →
Work). Logs go to `backend/logs/`. Stop with `pwsh ./scripts/stop-all.ps1`.

### 2. Frontend

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Set **`VITE_API_BASE_URL`** to the gateway (default `http://localhost:5100`). The app sends a
**Bearer** token from the Identity service on every API call.

### 3. Sign in

| Account | Email (seed) | Password |
| --- | --- | --- |
| Administrator | `admin@handt.ai` | Value of **`Seed:AdminPassword`** in Identity `appsettings.Local.json` (not committed) |

[`backend/scripts/smoke-test.ps1`](backend/scripts/smoke-test.ps1) signs in with **`Admin@1234`** —
use that locally only if you set `Seed:AdminPassword` to match. Seeded roster (no passwords until
provisioned): six developers (`DEV001`–`DEV006`), two mentors (`MEN001`, `MEN002`), three projects
(`PRJ001`–`PRJ003`). See [backend/README.md](backend/README.md) and [DEVELOPMENT.md](DEVELOPMENT.md).

---

## URLs (development)

| What | URL |
| --- | --- |
| Frontend (Vite) | `http://localhost:5173` (or `5174` if 5173 is taken) |
| API gateway | `http://localhost:5100` |
| Gateway Swagger (aggregated) | `http://localhost:5100/swagger` |
| Per-service Swagger | `http://localhost:5101/swagger` … `http://localhost:5105/swagger` |

Health check on each host: `GET /health`.

---

## Swagger

Open **`http://localhost:5100/swagger`** for a combined UI that proxies each service's OpenAPI
document. You can also use each service directly on ports **5101–5105**. Sign in via Identity
**POST /api/auth/login**, then **Authorize** with **`data.accessToken`** only (Swagger adds
`Bearer`). See [API.md](API.md).

---

## Testing

| Area | Command | What it covers |
| --- | --- | --- |
| **Frontend** | `npm test` in `frontend/` | Vitest over the API client (envelope, error mapping, session, retries, offline, timeout), the token store, failure ownership, and access scope |
| **Backend** | `dotnet test` in `backend/` | `Backend.UnitTests` (domain and application rules) and `Backend.IntegrationTests` (each service over HTTP against SQL Server) |
| **Manual** | `pwsh ./scripts/smoke-test.ps1` after `run-all.ps1` | The gateway end to end, against the running stack |

The integration tests create and use **`TeamProgressTracker_IntegrationTests`**, never the
application's database — they refuse to start against `TeamProgressTracker`. Point them elsewhere
with `INTEGRATION_TEST_DATABASE` (another name on the same instance) or `INTEGRATION_TEST_CONNECTION`
(a whole connection string, which is what CI uses).

[`.github/workflows/checks.yml`](.github/workflows/checks.yml) runs all of it on every push and
pull request: frontend typecheck, lint, test and build; backend build and tests against a SQL
Server container; and a build of the service image.

---

## Deployment

**Frontend.** GitHub Actions [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
publishes it to GitHub Pages and requires **`VITE_API_BASE_URL`** (HTTPS or a same-origin path)
pointing at wherever your gateway runs.

**Backend.** [`backend/docker-compose.yml`](backend/docker-compose.yml) brings up SQL Server, the
five services and the gateway on the same ports as a local run, so the frontend needs no change:

```powershell
cd backend
copy .env.example .env   # fill in Jwt__SigningKey, Seed__AdminPassword, MSSQL_SA_PASSWORD
docker compose up --build
```

All six hosts share [`backend/Dockerfile`](backend/Dockerfile), which takes the project and
assembly as build arguments. The stack is runnable rather than production-ready: plain HTTP, `sa`
for the database, and migrations applied on startup. See
[DEVELOPMENT.md](DEVELOPMENT.md#running-in-containers) before putting it anywhere shared.
