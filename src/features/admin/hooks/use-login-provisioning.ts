import { useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import type { ProvisionResult } from '@services/provisioning/provision-login'
import { isSupabaseConfigured } from '@services/supabase/index'

import {
  describeProvisionFailure,
  describeProvisionOutcome,
} from '../components/provisioning-notice'
import type { ProvisioningNotice } from '../components/provisioning-notice'

/** Provisioning requires Supabase Auth. */
export const CAN_PROVISION_LOGINS = isSupabaseConfigured()

interface LoginProvisioningOptions<TRecord> {
  /** Why this person cannot be given a login, or `null` when they can. */
  describeRefusal: (record: TRecord) => string | null

  nameOf: (record: TRecord) => string

  provision: (record: TRecord) => Promise<ProvisionResult>

  /** Appended to the notice when the record has only just been created. */
  newRecordReminder?: string
}

interface LoginProvisioning<TRecord> {
  notice: ProvisioningNotice | null

  requestLogin: (record: TRecord, isNewRecord?: boolean) => Promise<void>
}

/**
 * Creating a sign-in account for somebody on the roster.
 *
 * Employees and mentors differ only in what the endpoint is given and what the
 * refusal reads like, so the order of events lives here: the initial password
 * comes back once and cannot be fetched again, which is why a row action asks
 * for confirmation first and why the outcome is reported on the page rather
 * than in a snackbar that can be dismissed before it has been read.
 */
export function useLoginProvisioning<TRecord>({
  describeRefusal,
  nameOf,
  newRecordReminder = '',
  provision,
}: LoginProvisioningOptions<TRecord>): LoginProvisioning<TRecord> {
  const confirm = useConfirm()
  const [notice, setNotice] = useState<ProvisioningNotice | null>(null)

  const requestLogin = async (record: TRecord, isNewRecord = false) => {
    if (!CAN_PROVISION_LOGINS) return

    setNotice(null)

    const name = nameOf(record)
    const refusal = describeRefusal(record)

    if (refusal !== null) {
      setNotice({ tone: 'problem', message: `${name} was saved. ${refusal}` })
      return
    }

    if (!isNewRecord) {
      const isConfirmed = await confirm({
        title: 'Create a login?',
        message: `A sign-in account will be created for “${name}”. The initial password is shown here once and cannot be retrieved afterwards, so pass it on before you leave this screen.`,
        confirmLabel: 'Create login',
      })

      if (!isConfirmed) return
    }

    try {
      const outcome = describeProvisionOutcome(await provision(record), name)
      const reminder = isNewRecord ? newRecordReminder : ''

      setNotice({ tone: 'success', ...outcome, message: `${outcome.message}${reminder}` })
    } catch (error) {
      setNotice({
        tone: 'problem',
        message: `${name} was saved, but their login could not be set up. ${describeProvisionFailure(error)} Use “Create login” on their row to try again.`,
      })
    }
  }

  return { notice, requestLogin }
}
