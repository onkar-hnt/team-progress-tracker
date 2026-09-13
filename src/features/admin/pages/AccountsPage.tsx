import { useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { useAccounts, useSetAccountState } from '@hooks/use-accounts'
import { useTableSort } from '@hooks/use-table-sort'
import { useRosterDevelopers, useRosterMentors } from '@hooks/use-work-tracker'
import type { Account } from '@services/accounts/account.service'
import { areAccountsAvailable } from '@services/accounts/account.service'
import { USER_ROLE_LABELS } from '@models/user.model'
import { formatLongDate } from '@utils/date.utils'
import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table.utils'

import './AccountsPage.scss'

/**
 * The logins, and the one screen where they are turned off.
 *
 * Everything else in the administration area is about people: employees, mentors,
 * the projects they work on. This is about their accounts, which is a different
 * list even though it names the same team — a person can exist without a login, a
 * login can outlast somebody's place on the roster, and until this screen existed
 * the second of those was invisible and unfixable from inside the application.
 *
 * ## What it joins together
 *
 * Three sources, because no one of them answers the question on its own.
 * `profiles` says whether somebody can sign in and what they see. The employee
 * and mentor rosters say who they are and whether they are still with the team.
 * Reading them together is what surfaces the state worth acting on: a person
 * marked inactive on the roster whose login still works.
 *
 * That was previously left to a hint on the Employees form, which explained that
 * unticking Active does not revoke a login and left the reader with nothing to do
 * about it. The hint now points here.
 *
 * ## What it does not do
 *
 * No creating and no deleting. A login is created against a person's record, on
 * the Employees or Mentors screen, because that is where the record it attaches to
 * is; and nothing here deletes an auth account, because a deleted account takes
 * its profile with it and the roster rows that pointed at it would be left
 * claiming a login that never existed. Disabling is the reversible form of the same
 * intent, and it is what this offers.
 */

type SortKey = 'created' | 'email' | 'name' | 'records' | 'roster' | 'signIn' | 'role'

/** What the roster knows about the person behind a login. */
interface RosterFacts {
  /** As it reads in the table: "Employee", "Mentor", "Employee and mentor". */
  records: string

  /**
   * Whether every record naming them is still active.
   *
   * False is the interesting case, and the reason this screen exists: somebody
   * marked as having left, whose login nobody remembered to disable.
   */
  isOnRoster: boolean
}

/**
 * One column at a time, ascending.
 *
 * A factory, because two of the columns are about the roster rather than the
 * account, and the roster arrives from two other queries joined in the screen.
 */
function compareAccountsBy(rosterOf: (account: Account) => RosterFacts | undefined) {
  return (left: Account, right: Account, key: SortKey): number => {
    switch (key) {
      case 'name':
        return compareText(left.name, right.name)
      case 'email':
        return compareText(left.email, right.email)
      case 'role':
        return compareText(USER_ROLE_LABELS[left.role], USER_ROLE_LABELS[right.role])
      case 'records':
        return compareText(rosterOf(left)?.records, rosterOf(right)?.records)
      case 'roster':
        // Accounts attached to no record at all sort last, after both the active
        // and the inactive: an administrator's login is not part of the question
        // this column is being sorted to answer.
        return compareFlag(
          rosterOf(left)?.isOnRoster ?? false,
          rosterOf(right)?.isOnRoster ?? false,
        )
      case 'signIn':
        return compareFlag(left.isActive, right.isActive)
      case 'created':
        // ISO timestamps, so text order is time order.
        return compareText(left.createdAt, right.createdAt)
    }
  }
}

export function AccountsPage() {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const { user } = useAuth()

  const [search, setSearch] = useState('')
  const { sort, toggle } = useTableSort<SortKey>({ key: 'name', direction: 'asc' }, ['created'])

  const accountsQuery = useAccounts()
  const developersQuery = useRosterDevelopers()
  const mentorsQuery = useRosterMentors()
  const setAccountState = useSetAccountState()

  // Nothing to draw and nothing to explain away: the offline providers have no
  // auth accounts at all, so the honest answer is that this screen does not apply
  // rather than an empty table.
  if (!areAccountsAvailable()) {
    return (
      <PagePlaceholder
        description="Logins are Supabase accounts, and this deployment is reading its data from somewhere else. Switch the data source to Supabase to administer them."
        title="Logins are not used here"
      />
    )
  }

  const rosterByProfile = new Map<string, RosterFacts>()

  for (const developer of developersQuery.data ?? []) {
    if (developer.profileId === undefined) continue

    rosterByProfile.set(developer.profileId, {
      records: 'Employee',
      isOnRoster: developer.active,
    })
  }

  for (const mentor of mentorsQuery.data ?? []) {
    if (mentor.profileId === undefined) continue

    const existing = rosterByProfile.get(mentor.profileId)

    // One person, both records. Their place on the roster is the conjunction of
    // the two: a mentor still mentoring is still with the team even if their
    // employee row was retired.
    rosterByProfile.set(mentor.profileId, {
      records: existing === undefined ? 'Mentor' : 'Employee and mentor',
      isOnRoster: (existing?.isOnRoster ?? false) || mentor.active,
    })
  }

  const isSelf = (account: Account) => account.email === user?.email

  /**
   * The write, and what is said afterwards.
   *
   * Passed to the dialog as its `action`, so the dialog stays open and busy until
   * the server has answered — a second press cannot land, and the list behind is
   * not read back before the change has settled. A rejection is swallowed here
   * because `useSetAccountState` has already reported it.
   */
  const applyStateChange = async (account: Account, isActive: boolean) => {
    const result = await setAccountState
      .mutateAsync({ profileId: account.profileId, isActive })
      .catch(() => null)

    if (result === null) return

    if (result.warning !== undefined) {
      // Something did change, so this is not an error — but it is not all of what
      // was asked for either, and it needs an instruction rather than a tick.
      snackbar.warning(result.warning, { duration: 0 })
      return
    }

    if (result.unchanged === true) {
      snackbar.info(`${result.name}’s login was already ${isActive ? 'enabled' : 'disabled'}.`)
      return
    }

    snackbar.success(
      isActive
        ? `${result.name} can sign in again.`
        : `${result.name} can no longer sign in. Any open session of theirs stops working within the hour.`,
    )
  }

  const askThenChange = async (account: Account, isActive: boolean) => {
    const details = isActive
      ? {
          title: 'Enable this login?',
          message: `${account.name} will be able to sign in again with the password they already have. If they no longer know it, reset it from your profile screen afterwards.`,
          confirmLabel: 'Enable',
        }
      : {
          title: 'Disable this login?',
          message: `${account.name} will not be able to sign in, and a session they already have open will stop working within the hour. Nothing they have recorded is affected — their work, feedback and assignments all stay — and you can enable the login again at any time.`,
          confirmLabel: 'Disable',
          isDestructive: true,
        }

    await confirm({ ...details, action: async () => applyStateChange(account, isActive) })
  }

  const accounts = accountsQuery.data ?? []

  const strandedCount = accounts.filter((account) => {
    const roster = rosterByProfile.get(account.profileId)
    return account.isActive && roster !== undefined && !roster.isOnRoster
  }).length

  // Not memoised, unlike the other tables that do this. The join above is rebuilt
  // every render anyway — it depends on two queries and is cheap for a team-sized
  // roster — so a `useMemo` here would be a dependency on a map that is new each
  // time, which memoises nothing and only looks like it does.
  const visible = sortRows(
    accounts.filter((account) => matchesSearch([account.name, account.email], search)),
    sort,
    compareAccountsBy((account) => rosterByProfile.get(account.profileId)),
    (left, right) => compareText(left.name, right.name),
  )

  return (
    <div className="accounts-page">
      <Panel
        description="Who can sign in, what they see, and whether their account is still in use."
        isPageHeading
        title="Logins"
      >
        <p className="accounts-page__note">
          A login is created against somebody’s employee or mentor record, on those screens.
          Disabling one here refuses every future sign-in and ends any session already open, and
          keeps every record the person has ever written. Administrator accounts are not
          administered from here, and neither is your own.
        </p>
      </Panel>

      {strandedCount === 0 ? null : (
        <div className="accounts-page__alert" role="status">
          {strandedCount === 1
            ? 'One person is marked inactive on the roster but can still sign in.'
            : `${String(strandedCount)} people are marked inactive on the roster but can still sign in.`}
        </div>
      )}

      <Panel
        description="Read from the accounts themselves, alongside the employee and mentor records they are attached to."
        fills={visible.length > 0}
        title="All logins"
      >
        {accountsQuery.error !== null ? (
          <ErrorState
            message={`The logins could not be loaded: ${accountsQuery.error.message}`}
            onRetry={() => void accountsQuery.refetch()}
          />
        ) : accountsQuery.isPending ? (
          <Skeleton label="Loading logins…" rows={5} />
        ) : accounts.length === 0 ? (
          <p className="accounts-page__empty">
            No logins have been created yet. Add an employee or a mentor, then use “Create login” on
            their row.
          </p>
        ) : (
          <>
            <TableSearch
              hint="Name or email"
              matchCount={visible.length}
              noun="logins"
              onChange={setSearch}
              totalCount={accounts.length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="accounts-page__empty">
                No login matches “{search}”. Clear the search to see them all.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader columnKey="name" label="Name" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="email" label="Email" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="role" label="Sees" onSort={toggle} sort={sort} />
                      <SortableHeader
                        columnKey="records"
                        label="Records"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="roster"
                        label="On roster"
                        onSort={toggle}
                        sort={sort}
                      />
                      <th scope="col">Password</th>
                      <SortableHeader
                        columnKey="created"
                        label="Created"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="signIn"
                        label="Sign-in"
                        onSort={toggle}
                        sort={sort}
                      />
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((account) => {
                      const roster = rosterByProfile.get(account.profileId)
                      const isStranded =
                        account.isActive && roster !== undefined && !roster.isOnRoster

                      return (
                        <tr key={account.profileId}>
                          <td className="data-table__nowrap">
                            {account.name}
                            {isSelf(account) ? (
                              <span className="accounts-page__you">You</span>
                            ) : null}
                          </td>
                          <td className="data-table__nowrap">{account.email}</td>
                          <td>{USER_ROLE_LABELS[account.role]}</td>
                          {/* Absent means the account is attached to no employee or
                          mentor row — an administrator, ordinarily, since they own
                          no work. */}
                          <td>{roster?.records ?? '—'}</td>
                          <td>
                            {roster === undefined ? '—' : roster.isOnRoster ? 'Active' : 'Inactive'}
                          </td>
                          {/* Still holding one somebody else chose for them, which is
                          worth seeing next to a login that has never been used. */}
                          <td>{account.mustChangePassword ? 'Temporary' : 'Their own'}</td>
                          <td className="data-table__nowrap">
                            {formatLongDate(account.createdAt)}
                          </td>
                          <td>
                            <span
                              className={`accounts-page__state accounts-page__state--${
                                account.isActive ? 'active' : 'disabled'
                              }`}
                            >
                              {account.isActive ? 'Enabled' : 'Disabled'}
                            </span>
                            {isStranded ? (
                              <span className="accounts-page__flag">Off the roster</span>
                            ) : null}
                          </td>
                          <td>
                            <div className="row-actions">
                              {isSelf(account) || account.role === 'admin' ? (
                                <span className="accounts-page__muted">
                                  {isSelf(account) ? 'Your own account' : 'Administrator'}
                                </span>
                              ) : (
                                <Button
                                  disabled={setAccountState.isPending}
                                  onClick={() => void askThenChange(account, !account.isActive)}
                                  size="small"
                                  variant={account.isActive ? 'danger' : 'ghost'}
                                >
                                  {account.isActive ? 'Disable' : 'Enable'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
