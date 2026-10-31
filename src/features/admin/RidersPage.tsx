import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatShortDate } from '@/lib/format';

const MIN_PASSWORD_LENGTH = 8;

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

export default function RidersPage() {
  const riders = useQuery(api.users.listRiderUsers, {});
  const createRiderAccount = useAction(api.users.createRiderAccount);
  const setUserActive = useMutation(api.users.setUserActive);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (riders === undefined) return <LoadingSpinner />;

  const resetFeedback = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Le nom du livreur est obligatoire.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Saisissez une adresse e-mail valide.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }

    setPending(true);
    try {
      await createRiderAccount({
        displayName: trimmedName,
        email: trimmedEmail,
        password,
      });
      setSuccess(
        `Compte livreur « ${trimmedName} » créé. Transmettez-lui son e-mail et son mot de passe.`
      );
      setDisplayName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(readError(err));
    } finally {
      setPending(false);
    }
  };

  const handleToggleActive = async (rider: (typeof riders)[number]) => {
    resetFeedback();
    try {
      await setUserActive({ userId: rider.userId, isActive: !rider.isActive });
      setSuccess(
        `Compte de ${rider.displayName} ${rider.isActive ? 'désactivé' : 'réactivé'}.`
      );
    } catch (err) {
      setError(readError(err));
    }
  };

  const activeCount = riders.filter((rider) => rider.isActive).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Livreurs</h1>
          <p className="page-sub">
            Les comptes livreurs sont créés par l’administration. L’inscription publique est
            désactivée dès qu’un administrateur existe.
          </p>
        </div>
        <span className="page-tag">
          {activeCount} actif(s) / {riders.length}
        </span>
      </header>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Créer un compte livreur</h2>
            <p className="panel-sub">
              Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.
            </p>
          </div>
        </header>

        <form className="rider-admin-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Nom complet</span>
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Rida Alaoui"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="livreur@bringo.ma"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Mot de passe</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </label>

          <button type="submit" className="button button-primary" disabled={pending}>
            {pending ? 'Création…' : 'Créer le livreur'}
          </button>
        </form>

        <div aria-live="polite">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? <p className="form-success">{success}</p> : null}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Comptes livreurs</h2>
            <p className="panel-sub">
              Un compte désactivé ne peut plus se connecter ni saisir de commandes.
            </p>
          </div>
          <span className="panel-count">{riders.length} livreur(s)</span>
        </header>

        {riders.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun livreur enregistré</p>
            <p className="empty-text">
              Créez le premier compte avec le formulaire ci-dessus : le livreur pourra
              ensuite se connecter sur son espace mobile.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Créé le</th>
                  <th scope="col">État</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.userId}>
                    <td>{rider.displayName}</td>
                    <td className="table-muted">{rider.email ?? '—'}</td>
                    <td className="table-muted">{formatShortDate(rider.createdAt)}</td>
                    <td>
                      <span className={`badge ${rider.isActive ? 'badge-ok' : 'badge-neutral'}`}>
                        <span className="badge-dot" aria-hidden="true" />
                        {rider.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => handleToggleActive(rider)}
                        >
                          {rider.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
