import { formatMAD } from '@/lib/format';

interface DashboardKpisProps {
  totals: { cashDue: number; cardDue: number };
  collections: { total: number; count: number };
  deposits: { submitted: number; countSubmitted: number; approved: number; rejected: number };
  tpeReceipts: { pending: number; countPending: number; rejected: number };
  imports: { totalBatches: number; acceptedRows: number; totalRows: number };
}

export default function DashboardKpis({
  totals,
  collections,
  deposits,
  tpeReceipts,
  imports,
}: DashboardKpisProps) {
  return (
    <section className="stat-grid" aria-label="Indicateurs clés">
      <div className="stat">
        <span className="stat-label">Cash dû</span>
        <span className="stat-value">{formatMAD(totals.cashDue)}</span>
        <span className="stat-meta">Commandes cash éligibles</span>
      </div>
      <div className="stat">
        <span className="stat-label">Carte due</span>
        <span className="stat-value">{formatMAD(totals.cardDue)}</span>
        <span className="stat-meta">Commandes carte éligibles</span>
      </div>
      <div className="stat">
        <span className="stat-label">Encaissements</span>
        <span className="stat-value">{formatMAD(collections.total)}</span>
        <span className="stat-meta">{collections.count} saisie(s)</span>
      </div>
      <div className="stat">
        <span className="stat-label">Dépôts à approuver</span>
        <span className="stat-value">{formatMAD(deposits.submitted)}</span>
        <span className="stat-meta">{deposits.countSubmitted} dépôt(s) en attente</span>
      </div>
      <div className="stat">
        <span className="stat-label">TPE à approuver</span>
        <span className="stat-value">{formatMAD(tpeReceipts.pending)}</span>
        <span className="stat-meta">{tpeReceipts.countPending} preuve(s) en attente</span>
      </div>
      <div className="stat">
        <span className="stat-label">Rapports importés</span>
        <span className="stat-value">{imports.totalBatches}</span>
        <span className="stat-meta">
          {imports.acceptedRows} ligne(s) acceptée(s) sur {imports.totalRows}
        </span>
      </div>
    </section>
  );
}
