import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { formatMAD } from '@/lib/format';

export default function CashStatusBanner() {
  const cashStatus = useQuery(api.deposits.getRiderCashStatus);

  if (!cashStatus || cashStatus.status === 'green') {
    return null;
  }

  const isRed = cashStatus.status === 'red';

  return (
    <aside
      className={`cash-status-banner ${isRed ? 'is-red' : 'is-yellow'}`}
      role="status"
      aria-live="polite"
    >
      <div className="cash-status-banner-content">
        <span className="cash-status-badge" aria-hidden="true">
          {isRed ? '🔴' : '🟡'}
        </span>
        <div className="cash-status-details">
          <strong className="cash-status-title">
            {isRed
              ? `Espèces dues : ${formatMAD(cashStatus.amount)}`
              : `${formatMAD(cashStatus.amount)} en attente`}
          </strong>
          <p className="cash-status-message">{cashStatus.message}</p>
        </div>
      </div>
    </aside>
  );
}
