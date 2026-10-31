import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDateTime, formatMAD, formatShortDate } from '@/lib/format';

type StatusFilter = 'open' | 'resolved';

const reasonLabels: Record<'missing_in_excel' | 'amount_mismatch', string> = {
  missing_in_excel: 'Absent du fichier Excel',
  amount_mismatch: 'Montant différent',
};

const MAX_NOTE_LENGTH = 500;

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

export default function DiscrepanciesPanel() {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<Id<'discrepancies'> | null>(null);

  const stats = useQuery(api.discrepancies.getDiscrepancyStats, {});
  const rows = useQuery(api.discrepancies.getDiscrepancies, { status });
  const resolveDiscrepancy = useMutation(api.discrepancies.resolveDiscrepancy);

  const updateNote = (id: Id<'discrepancies'>, value: string) => {
    setNotes((prev) => ({ ...prev, [id]: value }));
  };

  const handleResolve = async (id: Id<'discrepancies'>) => {
    const note = (notes[id] ?? '').trim();
    if (!note) {
      setErrors((prev) => ({ ...prev, [id]: 'Indiquez une note de résolution.' }));
      return;
    }
    if (note.length > MAX_NOTE_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        [id]: `La note ne doit pas dépasser ${MAX_NOTE_LENGTH} caractères.`,
      }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingId(id);
    try {
      await resolveDiscrepancy({ discrepancyId: id, note });
      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [id]: readError(err) }));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="discrepancies-title">
      <header className="panel-head">
        <div>
          <h2 id="discrepancies-title">Écarts de rapprochement</h2>
          <p className="panel-sub">
            Commandes absentes du fichier Excel ou dont le montant diffère.
          </p>
        </div>
        <span className="panel-count">
          {stats === undefined ? 'Chargement…' : `${stats.open} à traiter`}
        </span>
      </header>

      <div className="filter-tabs" role="group" aria-label="Filtrer les écarts">
        <button
          type="button"
          className={`button-ghost${status === 'open' ? ' is-active' : ''}`}
          aria-pressed={status === 'open'}
          onClick={() => setStatus('open')}
        >
          À traiter{stats === undefined ? '' : ` (${stats.open})`}
        </button>
        <button
          type="button"
          className={`button-ghost${status === 'resolved' ? ' is-active' : ''}`}
          aria-pressed={status === 'resolved'}
          onClick={() => setStatus('resolved')}
        >
          Résolus{stats === undefined ? '' : ` (${stats.resolved})`}
        </button>
      </div>

      {rows === undefined ? (
        <p className="review-loading">Chargement des écarts…</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucun écart pour l’instant</p>
          <p className="empty-text">
            {status === 'open'
              ? 'Les commandes absentes du fichier Excel ou dont le montant diffère apparaîtront ici après un import.'
              : 'Les écarts traités apparaîtront ici avec leur note de résolution.'}
          </p>
        </div>
      ) : (
        <ul className="review-list">
          {rows.map((row) => {
            const isPending = pendingId === row._id;
            const rowError = errors[row._id];

            return (
              <li className="review-card discrepancy-card" key={row._id}>
                <div className="review-main">
                  <div className="review-head">
                    <span className="review-command">#{row.commandId}</span>
                    {row.status === 'resolved' ? (
                      <span className="badge badge-ok">
                        <span className="badge-dot" aria-hidden="true" />
                        Résolu
                      </span>
                    ) : (
                      <span className="badge badge-pending">
                        <span className="badge-dot" aria-hidden="true" />
                        À traiter
                      </span>
                    )}
                  </div>

                  <p className="review-rider">{row.riderName}</p>
                  <p className="review-meta">
                    {reasonLabels[row.reason]} · rapport du {formatShortDate(row.entryDate)}
                  </p>

                  <dl className="discrepancy-amounts">
                    <div className="discrepancy-amount">
                      <dt>Montant livreur</dt>
                      <dd className="amount">{formatMAD(row.riderAmount)}</dd>
                    </div>
                    <div className="discrepancy-amount">
                      <dt>Montant Excel</dt>
                      <dd className="amount">
                        {row.excelAmount !== undefined ? formatMAD(row.excelAmount) : '—'}
                      </dd>
                    </div>
                  </dl>

                  {row.status === 'open' ? (
                    <div className="review-reject">
                      <label className="field">
                        <span className="field-label">Note de résolution (obligatoire)</span>
                        <textarea
                          name={`resolutionNote-${row._id}`}
                          value={notes[row._id] ?? ''}
                          onChange={(event) => updateNote(row._id, event.target.value)}
                          rows={2}
                          maxLength={MAX_NOTE_LENGTH}
                          placeholder="Ex. : montant corrigé avec le superviseur…"
                          disabled={isPending}
                        />
                      </label>
                      {rowError ? (
                        <p className="field-error" role="alert">
                          {rowError}
                        </p>
                      ) : null}
                      <div className="review-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={pendingId !== null}
                          onClick={() => handleResolve(row._id)}
                        >
                          {isPending ? 'Résolution…' : 'Marquer résolu'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="review-meta discrepancy-resolution">
                      Résolu le{' '}
                      {row.resolvedAt !== undefined ? formatDateTime(row.resolvedAt) : '—'}
                      {row.resolutionNote ? ` · « ${row.resolutionNote} »` : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
