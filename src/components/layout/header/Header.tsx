import './Header.scss'

export function Header() {
  return (
    <header className="header">
      <div><span className="header__eyebrow">Team workspace</span><strong className="header__title">Team Progress Tracker</strong></div>
      <div className="header__mentor"><span>Mentor</span><strong>Onkar Ingawale</strong></div>
    </header>
  )
}
