import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';

/**
 * Placeholder rider home. The live-entry form and "my entries" list arrive in
 * Milestone 2; for now this only confirms the rider guard and mobile shell.
 */
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
        <p className="rider-eyebrow">Aujourd’hui</p>
        <section className="rider-card">
          <h1>Bonjour {user?.displayName ?? ''}</h1>
          <p className="rider-text">
            Votre espace de saisie arrive bientôt. Vous pourrez enregistrer vos commandes,
            choisir le marché et le mode de paiement, puis déposer vos justificatifs.
          </p>
          <button type="button" className="button button-primary button-block" disabled>
            Saisir une commande (bientôt)
          </button>
        </section>
      </main>
    </div>
  );
}
