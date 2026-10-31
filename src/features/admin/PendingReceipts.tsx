import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDateTime, formatMAD, paymentMethodLabels } from '@/lib/format';

const kindLabels: Record<'tpe' | 'bank_deposit', string> = {
  tpe: 'Reçu TPE',
  bank_deposit: 'Dépôt bancaire',
};

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

export default function PendingReceipts() {
  const receipts = useQuery(api.receipts.listPendingReceipts, {});
  const approveReceipt = useMutation(api.receipts.approveReceipt);
  const rejectReceipt = useMutation(api.receipts.rejectReceipt);

  const [rejectingId, setRejectingId] = useState<Id<'liveEntryReceipts'> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<Id<'liveEntryReceipts'> | null>(null);

  const cancelReject = () => {
    setRejectingId(null);
    setReason('');
    setError(null);
  };

  const handleApprove = async (receiptId: Id<'liveEntryReceipts'>) => {
    setError(null);
    setPendingId(receiptId);
    try {
      await approveReceipt({ receiptId });
    } catch (err) {
      setError(readError(err));
    } finally {
      setPendingId(null);
    }
  };

  const handleReject = async (receiptId: Id<'liveEntryReceipts'>) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Indiquez un motif de rejet.');
      return;
    }

    setError(null);
    setPendingId(receiptId);
    try {
      await rejectReceipt({ receiptId, reason: trimmedReason });
      setRejectingId(null);
      setReason('');
    } catch (err) {
      setError(readError(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="pending-receipts-title">
      <header className="panel-head">
        <div>
          <h2 id="pending-receipts-title">Preuves en attente</h2>
          <p className="panel-sub">
            Reçus TPE et dépôts bancaires téléversés par les livreurs, à valider.
          </p>
        </div>
        <span className="panel-count">
          {receipts === undefined ? 'Chargement…' : `${receipts.length} à traiter`}
        </span>
      </header>

      <div aria-live="polite">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {receipts === undefined ? (
        <p className="review-loading">Chargement des preuves…</p>
      ) : receipts.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune preuve en attente</p>
          <p className="empty-text">
            Les justificatifs téléversés par les livreurs apparaîtront ici jusqu’à leur
            approbation ou leur rejet.
          </p>
        </div>
      ) : (
        <ul className="review-list">
          {receipts.map((receipt) => {
            const isImage = receipt.mimeType.startsWith('image/');
            const isPending = pendingId === receipt.receiptId;

            return (
              <li className="review-card" key={receipt.receiptId}>
                <div className="review-main">
                  <div className="review-head">
                    <span className="review-command">#{receipt.entry.commandId}</span>
                    <span className="amount">{formatMAD(receipt.entry.amount)}</span>
                  </div>

                  <p className="review-rider">{receipt.rider.displayName}</p>
                  <p className="review-meta">
                    {receipt.entry.marketName} ·{' '}
                    {paymentMethodLabels[receipt.entry.paymentMethod]}
                  </p>
                  <p className="review-meta">
                    <span className="badge badge-pending">
                      <span className="badge-dot" aria-hidden="true" />
                      {kindLabels[receipt.kind]}
                    </span>{' '}
                    · déposé le {formatDateTime(receipt.createdAt)}
                  </p>

                  {rejectingId === receipt.receiptId ? (
                    <div className="review-reject">
                      <label className="field">
                        <span className="field-label">Motif du rejet (obligatoire)</span>
                        <textarea
                          name="rejectionReason"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Ex. : montant illisible, justificatif incomplet…"
                        />
                      </label>
                      <div className="review-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={isPending}
                          onClick={() => handleReject(receipt.receiptId)}
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
                        onClick={() => handleApprove(receipt.receiptId)}
                      >
                        {isPending ? 'Validation…' : 'Approuver'}
                      </button>
                      <button
                        type="button"
                        className="button-ghost is-danger"
                        disabled={pendingId !== null}
                        onClick={() => {
                          setRejectingId(receipt.receiptId);
                          setReason('');
                          setError(null);
                        }}
                      >
                        Rejeter
                      </button>
                    </div>
                  )}
                </div>

                <div className="review-evidence">
                  {receipt.url ? (
                    <a
                      href={receipt.url}
                      target="_blank"
                      rel="noreferrer"
                      className="review-link"
                    >
                      {isImage ? (
                        <img
                          className="review-thumb"
                          src={receipt.url}
                          alt={`Reçu de la commande ${receipt.entry.commandId}`}
                          loading="lazy"
                        />
                      ) : (
                        <span className="review-file">{receipt.fileName}</span>
                      )}
                    </a>
                  ) : (
                    <span className="review-file">Fichier indisponible</span>
                  )}
                  {isImage && receipt.url ? (
                    <span className="review-file">{receipt.fileName}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
