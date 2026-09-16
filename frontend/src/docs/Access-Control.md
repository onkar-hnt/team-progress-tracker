# Access Control

Who can see what, how it is enforced, and what this design does and does not protect against.

**The .NET services are the authority**: every API call is authenticated (except login), scoped
with **`AccessScope`**, and
checked again in application code. The browser rules exist so the UI does not offer actions that the
server would refuse — not as a security boundary.

---

## Roles

Roles come from **`identity.Profiles.Role`** at sign-in (JWT claim), set when a login is
**provisioned** from the roster. Changing access means updating the profile and/or roster links, not
redeploying the frontend.

| Role | Sees |
| --- | --- |
| Admin | Every record the APIs expose: roster, work, feedback, reports, logins, usage |
| Mentor | Developers **assigned** to them (`team.MentorAssignments`), and those people's projects, tasks, work and feedback |
| Developer | Only their own tasks, projects (membership / scope rules), work entries, feedback and personal reports |

A mentor's reach is defined by **`team.MentorAssignments`**. Adding an active assignment grants
access on the next API call; removing or deactivating it revokes access.

One deliberate exception: the **roster itself** (`GET /api/developers`, `/api/mentors`,
`/api/projects`) is readable by mentors in full, because mentors run the team management screens and
have to see people before assigning them. Work, feedback and reports remain limited to their
assigned people. In the browser the same split is `getRosterDevelopers` (full) against
`getDevelopers` (scoped).

Administrators are seeded in Identity (`Seed:AdminEmail`); they are not required to have a
`team.Developers` row.

---

## How it is enforced

### Server (authoritative)

1. **JWT** — Identity issues the token; all services validate the same issuer, audience and signing
   key. **`ICurrentUser`** reads role and roster link ids from claims.
2. **`AccessScope`** (`SharedKernel/AccessScope.cs`) — Built per request by:
   - **`TeamAccessScopeProvider`** (Team service)
   - **`WorkAccessScopeProvider`** (Work service; uses **`ITeamDirectory`** for assignments)
   - **`ReportAccessScopeFactory`** (Reporting)
3. **Queries** — List/get handlers call **`RestrictDeveloperIds`** / **`RequireDeveloperVisible`**
   so SQL and in-memory filters never return out-of-scope rows. Asking for someone else's id in a
   filter yields an **empty list** or **404**, not a distinguishable "forbidden" for existence.
4. **Policies** — `[Authorize(Policy = AppPolicies.Admin)]` or **`Privileged`** (admin or mentor)
   on selected controllers/actions.
5. **Account operations** — **`AccountRules`** (who may manage an account, and who may reset whose
   password) in **`Identity.Application.AccountService`**.
6. **Work rules** — Task write vs status change, feedback guards, daily update ownership, etc. in
   **`Work.Application`** (`TaskService`, `DailyWorkEntryService`, `CommentService`, rules under
   **`Work.Application/Rules/`**).
7. **Gateway** — **`ProfileActiveGateMiddleware`** blocks **inactive** profiles even if the JWT has
   not expired (cached status read).

### Client (UX and defence in depth)

Every read in the UI still passes through **`AccessScope`**, built in
`frontend/src/services/auth/access-scope.ts` from the signed-in user and mentor assignments fetched
from the API.

```text
AppUser + mentor assignments (API)
        |
        v
   AccessScope            frontend/src/services/auth/access-scope.ts
        |
        v
   useAccessScope()       frontend/src/hooks/use-access-scope.ts
        |
        v
   data hooks             frontend/src/hooks/use-work-tracker.ts
        |
        v
   API client             frontend/src/services/api/  (Bearer token; server re-scopes)
```

Three properties keep the client honest for normal use:

1. **Components never supply the scope.** Hooks resolve it internally.
2. **Queries stay disabled until scope exists**, so unscoped requests are not sent accidentally.
3. **Cache keys include scope identity**, so shared browser profiles do not cross-leak cached data.

The server **does not rely** on the client having filtered first.

### URLs

`/developers/:developerId` checks the id against scope before rendering. Route guards hide whole
areas (team activity, reports, administration) from roles that should not reach them.

---

## What this does not protect against

**Security boundary = API + database rules**, not the React bundle. Anyone with a valid token for
their role can call the gateway with the same tools as the app; **`AccessScope`** in C# decides what
comes back.

If the UI shows something the API allows but policy should forbid, that is a **product bug** in
permissions or handlers. If the UI shows something the API denies, that is a **client bug** only.

Deactivated accounts may keep working for up to **`ProfileActiveGate:StatusCacheSeconds`** (default
60) until the gateway cache refreshes.

---

## Writing — UI vs server

Reads are scoped on the server; writes are additionally gated in
`frontend/src/services/auth/permissions.ts` for display, and enforced in services.

| Action | Admin | Mentor | Developer | Server enforcement (examples) |
| --- | --- | --- | --- | --- |
| Log or edit a work entry | Anyone's | Own only (if they have a developer link) | Own only | `DailyWorkEntryService` + scope |
| Change a task's status | Yes | Assigned developers' tasks | Own tasks | `TaskService.CanChangeStatus` |
| Create or assign tasks (POST `/api/tasks`) | Yes | Assigned developers | No (403) | `TaskService.RequireTaskWriteAsync` |
| Write feedback about somebody | Yes | Assigned developers | No (general feedback) | `CommentService` + scope |
| Comment on a task | Yes | Visible tasks | Own tasks | `FeedbackTaskGuard`, scope |
| Edit or delete feedback | Yes | Own comments | Own comments | Author check in `CommentService` |
| Manage employees, mentors, projects | Yes | No | No | `AppPolicies.Privileged` + scope on assignments |
| List / deactivate logins | Yes | No | No | `AccountService` + `AccountRules` |
| Reset passwords | Yes | Assigned devs (rules) | No | `AccountRules.RequireCanResetPassword` |
| Team / project reports | Yes | Yes | No (team) | `[Authorize(Policy = Privileged)]` |
| Developer report | Anyone visible | Anyone visible | Self only | `ReportService` + scope |
| Usage screen | Yes | No | No | `[Authorize(Policy = Admin)]` on `/api/usage` |
| Notifications | Own inbox | Own inbox | Own inbox | Recipient filter in Notifications service |
| Recycle bin (roster rows) | Yes | Yes | No (UI); dev can restore **own** work deletes | `RecycleBinService` + `scope.IsPrivileged` for team rows |

Mentors **cannot** author daily updates for their developers — a daily update is first-hand record
(`canLogWorkFor` in `permissions.ts`; server rejects wrong `developerId`).

---

When extending the app, add the rule on the **service** first, then mirror it in **`permissions.ts`**
so screens stay consistent.
