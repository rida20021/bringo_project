import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD, formatShortDate } from '@/lib/format';
import DiscrepanciesPanel from './DiscrepanciesPanel';
import ExcelImportPanel from './ExcelImportPanel';
import ImportsPanel from './ImportsPanel';
import PendingReceipts from './PendingReceipts';

export default function AdminDashboard() {
  const data = useQuery(api.reconciliation.getAdminDashboardData, {});

  if (data === undefined) return <LoadingSpinner />;

  const { imports, totals, collections, deposits, tpeReceipts, recentBatches, dateRange } = data;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Vue d’ensemble</h1>
          <p className="page-sub">
            Du {formatShortDate(dateRange.from)} au {formatShortDate(dateRange.to)} · Africa/Casablanca
          </p>
        </div>
        <span className="page-tag">Administrateur</span>
      </header>

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

      <ExcelImportPanel />

      <DiscrepanciesPanel />

      <PendingReceipts />

      <ImportsPanel batches={recentBatches} conflictRows={imports.conflictRows} />

      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Contrôle des montants</h2>
              <p className="panel-sub">Sommes par mode de paiement</p>
            </div>
          </header>
          <dl className="metric-list">
            <div className="metric-row">
              <dt>Cash éligible</dt>
              <dd className="amount">{formatMAD(totals.cashDue)}</dd>
            </div>
            <div className="metric-row">
              <dt>Carte éligible</dt>
              <dd className="amount">{formatMAD(totals.cardDue)}</dd>
            </div>
            <div className="metric-row">
              <dt>Paiement en ligne exclu</dt>
              <dd className="amount">{formatMAD(totals.onlinePaymentExcluded)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Preuves et dépôts</h2>
              <p className="panel-sub">États cumulés de la période</p>
            </div>
          </header>
          <dl className="metric-list">
            <div className="metric-row">
              <dt>Dépôts approuvés</dt>
              <dd className="amount">{formatMAD(deposits.approved)}</dd>
            </div>
            <div className="metric-row">
              <dt>Dépôts rejetés</dt>
              <dd className="amount">{formatMAD(deposits.rejected)}</dd>
            </div>
            <div className="metric-row">
              <dt>TPE approuvé</dt>
              <dd className="amount">{formatMAD(tpeReceipts.approved)}</dd>
            </div>
            <div className="metric-row">
              <dt>TPE rejeté</dt>
              <dd className="amount">{formatMAD(tpeReceipts.rejected)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className="page-foot">
        {imports.duplicateRows} doublon(s) · {imports.rejectedRows} ligne(s) rejetée(s) sur la
        période
      </p>
    </div>
  );
}
