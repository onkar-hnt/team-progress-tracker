# Frontend

React 19, TypeScript, Vite, and SCSS. Routing uses **React Router** (hash URLs). Server state uses
**TanStack Query**. Forms use **react-hook-form** with **zod** validation. Charts use ApexCharts where
reports and dashboards need them.

All API traffic goes to the gateway at **`VITE_API_BASE_URL`**. That is the only backend the
frontend knows about, and every call reaches it through the client in `src/services/api`.

---

## Folder structure (`frontend/src`)

| Path | Role |
| --- | --- |
| **`app/`** | Shell: `App.tsx`, `ErrorBoundary`, providers, hash router and route guards |
| **`components/`** | Shared layout (header, app layout) and UI primitives |
| **`features/`** | Route-aligned screens: `auth`, `dashboard`, `daily-update`, `tasks`, `developers`, `feedback`, `reports`, `team-activity`, `admin`, `notifications`, `profile`, `history`, `recycle-bin` |
| **`hooks/`** | React Query hooks and cross-cutting hooks (`use-access-scope`, `use-work-tracker`, …) |
| **`models/`** | TypeScript types for users, roster, work |
| **`services/`** | Auth, HTTP client, domain services, provisioning; **`data-provider/`** is the data access seam |
| **`config/`** | `app.config.ts` (env), **`config/api/`** — endpoints catalogue and HTTP policy |
| **`constants/`** | Shared constants |
| **`styles/`** | Global SCSS |
| **`utils/`** | Small helpers |
| **`docs/`** | Access control and project notes |

Path aliases (see `tsconfig.app.json`) include `@app`, `@components`, `@features`, `@hooks`,
`@models`, `@services`, `@config`, `@styles`.

---

## npm scripts

Run all commands from **`frontend/`**:

| Script | Command |
| --- | --- |
| Install | `npm install` |
| Dev server | `npm run dev` |
| Production build | `npm run build` (runs `tsc -b` then Vite) |
| Preview build | `npm run preview` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Bundle analysis | `npm run analyze` |

There is **no** `npm test` script.

---

## Environment

Copy [`.env.example`](.env.example) to **`.env.local`** (untracked). All **`VITE_*`** values are
embedded in the bundle and are public.

| Variable | Role |
| --- | --- |
| **`VITE_API_BASE_URL`** | Gateway origin (default `http://localhost:5100`) |
| **`VITE_AUTH_MODE`** | `api`, `entra`, or `local`; blank = auto (API, then Entra if configured) |
| **`VITE_ENTRA_CLIENT_ID`**, **`VITE_ENTRA_TENANT_ID`** | Microsoft SSO |
| **`VITE_ADMIN_*`** | Offline `local` mode bootstrap admin only |

Resolved values live in [`src/config/app.config.ts`](src/config/app.config.ts).

---

## Routing and route guards

The app uses **`HashRouter`** ([`src/app/router/app-router.tsx`](src/app/router/app-router.tsx)) so
static hosting (GitHub Pages) does not need server rewrite rules. Public routes: `/login`,
`/set-password`. Authenticated routes sit under guards in
[`src/app/router/route-guards.tsx`](src/app/router/route-guards.tsx):

- **`RequireAuth`** — redirect to login; show loader while session restores
- **`RequirePasswordChange`** — force `/set-password` when `mustChangePassword`
- **`RequireScope`** — wait for client **`AccessScope`** (mentor assignments loaded)
- **`RequireTeamAccess`**, **`RequireFeedbackAccess`**, **`RequireTeamManagement`**, **`RequireAdmin`** — role-based areas

Examples: team activity, developers list, and reports need mentor or admin; feedback needs a mentor
or developer link; admin CRUD for roster/tasks needs privileged role; accounts and usage need admin.

---

## Authentication and session

Auth providers live under [`src/services/auth/`](src/services/auth/). Normal development uses
**`ApiAuthProvider`** ([`src/services/auth/api-auth-provider.ts`](src/services/auth/api-auth-provider.ts)):

1. **Sign-in** — `POST` to `apiEndpoints.auth.login`; store JWT via [`token-store.ts`](src/services/api/token-store.ts)
2. **Session restore** — if a non-expired token exists, `GET api/auth/me`
3. **Sign-out** — clear token and React Query cache

There is **no refresh token**. An expired access token is discarded locally; the next API **401**
clears the token and triggers **`onApiUnauthorized`** (session-expired snackbar and sign-out flow).

**`AuthSessionProvider`** ([`src/app/providers/AuthSessionProvider.tsx`](src/app/providers/AuthSessionProvider.tsx))
holds the signed-in user in React context. Optional Entra and offline `local` modes are selected by
`VITE_AUTH_MODE` / `createAuthProvider` in [`src/services/auth/index.ts`](src/services/auth/index.ts).

---

## Role-based flows and state

- **Server state** — TanStack Query in feature hooks (`use-work-tracker`, `use-accounts`, …).
  Default query options: 30s stale time, no refetch on window focus ([`app-providers.tsx`](src/app/providers/app-providers.tsx)).
- **Auth user** — React context from `AuthSessionProvider`.
- **Access scope** — [`src/services/auth/access-scope.ts`](src/services/auth/access-scope.ts) and
  **`useAccessScope`** mirror backend visibility for UX; hooks disable queries until scope exists.
- **Write permissions** — [`src/services/auth/permissions.ts`](src/services/auth/permissions.ts) for
  buttons and forms; server remains authoritative ([`frontend/src/docs/Access-Control.md`](src/docs/Access-Control.md)).

---

## Data access seam

[`src/services/data-provider`](src/services/data-provider/index.ts) defines the **`DataProvider`**
interface. The running app uses **`HttpDataProvider`** under
[`src/services/data-provider/http/`](src/services/data-provider/http/), which calls domain services
that in turn use the shared HTTP client. Feature code should not call `fetch` directly for API data.

---

## Centralised API infrastructure

### Endpoint catalogue

[`src/config/api/endpoints.ts`](src/config/api/endpoints.ts) exports **`apiEndpoints`**: every path
grouped by domain (auth, accounts, developers, tasks, …). Dynamic segments use a helper that
**URL-escapes** ids. Feature services import paths from here — **no API path literals elsewhere in
`src/`**.

### HTTP policy

[`src/config/api/http.config.ts`](src/config/api/http.config.ts) exports **`httpConfig`**:

- **Timeout** — 20s per attempt (`AbortController`)
- **Retry** — max **3** attempts; backoff **400ms** then **1600ms** before attempts 2 and 3
- **Retryable HTTP statuses** — 408, 429, 502, 503, 504

Retrying belongs to the client alone: TanStack Query is configured with **`retry: false`** in
[`src/app/providers/app-providers.tsx`](src/app/providers/app-providers.tsx), because its own three
attempts on top of these would turn one failed screen into nine requests.

### HTTP client

[`src/services/api/api-client.ts`](src/services/api/api-client.ts) is the **only** HTTP client:

- Base URL from config; **Bearer** token attached centrally (except `anonymous: true` for login)
- Query serialisation — arrays **comma-separated**; empty arrays sent as empty values where filters mean “match nothing”
- Parses **`{ message, status, data }`** envelope; maps status to typed errors
- **Retry loop** in `apiEnvelope` — **`GET` retried by default**; mutations **not** retried unless `retry: true` (avoid duplicate POSTs)
- Failures handed to **`reportApiFailure`** when globally owned

Exported helpers: **`apiGet`**, **`apiPost`**, **`apiPut`**, **`apiPatch`**, **`apiDelete`**, **`apiSend`**, **`apiEnvelope`**, **`apiData`**, and the **`apiClient`** object grouping them.

### Error ownership

[`src/services/api/api-failure.ts`](src/services/api/api-failure.ts):

- **Global layer** announces: offline, unreachable gateway, timeout, retry exhaustion, 408/429, 5xx, malformed envelope
- **Feature layer** announces: 400, 403, 404, 409 (business refusals)
- **401** — session channel only (`onApiUnauthorized` → sign-out, not a duplicate snackbar)
- **`wasAnnouncedGlobally`** / **`toFeatureMessage`** ([`src/services/errors/error-message.ts`](src/services/errors/error-message.ts)) let features stay silent when a snackbar already ran

### Offline detection

[`src/services/api/network-status.ts`](src/services/api/network-status.ts) registers one pair of
window **`online`/`offline`** listeners, read through `isOnline()` and `onNetworkStatusChange()`.
When **`navigator.onLine === false`**, the client throws **`ApiOfflineError`** before `fetch` — no
requests are sent while offline.

### Global feedback UI

[`src/app/providers/GlobalApiFeedback.tsx`](src/app/providers/GlobalApiFeedback.tsx) (inside
**`SnackbarProvider`**) subscribes to global failures and network/session events: de-duplicates the
same message within **5 seconds**, suppresses per-request offline noise while offline, waits **1 second**
for flapping connectivity, and shows offline / restored / session-expired messages.

---

## Related documentation

- [../API.md](../API.md) — HTTP contract
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — backend boundaries
- [src/docs/Access-Control.md](src/docs/Access-Control.md) — roles and permissions
- [../backend/README.md](../backend/README.md) — running services and Swagger
