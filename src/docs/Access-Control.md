# Access Control

Who can see what, how it is enforced, and — importantly — what this design does
and does not protect against.

## Roles

Roles come from the `AccessRole` column of the Employees table, or from the
presence of a row in the Mentors table. They are not configured in code, and
changing somebody's access means editing the workbook, not a deployment.

| Role | Sees |
|---|---|
| Admin | Every record: employees, mentors, projects, tasks, work, feedback, reports |
| Mentor | Only the developers assigned to them, and those developers' projects, tasks, work and feedback |
| Developer | Only their own tasks, projects, work entries, feedback and metrics |

A mentor's reach is defined entirely by the MentorMapping table. Adding a row
there grants access to that developer; removing it revokes access on the next
page load.

## How it is enforced

Every read passes through an `AccessScope`, built once per session in
`src/services/auth/access-scope.ts` from the signed-in user and the mentor
mapping. The scope carries the set of employee ids the person may see — or
`null`, meaning unrestricted, for an admin.

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

**This is enforced in the browser.** It reliably prevents the application from
displaying another person's data, including through a hand-edited URL, a stale
filter or the query cache. It is not a defence against a determined user.

The application is a single-page app that reads the workbook with the signed-in
person's own Microsoft Graph token, using delegated permissions. That token is
in the browser, and the file it addresses is a shared workbook. Anyone willing
to open developer tools can therefore read the whole file, regardless of what
this application chooses to render. The same is true of the SharePoint sharing
link itself: whoever holds it has the access the link grants.

Put plainly: the role model here is a correctness and privacy control for
ordinary use — people do not stumble into each other's records, and the UI never
reveals them — but it is not a security boundary.

Making it one requires moving the data behind a server: an API that holds the
workbook or database credentials, authenticates the caller, and filters rows
before responding. At that point the same `AccessScope` logic moves server-side,
and the client keeps its copy only to decide what to render. The
`DataProvider` abstraction exists precisely so that change is a new
implementation rather than a rewrite.

Until then:

- Keep the deployment behind company sign-in and off the public internet.
- Treat the workbook sharing link as a credential.
- Do not put anything in the workbook that would be damaging for a colleague to
  read.

## Writing

Reads are scoped; writes are additionally checked by role in
`src/services/auth/permissions.ts`.

| Action | Admin | Mentor | Developer |
|---|---|---|---|
| Log or edit a work entry | Anyone's | Own only | Own only |
| Change a task's status | Yes | For assigned developers | Own tasks only |
| Create or assign tasks | Yes | No | No |
| Write feedback | Yes | For assigned developers | No |
| Edit or delete feedback | Yes | Own comments only | No |
| Manage employees, mentors, projects, mappings | Yes | No | No |

Mentors deliberately cannot write work entries for their developers. A daily
update is a first-hand record, and letting somebody else author it would make
the history untrustworthy.
