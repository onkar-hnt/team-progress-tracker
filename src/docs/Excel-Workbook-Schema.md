# Excel Workbook Schema

The workbook is the source of truth for the MVP. This document is the contract
between the file and the application: the frontend reads **named Excel tables**,
never cell ranges or row numbers.

## File

| Item | Value |
|---|---|
| File name | `Team-Progress-Tracker.xlsx` |
| Location | OneDrive for Business (`hareandturtle-my.sharepoint.com`, mentor's personal drive) |
| Sharing URL | Supplied via `VITE_SHAREPOINT_WORKBOOK_URL` in `.env.local`, never committed |

## Non-negotiable rules

These exist because the application depends on them; breaking one breaks
existing data.

1. **No date-wise worksheets.** One `DailyWork` table holds every entry for
   every day. All daily, weekly and monthly views are calculated from it.
2. **Table names never change.** `tblDevelopers`, `tblMentors`,
   `tblMentorMapping`, `tblProjects`, `tblTasks`, `tblComments`,
   `tblDailyWork`.
3. **Column headers never change.** Spelling and casing are part of the contract.
4. **Ids are the only keys.** Never join on a developer or project name.
5. **Row order is meaningless.** Rows may be sorted or inserted freely.
6. Each column must be a real Excel **Table** (Insert → Table), not just a
   range, and the table must be given the exact name above via the Name Box or
   Table Design → Table Name.

New columns may be appended safely; the application ignores columns it does
not know about.

**No business data is hardcoded in the application.** Employees, mentors,
projects, mappings, tasks, task descriptions, statuses, comments and progress
all live in this file and are read from it at runtime. The fixtures in
`src/data` exist only for development against the mock provider.

## Sheet 1 — Employees (`tblDevelopers`)

Also the list of who may sign in. The table name is kept for compatibility with
existing files.

| Column | Type | Required | Notes |
|---|---|---|---|
| `DeveloperId` | Text | Yes | Stable key, e.g. `DEV001`. Must be unique. |
| `DeveloperName` | Text | Yes | Display only. |
| `Role` | Text | No | Job title. Blank is fine. |
| `Location` | Text | No | Blank is fine. |
| `Active` | Text | Yes | `Yes` or `No`. Blank is read as `Yes`. |
| `Email` | Text | No | Work email. A row without one cannot sign in. |
| `AccessRole` | Text | No | `Admin`, `Mentor` or `Developer`. Blank means `Developer`. |

`Email` and `AccessRole` were appended later; a workbook without those columns
still reads correctly, with every row treated as a developer who cannot sign in.

Adding a row here is what grants somebody access, and `AccessRole` is what
determines their permissions. There is no separate user list.

## Sheet 2 — Mentors (`tblMentors`)

| Column | Type | Required | Notes |
|---|---|---|---|
| `MentorId` | Text | Yes | Stable key, e.g. `MEN001`. Must be unique. |
| `MentorName` | Text | Yes | |
| `Email` | Text | Yes | The address they sign in with. |
| `Active` | Text | Yes | `Yes` or `No`. |

Somebody who both mentors and logs work needs a row in **both** tables, matched
by email.

## Sheet 3 — MentorMapping (`tblMentorMapping`)

One row per mentor–developer pair. This table defines what each mentor can see,
so it is the most access-sensitive part of the workbook.

| Column | Type | Required | Notes |
|---|---|---|---|
| `MentorId` | Text | Yes | Must exist in `tblMentors`. |
| `DeveloperId` | Text | Yes | Must exist in `tblDevelopers`. |

A developer may appear under more than one mentor. A developer with no row here
is visible only to administrators.

## Sheet 4 — Projects (`tblProjects`)

| Column | Type | Required | Notes |
|---|---|---|---|
| `ProjectId` | Text | Yes | Stable key, e.g. `PRJ001`. Must be unique. |
| `ProjectName` | Text | Yes | |
| `Client` | Text | No | |
| `Active` | Text | Yes | `Yes` or `No`. |
| `Description` | Text | No | |
| `Status` | Text | No | `Planned`, `Active`, `On Hold`, `Completed`. Blank means `Active`. |
| `StartDate` | Date | No | Excel date or `yyyy-MM-dd`. |
| `EndDate` | Date | No | Must not precede `StartDate`. |
| `MentorId` | Text | No | Must exist in `tblMentors`. |
| `AssignedDevelopers` | Text | No | Semicolon-separated ids, e.g. `DEV001; DEV002`. |

`AssignedDevelopers` is written with `; ` and read tolerantly: commas and stray
spaces are accepted, so a hand-edited cell still works.

## Sheet 5 — Tasks (`tblTasks`)

Assigned work, distinct from daily updates. A task is the plan; a `DailyWork`
row is the record of what happened.

| Column | Type | Required | Notes |
|---|---|---|---|
| `TaskId` | Text | Yes | Unique, e.g. `TSK001`. |
| `TaskName` | Text | Yes | |
| `TaskDescription` | Text | No | |
| `ProjectId` | Text | Yes | Must exist in `tblProjects`. |
| `DeveloperId` | Text | Yes | Must exist in `tblDevelopers`. |
| `MentorId` | Text | No | Must exist in `tblMentors`. |
| `Priority` | Text | Yes | `Low`, `Medium`, `High`, `Critical`. |
| `Status` | Text | Yes | `Not Started`, `In Progress`, `Completed`, `Blocked`. |
| `CreatedDate` | Date | Yes | |
| `DueDate` | Date | No | Must not precede `CreatedDate`. |
| `UpdatedAt` | Text | No | ISO timestamp, maintained by the application. |

## Sheet 6 — Comments (`tblComments`)

Mentor feedback, read as a timeline per developer.

| Column | Type | Required | Notes |
|---|---|---|---|
| `CommentId` | Text | Yes | Unique, e.g. `CMT001`. |
| `DeveloperId` | Text | Yes | Who the feedback is about. |
| `MentorId` | Text | Yes | Who wrote it. |
| `ProjectId` | Text | No | Blank means general feedback. |
| `CommentDate` | Date | Yes | |
| `Comment` | Text | Yes | |
| `ProgressUpdate` | Text | No | |
| `Blockers` | Text | No | |
| `Recommendations` | Text | No | |
| `CreatedAt` | Text | No | ISO timestamp. |
| `UpdatedAt` | Text | No | ISO timestamp. |

## Sheet 7 — DailyWork (`tblDailyWork`)

| Column | Type | Required | Notes |
|---|---|---|---|
| `EntryId` | Text | Yes | Unique. Generated by the app as `ENT-<uuid>`. |
| `Date` | Date | Yes | Real Excel date, or `yyyy-MM-dd` text. |
| `DeveloperId` | Text | Yes | Must exist in `tblDevelopers`. |
| `ProjectId` | Text | Yes | Must exist in `tblProjects`. |
| `TaskTitle` | Text | Yes | Free text typed by the developer. |
| `TaskDescription` | Text | No | |
| `Status` | Text | Yes | `Not Started`, `In Progress`, `Completed`, `Blocked`. |
| `Priority` | Text | Yes | `Low`, `Medium`, `High`, `Critical`. |
| `Progress` | Number | Yes | `0`–`100`. See the formatting warning below. |
| `HoursSpent` | Number | No | Non-negative. Half-hour steps in the UI. |
| `IsBlocked` | Text | Yes | `Yes` or `No`. Blank is read as `No`. |
| `BlockerDescription` | Text | Conditional | Required when `IsBlocked` is `Yes`. |
| `Remarks` | Text | No | |
| `CreatedAt` | Text | No | ISO timestamp. Falls back to `Date` if blank. |
| `UpdatedAt` | Text | No | ISO timestamp. Falls back to `CreatedAt` if blank. |

One developer may have **several rows for the same date**. `Date` is not unique
and is never used as a key.

### Format `Progress` as a plain number, not a percentage

If the column is formatted as Percentage, Excel stores 85% as the value `0.85`.
That is indistinguishable from a genuine fractional value, so the application
cannot safely correct it and will reject the row. Use a plain number column
containing `85`.

### Reading is tolerant, writing is strict

Reads accept the variations a hand-edited file accumulates: `Yes`/`Y`/`TRUE`/`1`
for booleans, date serials or ISO text for dates, and any casing for status and
priority. Writes always emit the canonical values in the tables above, so the
file stays consistent and filterable by hand.

Rows that cannot be mapped are skipped rather than failing the whole load, so a
single mistyped cell cannot blank out the dashboard. Malformed rows are reported
so they can be corrected.

## Referential integrity

Excel cannot enforce relationships, so the application does. A record cannot be
deleted while something still refers to it: removing an employee with tasks, work
entries or feedback is refused with a message naming what is in the way. Delete
or reassign the dependants first, or mark the record inactive instead — which
keeps its history and is usually what is actually wanted.

## Optional sheet — Configuration

Not read by the application yet. Reserved for `WorkWeek`, `DefaultDateRange` and
similar values once they need to be editable without a deployment.

## Access and permissions

Who may read which rows is decided from `AccessRole` in the Employees table and
from the MentorMapping table. See [Access-Control.md](./Access-Control.md),
which also explains the limits of enforcing this in the browser.

## How the application consumes this

```text
React component
      |
      v
Query hook            src/hooks/use-work-tracker.ts      <- access scope applied
      |
      v
WorkTrackerService    src/services/work-tracker.service.ts
      |
      v
DataProvider          src/services/data-provider/data-provider.interface.ts
      |                         |
      v                         v
MockDataProvider        ExcelDataProvider
(src/data/*.json)             |
                              v
                      GraphWorkbookGateway
                              |
                              v
                      Microsoft Graph workbook API
```

The fixtures in `src/data` deliberately use these exact column names and cell
values, and are mapped by the same code as the real workbook. Development
therefore exercises the mapping and validation layer continuously, and the
switch to the live file is a configuration change rather than a rewrite.
