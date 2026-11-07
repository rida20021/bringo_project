import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD, formatShortDate } from '@/lib/format';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';
import { useDateRangeFilter } from '@/lib/hooks/useDateRangeFilter';
import DiscrepanciesPanel from './DiscrepanciesPanel';
import ExcelImportPanel from './ExcelImportPanel';
import ImportsPanel from './ImportsPanel';
import PendingReceipts from './PendingReceipts';
import PendingDeposits from './PendingDeposits';
import AmountControlCard from './dashboard/AmountControlCard';
import DashboardKpis from './dashboard/DashboardKpis';
import RiderBalancesTable from './dashboard/RiderBalancesTable';

const PAGE_SIZE = 15;

export default function AdminDashboard() {
  const { range, handleFromChange, handleToChange, resetRange } = useDateRangeFilter();
  const [riderSearch, setRiderSearch] = useState('');
  const [remainingSort, setRemainingSort] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<Id<'importBatches'> | null>(null);

  const fromTimestamp = dateInputToTimestamp(range.from);
  const toTimestamp = dateInputToTimestamp(range.to);

  const data = useQuery(api.reconciliation.getAdminDashboardData, {
    fromDate: fromTimestamp ?? undefined,
    toDate: toTimestamp ?? undefined,
  });
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = currentUser?.role === 'admin';
  const importBatches = useQuery(
    api.imports.getImportBatches,
    isAdmin ? { limit: 200 } : 'skip'
  );

  useEffect(() => {
    if (importBatches === undefined) return;

    setSelectedBatchId((currentBatchId) => {
      const selectionStillExists = importBatches.some(
        (batch) => batch._id === currentBatchId
      );
      return selectionStillExists ? currentBatchId : (importBatches[0]?._id ?? null);
    });
  }, [importBatches]);

  const filteredAndSortedRiders = useMemo(() => {
    if (!data?.riders) return [];
    const riders = data.riders;
    const query = riderSearch.trim().toLowerCase();
    const filtered = query
      ? riders.filter((rider) => rider.name.toLowerCase().includes(query))
      : riders;

    return [...filtered].sort((a, b) => {
      const diff =
        remainingSort === 'desc' ? b.remaining - a.remaining : a.remaining - b.remaining;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [data?.riders, riderSearch, remainingSort]);

  const totalPages = Math.ceil(filteredAndSortedRiders.length / PAGE_SIZE);

  // Reset to the first page whenever the search query or sort order changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [riderSearch, remainingSort]);

  const header = (
    <header className="page-head">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1>Vue d’ensemble</h1>
          {data?.mode === 'live' ? (
            <span className="mode-badge mode-badge-live">
              <span aria-hidden="true">📡</span> Mode Live (Prévisions)
            </span>
          ) : data?.mode === 'audit' ? (
            <span className="mode-badge mode-badge-audit">
              <span aria-hidden="true">✅</span> Mode Audit (TIKTAK)
            </span>
          ) : null}
        </div>
        <p className="page-sub">
          Du {formatShortDate(fromTimestamp ?? Date.now())} au{' '}
          {formatShortDate(toTimestamp ?? Date.now())} · Africa/Casablanca
        </p>
      </div>
      <div className="page-actions">
        <label className="date-filter" htmlFor="admin-from-date">
          <span className="date-filter-label">Du</span>
          <input
            id="admin-from-date"
            type="date"
            value={range.from}
            max={range.to}
            onChange={handleFromChange}
          />
        </label>
        <label className="date-filter" htmlFor="admin-to-date">
          <span className="date-filter-label">Au</span>
          <input
            id="admin-to-date"
            type="date"
            value={range.to}
            min={range.from}
            max={todayDateInputValue()}
            onChange={handleToChange}
          />
        </label>
        <button type="button" className="button-ghost" onClick={resetRange}>
          7 derniers jours
        </button>
      </div>
    </header>
  );

  if (data === undefined || currentUser === undefined) {
    return (
      <div className="page">
        {header}
        <LoadingSpinner />
      </div>
    );
  }

  const { imports, totals, collections, deposits, tpeReceipts, recentBatches } = data;

  return (
    <div className="page">
      {header}

      <DashboardKpis
        totals={totals}
        collections={collections}
        deposits={deposits}
        tpeReceipts={tpeReceipts}
        imports={imports}
      />

      {isAdmin && <ExcelImportPanel />}

      {isAdmin && <DiscrepanciesPanel />}

      <PendingReceipts />

      <PendingDeposits />

      {isAdmin && <ImportsPanel batches={recentBatches} conflictRows={imports.conflictRows} />}

      {isAdmin ? (
        <div className="split">
          <AmountControlCard
            importBatches={importBatches ?? []}
            selectedBatchId={selectedBatchId}
            onSelectedBatchChange={setSelectedBatchId}
          />

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
                <dt>TPE rejeté</dt>
                <dd className="amount">{formatMAD(tpeReceipts.rejected)}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : (
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
              <dt>TPE rejeté</dt>
              <dd className="amount">{formatMAD(tpeReceipts.rejected)}</dd>
            </div>
          </dl>
        </section>
      )}

      <RiderBalancesTable
        riders={data.riders}
        filteredAndSortedRiders={filteredAndSortedRiders}
        pagination={{
          currentPage,
          totalPages,
          setCurrentPage,
        }}
        search={{
          riderSearch,
          setRiderSearch,
          remainingSort,
          setRemainingSort,
        }}
      />

      <p className="page-foot">
        {imports.duplicateRows} doublon(s) · {imports.rejectedRows} ligne(s) rejetée(s) sur la
        période
      </p>
    </div>
  );
}
