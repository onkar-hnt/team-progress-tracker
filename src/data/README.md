# Fixture tables

Empty on purpose.

Every record — employees, mentors, mappings, projects, tasks, comments and
daily updates — lives in the Excel workbook, not in this repository. These
files exist only so the `mock` data source has something shaped like a
workbook to read when developing offline, and they are deliberately left with
no rows so that no business data can drift into version control.

Each file is an array of raw Excel rows: object keys are the column names from
`src/services/data-provider/excel/excel-schema.ts`, exactly as they appear in
the workbook's header row. If you add rows here while working on a feature, do
not commit them.

To work against real data, set `VITE_DATA_SOURCE=local-excel` and connect the
workbook from the application.
