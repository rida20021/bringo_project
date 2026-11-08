import { useState } from 'react';
import type { CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import {
  Calculator,
  ChevronDown,
  Eye,
  HandCoins,
  LayoutDashboard,
  Menu,
  Store,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatLongDate, initials, roleLabels } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';
import GlobalSearch from './GlobalSearch';

interface NavLeaf {
  to: string;
  label: string;
  icon?: LucideIcon;
}

interface NavItem {
  label: string;
  to?: string;
  icon?: LucideIcon;
  children?: NavLeaf[];
}

/**
 * Inline styles for the nested-sidebar primitives. Kept in the component
 * file so the refactor is self-contained; mirror them in the global
 * stylesheet when `rail-subnav` support is added there (see DESIGN_SYSTEM.md).
 */
const navLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
};

const navIconStyle: CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
};

const subNavStyle: CSSProperties = {
  marginTop: '0.125rem',
  marginLeft: '1rem',
  paddingLeft: '0.75rem',
  borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
};

const subLinkStyle: CSSProperties = {
  fontSize: '0.9em',
};

const chevronStyle = (open: boolean): CSSProperties => ({
  marginLeft: 'auto',
  flexShrink: 0,
  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: 'transform 150ms ease',
});



interface SidebarItemProps {
  item: NavItem;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

function SidebarItem({
  item,
  pathname,
  isOpen,
  onToggle,
  onNavigate,
}: SidebarItemProps) {
  const isActivePath = (to: string) =>
    pathname === to || pathname.startsWith(`${to}/`);

  const Icon = item.icon;

  if (!item.children) {
    return (
      <NavLink
        to={item.to ?? item.label}
        className={({ isActive }) => `rail-link${isActive ? ' is-active' : ''}`}
        style={navLinkStyle}
        onClick={onNavigate}
      >
        {Icon ? <Icon size={16} style={navIconStyle} /> : null}
        {item.label}
      </NavLink>
    );
  }

  const parentActive =
    (item.to ? isActivePath(item.to) : false) ||
    item.children.some((child) => isActivePath(child.to));

  return (
    <>
      <button
        type="button"
        className={`rail-link${parentActive ? ' is-active' : ''}`}
        style={navLinkStyle}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        {Icon ? <Icon size={16} style={navIconStyle} /> : null}
        {item.label}
        <ChevronDown size={14} style={chevronStyle(isOpen)} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className="rail-subnav"
          role="group"
          aria-label={item.label}
          style={subNavStyle}
        >
          {item.children.map((child) => {
            const ChildIcon = child.icon;
            return (
              <NavLink
                key={child.to}
                to={child.to}
                className={({ isActive }) =>
                  `rail-link rail-link--sub${isActive ? ' is-active' : ''}`
                }
                style={{ ...navLinkStyle, ...subLinkStyle }}
                onClick={onNavigate}
              >
                {ChildIcon ? (
                  <ChildIcon size={14} style={navIconStyle} />
                ) : null}
                {child.label}
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default function Layout() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const user = useQuery(api.users.getCurrentUser);
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  const closeSidebar = () => setIsSidebarOpen(false);

  if (user === undefined) return <LoadingSpinner />;

  const isAdmin = user?.role === 'admin';
  const displayName = user?.displayName ?? user?.email ?? 'Utilisateur';

  const navItems: NavItem[] = [];

  if (isAdmin) {
    navItems.push(
      { to: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { to: '/admin/overview', label: 'Vue d\'ensemble', icon: Eye },
      { to: '/admin/markets', label: 'Marchés', icon: Store },
      { to: '/admin/riders', label: 'Équipe', icon: Users },
      {
        label: 'Rapports',
        icon: Calculator,
        children: [
          { to: '/admin/reports/financials', label: 'Contrôle des montants', icon: Calculator }
        ]
      }
    );
  } else if (user?.role === 'supervisor') {
    navItems.push(
      { to: '/supervisor/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { to: '/supervisor/supervision', label: 'Collectes & Dépôts', icon: HandCoins }
    );
  }

  const isParentActive = (item: NavItem) =>
    (item.to
      ? pathname === item.to || pathname.startsWith(`${item.to}/`)
      : false) ||
    (item.children?.some(
      (child) =>
        pathname === child.to || pathname.startsWith(`${child.to}/`),
    ) ?? false);

  // Derived during render (no effect): a parent is open when the user
  // explicitly toggled it, otherwise it follows the active route so the
  // menu containing the current page is always expanded.
  const isParentOpen = (item: NavItem) =>
    openParents[item.label] ?? isParentActive(item);

  const toggleParent = (item: NavItem) => {
    setOpenParents((prev) => ({
      ...prev,
      [item.label]: !(prev[item.label] ?? isParentActive(item)),
    }));
  };

  // Mobile nav stays flat: a parent links to its own destination when it
  // has one, and its children are rendered right after it.
  const mobileLinks: NavLeaf[] = [];
  for (const item of navItems) {
    if (item.to) {
      mobileLinks.push({ to: item.to, label: item.label, icon: item.icon });
    }
    for (const child of item.children ?? []) {
      mobileLinks.push(child);
    }
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>

      {/* Sidebar backdrop — closes sidebar when tapped on mobile */}
      {isSidebarOpen ? (
        <div
          className="sidebar-backdrop is-visible"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      ) : null}

      <aside className={`rail${isSidebarOpen ? ' is-open' : ''}`}>
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
            <SidebarItem
              key={item.label}
              item={item}
              pathname={pathname}
              isOpen={isParentOpen(item)}
              onToggle={() => toggleParent(item)}
              onNavigate={closeSidebar}
            />
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
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label="Menu"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          {isAdmin && <GlobalSearch />}
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
        {mobileLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `mobile-link${isActive ? ' is-active' : ''}`
            }
          >
            {link.label}
          </NavLink>
        ))}
        <button type="button" className="mobile-link" onClick={handleSignOut}>
          Quitter
        </button>
      </nav>
    </div>
  );
}