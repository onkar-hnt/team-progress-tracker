# Team Daily Work Tracker — Project Plan

## 1. Project Overview

The **Team Daily Work Tracker** is an internal web application designed to record, monitor, and visualize the daily work progress of developers.

Each developer will update their work on a daily basis. The application will provide a centralized dashboard for reviewing:

- Daily work updates
- Weekly progress
- Developer-wise task completion
- Completed, pending, in-progress, and blocked tasks
- Team-level progress
- Work trends
- Missing daily updates
- Project-wise activity
- Developer history

The application should remain simple enough for developers to update every day while still providing useful information to the team mentor.

---

## 2. Primary Goal

The main goal is to create a lightweight work-tracking system that allows the mentor and developers to quickly understand:

- What each developer worked on
- What was completed
- What is still in progress
- What is pending
- Whether any developer is blocked
- Whether any developer has not submitted a daily update
- How work is progressing over a week or month
- How activity is distributed across projects and developers

The application is intended for **work visibility and progress tracking**, not employee surveillance or simplistic productivity scoring.

---

## 3. Team Structure

### Mentor

- **Onkar Ingawale**

The mentor will have visibility across the entire team and will primarily use the dashboard, team activity, developer details, blockers, and reports.

### Developers

1. Esha Nagarkar
2. Mayuri Gawade
3. Rutik Shinde
4. Saira Anap
5. Suyog Shinde
6. Shubham Deshmukh
7. Akshaykumar Sarsamkar

The developer list should be configurable so that team members can be added, disabled, or updated later without major code changes.

---

## 4. User Roles

The initial version will support two logical roles.

### 4.1 Developer

A developer should be able to:

- Select or identify themselves
- Add a daily work update
- Update their own entry
- View their recent work
- View their weekly summary
- View pending and in-progress tasks
- Add blocker information
- Review previous updates

### 4.2 Mentor

The mentor should be able to:

- View all developers
- View all daily updates
- View team-level dashboard metrics
- View developer-wise progress
- Identify blocked work
- Identify missing daily updates
- Filter by developer
- Filter by date
- Filter by project
- Filter by status
- Review weekly and monthly summaries
- Open individual developer details

Role-based authentication can be introduced later if not required in the MVP.

---

## 5. Scope

## 5.1 MVP Scope

The first usable version will include:

- Dashboard
- Daily Update form
- Team Activity screen
- Developer Details screen
- Basic Reports screen
- Developer management through static/configured data
- Project selection
- Task status tracking
- Date filtering
- Developer filtering
- Project filtering
- Task progress percentage
- Blocker tracking
- Weekly progress charts
- Missing update detection
- Excel-based data source or mock JSON abstraction
- GitHub Pages deployment for the frontend

## 5.2 Future Scope

Future versions may include:

- Authentication
- Role-based authorization
- Microsoft Entra ID integration
- Microsoft Graph integration
- SharePoint / OneDrive-hosted Excel
- Backend API
- Database migration from Excel
- Automated reminders
- Email notifications
- Weekly summary generation
- Monthly reports
- Export to Excel/PDF
- Comments from mentor
- Task carry-forward
- Jira/Azure DevOps integration
- Team and project configuration
- Audit history
- Multiple mentors
- Multiple teams
- Leave/holiday handling

---

## 6. Proposed Technology Stack

The preferred frontend stack is:

- **React**
- **TypeScript**
- **Vite**
- **SCSS**
- **React Router**
- **TanStack Query**
- **React Hook Form**
- **Zod**
- **AG Grid**
- **Recharts**
- **date-fns**
- **GitHub Pages**

### Why React?

This project is a good practical React application because it contains:

- Forms
- Tables
- Charts
- Routing
- Shared components
- State management
- API/data integration
- Feature-based architecture
- Dashboard design
- Real-world CRUD behavior

It also provides useful React practice while keeping concepts familiar to an Angular developer.

---

## 7. Architecture Strategy

The frontend should not directly depend on Excel-specific logic throughout the application.

Instead, all data access should go through a service/repository layer.

Example:

```text
UI Components
      |
      v
Feature Hooks / Queries
      |
      v
Work Tracker Service
      |
      v
Data Provider
  |        |
  |        |
Mock JSON  Excel / API
```

This keeps the application flexible.

During development, we can use mock JSON.

Later, the data provider can be replaced with:

- Excel
- Microsoft Graph
- REST API
- SQL Database

without rewriting all UI components.

---

## 8. Important Deployment Constraint

GitHub Pages is a **static hosting platform**.

It can host the React application, but it cannot directly provide a backend capable of safely modifying an Excel file stored inside the deployed application.

Therefore:

### Supported

```text
Excel / JSON
     |
     v
React Application
     |
     v
GitHub Pages
```

for read-only or pre-generated data.

### Not Recommended

```text
Developer
    |
    v
GitHub Pages
    |
    v
Modify local Excel file
```

because GitHub Pages has no persistent server-side storage.

### Recommended Long-Term Architecture

```text
React Frontend
      |
      v
Microsoft Graph / Backend API
      |
      v
Excel on OneDrive / SharePoint
```

or:

```text
React Frontend
      |
      v
.NET API
      |
      v
SQL Database
```

For the MVP, the data layer should be abstracted so that we can start quickly and replace storage later.

---

## 9. Core Screens

## 9.1 Dashboard

Route:

```text
/dashboard
```

The dashboard will give the mentor a quick overview of the team's current progress.

### Dashboard Cards

- Total Tasks
- Completed Tasks
- In Progress Tasks
- Pending Tasks
- Blocked Tasks
- Completion Rate
- Developers Updated Today
- Developers Yet to Update

### Dashboard Charts

- Daily Task Completion
- Weekly Task Trend
- Developer-wise Task Status
- Project-wise Task Distribution
- Completion Trend
- Blocker Trend

### Dashboard Sections

#### Today's Team Activity

Shows the latest work submitted by developers.

#### Missing Daily Updates

Lists developers who have not submitted an update for the selected working day.

#### Blocked Tasks

Shows all currently blocked tasks.

#### Developer Summary

Example:

| Developer | Completed | In Progress | Pending | Blocked | Completion Rate |
|---|---:|---:|---:|---:|---:|
| Shubham | 5 | 2 | 1 | 0 | 62.5% |
| Rutik | 4 | 1 | 1 | 1 | 57.1% |

#### Weekly Activity

Shows task updates over the last seven working days.

---

## 9.2 Daily Update Screen

Route:

```text
/daily-update
```

This is the most important screen for developers.

The form should be fast and easy to complete.

### Fields

- Date
- Developer
- Project
- Task Title
- Task Description
- Status
- Priority
- Progress %
- Hours Spent
- Blocker
- Blocker Description
- Remarks

### Optional Future Fields

- Task Type
- Jira/Azure DevOps ID
- Estimated Hours
- Start Date
- Expected Completion Date
- Reviewer
- Carry Forward

### Validation Rules

- Developer is required
- Date is required
- Project is required
- Task title is required
- Status is required
- Progress must be between 0 and 100
- Hours cannot be negative
- Blocker description is required when `Blocked = Yes`
- Completed tasks should normally have 100% progress

---

## 9.3 Team Activity Screen

Route:

```text
/team-activity
```

This screen will display all work updates in a tabular format.

AG Grid is recommended.

### Columns

- Date
- Developer
- Project
- Task
- Status
- Priority
- Progress
- Hours
- Blocker
- Last Updated

### Filters

- Date range
- Developer
- Project
- Status
- Priority
- Blocked/Not Blocked

### Actions

- View
- Edit own entry
- Delete own entry
- Open developer details

Role restrictions can be applied later.

---

## 9.4 Developer Details Screen

Route:

```text
/developers/:developerId
```

This page will show an individual developer's work history.

### Header

- Developer Name
- Role
- Location
- Active/Inactive status

### Summary Cards

- Tasks This Week
- Completed
- In Progress
- Pending
- Blocked
- Completion Rate
- Total Logged Hours

### Sections

- Recent Tasks
- Weekly Progress
- Monthly Progress
- Project Distribution
- Current Blockers
- Task History

---

## 9.5 Reports Screen

Route:

```text
/reports
```

The reports page will support:

- Today
- This Week
- This Month
- Custom Date Range

### Reports

- Developer Summary
- Team Summary
- Project Summary
- Status Summary
- Blocker Summary
- Work Trend
- Completion Trend
- Missing Updates

Future versions may include PDF and Excel export.

---

## 10. Suggested Navigation

```text
Dashboard
Daily Update
Team Activity
Developers
Reports
Settings
```

Settings can initially be hidden or minimal.

---

## 11. Data Model

## 11.1 Developer

```ts
export interface Developer {
  id: string;
  name: string;
  role?: string;
  location?: string;
  active: boolean;
}
```

---

## 11.2 Project

```ts
export interface Project {
  id: string;
  name: string;
  client?: string;
  active: boolean;
}
```

---

## 11.3 Daily Work Entry

```ts
export interface DailyWorkEntry {
  id: string;
  date: string;
  developerId: string;
  projectId: string;

  taskTitle: string;
  description?: string;

  status: TaskStatus;
  priority: TaskPriority;

  progress: number;
  hoursSpent?: number;

  isBlocked: boolean;
  blockerDescription?: string;

  remarks?: string;

  createdAt: string;
  updatedAt: string;
}
```

---

## 11.4 Task Status

```ts
export type TaskStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'blocked';
```

---

## 11.5 Task Priority

```ts
export type TaskPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';
```

---

## 12. Excel Workbook Design

The initial workbook can contain the following sheets.

### Sheet 1 — Developers

| DeveloperId | Name | Role | Location | Active |
|---|---|---|---|---|

### Sheet 2 — Projects

| ProjectId | ProjectName | Client | Active |
|---|---|---|---|

### Sheet 3 — DailyWork

| ID | Date | DeveloperId | ProjectId | TaskTitle | Description | Status | Priority | Progress | HoursSpent | IsBlocked | BlockerDescription | Remarks | CreatedAt | UpdatedAt |
|---|---|---|---|---|---|---|---|---:|---:|---|---|---|---|---|

### Sheet 4 — Configuration

Optional configuration values:

| Key | Value |
|---|---|
| WorkWeek | Monday-Friday |
| Mentor | Onkar Ingawale |
| DefaultDateRange | 7 |
| ReminderEnabled | false |

---

## 13. Data Source Strategy

The data-access layer should expose generic functions such as:

```ts
getDevelopers()
getProjects()
getDailyWorkEntries()
getDailyWorkEntryById()
createDailyWorkEntry()
updateDailyWorkEntry()
deleteDailyWorkEntry()
```

The React components should not care whether the data comes from:

- JSON
- Excel
- REST API
- Microsoft Graph

This separation is essential.

---

## 14. Proposed Folder Structure

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── router/
│   │   └── app-router.tsx
│   └── providers/
│       └── app-providers.tsx
│
├── components/
│   ├── layout/
│   │   ├── AppLayout/
│   │   ├── Header/
│   │   └── Sidebar/
│   │
│   ├── ui/
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Select/
│   │   ├── Input/
│   │   ├── Modal/
│   │   ├── Badge/
│   │   └── Loader/
│   │
│   └── charts/
│       ├── CompletionChart/
│       ├── TaskTrendChart/
│       └── DeveloperProgressChart/
│
├── features/
│   ├── dashboard/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   │
│   ├── daily-update/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── schemas/
│   │   └── services/
│   │
│   ├── team-activity/
│   ├── developers/
│   ├── reports/
│   └── settings/
│
├── models/
│   ├── developer.model.ts
│   ├── project.model.ts
│   └── daily-work.model.ts
│
├── services/
│   ├── work-tracker.service.ts
│   └── data-provider/
│       ├── data-provider.interface.ts
│       ├── mock-data-provider.ts
│       └── excel-data-provider.ts
│
├── hooks/
│
├── utils/
│   ├── date.utils.ts
│   ├── task.utils.ts
│   └── calculation.utils.ts
│
├── constants/
│
├── config/
│
├── data/
│   ├── developers.json
│   ├── projects.json
│   └── daily-work.json
│
└── styles/
    ├── _variables.scss
    ├── _mixins.scss
    ├── _reset.scss
    ├── _utilities.scss
    └── global.scss
```

---

## 15. State Management Strategy

Avoid adding a large global state library unless the application actually needs it.

Use:

- React local state for local UI behavior
- React Hook Form for forms
- TanStack Query for server/data-source state
- Context only for truly global UI/user configuration

If the application grows significantly, Zustand or Redux Toolkit can be evaluated later.

---

## 16. API / Service Layer

Example service contract:

```ts
export interface WorkTrackerService {
  getDevelopers(): Promise<Developer[]>;
  getProjects(): Promise<Project[]>;
  getDailyWorkEntries(): Promise<DailyWorkEntry[]>;

  createDailyWorkEntry(
    entry: CreateDailyWorkEntryRequest
  ): Promise<DailyWorkEntry>;

  updateDailyWorkEntry(
    id: string,
    entry: UpdateDailyWorkEntryRequest
  ): Promise<DailyWorkEntry>;

  deleteDailyWorkEntry(id: string): Promise<void>;
}
```

The implementation can initially use mock JSON and later switch to an API.

---

## 17. Dashboard Calculations

## 17.1 Total Tasks

```text
Total Tasks = Number of task entries in selected period
```

## 17.2 Completed Tasks

```text
Completed Tasks =
Count(Status = Completed)
```

## 17.3 Completion Rate

```text
Completion Rate =
Completed Tasks / Total Tasks × 100
```

## 17.4 Blocked Tasks

```text
Blocked Tasks =
Count(Status = Blocked OR IsBlocked = true)
```

## 17.5 Developer Update Status

```text
Updated Today =
Developer has at least one work entry for selected day
```

```text
Missing Update =
Active developer has no work entry for selected working day
```

---

## 18. Productivity Metrics

Avoid calculating a single simplistic "employee productivity score."

Instead, show measurable indicators separately:

- Tasks completed
- Tasks in progress
- Tasks pending
- Blocked tasks
- Completion rate
- Work update consistency
- Task carry-forward
- Hours logged
- Weekly task trend

This gives the mentor context without making misleading assumptions about task complexity.

---

## 19. Missing Daily Update Logic

For each active developer:

```text
IF
  selectedDate is a working day
AND
  developer is active
AND
  no entry exists for selectedDate
THEN
  mark as "Update Missing"
```

Future versions should also consider:

- Leave
- Public holidays
- Weekends
- Client holidays
- Training days

---

## 20. UI/UX Guidelines

The tracker should prioritize speed and clarity.

### Daily Update Form

Target completion time:

```text
1-2 minutes
```

### Dashboard

Important information should be visible without excessive scrolling.

Priority order:

1. Blockers
2. Missing Updates
3. Task Status
4. Developer Progress
5. Weekly Trends

### General UI Principles

- Responsive layout
- Clean visual hierarchy
- Accessible colors
- Keyboard-friendly forms
- Clear status badges
- Minimal modal usage
- Skeleton loading where appropriate
- Proper empty states
- Proper error states
- Confirmation before destructive actions

---

## 21. Responsive Design

Target breakpoints:

- Desktop
- Tablet
- Mobile

Primary expected usage is desktop/browser, but the daily update form should work properly on mobile.

---

## 22. Accessibility

The application should aim for WCAG AA practices.

Include:

- Semantic HTML
- Form labels
- Keyboard navigation
- Visible focus states
- Adequate contrast
- ARIA only where necessary
- Accessible table controls
- Chart summaries for non-visual users

---

## 23. Error Handling

The application should handle:

- Failed data load
- Invalid Excel format
- Missing required columns
- Duplicate IDs
- Invalid date values
- Failed save
- Failed update
- Failed delete
- Empty dataset
- Network/API failure
- Unauthorized actions in future authenticated versions

User-facing errors should be clear and actionable.

---

## 24. Loading States

Use:

- Skeleton loaders for dashboard cards
- Table loading indicators
- Form submit loading state
- Disabled submit button during save
- Retry state for failed fetches

---

## 25. Empty States

Examples:

### No Tasks

```text
No work updates found for the selected date.
```

### No Blockers

```text
No blockers reported.
```

### No Developer Data

```text
No developer activity is available for this period.
```

---

## 26. Git Strategy

Recommended branches:

```text
main
develop
feature/*
fix/*
chore/*
```

For a small personal/internal project, `main + feature branches` is also sufficient.

Example:

```text
feature/project-foundation
feature/dashboard
feature/daily-update
feature/team-activity
feature/developer-details
feature/reports
```

---

## 27. Commit Strategy

Keep commits small and meaningful.

Examples:

```text
chore: initialize React TypeScript project
chore: configure SCSS architecture
feat: add application layout
feat: add developer model and mock data
feat: implement daily update form
feat: add team activity grid
feat: add dashboard summary cards
feat: add developer progress chart
feat: add missing update detection
feat: configure GitHub Pages deployment
```

---

## 28. Testing Strategy

### Unit Tests

Test:

- Calculation utilities
- Date helpers
- Missing update logic
- Form validation
- Data transformation
- Dashboard aggregation

### Component Tests

Test:

- Daily update form
- Dashboard cards
- Filters
- Empty states
- Error states

### Future E2E Tests

Use Playwright for:

- Add daily update
- Edit update
- Filter team activity
- Open developer details
- Validate dashboard metrics

---

## 29. Data Validation

Use Zod schemas for incoming data.

Example:

```ts
const dailyWorkSchema = z.object({
  id: z.string(),
  date: z.string(),
  developerId: z.string(),
  projectId: z.string(),
  taskTitle: z.string().min(1),
  status: z.enum([
    'not-started',
    'in-progress',
    'completed',
    'blocked'
  ]),
  progress: z.number().min(0).max(100)
});
```

This becomes particularly important when reading from Excel.

---

## 30. Security Considerations

If the application contains internal company information, GitHub Pages must be evaluated carefully.

A public GitHub Pages deployment should **not expose confidential client or project data**.

Possible deployment alternatives for internal usage include:

- Private organizational hosting
- Azure Static Web Apps
- Azure App Service
- Internal SharePoint
- Company-approved hosting
- Authenticated cloud application

Before production deployment, confirm company policy regarding:

- Client data
- Project names
- Developer information
- Source code hosting
- Public URLs

---

## 31. Recommended Development Phases

# Phase 0 — Planning

Deliverables:

- Project plan
- Scope
- Data model
- Screen list
- Architecture decision
- Storage strategy
- Deployment strategy

Status:

```text
Current Phase
```

---

# Phase 1 — Project Foundation

Tasks:

- Create Git repository
- Create React + TypeScript Vite application
- Configure SCSS
- Configure linting
- Configure formatting
- Add folder structure
- Add React Router
- Add application layout
- Add shared UI foundation
- Add TypeScript path aliases
- Add environment configuration
- Add base error boundary

Deliverable:

```text
Running production-ready frontend foundation
```

---

# Phase 2 — Models and Mock Data

Tasks:

- Add Developer model
- Add Project model
- Add DailyWorkEntry model
- Add enums/types
- Create mock developer data
- Create mock projects
- Create mock daily work data
- Create data-provider interface
- Implement mock provider

Deliverable:

```text
Frontend can retrieve realistic mock data
```

---

# Phase 3 — Daily Update

Tasks:

- Create Daily Update page
- Build form
- Add React Hook Form
- Add Zod validation
- Add developer selection
- Add project selection
- Add task status
- Add progress
- Add blocker handling
- Add save flow
- Add success/error feedback

Deliverable:

```text
Developer can submit daily work
```

---

# Phase 4 — Team Activity

Tasks:

- Install/configure AG Grid
- Build activity table
- Add date filter
- Add developer filter
- Add project filter
- Add status filter
- Add blocked filter
- Add sorting
- Add pagination
- Add responsive handling

Deliverable:

```text
Mentor can review all team activity
```

---

# Phase 5 — Dashboard

Tasks:

- Build dashboard shell
- Add summary cards
- Add daily metrics
- Add weekly metrics
- Add missing updates
- Add blocked task list
- Add developer summary
- Add Recharts
- Add weekly trend
- Add task status chart
- Add developer-wise chart

Deliverable:

```text
Mentor gets a complete team overview
```

---

# Phase 6 — Developer Details

Tasks:

- Add developer route
- Add developer header
- Add weekly summary
- Add monthly summary
- Add recent tasks
- Add status distribution
- Add project distribution
- Add blocker list

Deliverable:

```text
Individual developer progress view
```

---

# Phase 7 — Reports

Tasks:

- Add report filters
- Add weekly report
- Add monthly report
- Add developer report
- Add project report
- Add blocker report
- Add missing updates report

Deliverable:

```text
Mentor can analyze historical work
```

---

# Phase 8 — Excel Integration

Tasks:

- Define final workbook schema
- Add Excel parsing library if local-read strategy is used
- Validate workbook
- Map rows to models
- Handle invalid rows
- Add import
- Add export if required
- Replace mock provider with Excel provider

If centralized Excel editing is required:

- Evaluate OneDrive
- Evaluate SharePoint
- Evaluate Microsoft Graph
- Implement authenticated integration

Deliverable:

```text
Application uses real team data
```

---

# Phase 9 — Deployment

Tasks:

- Configure production build
- Configure GitHub Pages
- Configure base path
- Configure SPA routing fallback strategy
- Add CI workflow
- Validate environment variables
- Validate data security
- Deploy application

Deliverable:

```text
Accessible hosted application
```

---

# Phase 10 — Production Hardening

Tasks:

- Add test coverage
- Add accessibility validation
- Add responsive testing
- Add performance optimization
- Add error monitoring
- Add audit logging if backend exists
- Add authentication if required
- Add role authorization
- Add backup strategy

---

## 32. Initial Developer Seed Data

```ts
export const developers: Developer[] = [
  {
    id: 'DEV001',
    name: 'Esha Nagarkar',
    role: 'Intern - Angular',
    location: 'Pune',
    active: true
  },
  {
    id: 'DEV002',
    name: 'Mayuri Gawade',
    role: 'Jr. UI Developer',
    location: 'Pune',
    active: true
  },
  {
    id: 'DEV003',
    name: 'Rutik Shinde',
    role: 'Jr. Angular Developer',
    location: 'Bangalore',
    active: true
  },
  {
    id: 'DEV004',
    name: 'Saira Anap',
    role: 'Jr. Angular Developer',
    location: 'Pune',
    active: true
  },
  {
    id: 'DEV005',
    name: 'Suyog Shinde',
    role: 'Jr. Angular Developer',
    location: 'Pune',
    active: true
  },
  {
    id: 'DEV006',
    name: 'Shubham Deshmukh',
    active: true
  },
  {
    id: 'DEV007',
    name: 'Akshaykumar Sarsamkar',
    active: true
  }
];
```

Role/location values should remain configurable and can be corrected when the final team metadata is available.

---

## 33. Mentor Configuration

```ts
export const mentor = {
  name: 'Onkar Ingawale'
};
```

Later this can become a proper user/role entity.

---

## 34. MVP Acceptance Criteria

The MVP will be considered successful when:

1. All seven developers are available in the application.
2. Onkar Ingawale is represented as the team mentor.
3. A developer can create a daily work update.
4. Work entries contain project, task, status, and progress information.
5. The mentor can see today's activity.
6. The mentor can identify developers who have not updated.
7. The mentor can see completed, in-progress, pending, and blocked work.
8. The mentor can filter team activity.
9. The mentor can open individual developer details.
10. Weekly progress is visible.
11. The application is responsive.
12. Data access is abstracted from the UI.
13. The project can be built successfully for production.
14. The application can be deployed using the selected hosting strategy.

---

## 35. Non-Goals for MVP

The first version will not require:

- Complex task assignment
- Full Jira replacement
- Sprint planning
- Story point management
- Payroll calculation
- Attendance management
- Employee ranking
- AI-generated performance ratings
- Chat functionality
- Complex approval workflows

These can be evaluated only if actual business requirements justify them.

---

## 36. Design Direction

The UI should look like a lightweight professional internal dashboard.

Recommended characteristics:

- Left sidebar navigation
- Fixed top header
- Dashboard card grid
- Neutral professional theme
- Clear status badges
- Minimal visual noise
- Consistent spacing
- Responsive tables
- Simple charts
- Strong empty states
- High information density without clutter

---

## 37. Suggested Dashboard Layout

```text
+------------------------------------------------------------------+
| Team Daily Work Tracker                           Mentor: Onkar   |
+------------------------------------------------------------------+
| Sidebar      | Dashboard                                         |
|              |                                                   |
| Dashboard    | [Total] [Completed] [In Progress] [Blocked]      |
| Daily Update |                                                   |
| Activity     | [Updated Today] [Missing Updates]                 |
| Developers   |                                                   |
| Reports      | Weekly Task Trend                                 |
|              | +-----------------------------------------------+  |
|              | | Chart                                         |  |
|              | +-----------------------------------------------+  |
|              |                                                   |
|              | Developer Summary      Task Status Distribution  |
|              |                                                   |
|              | Blocked Tasks          Missing Daily Updates     |
+------------------------------------------------------------------+
```

---

## 38. Suggested Daily Update Flow

```text
Developer opens application
        |
        v
Select Daily Update
        |
        v
Developer auto-selected / selected
        |
        v
Select Project
        |
        v
Enter Task
        |
        v
Select Status
        |
        v
Enter Progress
        |
        v
Add Blocker if any
        |
        v
Save
        |
        v
Update appears on Dashboard and Team Activity
```

---

## 39. Development Principle

Build the project **feature-by-feature**.

For every feature:

1. Define requirement
2. Define data contract
3. Build UI
4. Add business logic
5. Add validation
6. Add loading/error states
7. Test
8. Commit
9. Move to next feature

Avoid building the complete UI first and connecting logic later.

---

## 40. Immediate Next Step

After this project plan is approved, development should begin with:

```text
Phase 1 — Project Foundation
```

The first implementation task will be to create the React + TypeScript project and configure the initial production-ready folder structure, SCSS architecture, routing, linting, and development standards.

No dashboard implementation should begin until the project foundation is complete.

---

## 41. Final Architecture Direction

### MVP

```text
React + TypeScript
       |
       v
Data Provider Interface
       |
       v
Mock JSON / Excel Import
       |
       v
GitHub Pages
```

### Future Production Version

```text
React + TypeScript
       |
       v
REST API / Microsoft Graph
       |
       v
Excel on SharePoint / OneDrive
            OR
       SQL Database
```

This approach allows fast initial development without locking the project into Excel permanently.

---

## 42. Project Success Criteria

The project will be successful when daily updating becomes easy enough that developers consistently use it and the mentor can understand team progress within a few seconds of opening the dashboard.

The system should answer these questions quickly:

- Who updated today?
- Who has not updated today?
- What was completed today?
- What is currently in progress?
- What is blocked?
- Which developer is working on what?
- What changed during the week?
- Which project has the most active work?
- What work is carrying forward?
- Where does the mentor need to intervene?

That should remain the central design principle throughout development.
