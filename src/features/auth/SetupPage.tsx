import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function SetupPage() {
  const user = useQuery(api.users.getCurrentUser);
  const seedAdmin = useMutation(api.users.seedAdmin);
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user === undefined) return <LoadingSpinner />;
  if (user?.role) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await seedAdmin({ displayName: displayName.trim() || undefined });
      navigate('/admin/dashboard', { replace: true });
    } catch {
      setError(
        'L’activation a échoué. Un administrateur existe peut-être déjà : demandez-lui de vous attribuer un rôle.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="setup-page">
      <div className="setup-card">
        <span className="setup-step">Première mise en service</span>
        <h1>Activer le compte administrateur</h1>
        <p className="setup-text">
          Ce compte est connecté mais n’a pas encore de rôle. Tant qu’aucun administrateur
          n’existe, vous pouvez activer ce compte comme administrateur initial.
        </p>
        <p className="setup-account">
          Connecté avec <strong>{user?.email}</strong>
        </p>

        <form onSubmit={handleSubmit} className="setup-form">
          <label className="field">
            <span className="field-label">Nom affiché</span>
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Votre nom"
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="button button-primary button-block" disabled={submitting}>
            {submitting ? 'Activation…' : 'Activer comme administrateur'}
          </button>
        </form>

        <p className="setup-note">
          Une fois un administrateur actif, les autres comptes reçoivent leur rôle depuis
          l’administration.
        </p>
      </div>
    </main>
  );
}
