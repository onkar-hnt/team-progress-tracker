# Architecture

Team Progress Tracker is split into a **browser application** and a **backend** that owns all data
and authorization. The backend is organised as **bounded contexts** (Identity, Team, Work,
Notifications, Reporting), each with **Clean Architecture** layers, sharing one SQL Server
database but **separate schemas**. A **gateway** gives the frontend a single origin and re-checks
that deactivated logins cannot keep using old tokens.

---

## Bounded contexts

| Context | Owns | Why it exists |
| --- | --- | --- |
| **Identity** | `identity.Profiles`, sign-in, passwords, account lifecycle | Credentials and roles for people who use the app |
| **Team** | `team.*` roster, projects, mentor assignments | Who exists, who reports to whom, project membership |
| **Work** | `work.*` tasks, daily updates, feedback, change history, soft deletes | Everything that happens on the job — kept together because the old Postgres model tied them with triggers and RLS |
| **Notifications** | `notify.*` inbox and preferences | Delivery rules (no self-notify, respect mutes) stay out of Work writes |
| **Reporting** | No schema; read-only SQL across `team` and `work` | Aggregates without duplicating write paths or loading full datasets into the browser |

**Work is one service, not five**, because tasks, daily updates, feedback, the change log and the
recycle bin were one transactional graph in Postgres: creating an update could create a task,
recompute effort, sync status both ways, enqueue notifications and append history. Splitting that
across HTTP calls would reintroduce distributed consistency problems the monolithic database layer
had already solved.

---

## Clean Architecture per service

Each service follows the same dependency rule:

```
Api  →  Application  →  Domain
         ↑
Infrastructure (EF Core, SQL readers, publishers)
```

- **Domain**: entities and invariants with no infrastructure references.
- **Application**: use cases, validators, rules ported from triggers, orchestration.
- **Infrastructure**: `DbContext`, migrations, cross-schema gateways (`SqlRosterGateway`,
  `SqlTeamDirectory`, `SqlWorkEntryReader`, `SqlProfileStatusReader`).
- **Api**: controllers, DI composition, `Program.cs`.

**BuildingBlocks** (`backend/src/BuildingBlocks/`) holds shared **Contracts** (DTOs and
`ApiResponse`), **Common** (JWT, CORS, Swagger, exception envelope), **Persistence**
(interceptors), and **SharedKernel** (`AccessScope`, `DomainRules`, `Db` schema names).

---

## One database, explicit boundaries

All services use **`TeamProgressTracker`** with schemas:

- `identity`, `team`, `work`, `notify`

A service **writes only its schema** (Reporting writes nothing). Cross-context facts are read
through narrow interfaces:

| Reader | Used by | Reads |
| --- | --- | --- |
| `SqlRosterGateway` | Identity | `team.Developers`, `team.Mentors` for provisioning |
| `SqlTeamDirectory` | Work, Reporting | Roster names, assignments, existence checks |
| `SqlWorkEntryReader` | Reporting | Work entries for totals |
| `SqlProfileStatusReader` | ApiGateway | `identity.Profiles.Status` for the active-account gate |

That keeps coupling visible: there is no shared EF model spanning services.

---

## Gateway

**YARP** (`backend/src/ApiGateway`) listens on **5100** and routes `/api/*` to the service
clusters defined in `appsettings.json`. It also proxies each service's OpenAPI document to
`/swagger/{identity|team|work|notifications|reporting}/swagger.json` so **Try it out** from
`http://localhost:5100/swagger` hits the same paths the React app uses.

The gateway validates JWTs (same issuer, audience and signing key as the services) and runs
**`ProfileActiveGateMiddleware`**: for authenticated requests it reads `identity.Profiles.Status`
(with an in-memory cache, default **60 seconds** from `ProfileActiveGate:StatusCacheSeconds`) and
returns **403** if the profile is `inactive`. Tokens remain valid until expiry; deactivation is
enforced here so Team/Work do not each re-query Identity on every request.

---

## Authentication and authorization (post-RLS)

Postgres **row-level security is gone**. The server is authoritative.

1. **Sign-in** (`Identity`): email/password → JWT (`JwtTokenIssuer`) carrying `profile_id`, `role`,
   optional `developer_id` / `mentor_id`, and `must_change_password`. Role comes from
   **`identity.Profiles`**, not from client-supplied metadata.
2. **`ICurrentUser`** (`CurrentUserAccessor`): per-request identity from the validated token.
3. **`AccessScope`** (`SharedKernel/AccessScope.cs`): what rows the caller may see — admin has
   `VisibleDeveloperIds == null` (unrestricted); mentor gets assigned developer ids;
   developer gets only themselves. Built by **`TeamAccessScopeProvider`** or
   **`WorkAccessScopeProvider`** (and **`ReportAccessScopeFactory`** in Reporting).
4. **ASP.NET policies**: `AppPolicies.Admin`, `AppPolicies.Privileged` (admin or mentor) on
   selected endpoints.
5. **Application rules**: fine-grained checks (e.g. `TaskService.RequireTaskWriteAsync`,
   `AccountRules.RequireCanResetPassword`, comment author checks).

The frontend mirrors scope in `frontend/src/services/auth/access-scope.ts` and
`permissions.ts` for UX only; a crafted request is still filtered server-side.

The SPA calls only the gateway. Paths live in **`frontend/src/config/api/endpoints.ts`**; one client
(**`frontend/src/services/api/api-client.ts`**) handles the bearer token, envelope parsing, timeouts,
GET retries, offline short-circuit, and global failure reporting (see [frontend/README.md](frontend/README.md)).

```
Browser                    Gateway                 Service
   |  Bearer JWT  -->  validate JWT  -->  validate JWT
   |                      |                AccessScope + handlers
   |                      profile active gate (cached)
   v                      v                v
              { message, status, data } envelope
```

---

## Postgres triggers → C# (Work and related)

| Postgres (conceptual) | C# replacement |
| --- | --- |
| `ensure_daily_update_task` (R1) | `DailyUpdateTaskEnsurer` |
| `apply_daily_update_task_link` (R2) | `DailyUpdateTaskLinkApplier` |
| `sync_task_from_daily_update` (R3) | `EntryStatusToTaskSynchronizer` |
| `sync_daily_update_from_task` (R4) | `TaskStatusToEntriesSynchronizer` |
| `sync_task_effort` / `task_reported_hours` (R5) | `TaskEffortSynchronizer` |
| `stamp_feedback_author` (R6) | `FeedbackAuthorStamper` |
| `guard_feedback_task` (R7) | `FeedbackTaskGuard` |
| `enqueue_notification` + triggers (R8) | `WorkNotificationComposer` + `INotificationPublisher` / Notifications service |
| `record_change` | `ChangeHistoryInterceptor` |
| BEFORE audit / soft delete triggers | `AuditInterceptor` |
| `prune_record_history` / `purge_expired_deletions` (R12) | `RetentionBackgroundService` |
| `may_reset_password` / `may_manage_account` | `AccountRules` in Identity.Domain |
| RLS visibility policies | `AccessScope` + query filtering in Team/Work stores |

**`WorkSyncContext`** breaks sync cycles the way Postgres used `pg_trigger_depth()`.

---

## Notifications

Work composes **`NotificationRequest`** lists (`WorkNotificationComposer`) and publishes through
**`INotificationPublisher`**. The Notifications service applies rules (skip actor, honour
**`UserPreferences.MutedNotificationTypes`**) before insert. Types and entity types match
**`DomainRules.NotificationTypes`** and **`NotificationEntityTypes`**.

Default inbox page size: **20** (max **200**) when `limit` is omitted.

---

## Change history and retention

**`ChangeHistoryInterceptor`** writes **`work.RecordHistory`** on create/update/delete/restore,
skipping audit stamps, business codes, soft-delete columns, and derived **`WorkedDays`** /
**`ActualHours`**.

**`RetentionBackgroundService`** (Work, every **`Retention:IntervalHours`**, default **6**):

- Deletes history rows older than **`DomainRules.RetentionDays`** (**15**).
- Hard-deletes soft-deleted work rows past the same cutoff (batched).
- Purges soft-deleted **`team`** rows via cross-schema SQL (same 15-day window).

---

## ASCII overview

```
                    +------------------+
                    |  React (frontend/)|
                    |  gateway :5100   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   ApiGateway     |
                    | JWT + active gate|
                    +--------+---------+
         +----------+--------+----------+----------+
         |          |        |          |          |
    Identity    Team     Work    Notifications Reporting
     :5101      :5102    :5103      :5104       :5105
         |          |        |          |          |
         +----------+--------+----------+----------+
                             |
                    SQL Server TeamProgressTracker
                    schemas: identity | team | work | notify
```
