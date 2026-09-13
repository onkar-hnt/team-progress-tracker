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
login provisioning, password resets, the Logins screen and the Usage screen all check
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
notifications, record every change and keep records in step, the storage bucket attachments go to,
and the SQL functions the Edge Functions ask for permission. They are applied in filename order and
each is written to be run once.

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

Every size, colour, radius, shadow, duration and layer is a token in `styles/_variables.scss`, and
a literal in a feature stylesheet is a bug rather than a shortcut — the file says what each token
is for, which is usually enough to find the right rung of the scale.

### Charts

ApexCharts, wrapped in `components/charts/`. `ApexChart.tsx` is the frame every chart shares — the
text summary read in place of the drawing, the empty state, the imports — `chart-theme.ts` holds the
options they all agree on, `chart-utils.ts` the number formatting, and `WorkCharts.tsx` the five
charts themselves over the aggregations in `work-summary.utils`.

The split between Sass and TypeScript is deliberate and is the thing to understand before changing
a colour. Everything around the data — axis labels, grid lines, legend, tooltip — is ordinary DOM
that `ApexChart.scss` styles from the same tokens as the rest of the application. The data colours
cannot work that way, because Apex does arithmetic on them to shade gradients and hover states, so
they are literals in `chart-colors.ts`: one tier brighter than the interface palette, which is tuned
for 12px text rather than for a filled area. Each one means something, and `STATUS_CHART_COLORS`
keys them by status so a chart cannot list its data in one order and its colours in another.

Renderers are imported one per chart type rather than as Apex's default bundle, which is worth about
260 KB; a new kind of chart needs its renderer added to `ApexChart.tsx`, and the console says so.
Clicking a status slice, a developer's bar or a project slice opens the activity list filtered to
those rows, through `activityRangeLink`. That is a shortcut rather than the only route, because the
drawing is hidden from assistive technology: the metric cards above are real links to the same
views.

### Scrolling

The document never scrolls. `body` is `100dvh` and `overflow: hidden`, the shell fills it, and the
content region inside `AppLayout` is the page scroller — which is what keeps the rail and the bar in
place while a long report moves under them.

Inside that, some regions scroll on their own: tables at ten rows, entry and comment lists at a
screenful, the dashboard's two side-by-side panels, the notification popover, dropdown lists, and a
dialog body. Whether one of those chains to its parent when it reaches its end is the only decision
that matters, and it goes one way inside the page and the other way in an overlay. `_reset.scss`
states the rule and the reasoning; the short version is that containment inside the page reads as
the application freezing, because the reader was scrolling the page and the page had not ended.

None of it is done in script. There are no wheel or touch handlers anywhere in the codebase and
nothing writes to `body.style.overflow`, so there is no scroll lock that can survive the thing that
set it. Locking the page behind an open dialog is one CSS rule — `body:has(dialog[open])` in
`AppLayout.scss` — which stops applying the moment the dialog closes, and the mobile drawer locks
the same way through its own class.

### Motion

Animation is written inside `@include motion-safe` — a `prefers-reduced-motion: no-preference`
query — rather than added and then switched off under `reduce`. The second form needs two rules
kept in agreement and fails silently when somebody forgets the second, so the movement here only
ever exists inside the query. `enter` and `stagger` in `_mixins.scss` follow that rule for you, and
the shared keyframes live in `_motion.scss`; keyframes describing one component stay with it.

Two exceptions cannot be expressed in CSS and read the preference in script through
`usePrefersReducedMotion`: the counting stat-card values, where each frame is a different string,
and the chart animations, which are options on a library that does not ask. A blanket rule in
`_reset.scss` is the floor under all of it, for transitions that arrive from a dependency's own
stylesheet.

**Smooth scrolling is native.** Lenis was considered and not adopted. It works by taking the wheel
and touch events of one scroller and animating that scroller itself, and this application does not
have one scroller: the shell's content region, every table, the notification popover, dropdown
lists, dialog bodies and the sidebar's own navigation all scroll independently, several of them
inside the top layer where a library reaching in from the page cannot follow. Making it safe would
mean marking each of those as off-limits and re-marking every one added later — for an eased wheel
gesture, at the cost of the browser's own scroll anchoring, keyboard paging and touch handling.
`scroll-behavior: smooth` on the content region gives the part that is actually worth having, which
is anchor and skip-link jumps easing rather than teleporting; wheel scrolling stays the browser's.

## What is missing

Kept honest rather than aspirational:

- **No tests, and no test runner.** The data layer and the permission rules are the parts that
  would repay them most.
- **Paging is in the query where a list can be paged, and in the browser where it cannot.** The
  three record queries now carry a `limit`, which every provider honours newest-first, and the
  notification panel, the feedback lists and a developer's own feedback ask the database for a page
  at a time. The remaining lists deliberately still arrive whole, because something on the screen
  needs all of them: the totals above team activity add up every entry in the period, and the
  sortable tables sort in the browser, so a paged read would give a stat card that is wrong and a
  column that sorts only what happens to be loaded. **Aggregates and sorting in the database is the
  next piece of this**, and it is the one that would let those screens page too.
- **The audit trail is field-level, but not a time machine.** Every change to a work entry, a
  task, feedback, an employee, a mentor or a project is recorded as a diff — the field, what it
  was, what it became, who did it and when — and **Change log** shows it, narrowed by the same rule
  that narrows the work itself, so a developer sees who moved their task and an administrator sees
  everything. What it will not do is reassemble a record as it stood on an arbitrary Tuesday:
  diffs are kept rather than snapshots, which is the right trade for "who did this" and the wrong
  one for "show me the whole thing as it was". Project membership is the one write not yet logged.
- **Deleting is recoverable, except for a file.** Every delete of a record sets it aside rather
  than destroying it, and **Recently deleted** stamps who did it and when; an employee, mentor or
  project can still only be deleted while no live work references it, which is a rule about
  deleting rather than about the bin. An attachment is the exception and says so before it goes:
  the row and the object are both removed, and neither comes back.
- **Attachments are per record, and nothing wider.** A task, a work entry and a piece of feedback
  can each carry files — private bucket, signed links that expire in a minute, 10 MB and a named
  list of types enforced by the service rather than by the browser. There is no gallery, no
  preview, and no way to attach a file to a project or a person: a file about a piece of work
  belongs on that work, and one about somebody's employment does not belong here at all.
- **Feedback is the only conversation.** It can now be about a task or about the person's work in
  general, which is what a note after a one-to-one actually is. What is still missing is a reply:
  feedback is written and read, not discussed, so a developer answering a point has to do it
  somewhere else.
- **Usage is measured for the two limits that bite, and named for the three it cannot reach.**
  **Usage**, under Administration, reads `public.resource_usage()` and shows the database against
  500 MB, files against 1 GB, a per-table breakdown of where the bytes are, the accounts, and how
  long it has been since anything was written — that last one because a free project with a week of
  no activity is paused, which is worse than being full. Egress, Edge Function invocations and
  realtime messages are not there: the platform meters them and the only way in is the Management
  API with a token that has rights over the entire project, which is not a credential to put behind
  a browser screen. Those three are listed with their allowances and a link to the project's own
  report instead of being quietly left out.
