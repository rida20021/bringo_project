import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';

type Mode = 'signIn' | 'signUp';

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const registration = useQuery(api.users.getRegistrationStatus, {});
  const navigate = useNavigate();

  const [requestedMode, setRequestedMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sign-up exists only for the one-time bootstrap; afterwards the auth backend
  // rejects it too, so this is not just a UI gate.
  const allowSignUp = registration?.allowSignUp ?? false;
  const mode: Mode = allowSignUp ? requestedMode : 'signIn';

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (mode === 'signUp' && name.trim().length < 2) {
      setError('Indiquez votre nom complet.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn('password', {
        email: email.trim(),
        password,
        flow: mode,
        ...(mode === 'signUp' ? { name: name.trim() } : {}),
      });
      navigate('/', { replace: true });
    } catch {
      setError(
        mode === 'signIn'
          ? 'Adresse e-mail ou mot de passe incorrect.'
          : 'Impossible de créer ce compte. Vérifiez l’adresse e-mail ou connectez-vous.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setRequestedMode(requestedMode === 'signIn' ? 'signUp' : 'signIn');
    setError(null);
    setPassword('');
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span className="brand-text">
            <span className="brand-name">Bringo</span>
            <span className="brand-sub">Money Flow</span>
          </span>
        </div>

        <div className="auth-pitch">
          <h1>
            Chaque dirham,
            <br />
            tracé jusqu’au reçu.
          </h1>
          <p>
            Le rapprochement du cash et des preuves TPE, du rapport TIKTAK jusqu’à
            l’approbation administrative.
          </p>
        </div>

        <ol className="auth-ledger" aria-label="Étapes du circuit cash">
          <li>
            <span>Dû par les livreurs</span>
            <span className="ledger-rule" aria-hidden="true" />
          </li>
          <li>
            <span>Encaissé par le superviseur</span>
            <span className="ledger-rule" aria-hidden="true" />
          </li>
          <li>
            <span>Déposé en banque, preuve approuvée</span>
            <span className="ledger-rule" aria-hidden="true" />
          </li>
        </ol>

        <p className="auth-note">Casablanca · Africa/Casablanca</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2>{mode === 'signIn' ? 'Connexion' : 'Créer le compte administrateur'}</h2>
          <p className="auth-intro">
            {mode === 'signIn'
              ? 'Accédez à votre espace livreur, superviseur ou administrateur.'
              : 'Le premier compte créé peut s’activer comme administrateur à l’étape suivante.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === 'signUp' ? (
              <label className="field">
                <span className="field-label">Nom complet</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            ) : null}

            <label className="field">
              <span className="field-label">Adresse e-mail</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Mot de passe</span>
              <input
                type="password"
                name="password"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="button button-primary button-block" disabled={submitting}>
              {submitting
                ? 'Vérification…'
                : mode === 'signIn'
                  ? 'Se connecter'
                  : 'Créer le compte'}
            </button>
          </form>

          <p className="auth-switch">
            {allowSignUp ? (
              <>
                {mode === 'signIn'
                  ? 'Premier démarrage ?'
                  : 'Vous avez déjà un compte ?'}{' '}
                <button type="button" className="link-button" onClick={switchMode}>
                  {mode === 'signIn' ? 'Créer le compte administrateur' : 'Se connecter'}
                </button>
              </>
            ) : (
              <span className="auth-footnote">
                Les comptes sont créés par l’administration. Si vous êtes livreur, contactez
                votre administrateur pour obtenir vos identifiants.
              </span>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
