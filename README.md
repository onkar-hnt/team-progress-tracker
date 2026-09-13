# Team Progress Tracker

A team's daily work in one place: what each developer did, what they are assigned, what is
blocking them, and what their mentor has said about it.

Three kinds of people use it, and each sees a different application. A **developer** logs their
own day and reads their own feedback. A **mentor** maintains the roster and sees the developers
assigned to them. An **administrator** sees and administers everything. Those rules are written
once, in `src/services/auth/permissions.ts`, and enforced again in the database by row-level
security — the interface decides what to draw, and Postgres decides what may actually be read or
written.

Deployed to GitHub Pages from `main`: <https://onkar-hnt.github.io/team-progress-tracker/>

---

## Running it

Node 22 or newer, and npm.

```bash
npm install
npm run dev
```

That is the whole setup. With no configuration at all the application runs on a workbook held in
memory, seeded with sample data — every screen works, admin writes survive the session, and
nothing is saved when the tab closes. It is the right mode for looking around and for working on
the interface.

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                           |
| `npm run typecheck` | `tsc -b`, the same check CI runs                          |
| `npm run lint`      | ESLint over the whole project                             |
| `npm run build`     | Typecheck, then a production build into `dist/`           |
| `npm run preview`   | Serves `dist/` locally, to check a build before deploying  |

There is no test script. That is a real gap rather than an oversight — see
[What is missing](#what-is-missing).

## Configuration

Copy `.env.example` to `.env.local` and fill in what you need. That file is the reference and
explains every variable; this is the shape of it.

Everything prefixed `VITE_` is **embedded in the built JavaScript** and readable by anyone who
loads the site. No secret ever belongs in it. The Supabase publishable key is safe there by
design: it identifies the project rather than the caller, and access is decided by Auth and
row-level security. A `service_role` or `sb_secret_…` key is not safe there, and the application
inspects the key and refuses to start if it finds one.

### Where records come from — `VITE_DATA_SOURCE`

| Value              | What it reads                                                      |
| ------------------ | ------------------------------------------------------------------ |
| `supabase`         | PostgreSQL through Supabase, with RLS. The production source.       |
| `memory-excel`     | A workbook in memory. **The default**, and what a fresh clone runs. |
| `local-excel`      | An `.xlsx` on this computer, chosen from the browser.               |
| `sharepoint-excel` | The shared workbook through Microsoft Graph. Needs Entra.           |
| `mock`             | The fixtures in `src/data`.                                        |

The Excel modes are not a second production path. They came first, they still exercise the same
mappers and structure checks, and they remain useful for import, export and working offline — but
several features exist only under `supabase` and say so rather than pretending: notifications,
login provisioning, password resets and the Logins screen all check
`appConfig.dataSource === 'supabase'` and hide themselves otherwise.

### Who signs in — `VITE_AUTH_MODE`

| Value      | How somebody proves who they are                                            |
| ---------- | --------------------------------------------------------------------------- |
| `supabase` | Supabase Auth. The role is read from `public.profiles`, never from the token. |
| `entra`    | Microsoft single sign-on, through the app registration.                       |
| `local`    | Passwords derived from the workbook. Development only.                        |

Left blank, the mode is chosen for you: Supabase if a project is configured, Entra if a
registration is, and the offline workbook otherwise. Setting it pins the choice, which is what
makes the offline fallback a decision rather than something the application can slip into.

## The Supabase side

Two things live outside the bundle and are deployed separately: the schema, and the four Edge
Functions that do the work no browser may.

The [Supabase CLI](https://supabase.com/docs/guides/cli) is needed for both. Link the project
once:

```bash
supabase link --project-ref <your-project-ref>
```

### Migrations

Everything in `supabase/migrations/` — the schema, the RLS policies, the triggers that raise
notifications and keep records in step, and the SQL functions the Edge Functions ask for
permission. They are applied in filename order and each is written to be run once.

```bash
supabase migration list --linked   # what is applied, and what is not
supabase db push --linked          # apply the rest
```

Read them in order if you want to know how the access model works: `20260910181600_rls_policies.sql`
is where it starts.

### Edge Functions

Each of these holds the service-role key, which bypasses row-level security entirely and so must
never reach a browser. Every one of them is written as the same gate: resolve who is calling from
their bearer token, ask the *database* whether they may, and only then act. None of them trusts a
JWT claim for a role, because `user_metadata` is writable by the account holder.

| Function                    | What it does                                              | Who may                                      |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `provision-developer-user`  | Gives an employee record a login                          | Administrators and mentors                   |
| `provision-mentor-user`     | Gives a mentor record a login                             | Administrators and mentors                   |
| `reset-user-password`       | Sets somebody else's password                             | `public.may_reset_password` decides, per person |
| `set-account-state`         | Disables or re-enables a login, and ends open sessions     | `public.may_manage_account` — administrators   |

```bash
supabase functions deploy set-account-state    # one
supabase functions deploy                      # all of them
```

They share `supabase/functions/_shared/provisioning.ts`, which is uploaded alongside whichever
function is deployed. **A change to that file needs every function redeployed**, not just the one
you were working on.

Two failure modes are worth recognising, because both look like a network fault from the browser:
a function that has not been deployed answers the preflight with a 404 carrying no CORS headers,
and a migration that has not been applied makes the authorization call fail. The screens say which
of the two it was — that wording exists because both happened.

### Deploying the site

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`, after
typechecking and linting. It needs two repository variables under
**Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Both are public values, so repository *variables* are the right home rather than secrets. The
workflow checks for them before it builds and stops with a message naming what is missing — without
that check the build would succeed, fall back to the in-memory workbook, and deploy a site that
looks fine and saves nothing.

`.github/workflows/checks.yml` runs the same typecheck and lint on pull requests, so a branch is
gated before it reaches `main` rather than after.

`.github/workflows/supabase.yml` applies migrations and deploys functions from the repository
instead of from a laptop. It is manual — **Actions → Supabase → Run workflow** — and needs
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` as secrets. Deliberately
not automatic on push: a schema change and the code that depends on it usually want to land in a
particular order, and that order is a judgement.

Routing is by hash (`/#/dashboard`), because Pages serves static files and has no way to answer an
unknown path with `index.html`. `vite.config.ts` sets `base` to the repository name to match.

## How the code is laid out

```
src/
  app/          providers, routing, the error boundary
  components/   layout and the shared UI vocabulary
  features/     one folder per screen area: pages, and the components only they use
  hooks/        React Query hooks — the only thing screens call to read or write
  models/       the domain types every layer agrees on
  services/     everything that talks to the outside world
  styles/       variables, mixins and the global sheet
  utils/        dates, tasks, work summaries
supabase/
  migrations/   the schema and the access model
  functions/    the privileged operations
```

Four seams are worth knowing before changing anything:

- **`services/data-provider`** is the interface that makes the record store replaceable, and it is
  implemented three times over — Supabase, Excel and fixtures. Anything a spreadsheet cannot do
  does not belong on it; that is why notifications, accounts and the recycle bin sit beside it
  instead, gated on the data source.
- **`services/auth/permissions.ts`** answers every "may they?" in the interface. Screens ask it
  rather than checking `role === 'admin'` inline, so the policy can be read in one place.
- **`hooks/query-keys.ts`** declares every cache key once, so a write cannot fail to refresh a
  screen because two files spelled a key differently.
- **`app/providers`** holds the snackbar, the confirmation dialog and the session, all reached
  through hooks — `useSnackbar`, `useConfirm`, `useAuth`.

### Conventions

SCSS with BEM, one stylesheet beside the component it styles, and no CSS-in-JS. Comments explain
*why* something is the way it is, especially where the obvious approach was tried and did not
work; several of the longer ones exist because a subtle failure took an afternoon to understand
and is worth exactly one paragraph to never repeat.

## What is missing

Kept honest rather than aspirational:

- **No tests, and no test runner.** The data layer and the permission rules are the parts that
  would repay them most.
- **Paging is in the browser, not in the query.** Long lists arrive in full and are drawn a page at
  a time — the notification panel is the one exception, and asks the database for its pages. That is
  the right trade for a team and the wrong one for a company: the fix is `range()` on the reads,
  which means the query interface the three data providers share has to grow a limit.
- **No audit trail.** Who changed a task's status yesterday, and what it was before, is not
  recorded anywhere. Deleting is the exception: every delete — a work entry, a task, feedback, an
  employee, a mentor or a project — sets the record aside rather than destroying it, and **Recently
  deleted** stamps who did it and when. An employee, mentor or project can still only be deleted
  while no live work references it, which is a rule about deleting rather than about the bin.
- **No attachments, and no general comments** — feedback is attached to a task, and that is the
  only conversation the application holds.
