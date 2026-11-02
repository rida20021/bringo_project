import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import MarketImportPanel from './MarketImportPanel';
import { MOROCCAN_CITIES } from '@/lib/cities';

const PAGE_SIZE = 20;

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

function isKnownCity(city: string): boolean {
  return MOROCCAN_CITIES.some((candidate) => candidate === city);
}

export default function MarketsPage() {
  const markets = useQuery(api.markets.listMarkets, { includeInactive: true });
  const createMarket = useMutation(api.markets.createMarket);
  const updateMarket = useMutation(api.markets.updateMarket);

  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<Id<'markets'> | null>(null);
  const [editName, setEditName] = useState('');
  const [editExternalId, setEditExternalId] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPending, setEditPending] = useState(false);

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
    if (!trimmedName || !trimmedExternalId || !city) {
      setError('Le nom, l’identifiant externe et la ville sont obligatoires.');
      return;
    }

    setPending(true);
    try {
      await createMarket({ name: trimmedName, externalId: trimmedExternalId, city });
      setName('');
      setExternalId('');
      setCity('');
      setSuccess(`Marché « ${trimmedName} » ajouté.`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setPending(false);
    }
  };

  const handleToggleActive = async (market: (typeof markets)[number]) => {
    resetFeedback();
    if (
      market.isActive &&
      !window.confirm(
        `Archiver le marché « ${market.name} » ? Il ne sera plus proposé aux livreurs.`
      )
    ) {
      return;
    }

    try {
      await updateMarket({ marketId: market._id, isActive: !market.isActive });
      setSuccess(
        `Marché « ${market.name} » ${market.isActive ? 'archivé' : 'réactivé'}.`
      );
    } catch (err) {
      setError(readError(err));
    }
  };

  const beginEdit = (market: (typeof markets)[number]) => {
    resetFeedback();
    setEditingId(market._id);
    setEditName(market.name);
    setEditExternalId(market.externalId);
    setEditCity(market.city ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditExternalId('');
    setEditCity('');
  };

  const handleSaveEdit = async (market: (typeof markets)[number]) => {
    resetFeedback();
    const trimmedName = editName.trim();
    const trimmedExternalId = editExternalId.trim();
    if (!trimmedName || !trimmedExternalId || !editCity) {
      setError('Le nom, l’identifiant externe et la ville sont obligatoires.');
      return;
    }

    setEditPending(true);
    try {
      await updateMarket({
        marketId: market._id,
        name: trimmedName,
        externalId: trimmedExternalId,
        city: editCity,
      });
      setSuccess(`Marché « ${trimmedName} » mis à jour.`);
      cancelEdit();
    } catch (err) {
      setError(readError(err));
    } finally {
      setEditPending(false);
    }
  };

  const query = searchQuery.trim().toLocaleLowerCase('fr');
  const filteredMarkets = markets.filter((market) => {
    if (!query) return true;
    return (
      market.name.toLocaleLowerCase('fr').includes(query) ||
      market.externalId.toLocaleLowerCase('fr').includes(query) ||
      (market.city ?? '').toLocaleLowerCase('fr').includes(query)
    );
  });
  const displayedMarkets = filteredMarkets.slice(0, visibleCount);
  const hasMore = filteredMarkets.length > visibleCount;
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
            <p className="panel-sub">Le nom, l’identifiant externe et la ville sont obligatoires.</p>
          </div>
        </header>

        <form className="market-form" onSubmit={handleSubmit} noValidate>
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

          <label className="field">
            <span className="field-label">Ville</span>
            <select name="city" value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">Sélectionner une ville</option>
              {MOROCCAN_CITIES.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
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

      <MarketImportPanel />

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Marchés existants</h2>
            <p className="panel-sub">
              Les marchés archivés n’apparaissent plus dans le formulaire livreur.
            </p>
          </div>
          <span className="panel-count">{markets.length} marché(s)</span>
        </header>

        {markets.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun marché enregistré</p>
            <p className="empty-text">
              Ajoutez un premier marché ou importez un fichier pour le rendre disponible aux
              livreurs.
            </p>
          </div>
        ) : (
          <>
            <label className="field market-search">
              <span className="field-label">Rechercher</span>
              <input
                type="search"
                value={searchQuery}
                placeholder="Nom, identifiant externe ou ville…"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                  cancelEdit();
                }}
              />
            </label>

            {filteredMarkets.length === 0 ? (
              <div className="empty">
                <p className="empty-title">Aucun résultat</p>
                <p className="empty-text">Essayez un autre nom, identifiant ou ville.</p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Nom</th>
                        <th scope="col">Identifiant externe</th>
                        <th scope="col">Ville</th>
                        <th scope="col">État</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedMarkets.map((market) => {
                        const isEditing = editingId === market._id;
                        return (
                          <tr key={market._id} className={isEditing ? 'is-editing' : undefined}>
                            <td>
                              {isEditing ? (
                                <input
                                  className="table-edit-control"
                                  aria-label={`Nom de ${market.name}`}
                                  value={editName}
                                  onChange={(event) => setEditName(event.target.value)}
                                  disabled={editPending}
                                />
                              ) : (
                                market.name
                              )}
                            </td>
                            <td className={isEditing ? undefined : 'table-muted'}>
                              {isEditing ? (
                                <input
                                  className="table-edit-control"
                                  aria-label={`Identifiant externe de ${market.name}`}
                                  value={editExternalId}
                                  onChange={(event) => setEditExternalId(event.target.value)}
                                  disabled={editPending}
                                />
                              ) : (
                                market.externalId
                              )}
                            </td>
                            <td className={isEditing ? undefined : 'table-muted'}>
                              {isEditing ? (
                                <select
                                  className="table-edit-control"
                                  aria-label={`Ville de ${market.name}`}
                                  value={editCity}
                                  onChange={(event) => setEditCity(event.target.value)}
                                  disabled={editPending}
                                >
                                  <option value="">Sélectionner</option>
                                  {editCity && !isKnownCity(editCity) ? (
                                    <option value={editCity}>{editCity}</option>
                                  ) : null}
                                  {MOROCCAN_CITIES.map((option) => (
                                    <option value={option} key={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                market.city ?? '—'
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${market.isActive ? 'badge-ok' : 'badge-neutral'}`}
                              >
                                <span className="badge-dot" aria-hidden="true" />
                                {market.isActive ? 'Actif' : 'Archivé'}
                              </span>
                            </td>
                            <td>
                              <div className="table-actions">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="button-ghost"
                                      disabled={editPending}
                                      onClick={() => handleSaveEdit(market)}
                                    >
                                      {editPending ? 'Enregistrement…' : 'Enregistrer'}
                                    </button>
                                    <button
                                      type="button"
                                      className="button-ghost"
                                      disabled={editPending}
                                      onClick={cancelEdit}
                                    >
                                      Annuler
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="button-ghost"
                                      onClick={() => beginEdit(market)}
                                    >
                                      Modifier
                                    </button>
                                    <button
                                      type="button"
                                      className={`button-ghost${market.isActive ? ' is-danger' : ''}`}
                                      onClick={() => handleToggleActive(market)}
                                    >
                                      {market.isActive ? 'Archiver' : 'Réactiver'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasMore ? (
                  <div className="load-more">
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    >
                      Charger plus ({filteredMarkets.length - visibleCount} restant(s))
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
