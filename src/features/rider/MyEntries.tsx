import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, formatLongDate, formatMAD, paymentMethodLabels } from '@/lib/format';

export default function MyEntries() {
  const entries = useQuery(api.orders.getMyLiveEntries, {});

  if (entries === undefined) return <LoadingSpinner />;

  const totals = entries.reduce(
    (acc, entry) => {
      acc[entry.paymentMethod] += entry.amount;
      return acc;
    },
    { cash: 0, tpe: 0, card: 0 }
  );

  return (
    <section className="rider-section" aria-labelledby="my-entries-title">
      <header className="panel-head">
        <div>
          <h2 id="my-entries-title">Mes entrées du jour</h2>
          <p className="panel-sub">{formatLongDate(Date.now())}</p>
        </div>
        <span className="panel-count">
          {entries.length} commande{entries.length === 1 ? '' : 's'}
        </span>
      </header>

      {entries.length > 0 ? (
        <div className="day-totals" aria-label="Totaux du jour">
          <div className="day-total">
            <span className="day-total-label">Espèces</span>
            <span className="amount">{formatMAD(totals.cash)}</span>
          </div>
          <div className="day-total">
            <span className="day-total-label">TPE</span>
            <span className="amount">{formatMAD(totals.tpe)}</span>
          </div>
          <div className="day-total">
            <span className="day-total-label">Carte</span>
            <span className="amount">{formatMAD(totals.card)}</span>
          </div>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune commande aujourd’hui</p>
          <p className="empty-text">
            Les commandes que vous enregistrez apparaîtront ici avec l’état de leurs
            justificatifs.
          </p>
        </div>
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => {
            const receipt = [...entry.receipts].sort((a, b) => b.createdAt - a.createdAt)[0];

            return (
              <li className="entry-card" key={entry._id}>
                <div className="entry-head">
                  <span className="entry-command">#{entry.commandId}</span>
                  <span className="entry-amount">{formatMAD(entry.amount)}</span>
                </div>

                <p className="entry-meta">
                  {entry.marketName} · {paymentMethodLabels[entry.paymentMethod]}
                </p>

                <div className="entry-foot">
                  <span className="entry-time">{formatDateTime(entry.createdAt)}</span>
                  {receipt ? (
                    <StatusBadge status={receipt.status} />
                  ) : (
                    <span className="badge badge-neutral">
                      <span className="badge-dot" aria-hidden="true" />
                      Enregistrée
                    </span>
                  )}
                </div>

                {receipt?.status === 'rejected' && receipt.rejectionReason ? (
                  <p className="entry-reason">Motif : {receipt.rejectionReason}</p>
                ) : null}

                {receipt?.url ? (
                  <a
                    className="entry-link"
                    href={receipt.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir le reçu
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
