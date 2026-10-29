import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { formatLongDate, initials, roleLabels } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';

interface NavItem {
  to: string;
  label: string;
}

export default function Layout() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const user = useQuery(api.users.getCurrentUser);

  if (user === undefined) return <LoadingSpinner />;

  const isAdmin = user?.role === 'admin';
  const displayName = user?.displayName ?? user?.email ?? 'Utilisateur';
  const navItems: NavItem[] = [
    { to: '/supervisor/dashboard', label: 'Tableau de bord' },
    ...(isAdmin ? [{ to: '/admin/dashboard', label: 'Vue d’ensemble' }] : []),
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>

      <aside className="rail">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span className="brand-text">
            <span className="brand-name">Bringo</span>
            <span className="brand-sub">Money Flow</span>
          </span>
        </div>

        <nav className="rail-nav" aria-label="Navigation principale">
          <p className="rail-section">
            {isAdmin ? 'Supervision et administration' : 'Espace superviseur'}
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-footer">
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {initials(displayName)}
            </span>
            <span className="account-text">
              <span className="account-name">{displayName}</span>
              <span className="account-role">
                {user?.role ? roleLabels[user.role] : 'Profil incomplet'}
              </span>
            </span>
          </div>
          <button type="button" className="link-button" onClick={handleSignOut}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="topbar-context">
            {isAdmin ? 'Administration' : 'Supervision'}
          </span>
          <span className="topbar-date">{formatLongDate(Date.now())}</span>
        </header>

        <main className="main" id="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-link${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <button type="button" className="mobile-link" onClick={handleSignOut}>
          Quitter
        </button>
      </nav>
    </div>
  );
}
