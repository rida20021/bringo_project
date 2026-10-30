import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import LiveEntryForm from './LiveEntryForm';
import MyEntries from './MyEntries';

/** Mobile rider home: live entry form plus today's entries. */
export default function RiderHome() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const user = useQuery(api.users.getCurrentUser);

  if (user === undefined) return <LoadingSpinner />;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="rider-shell">
      <header className="rider-header">
        <span className="rail-brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span className="brand-text">
            <span className="brand-name">Bringo</span>
            <span className="brand-sub">Espace livreur</span>
          </span>
        </span>
        <button type="button" className="link-button" onClick={handleSignOut}>
          Quitter
        </button>
      </header>

      <main className="rider-main">
        <div className="rider-intro">
          <p className="rider-eyebrow">Ma journée</p>
          <h1 className="rider-greeting">Bonjour {user?.displayName ?? ''}</h1>
        </div>

        <LiveEntryForm />
        <MyEntries />
      </main>
    </div>
  );
}
