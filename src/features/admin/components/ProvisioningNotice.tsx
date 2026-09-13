import type { ProvisioningNotice } from './provisioning-notice'

export function ProvisioningNoticeView({ notice }: { notice: ProvisioningNotice | null }) {
  return (
    <div aria-live="polite" role="status">
      {notice === null ? null : (
        <>
          <p className={notice.tone === 'problem' ? 'form__alert' : 'form__hint'}>
            {notice.message}
          </p>
          {notice.credentials === undefined ? null : (
            <div className="credentials">
              <p className="credentials__line">
                <span className="credentials__label">Email</span>
                <code>{notice.credentials.email}</code>
              </p>
              <p className="credentials__line">
                <span className="credentials__label">Temporary password</span>
                <code>{notice.credentials.password}</code>
              </p>
              <p className="credentials__note">
                Pass these on now — they are shown once and cannot be looked up again. The person
                must change this password at first login, and nothing else in the application will
                open until they do.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
