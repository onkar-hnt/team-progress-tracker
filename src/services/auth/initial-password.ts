/**
 * The temporary password a newly provisioned account is issued.
 *
 * Accounts are created with a password derived from the person's name rather
 * than emailed an invitation, so that onboarding does not depend on the mail
 * service. The rule is therefore public knowledge by construction, and the
 * password protects nothing on its own — `profiles.must_change_password` is
 * what does, by holding the account on the change-password screen until this
 * password has been replaced.
 *
 * The rule, exactly:
 *
 *   1. Trim the name and split it on whitespace; take the first word.
 *   2. Remove every character that is not A-Z, a-z or 0-9. Case is kept as
 *      entered, so "Shubham Deshmukh" gives "Shubham".
 *   3. If fewer than three characters survive, use the whole name with the
 *      same characters removed instead, so a two-letter first name does not
 *      produce a password Supabase rejects for being under six characters.
 *   4. If that is still under three characters, use "Employee".
 *   5. Append "@123".
 *
 * "Shubham Deshmukh" -> "Shubham@123".
 *
 * Three copies of this rule exist, in three languages, and they must not
 * drift:
 *
 *   - here, to stop somebody re-entering the password they were given;
 *   - `initialPasswordFor` in the `provision-developer-user` Edge Function,
 *     which issues it;
 *   - `public.initial_password_for` in SQL, which is what actually decides
 *     whether the password has been replaced, and so is the authority.
 */
export function initialPasswordFor(name: string): string {
  const strip = (value: string) => value.replace(/[^A-Za-z0-9]/g, '')
  const [first = ''] = name.trim().split(/\s+/)

  const firstWord = strip(first)
  const whole = strip(name)

  const stem = firstWord.length >= 3 ? firstWord : whole.length >= 3 ? whole : 'Employee'

  return `${stem}@123`
}
