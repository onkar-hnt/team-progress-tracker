/**
 * A team member who submits daily work updates.
 *
 * `id` mirrors the `DeveloperId` column in `tblDevelopers` and is the only
 * valid relational key. Developer names are display data and must never be
 * used to join records.
 */
export interface Developer {
  id: string
  name: string
  role?: string
  location?: string
  active: boolean
}
