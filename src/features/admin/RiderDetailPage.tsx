import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatusBadge from '@/components/StatusBadge';
import {
  formatDateTime,
  formatLongDate,
  formatMAD,
  paymentMethodLabels,
  roleLabels,
} from '@/lib/format';
import { toast } from 'sonner';

const TEMPORARY_PASSWORD_LENGTH = 16;
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NUMBERS = '23456789';
const SYMBOLS = '!@#$%*-_';
const ALL_PASSWORD_CHARACTERS = LOWERCASE + UPPERCASE + NUMBERS + SYMBOLS;

function randomCharacter(characters: string): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return characters[value[0] % characters.length];
}

function generateTemporaryPassword(): string {
  const characters = [
    randomCharacter(LOWERCASE),
    randomCharacter(UPPERCASE),
    randomCharacter(NUMBERS),
    randomCharacter(SYMBOLS),
  ];

  while (characters.length < TEMPORARY_PASSWORD_LENGTH) {
    characters.push(randomCharacter(ALL_PASSWORD_CHARACTERS));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    const swapIndex = randomValue[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join('');
}

export default function RiderDetailPage() {
  const { riderId } = useParams<{ riderId: string }>();
  const data = useQuery(
    api.users.getRiderProfileData,
    riderId ? { riderUserId: riderId as Id<'users'> } : 'skip'
  );
  const resetRiderPassword = useAction(api.users.resetRiderPassword);

  const [showReset, setShowReset] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [resetPending, setResetPending] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  if (!riderId) {
    return (
      <div className="notice-page">
        <p className="notice-code">Livreur introuvable</p>
        <h1>Profil indisponible</h1>
        <Link className="button button-primary" to="/admin/riders">
          Retour à l’Équipe
        </Link>
      </div>
    );
  }

  if (data === undefined) return <LoadingSpinner />;

  if (data === null) {
    return (
      <div className="notice-page">
        <p className="notice-code">Livreur introuvable</p>
        <h1>Ce profil n’existe pas</h1>
        <p className="notice-text">
          Le compte a peut-être changé de rôle ou n’est plus disponible.
        </p>
        <Link className="button button-primary" to="/admin/riders">
          Retour à l’Équipe
        </Link>
      </div>
    );
  }

  const openResetDialog = () => {
    setTemporaryPassword(generateTemporaryPassword());
    setResetComplete(false);
    setShowReset(true);
  };

  const closeResetDialog = () => {
    if (resetPending) return;
    setShowReset(false);
    setTemporaryPassword('');
    setResetComplete(false);
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      toast.success('Mot de passe temporaire copié.');
    } catch {
      toast.error('Copie impossible. Sélectionnez le mot de passe manuellement.');
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetPending(true);
    try {
      await resetRiderPassword({
        riderUserId: data.profile.userId,
        temporaryPassword,
      });
      setResetComplete(true);
      toast.success('Mot de passe réinitialisé et sessions fermées.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'La réinitialisation a échoué.');
    } finally {
      setResetPending(false);
    }
  };

  const accountStatus = data.profile.isArchived
    ? 'Archivé'
    : data.profile.isActive
      ? 'Actif'
      : 'Inactif';

  return (
    <div className="page rider-detail-page">
      <Link className="rider-detail-back" to="/admin/riders">
        <span aria-hidden="true">←</span> Retour à l’Équipe
      </Link>

      <header className="rider-detail-head">
        <div>
          <div className="rider-detail-identity-line">
            <h1>{data.profile.name}</h1>
            <span
              className={`badge ${
                data.profile.isArchived || !data.profile.isActive ? 'badge-neutral' : 'badge-ok'
              }`}
            >
              <span className="badge-dot" aria-hidden="true" />
              {accountStatus}
            </span>
          </div>
          <p className="page-sub">
            {data.profile.email} · {roleLabels[data.profile.role]}
          </p>
          <p className="rider-detail-business-date">
            Journée opérationnelle du {formatLongDate(data.businessDate).toLocaleLowerCase('fr')}
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={openResetDialog}
          disabled={data.profile.isArchived}
          title={data.profile.isArchived ? 'Restaurez le compte avant de réinitialiser son mot de passe.' : undefined}
        >
          Réinitialiser le mot de passe
        </button>
      </header>

      <section className="rider-detail-ledger" aria-label="Situation du livreur">
        <div className={`rider-debt ${data.profile.debtBalance > 0 ? 'has-debt' : ''}`}>
          <span className="rider-debt-label">Dette en cours</span>
          <strong>{formatMAD(data.profile.debtBalance)}</strong>
          <span className="rider-debt-note">
            {data.profile.debtBalance > 0
              ? 'Montant dû à l’entreprise'
              : 'Aucune dette enregistrée'}
          </span>
        </div>

        <div className="rider-detail-stats">
          <div className="rider-detail-stat">
            <span>Commandes</span>
            <strong>{data.stats.entryCount}</strong>
          </div>
          <div className="rider-detail-stat">
            <span>Total saisi</span>
            <strong>{formatMAD(data.stats.totalAmount)}</strong>
          </div>
          <div className="rider-detail-stat">
            <span>Espèces</span>
            <strong>{formatMAD(data.stats.cashAmount)}</strong>
          </div>
          <div className="rider-detail-stat">
            <span>TPE</span>
            <strong>{formatMAD(data.stats.tpeAmount)}</strong>
          </div>
          <div className="rider-detail-stat">
            <span>Carte en ligne</span>
            <strong>{formatMAD(data.stats.cardAmount)}</strong>
          </div>
        </div>
      </section>

      {/* Task 6.6.2: Cash Chain of Custody & Live Feed */}
      <section className="panel" aria-labelledby="cash-chain-title">
        <header className="panel-head">
          <div>
            <h2 id="cash-chain-title">Chaîne de garde des espèces</h2>
            <p className="panel-sub">
              Circuit de transmission du cash : Livreur → Superviseur (Coffre) → Banque → Validation.
            </p>
          </div>
          {data.cashObligation.status === 'red' ? (
            <span className="badge badge-pending" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171' }}>
              🔴 Doit {formatMAD(data.cashObligation.cashOwed)}
            </span>
          ) : data.cashObligation.status === 'yellow' ? (
            <span className="badge badge-pending" style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #facc15' }}>
              🟡 En cours ({formatMAD(data.cashObligation.heldBySupervisor + data.cashObligation.depositedPending)})
            </span>
          ) : (
            <span className="badge badge-ok">
              🟢 Soldé
            </span>
          )}
        </header>

        <div className="vault-summary-grid">
          <div className="vault-stat-card">
            <span className="vault-stat-label">Total espèces dues</span>
            <span className="vault-stat-value amount">{formatMAD(data.cashObligation.totalCashDue)}</span>
            <span className="field-hint">Commandes et saisies cash</span>
          </div>
          <div className="vault-stat-card">
            <span className="vault-stat-label">Encaissé par superviseur</span>
            <span className="vault-stat-value amount">{formatMAD(data.cashObligation.totalCollected)}</span>
            <span className="field-hint">Remis physiquement au superviseur</span>
          </div>
          <div className="vault-stat-card">
            <span className="vault-stat-label">En coffre superviseur</span>
            <span className="vault-stat-value amount">{formatMAD(data.cashObligation.heldBySupervisor)}</span>
            <span className="field-hint">En attente de dépôt bancaire</span>
          </div>
          <div className="vault-stat-card">
            <span className="vault-stat-label">Déposé et soldé</span>
            <span className="vault-stat-value amount">{formatMAD(data.cashObligation.clearedAmount)}</span>
            <span className="field-hint">Validé par l’administration</span>
          </div>
        </div>

        {data.todayCollections.length > 0 ? (
          <div className="vault-table-wrapper" style={{ marginTop: '1rem' }}>
            <table className="chain-of-custody-table">
              <thead>
                <tr>
                  <th scope="col">Superviseur ayant encaissé</th>
                  <th scope="col" className="numeric">Montant</th>
                  <th scope="col">Date de remise</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.todayCollections.map((col) => (
                  <tr key={col.collectionId}>
                    <td><strong>{col.supervisorName}</strong></td>
                    <td className="numeric amount">{formatMAD(col.amount)}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{formatDateTime(col.collectedAt)}</td>
                    <td>
                      {col.cashStatus === 'held_by_supervisor' ? (
                        <span className="badge badge-pending">En coffre</span>
                      ) : col.cashStatus === 'deposited_pending' ? (
                        <span className="badge badge-pending" style={{ background: '#fef3c7', color: '#92400e' }}>
                          Dépôt en validation
                        </span>
                      ) : (
                        <span className="badge badge-ok">Soldé</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2>Entrées de la journée</h2>
              <span className="mode-badge mode-badge-live">
                <span aria-hidden="true">📡</span> Flux direct
              </span>
            </div>
            <p className="panel-sub">Commandes saisies en direct par ce livreur.</p>
          </div>
          <span className="panel-count">{data.liveEntries.length} entrée(s)</span>
        </header>

        {data.liveEntries.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucune entrée pour cette journée</p>
            <p className="empty-text">Les nouvelles commandes apparaîtront ici en temps réel.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Commande</th>
                  <th scope="col">Marché</th>
                  <th scope="col">Paiement</th>
                  <th scope="col">Saisie</th>
                  <th scope="col">Justificatif</th>
                  <th scope="col" className="numeric">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.liveEntries.map((entry) => {
                  const receipt = [...entry.receipts].sort(
                    (first, second) => second.createdAt - first.createdAt
                  )[0];
                  return (
                    <tr key={entry._id}>
                      <td className="rider-detail-command">#{entry.commandId}</td>
                      <td>{entry.marketName}</td>
                      <td>{paymentMethodLabels[entry.paymentMethod]}</td>
                      <td className="table-muted">{formatDateTime(entry.createdAt)}</td>
                      <td>
                        {receipt ? (
                          <div className="rider-receipt-status">
                            <StatusBadge status={receipt.status} />
                            {receipt.url ? (
                              <a href={receipt.url} target="_blank" rel="noreferrer">
                                Voir
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="table-muted">—</span>
                        )}
                      </td>
                      <td className="numeric amount">{formatMAD(entry.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Reçus TPE récents</h2>
            <p className="panel-sub">Les dix derniers justificatifs transmis par le livreur.</p>
          </div>
          <span className="panel-count">{data.recentTpeReceipts.length} reçu(s)</span>
        </header>

        {data.recentTpeReceipts.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun reçu TPE</p>
            <p className="empty-text">Les prochains justificatifs TPE apparaîtront ici.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Commande</th>
                  <th scope="col">Marché</th>
                  <th scope="col">Déposé le</th>
                  <th scope="col">État</th>
                  <th scope="col">Preuve</th>
                  <th scope="col" className="numeric">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTpeReceipts.map((receipt) => (
                  <tr key={receipt.receiptId}>
                    <td className="rider-detail-command">#{receipt.entry.commandId}</td>
                    <td>{receipt.entry.marketName}</td>
                    <td className="table-muted">{formatDateTime(receipt.createdAt)}</td>
                    <td>
                      <StatusBadge status={receipt.status} />
                      {receipt.status === 'rejected' && receipt.rejectionReason ? (
                        <p className="rider-receipt-reason">{receipt.rejectionReason}</p>
                      ) : null}
                    </td>
                    <td>
                      {receipt.url ? (
                        <a href={receipt.url} target="_blank" rel="noreferrer">
                          {receipt.fileName}
                        </a>
                      ) : (
                        <span className="table-muted">Indisponible</span>
                      )}
                    </td>
                    <td className="numeric amount">{formatMAD(receipt.entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showReset ? (
        <div className="modal-backdrop" role="presentation" onClick={closeResetDialog}>
          <div
            className="modal-card rider-reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2 id="reset-password-title">Réinitialiser le mot de passe</h2>
                <p className="panel-sub">Compte de {data.profile.name}</p>
              </div>
              <button
                type="button"
                className="button-ghost"
                onClick={closeResetDialog}
                disabled={resetPending}
              >
                Fermer
              </button>
            </header>

            <form className="rider-reset-form" onSubmit={handlePasswordReset}>
              <p className="rider-reset-warning">
                Toutes les sessions ouvertes seront fermées. Transmettez ce mot de passe au
                livreur par un canal sécurisé.
              </p>

              <div className="temporary-password-box">
                <span>Mot de passe temporaire</span>
                <code>{temporaryPassword}</code>
                <div className="temporary-password-actions">
                  <button type="button" className="button-ghost" onClick={handleCopyPassword}>
                    Copier
                  </button>
                  {!resetComplete ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                    >
                      Regénérer
                    </button>
                  ) : null}
                </div>
              </div>

              {resetComplete ? (
                <p className="form-success">
                  Mot de passe modifié. Copiez-le avant de fermer cette fenêtre : il ne sera plus
                  affiché ensuite.
                </p>
              ) : (
                <div className="rider-reset-actions">
                  <button type="submit" className="button button-primary" disabled={resetPending}>
                    {resetPending ? 'Réinitialisation…' : 'Confirmer la réinitialisation'}
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={closeResetDialog}
                    disabled={resetPending}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
