import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { MENTOR } from '@constants/team.constants'
import { isAdmin } from '@services/auth/index'

import './Header.scss'

export function Header() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    void navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <div>
        <span className="header__eyebrow">Team workspace</span>
        <strong className="header__title">Team Progress Tracker</strong>
      </div>

      <div className="header__account">
        <div className="header__identity">
          <span>{user === null ? 'Mentor' : isAdmin(user) ? 'Mentor (Admin)' : 'Developer'}</span>
          <strong>{user?.name ?? MENTOR.name}</strong>
        </div>

        {user === null ? null : (
          <button className="header__sign-out" onClick={handleSignOut} type="button">
            Sign out
          </button>
        )}
      </div>
    </header>
  )
}
