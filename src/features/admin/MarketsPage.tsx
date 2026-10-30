import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';

function readError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Une erreur est survenue. Réessayez.';
}

export default function MarketsPage() {
  const markets = useQuery(api.markets.listMarkets, { includeInactive: true });
  const createMarket = useMutation(api.markets.createMarket);
  const updateMarket = useMutation(api.markets.updateMarket);
  const deleteMarket = useMutation(api.markets.deleteMarket);

  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (markets === undefined) return <LoadingSpinner />;

  const resetFeedback = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const trimmedName = name.trim();
    const trimmedExternalId = externalId.trim();
    if (!trimmedName || !trimmedExternalId) {
      setError('Le nom et l’identifiant externe sont obligatoires.');
      return;
    }

    setPending(true);
    try {
      await createMarket({ name: trimmedName, externalId: trimmedExternalId });
      setName('');
      setExternalId('');
      setSuccess(`Marché « ${trimmedName} » ajouté.`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setPending(false);
    }
  };

  const handleToggleActive = async (market: (typeof markets)[number]) => {
    resetFeedback();
    try {
      await updateMarket({ marketId: market._id, isActive: !market.isActive });
      setSuccess(
        `Marché « ${market.name} » ${market.isActive ? 'désactivé' : 'réactivé'}.`
      );
    } catch (err) {
      setError(readError(err));
    }
  };

  const handleDelete = async (market: (typeof markets)[number]) => {
    resetFeedback();
    const confirmed = window.confirm(
      `Supprimer définitivement le marché « ${market.name} » ?`
    );
    if (!confirmed) return;

    try {
      await deleteMarket({ marketId: market._id });
      setSuccess(`Marché « ${market.name} » supprimé.`);
    } catch (err) {
      setError(readError(err));
    }
  };

  const activeCount = markets.filter((market) => market.isActive).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Marchés</h1>
          <p className="page-sub">
            Référentiel utilisé par les livreurs pour choisir un marché.
          </p>
        </div>
        <span className="page-tag">
          {activeCount} actif(s) / {markets.length}
        </span>
      </header>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Ajouter un marché</h2>
            <p className="panel-sub">Le nom et l’identifiant externe sont obligatoires.</p>
          </div>
        </header>

        <form className="market-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Nom du marché</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Marché Central"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Identifiant externe</span>
            <input
              type="text"
              name="externalId"
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="MKT-001"
              autoComplete="off"
            />
          </label>

          <button type="submit" className="button button-primary" disabled={pending}>
            {pending ? 'Ajout…' : 'Ajouter'}
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
            <h2>Marchés existants</h2>
            <p className="panel-sub">
              Les marchés inactifs n’apparaissent plus dans le formulaire livreur.
            </p>
          </div>
          <span className="panel-count">{markets.length} marché(s)</span>
        </header>

        {markets.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun marché enregistré</p>
            <p className="empty-text">
              Ajoutez un premier marché avec le formulaire ci-dessus pour le rendre
              disponible aux livreurs.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Identifiant externe</th>
                  <th scope="col">État</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => (
                  <tr key={market._id}>
                    <td>{market.name}</td>
                    <td className="table-muted">{market.externalId}</td>
                    <td>
                      <span className={`badge ${market.isActive ? 'badge-ok' : 'badge-neutral'}`}>
                        <span className="badge-dot" aria-hidden="true" />
                        {market.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => handleToggleActive(market)}
                        >
                          {market.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                        <button
                          type="button"
                          className="button-ghost is-danger"
                          onClick={() => handleDelete(market)}
                        >
                          Supprimer
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
