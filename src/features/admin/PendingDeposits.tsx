import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDateTime, formatMAD } from '@/lib/format';
import { toast } from 'sonner';

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

export default function PendingDeposits() {
  const deposits = useQuery(api.deposits.listPendingBankDeposits, {});
  const currentUser = useQuery(api.users.getCurrentUser);
  const reviewDeposit = useMutation(api.deposits.reviewBankDeposit);

  const canReview = currentUser?.role === 'admin';

  const [rejectingId, setRejectingId] = useState<Id<'bankDeposits'> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<Id<'bankDeposits'> | null>(null);

  const cancelReject = () => {
    setRejectingId(null);
    setReason('');
    setError(null);
  };

  const handleApprove = async (depositId: Id<'bankDeposits'>) => {
    setError(null);
    setPendingId(depositId);
    try {
      await reviewDeposit({ depositId, action: 'approve' });
      toast.success('Dépôt approuvé.');
    } catch (err) {
      toast.error(readError(err));
    } finally {
      setPendingId(null);
    }
  };

  const handleReject = async (depositId: Id<'bankDeposits'>) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Indiquez un motif de rejet.');
      return;
    }

    setError(null);
    setPendingId(depositId);
    try {
      await reviewDeposit({ depositId, action: 'reject', reason: trimmedReason });
      setRejectingId(null);
      setReason('');
      toast.success('Dépôt rejeté.');
    } catch (err) {
      toast.error(readError(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="pending-deposits-title">
      <header className="panel-head">
        <div>
          <h2 id="pending-deposits-title">Dépôts bancaires à approuver</h2>
          <p className="panel-sub">
            Dépôts enregistrés par les superviseurs, à valider.
          </p>
        </div>
        <span className="panel-count">
          {deposits === undefined ? 'Chargement…' : `${deposits.length} à traiter`}
        </span>
      </header>

      <div aria-live="polite">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {deposits === undefined ? (
        <p className="review-loading">Chargement des dépôts…</p>
      ) : deposits.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucun dépôt en attente</p>
          <p className="empty-text">
            Les dépôts enregistrés par les superviseurs apparaîtront ici jusqu’à leur
            approbation ou leur rejet.
          </p>
        </div>
      ) : (
        <ul className="review-list">
          {deposits.map((deposit) => {
            const isPending = pendingId === deposit.depositId;
            const expectedAmount = deposit.expectedAmount ?? null;
            const shortfall =
              expectedAmount === null ? null : Math.max(0, expectedAmount - deposit.amount);
            const isBulk = deposit.isBulk === true;

            return (
              <li className="review-card" key={deposit.depositId}>
                <div className="review-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="review-command">
                      {isBulk
                        ? `Dépôt groupé (${deposit.collections.length} encaissement(s))`
                        : (deposit.rider?.name ?? 'Livreur inconnu')}
                    </span>
                    {isBulk ? (
                      <span className="badge badge-ok" style={{ background: '#ede9fe', color: 'var(--primary)' }}>
                        Chaîne de garde
                      </span>
                    ) : null}
                  </div>
                  <span className="amount">{formatMAD(deposit.amount)}</span>
                </div>
                <p className="review-rider">
                  Superviseur : <strong>{deposit.supervisor.displayName}</strong>
                </p>
                {expectedAmount !== null ? (
                  <p className="review-meta">
                    Attendu : <span className="amount">{formatMAD(expectedAmount)}</span>
                    {' · '}Déposé : <span className="amount">{formatMAD(deposit.amount)}</span>
                    {shortfall !== null ? (
                      <>
                        {' · '}Écart :{' '}
                        <span className={`amount ${shortfall > 0 ? 'review-shortfall' : ''}`}>
                          {formatMAD(shortfall)}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <p className="review-meta">
                  <span className="badge badge-pending">
                    <span className="badge-dot" aria-hidden="true" />
                    En attente
                  </span>{' '}
                  · enregistré le {formatDateTime(deposit.depositDate)}
                </p>

                {/* Chain of custody breakdown for bulk deposits */}
                {isBulk && deposit.collections.length > 0 ? (
                  <div className="vault-table-wrapper" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                    <table className="chain-of-custody-table">
                      <thead>
                        <tr>
                          <th scope="col">Livreur</th>
                          <th scope="col" className="numeric">Montant</th>
                          <th scope="col">Date collecte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposit.collections.map((col) => (
                          <tr key={col.collectionId}>
                            <td><strong>{col.riderName}</strong></td>
                            <td className="numeric amount">{formatMAD(col.amount)}</td>
                            <td style={{ fontSize: '0.8125rem' }}>{formatDateTime(col.collectedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="review-evidence">
                  {deposit.receiptUrl ? (
                    <a
                      href={deposit.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="review-link"
                    >
                      Voir le reçu {isBulk ? 'bancaire unique' : ''}
                    </a>
                  ) : (
                    <span className="review-file">Reçu indisponible</span>
                  )}
                </div>

                {canReview ? (
                  rejectingId === deposit.depositId ? (
                    <div className="review-reject">
                      <label className="field">
                        <span className="field-label">Motif du rejet (obligatoire)</span>
                        <textarea
                          name="rejectionReason"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Ex. : reçu illisible, montant incorrect…"
                        />
                      </label>
                      <div className="review-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={isPending}
                          onClick={() => handleReject(deposit.depositId)}
                        >
                          {isPending ? 'Rejet…' : 'Confirmer le rejet'}
                        </button>
                        <button
                          type="button"
                          className="button-ghost"
                          disabled={isPending}
                          onClick={cancelReject}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="review-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={pendingId !== null}
                        onClick={() => handleApprove(deposit.depositId)}
                      >
                        {isPending
                          ? 'Validation…'
                          : shortfall !== null && shortfall > 0
                            ? 'Approuver avec écart'
                            : isBulk
                              ? `Approuver et solder (${deposit.collections.length} livreurs)`
                              : 'Approuver'}
                      </button>
                      <button
                        type="button"
                        className="button-ghost is-danger"
                        disabled={pendingId !== null}
                        onClick={() => {
                          setRejectingId(deposit.depositId);
                          setReason('');
                          setError(null);
                        }}
                      >
                        Rejeter
                      </button>
                    </div>
                  )
                ) : (
                  <p className="review-meta">Réservé aux administrateurs.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
