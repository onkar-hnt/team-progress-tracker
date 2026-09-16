# Database

Single SQL Server database **`TeamProgressTracker`**, default connection:

`Server=localhost\SQLEXPRESS01;Database=TeamProgressTracker;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True`

Four application schemas: **`identity`**, **`team`**, **`work`**, **`notify`**. Reporting has no
tables; it queries across schemas.

Timestamps are **`datetimeoffset`**. Business dates use **`date`**. Identifiers are **`uniqueidentifier`**.

---

## Schema `identity`

### `identity.Profiles`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Email | nvarchar(320) | NO | unique `IX_Profiles_Email` |
| DisplayName | nvarchar(200) | NO | |
| Role | nvarchar(20) | NO | CHECK `admin`, `mentor`, `developer`; index `IX_Profiles_Role` |
| Status | nvarchar(20) | NO | CHECK `active`, `inactive` |
| MustChangePassword | bit | NO | |
| PasswordHash | nvarchar(200) | NO | |
| CreatedAt | datetimeoffset | NO | server-maintained |
| UpdatedAt | datetimeoffset | NO | server-maintained |

**Client must not write**: password hash, audit stamps (except via API semantics).

---

## Schema `team`

### `team.Mentors`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Code | nvarchar(20) | NO | unique `IX_Mentors_Code` — **MEN** + numeric suffix |
| ProfileId | uniqueidentifier | YES | unique when set `IX_Mentors_ProfileId` |
| Name | nvarchar(200) | NO | |
| Email | nvarchar(320) | NO | unique when not deleted `IX_Mentors_Email` |
| Active | bit | NO | |
| CreatedDate | date | YES | |
| DeletedAt | datetimeoffset | YES | soft delete; index `IX_Mentors_DeletedAt` |
| DeletedBy | uniqueidentifier | YES | |
| CreatedAt, UpdatedAt | datetimeoffset | NO | server-maintained |

### `team.Projects`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Code | nvarchar(20) | NO | unique — **PRJ** |
| Name | nvarchar(200) | NO | |
| Client | nvarchar(200) | YES | |
| Description | nvarchar(max) | YES | |
| Status | nvarchar(20) | NO | CHECK `planned`, `active`, `on-hold`, `completed`; `IX_Projects_Status` |
| Active | bit | NO | |
| StartDate, EndDate | date | YES | CHECK EndDate >= StartDate when both set |
| MentorId | uniqueidentifier | YES | FK → Mentors, ON DELETE SET NULL |
| DeletedAt, DeletedBy | | | soft delete; `IX_Projects_DeletedAt` |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

### `team.Developers`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Code | nvarchar(20) | NO | unique — **DEV** |
| ProfileId | uniqueidentifier | YES | unique when set |
| Name | nvarchar(200) | NO | |
| EmployeeId | nvarchar(50) | YES | unique when set and not deleted |
| Role | nvarchar(100) | YES | job title, not access role |
| Location | nvarchar(100) | YES | |
| Active | bit | NO | `IX_Developers_Active` |
| Email | nvarchar(320) | YES | unique when set and not deleted |
| AccessRole | nvarchar(20) | YES | CHECK admin/mentor/developer or NULL |
| PrimaryProjectId | uniqueidentifier | YES | FK → Projects SET NULL |
| CreatedDate | date | YES | |
| DeletedAt, DeletedBy | | | soft delete |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

### `team.MentorAssignments`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| MentorId | uniqueidentifier | NO | FK → Mentors CASCADE |
| DeveloperId | uniqueidentifier | NO | FK → Developers RESTRICT |
| AssignedDate | date | YES | |
| Active | bit | NO | |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

Unique active pair: `IX_MentorAssignments_MentorId_DeveloperId_Active` where `Active = 1`.

### `team.ProjectDevelopers`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| ProjectId | uniqueidentifier | NO | PK (composite) |
| DeveloperId | uniqueidentifier | NO | PK; FKs CASCADE/RESTRICT |
| CreatedAt | datetimeoffset | NO | |

---

## Schema `work`

### `work.Tasks`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Code | nvarchar(20) | NO | unique — **TSK**; server-assigned if omitted on create |
| Name | nvarchar(200) | NO | |
| Description | nvarchar(max) | YES | |
| ProjectId, DeveloperId | uniqueidentifier | NO | logical refs to team (no FK across schema) |
| MentorId | uniqueidentifier | YES | |
| Priority | nvarchar(20) | NO | CHECK low/medium/high/critical; default medium |
| Status | nvarchar(20) | NO | CHECK not-started/in-progress/completed/blocked |
| CreatedDate | date | NO | default UTC date |
| DueDate | date | YES | filtered index when set |
| EstimatedHours | decimal(6,2) | YES | CHECK >= 0 |
| **ActualHours** | decimal(7,2) | NO | **server-maintained** (effort sync) |
| **WorkedDays** | int | NO | **server-maintained** |
| DeletedAt, DeletedBy | | | soft delete |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

Indexes include `IX_Tasks_DeveloperId`, `IX_Tasks_DeveloperId_Status`, `IX_Tasks_ProjectId`.

### `work.DailyUpdates`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| DeveloperId, ProjectId | uniqueidentifier | NO | |
| TaskId | uniqueidentifier | YES | FK → Tasks SET NULL |
| EntryDate | date | NO | |
| TaskTitle | nvarchar(300) | NO | |
| Description, WorkDone, PlannedWork | nvarchar(max) | YES | |
| Status, Priority | nvarchar(20) | NO | same CHECK sets as tasks |
| Progress | int | NO | CHECK 0–100 |
| HoursSpent | decimal(5,2) | YES | CHECK >= 0 |
| EstimatedHours | decimal(6,2) | YES | |
| IsBlocked | bit | NO | filtered index when true |
| BlockerDescription, Remarks | nvarchar(max) | YES | |
| DeletedAt, DeletedBy | | | soft delete |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

**No business code column** on daily updates (only tasks and feedback carry TSK/CMT-style codes).

### `work.Feedback`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| Code | nvarchar(20) | NO | unique — **CMT** |
| DeveloperId | uniqueidentifier | NO | |
| MentorId, ProjectId, TaskId | uniqueidentifier | YES | TaskId FK SET NULL |
| FeedbackDate | date | NO | |
| Comment | nvarchar(max) | NO | |
| ProgressUpdate, Blockers, Recommendations | nvarchar(max) | YES | |
| AuthorProfileId | uniqueidentifier | YES | stamped server-side |
| AuthorRole | nvarchar(20) | NO | CHECK admin/mentor/developer |
| DeletedAt, DeletedBy | | | soft delete |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

### `work.RecordHistory`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| TableName | nvarchar(40) | NO | CHECK allowed table names |
| RecordId | uniqueidentifier | NO | |
| Action | nvarchar(20) | NO | CHECK create/update/delete/restore |
| Subject | nvarchar(120) | NO | |
| SubjectDeveloperId | uniqueidentifier | YES | scoped reads |
| ChangedBy | uniqueidentifier | YES | |
| ChangedByName | nvarchar(200) | NO | |
| ChangedAt | datetimeoffset | NO | index descending |
| Changes | nvarchar(max) | NO | JSON field diffs |

**Retention**: rows with `ChangedAt` older than **15 days** are deleted by
`RetentionBackgroundService`.

---

## Schema `notify`

### `notify.Notifications`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| Id | uniqueidentifier | NO | PK |
| RecipientProfileId | uniqueidentifier | NO | |
| Type | nvarchar(40) | NO | CHECK notification types |
| Title | nvarchar(200) | NO | |
| Message | nvarchar(1000) | NO | |
| EntityType | nvarchar(20) | YES | CHECK daily_update/feedback/task |
| EntityId | uniqueidentifier | YES | |
| IsRead | bit | NO | partial index unread |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

### `notify.UserPreferences`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| ProfileId | uniqueidentifier | NO | PK |
| MutedNotificationTypes | nvarchar(400) | NO | encoded list |
| CreatedAt, UpdatedAt | datetimeoffset | NO | |

---

## Business codes

Allocated by scanning max suffix in-table (retry on unique violation):

| Prefix | Entity | Example |
| --- | --- | --- |
| DEV | Developers | DEV001 |
| MEN | Mentors | MEN001 |
| PRJ | Projects | PRJ001 |
| TSK | Tasks | TSK001 |
| CMT | Feedback comments | CMT001 |

Below 1000, suffix is **three digits** (`D3`); at 1000+ unpadded numeric.

**Do not send** on create unless intentionally supplying a code; **`Code`** on PUT is not a normal
partial-update field (history ignores Code changes).

---

## Server-maintained columns

Clients and PUT bodies must not expect to control:

- **`WorkedDays`**, **`ActualHours`** on tasks (recomputed from daily updates;
  **`DomainRules.StandardWorkingHours`** = **8** when a day has no `HoursSpent`)
- **`Code`** on create (allocator) — treat as read-only in the UI
- **`CreatedAt`**, **`UpdatedAt`**, soft-delete **`DeletedAt`** / **`DeletedBy`** (via
  **`AuditInterceptor`** on delete)
- **`AuthorProfileId`**, **`AuthorRole`** on feedback ( **`FeedbackAuthorStamper`** )
- History rows (append-only via interceptor)

---

## Relationships (logical)

```
team.MentorAssignments  links Mentors ↔ Developers
team.ProjectDevelopers    links Projects ↔ Developers
work.Tasks                → team Project/Developer/Mentor ids (by Guid)
work.DailyUpdates         → work.Tasks (optional FK)
work.Feedback             → work.Tasks (optional FK)
identity.Profiles         ↔ team.ProfileId on roster rows when provisioned
notify.Notifications      → identity profile ids
```

Delete guards (409): roster deletes blocked while live work references exist; task delete blocked
while live entries or feedback exist.

---

## Migrations

EF Core migrations live per owning service:

| Service | Project (migrations) | Startup project |
| --- | --- | --- |
| Identity | `src/Services/Identity/Identity.Infrastructure` | `src/Services/Identity/Identity.Api` |
| Team | `src/Services/Team/Team.Infrastructure` | `src/Services/Team/Team.Api` |
| Work | `src/Services/Work/Work.Infrastructure` | `src/Services/Work/Work.Api` |
| Notifications | `src/Services/Notifications/Notifications.Infrastructure` | `src/Services/Notifications/Notifications.Api` |

Reporting has **no** migrations.

Run from **`backend/`** (install tool once: `dotnet tool install --global dotnet-ef` if needed):

```powershell
cd d:\Projects\team-progress-tracker\backend

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

Add a migration (example Team):

```powershell
dotnet ef migrations add YourMigrationName `
  --project src/Services/Team/Team.Infrastructure/Team.Infrastructure.csproj `
  --startup-project src/Services/Team/Team.Api/Team.Api.csproj
```

### `Database:MigrateOnStartup`

| Environment | Typical value | Behaviour |
| --- | --- | --- |
| `appsettings.json` | `false` | Production-safe default |
| `appsettings.Development.json` | `true` for Identity, Team, Work, Notifications | On startup, migrate then seed where implemented |

**Identity** seeds admin when `Seed:AdminEmail` and `Seed:AdminPassword` are set. **Team** seeds
roster when empty. **Work** seeds sample tasks/entries when empty and Team has developers.
**Reporting** does not migrate.

`run-all.ps1` sets `ASPNETCORE_ENVIRONMENT=Development`, so a first **`run-all`** applies
migrations and seeds without manual `dotnet ef database update`.
