# Access Control

Who can see what, how it is enforced, and — importantly — what this design does
and does not protect against.

## Roles

Roles come from the `AccessRole` column of the Employees table, or from the
presence of a row in the Mentors table. They are not configured in code, and
changing somebody's access means editing a record, not a deployment.

| Role | Sees |
|---|---|
| Admin | Every record: employees, mentors, projects, tasks, work, feedback, reports |
| Mentor | Developers assigned to them, and only on the projects that mentor is responsible for: tasks, work, feedback, reports and statistics |
| Developer | Only their own tasks, projects, work entries, feedback and metrics, and the mentors assigned to them |

A mentor's reach over a person is defined by the mentor assignments. A mentor's reach over that person's work is the projects they are responsible for (`project_mentors`, with `projects.mentor_id` kept as the primary mentor). Adding an assignment grants access to that developer; responsibility for a project decides which of that developer's tasks, updates, feedback and reports the mentor receives. Two mentors of the same developer on different projects do not see each other's project. Two mentors responsible for the same project both see that project's work. Removing an assignment or a project mentor revokes access on the next page load.

The same rule is applied in Postgres. `can_view_developer_on_project` is what tasks, daily updates, project-scoped feedback, task status changes and the change history consult. Notifications about a daily update or a blocker are sent only to mentors who cover that update's project. A developer still reads all of their own work, and an administrator still reads everything.

## How it is enforced

Every read passes through an `AccessScope`, built once per session in
`src/services/auth/access-scope.ts` from the signed-in user and the mentor
mapping. The scope carries the set of employee ids the person may see — or
`null`, meaning unrestricted, for an admin — and, for a mentor, the projects
they are responsible for. A row of work is shown only when both match.

```text
AppUser + MentorMapping
        |
        v
   AccessScope            src/services/auth/access-scope.ts
        |
        v
   useAccessScope()       src/hooks/use-access-scope.ts
        |
        v
   data hooks             src/hooks/use-work-tracker.ts   <- scope applied here
        |
        v
   WorkTrackerService     narrows every query, then filters the result again
```

Three properties make this reliable rather than merely present:

1. **Components never supply the scope.** Each hook resolves it internally, so
   a screen cannot issue an unscoped query, and a newly added screen inherits
   the restriction without its author doing anything.
2. **Queries cannot run before the scope exists.** Hooks stay disabled while
   the scope is resolving, so there is no window in which an unrestricted
   request could be sent.
3. **Filtering happens twice.** The scope is applied as a query predicate, so a
   capable backend can filter server-side, and again in memory afterwards, so
   the guarantee does not depend on the backend having honoured it.

Cache keys include the scope's identity, so two people using the same browser
profile cannot read each other's cached results.

### URLs

`/developers/:developerId` takes an id straight from the address bar. The page
checks it against the scope before rendering anything, and refuses with the
same wording whether or not the person exists — so a refusal does not confirm
who is on the team. Route guards additionally keep whole areas (team activity,
reports, administration) out of reach of roles that should not have them.

## What this does not protect against

**What is written here is enforced twice, and only one of the two is a
boundary.** The scope in the browser decides what the application draws, which
is what stops another person's data appearing through a hand-edited URL, a stale
filter or the query cache. Row-level security in Postgres decides what may
actually be read or written, and that is the boundary: the publishable key in
the bundle identifies the project rather than the caller, so a request made by
hand from developer tools is subject to exactly the same policies.

So the client-side rules are a correctness and privacy control for ordinary use,
and the policies in `supabase/migrations/20260910181600_rls_policies.sql` are the
security. When the two disagree it is a bug in the client, and the symptom is a
screen that offers something the database then refuses.

Two things still sit outside that:

- The privileged operations — provisioning a login, resetting somebody's
  password, disabling an account — hold the service-role key and so run as Edge
  Functions, each asking the database whether the caller may before acting.
- A role read from a JWT claim would be writable by the account holder, so the
  role is always read from `public.profiles`.

## Writing

Reads are scoped; writes are additionally checked by role in
`src/services/auth/permissions.ts`.

| Action | Admin | Mentor | Developer |
|---|---|---|---|
| Log or edit a work entry | Anyone's | Own only | Own only |
| Change a task's status | Yes | For assigned developers, on a project they are responsible for | Own tasks only |
| Create or assign tasks | Yes | For assigned developers, on a project they are responsible for | No |
| Write feedback about somebody | Yes | For assigned developers, on a project they are responsible for | No |
| Comment on a task | Yes | Tasks of an assigned developer on a project they are responsible for | Own tasks only |
| Edit or delete feedback | Yes | Own comments only | No |
| Manage employees, mentors, projects, mappings | Yes | No | No |

A mentor's reach over a task is decided by the assignment and the project, not by who created
the task: any task belonging to an assigned developer on a project that mentor is responsible
for can be commented on. The
comment trail is `public.feedback`, where each entry records its author and the
capacity they wrote in, so a developer's reply and a mentor's comment sit in the
same history and neither can be attributed to the other.

Mentors deliberately cannot write work entries for their developers. A daily
update is a first-hand record, and letting somebody else author it would make
the history untrustworthy.
