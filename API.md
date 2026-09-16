# API

HTTP API for Team Progress Tracker. In development the **gateway** is the intended origin:
`http://localhost:5100`. Paths below are relative to that origin unless you are calling a service
directly on 5101–5105 (same routes).

---

## Response envelope

Every JSON response uses **`{ message, status, data }`**. The numeric **`status`** property always
matches the **HTTP status code**.

### Success example (200)

```json
{
  "message": "Operation completed successfully.",
  "status": 200,
  "data": { }
}
```

### Failure example (400 validation)

```json
{
  "message": "Some details need correcting before this can be saved.",
  "status": 400,
  "data": {
    "errors": [
      "Progress must be between 0 and 100."
    ]
  }
}
```

Failures never include stack traces or raw database messages (`ExceptionHandlingMiddleware`).

### Status code mapping (exceptions)

| Exception / case | HTTP | Typical message |
| --- | --- | --- |
| `ValidationFailedException` | 400 | Specific validation message |
| `UnauthenticatedException` | 401 | Sign-in required |
| Invalid/missing JWT (framework) | 401 | "Please sign in again." (`UseEnvelopeStatusCodes`) |
| `ForbiddenException`, `UnauthorizedAccessException` | 403 | Not allowed |
| Deactivated profile (gateway gate) | 403 | Login deactivated |
| `NotFoundException` | 404 | Resource wording |
| `ConflictException` | 409 | Duplicate / dependency |
| Unhandled | 500 | Generic retry message |
| `OperationCanceledException` | 408 | Request cancelled |

---

## Authentication

1. **`POST /api/auth/login`** (anonymous) with `{ "email", "password" }`.
2. Read **`data.accessToken`** and optional **`data.expiresAt`**.
3. Send on every other request:

```http
Authorization: Bearer <accessToken>
```

Token lifetime: **`Jwt:LifetimeMinutes`** (default **480**). Claims include role, `profile_id`,
optional developer/mentor ids, and must-change-password flag.

**Swagger**: open a service Swagger UI or `http://localhost:5100/swagger`, call login on Identity
(or paste a token from elsewhere), click **Authorize**, paste **`data.accessToken`** only (Swagger
adds `Bearer`).

Authenticated routes return **401** without a valid token. Role/policy failures return **403**.

---

## Partial updates (PUT)

PUT endpoints take **`UpdatePayload<T>`**: only JSON **keys present** in the body are applied.
Omitted keys leave the stored value unchanged.

For **nullable** fields, if the key **is present** with `null` (or blank where documented), the
field is **cleared** — see `Team.Application.RequestApply` and `WorkMapping.Apply*`.

**Exception**: **`name`** on roster PUT is applied only when non-blank.

**Lists**: `assignedDeveloperIds` and mentor assignment PUTs replace the **whole** list when that
key is sent.

---

## Identity service

Base (direct): `http://localhost:5101`. Swagger: `/swagger`.

### Authentication — `/api/auth`

| Method | Path | Auth | Body | Response `data` | Failures |
| --- | --- | --- | --- | --- | --- |
| POST | `/login` | Anonymous | `SignInRequest` | `SignInResponse` (token, user) | 401 wrong credentials; 403 inactive |
| GET | `/me` | Bearer | — | `AuthenticatedUserDto` | 401 |
| POST | `/change-password` | Bearer | `ChangePasswordRequest` | `SignInResponse` | 400 policy/validation |

### Accounts — `/api/accounts`

| Method | Path | Auth | Body | Response `data` | Failures |
| --- | --- | --- | --- | --- | --- |
| GET | `/` | Admin | — | `AccountDto[]` | 403 non-admin |
| POST | `/state` | Admin | `SetAccountStateRequest` | `SetAccountStateResponse` | 403/404 |
| POST | `/provision` | Privileged | `ProvisionLoginRequest` | `ProvisionLoginResponse` (201) | 404 roster; 409 already has login |
| POST | `/reset-password` | Privileged | `ResetUserPasswordRequest` | `ResetUserPasswordResponse` | 403 `AccountRules` |

`table` on provision/reset: **`developers`** or **`mentors`**. **`rowId`**: roster row Guid.

---

## Team service

Base: `http://localhost:5102`.

### Employees — `/api/developers`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Bearer | Scoped list; soft-deleted excluded |
| POST | `/` | Privileged | `SaveDeveloperRequest` → 201 `DeveloperDto` |
| PUT | `/{id}` | Privileged | Partial `SaveDeveloperRequest` |
| DELETE | `/{id}` | Privileged | Soft delete; 409 if work references |

### Mentors — `/api/mentors`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Bearer | Scoped |
| POST | `/` | Privileged | 201 `MentorDto` |
| PUT | `/{id}` | Privileged | Partial update |
| DELETE | `/{id}` | Privileged | 409 if live feedback |
| PUT | `/{mentorId}/assignments` | Bearer | Admin any mentor; mentor **own** list only — `SetMentorAssignmentsRequest` |

### Mentor assignments — `/api/mentor-assignments`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Bearer | Scoped read-only |

### Projects — `/api/projects`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Bearer | Includes `assignedDeveloperIds` |
| POST | `/` | Privileged | 201 |
| PUT | `/{id}` | Privileged | Partial; membership replace when key sent |
| DELETE | `/{id}` | Privileged | 409 if tasks/entries |

---

## Work service

Base: `http://localhost:5103`.

### Tasks — `/api/tasks`

| Method | Path | Auth | Query / body | Notes |
| --- | --- | --- | --- | --- |
| GET | `/` | Bearer | `developerIds`, `mentorIds`, `projectIds`, `statuses`, `priorities`, `dueOnOrBefore`, `limit` (comma-separated lists) | Scoped; foreign ids → empty set |
| GET | `/{id}` | Bearer | — | 404 if not visible |
| POST | `/` | Bearer | `SaveTaskRequest` | Admin/mentor for assignee; **developer → 403** |
| PUT | `/{id}` | Bearer | Partial `SaveTaskRequest` | Same write rule as POST |
| PATCH | `/{id}/status` | Bearer | `{ "status" }` | Admin, mentor for assignee, or assignee developer |
| DELETE | `/{id}` | Bearer | — | Soft delete; 409 dependencies |

### Daily updates — `/api/daily-updates`

| Method | Path | Auth | Query / body | Notes |
| --- | --- | --- | --- | --- |
| GET | `/` | Bearer | `dateFrom`, `dateTo`, `developerIds`, `projectIds`, `statuses`, `priorities`, `isBlocked`, `limit` | Newest first |
| GET | `/{id}` | Bearer | — | |
| POST | `/` | Bearer | `SaveDailyWorkEntryRequest` | Developer own only; creates/links task by title |
| PUT | `/{id}` | Bearer | Partial | |
| DELETE | `/{id}` | Bearer | — | Soft delete |

### Feedback — `/api/feedback`

| Method | Path | Auth | Query / body | Notes |
| --- | --- | --- | --- | --- |
| GET | `/` | Bearer | `developerIds`, `mentorIds`, `projectIds`, `taskIds`, `dateFrom`, `dateTo`, `limit` | Oldest first per task |
| POST | `/` | Bearer | `SaveCommentRequest` | Author from token; 201 |
| PUT | `/{id}` | Bearer | Partial | Author only |
| DELETE | `/{id}` | Bearer | — | Author only; soft delete |

### Change log — `/api/change-log`

| Method | Path | Auth | Query | Notes |
| --- | --- | --- | --- | --- |
| GET | `/` | Bearer | `limit` (default 100) | Scoped |
| GET | `/{kind}/{recordId}` | Bearer | — | `kind`: daily_updates, developers, feedback, mentors, projects, tasks |

### Recycle bin — `/api/recycle-bin`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Bearer | Scoped deleted rows |
| POST | `/{kind}/{id}/restore` | Bearer | `kind`: task, entry, feedback, employee, mentor, project — 409 if parent deleted |
| DELETE | `/{kind}/{id}` | Bearer | Permanent delete |

---

## Notifications service

Base: `http://localhost:5104`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/notifications` | Bearer | Optional `limit` (default 20, max 200) |
| GET | `/api/notifications/unread-count` | Bearer | integer |
| POST | `/api/notifications/{id}/read` | Bearer | Own inbox only — 404 other user |
| POST | `/api/notifications/read-all` | Bearer | |
| GET | `/api/notification-preferences` | Bearer | `NotificationPreferencesDto` |
| PUT | `/api/notification-preferences` | Bearer | Full muted list; 400 unknown types |

---

## Reporting service

Base: `http://localhost:5105`.

| Method | Path | Auth | Query | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/reports/team` | Privileged | `from`, `to`, `projectId` (`ScopedReportQuery`) | `TeamReportDto` |
| GET | `/api/reports/developers/{developerId}` | Bearer | same | `DeveloperTotalsDto`; 403 other people's ids |
| GET | `/api/reports/projects` | Privileged | `from`, `to` | `ProjectTotalsDto[]` |
| GET | `/api/usage` | Admin | — | `ResourceUsageDto` |

Date query params: **`yyyy-MM-dd`**. Range must be valid and ≤ **366** days. Backwards range → 400.

---

## Swagger URLs (development)

| Host | Swagger UI |
| --- | --- |
| Gateway (combined) | http://localhost:5100/swagger |
| Identity | http://localhost:5101/swagger |
| Team | http://localhost:5102/swagger |
| Work | http://localhost:5103/swagger |
| Notifications | http://localhost:5104/swagger |
| Reporting | http://localhost:5105/swagger |

Gateway OpenAPI JSON: `/swagger/identity/swagger.json`, … `/swagger/reporting/swagger.json`.

---

## DTO reference

Shared request/response types live in `backend/src/BuildingBlocks/Contracts/`:

- `IdentityDtos.cs`, `TeamDtos.cs`, `WorkDtos.cs`, `HistoryDtos.cs`, `NotificationDtos.cs`,
  `ReportDtos.cs`, `UsageDtos.cs`

Field names in JSON are **camelCase** on the wire.
