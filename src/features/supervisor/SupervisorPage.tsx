import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDateTime, formatMAD } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';
import { toast } from 'sonner';
import BulkDepositForm from './BulkDepositForm';
import SearchableSelect from '@/components/SearchableSelect';

/**
 * Searchable rider dropdown shared by supervisor forms.
 */
function RiderPicker({
  riders,
  riderId,
  onRiderIdChange,
}: {
  riders: Doc<'riders'>[];
  riderId: string;
  onRiderIdChange: (riderId: string) => void;
}) {
  return (
    <SearchableSelect
      label="Livreur"
      value={riderId}
      options={riders.map((rider) => ({ id: rider._id, name: rider.canonicalName }))}
      onChange={onRiderIdChange}
      placeholder={riders.length === 0 ? 'Aucun livreur disponible' : 'Sélectionner un livreur'}
      searchPlaceholder="Rechercher un livreur..."
      disabled={riders.length === 0}
    />
  );
}

export default function SupervisorPage() {
  const riders = useQuery(api.riders.getRiders, {});
  const vault = useQuery(api.deposits.getSupervisorVault);
  const createCashCollection = useMutation(api.deposits.createCashCollection);

  const [collectionRiderId, setCollectionRiderId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionNote, setCollectionNote] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  if (riders === undefined || vault === undefined) return <LoadingSpinner />;

  const activeRiders = riders;

  const handleCollectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!collectionRiderId) {
      toast.error('Sélectionnez un livreur.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(collectionAmount);
    if (amountCentimes === null || amountCentimes <= 0) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    const sourceReportDate = dateInputToTimestamp(todayDateInputValue());
    if (sourceReportDate === null) {
      toast.error('Date du rapport invalide.');
      return;
    }

    setCollectionSubmitting(true);
    try {
      await createCashCollection({
        riderId: collectionRiderId as Id<'riders'>,
        amount: amountCentimes,
        sourceReportDate,
        note: collectionNote.trim() || undefined,
      });

      toast.success(`Encaissement de ${formatMAD(amountCentimes)} enregistré dans votre coffre.`);
      setCollectionRiderId('');
      setCollectionAmount('');
      setCollectionNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setCollectionSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Supervision des Espèces</h1>
          <p className="page-sub">Coffre, encaissements livreurs et dépôts bancaires groupés</p>
        </div>
        <span className="page-tag">Superviseur</span>
      </header>

      {/* Task 6.6.4: Supervisor Vault */}
      <section className="panel" aria-labelledby="vault-title">
        <header className="panel-head">
          <div>
            <h2 id="vault-title">Mon Coffre (Espèces en main)</h2>
            <p className="panel-sub">
              Montant physique collecté auprès des livreurs actuellement sous votre garde.
            </p>
          </div>
          <span className="panel-count">
            {vault.heldCollections.length} encaissement(s) en caisse
          </span>
        </header>

        <div className="vault-summary-grid">
          <div className="vault-stat-card is-highlighted">
            <span className="vault-stat-label">Total en caisse (à déposer)</span>
            <span className="vault-stat-value amount" style={{ color: 'var(--primary)' }}>
              {formatMAD(vault.totalHeld)}
            </span>
            <span className="field-hint">
              Espèces physiques à déposer à la banque.
            </span>
          </div>
          <div className="vault-stat-card">
            <span className="vault-stat-label">Dépôts en attente admin</span>
            <span className="vault-stat-value amount">
              {formatMAD(vault.totalPending)}
            </span>
            <span className="field-hint">
              {vault.pendingCollections.length} encaissement(s) déposés, en attente de validation admin.
            </span>
          </div>
        </div>

        {vault.allVaultItems.length > 0 ? (
          <div className="vault-table-wrapper">
            <table className="chain-of-custody-table">
              <thead>
                <tr>
                  <th scope="col">Livreur</th>
                  <th scope="col" className="numeric">Montant</th>
                  <th scope="col">Heure de collecte</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {vault.allVaultItems.map((item) => (
                  <tr key={item.collectionId}>
                    <td>
                      <strong>{item.riderName}</strong>
                      {item.note ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                          {item.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="numeric amount">{formatMAD(item.amount)}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{formatDateTime(item.collectedAt)}</td>
                    <td>
                      {item.cashStatus === 'held_by_supervisor' ? (
                        <span className="badge badge-pending">
                          <span className="badge-dot" aria-hidden="true" /> En caisse
                        </span>
                      ) : item.cashStatus === 'deposited_pending' ? (
                        <span className="badge badge-pending" style={{ background: '#fef3c7', color: '#92400e' }}>
                          <span className="badge-dot" aria-hidden="true" /> Déposé (validation admin)
                        </span>
                      ) : (
                        <span className="badge badge-ok">
                          <span className="badge-dot" aria-hidden="true" /> Soldé
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p className="empty-title">Votre coffre est vide</p>
            <p className="empty-text">
              Utilisez le formulaire ci-dessous pour encaisser un livreur lorsqu’il vous remet ses espèces.
            </p>
          </div>
        )}
      </section>

      {/* Task 6.6.4: Cash Collection from Rider */}
      <section className="panel" aria-labelledby="collection-form-title">
        <header className="panel-head">
          <div>
            <h2 id="collection-form-title">Encaisser un livreur</h2>
            <p className="panel-sub">
              Enregistrez les espèces physiquement remises par un livreur (transfère la dette dans votre coffre).
            </p>
          </div>
        </header>

        <form className="rider-form" onSubmit={handleCollectionSubmit} noValidate>
          <RiderPicker
            riders={activeRiders}
            riderId={collectionRiderId}
            onRiderIdChange={setCollectionRiderId}
          />

          <label className="field">
            <span className="field-label">Montant encaissé (MAD)</span>
            <input
              type="text"
              name="collectionAmount"
              value={collectionAmount}
              onChange={(event) => setCollectionAmount(event.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Note interne (optionnel)</span>
            <input
              type="text"
              name="collectionNote"
              value={collectionNote}
              onChange={(event) => setCollectionNote(event.target.value)}
              placeholder="Ex. : Remis en mains propres à l’agence"
              autoComplete="off"
            />
          </label>

          <button
            type="submit"
            className="button button-primary button-block"
            disabled={collectionSubmitting}
          >
            {collectionSubmitting ? 'Enregistrement…' : 'Enregistrer l’encaissement'}
          </button>
        </form>
      </section>

      {/* Task 6.6.5: Bulk Bank Deposit */}
      <section className="panel" aria-labelledby="bulk-deposit-title">
        <header className="panel-head">
          <div>
            <h2 id="bulk-deposit-title">Dépôt bancaire groupé</h2>
            <p className="panel-sub">
              Cochez les encaissements couverts et joignez le reçu bancaire unique.
            </p>
          </div>
          <span className="panel-count">
            {vault.heldCollections.length} disponible(s)
          </span>
        </header>

        <BulkDepositForm heldCollections={vault.heldCollections} />
      </section>
    </div>
  );
}
