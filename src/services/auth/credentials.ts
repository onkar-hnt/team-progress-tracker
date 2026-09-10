import type { AppUser } from '@models/user.model'

/**
 * Hardcoded accounts for the MVP.
 *
 * SECURITY: these values are compiled into the JavaScript bundle and are
 * readable by anyone who can open the application or view its source. They
 * provide *convenience*, not protection, so the deployment must not be
 * publicly reachable while this file is in use, and these passwords must not
 * be reused anywhere else.
 *
 * This exists behind the `AuthProvider` interface specifically so it can be
 * deleted wholesale once real sign-in replaces it.
 *
 * `developerId` must match a `DeveloperId` in `tblDevelopers`; that link is
 * what lets a developer edit their own entries and nobody else's. The mentor
 * is an admin and has no developer row.
 */
export interface HardcodedAccount extends AppUser {
  password: string
}

const PASSWORD_SUFFIX = '@1234'

/** Passwords follow the agreed `FirstName@1234` convention. */
function passwordFor(firstName: string): string {
  return `${firstName}${PASSWORD_SUFFIX}`
}

export const HARDCODED_ACCOUNTS: readonly HardcodedAccount[] = [
  {
    email: 'o.ingawale@handt.ai',
    name: 'Onkar Ingawale',
    role: 'admin',
    password: passwordFor('Onkar'),
  },
  {
    email: 'e.nagarkar@handt.ai',
    name: 'Esha Nagarkar',
    role: 'developer',
    developerId: 'DEV001',
    password: passwordFor('Esha'),
  },
  {
    email: 'm.gawade@handt.ai',
    name: 'Mayuri Gawade',
    role: 'developer',
    developerId: 'DEV002',
    password: passwordFor('Mayuri'),
  },
  {
    email: 'r.shinde@handt.ai',
    name: 'Rutik Shinde',
    role: 'developer',
    developerId: 'DEV003',
    password: passwordFor('Rutik'),
  },
  {
    email: 's.anap@handt.ai',
    name: 'Saira Anap',
    role: 'developer',
    developerId: 'DEV004',
    password: passwordFor('Saira'),
  },
  {
    email: 's.shinde@handt.ai',
    name: 'Suyog Shinde',
    role: 'developer',
    developerId: 'DEV005',
    password: passwordFor('Suyog'),
  },
  {
    email: 'sh.deshmukh@handt.ai',
    name: 'Shubham Deshmukh',
    role: 'developer',
    developerId: 'DEV006',
    password: passwordFor('Shubham'),
  },
  {
    email: 'a.sarsamkar@handt.ai',
    name: 'Akshaykumar Sarsamkar',
    role: 'developer',
    developerId: 'DEV007',
    password: passwordFor('Akshaykumar'),
  },
]
