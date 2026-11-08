import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import CashCircuitPanel from '@/components/CashCircuitPanel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatAmount, formatLongDate, formatMAD } from '@/lib/format';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';

const PAGE_SIZE = 15;

function readDateParam(searchParams: URLSearchParams): string | null {
  const value = searchParams.get('date');
  return value && dateInputToTimestamp(value) !== null ? value : null;
}

export default function SupervisorDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(
    () => readDateParam(searchParams) ?? todayDateInputValue()
  );
  const [riderSearch, setRiderSearch] = useState('');
  const [remainingSort, setRemainingSort] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const reportTimestamp =
    dateInputToTimestamp(selectedDate) ?? dateInputToTimestamp(todayDateInputValue())!;
  const isToday = selectedDate === todayDateInputValue();

  const currentUser = useQuery(api.users.getCurrentUser);
  const data = useQuery(
    api.reconciliation.getSupervisorDashboardData,
    currentUser?.role === 'supervisor' ? { reportDate: reportTimestamp } : 'skip'
  );

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
  const paginatedRiders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAndSortedRiders.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedRiders, currentPage]);

  // Reset to the first page whenever the search query or sort order changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [riderSearch, remainingSort]);

  const updateDate = (value: string) => {
    if (!value || dateInputToTimestamp(value) === null) return;
    setSelectedDate(value);
    const next = new URLSearchParams(searchParams);
    next.set('date', value);
    setSearchParams(next, { replace: true });
  };

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDate(event.target.value);
  };

  const resetToToday = () => {
    setSelectedDate(todayDateInputValue());
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  };

  const header = (
    <header className="page-head">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1>Tableau de bord</h1>
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
          {isToday ? 'Aujourd’hui, ' : 'Rapport du '}
          {formatLongDate(reportTimestamp)} · Africa/Casablanca
        </p>
      </div>
      <div className="page-actions">
        <label className="date-filter" htmlFor="supervisor-report-date">
          <span className="date-filter-label">Date du rapport</span>
          <input
            id="supervisor-report-date"
            type="date"
            value={selectedDate}
            max={todayDateInputValue()}
            onChange={handleDateChange}
          />
        </label>
        {!isToday ? (
          <button type="button" className="button-ghost" onClick={resetToToday}>
            Aujourd’hui
          </button>
        ) : null}
      </div>
    </header>
  );

  if (currentUser === undefined || data === undefined) {
    return (
      <div className="page">
        {header}
        <LoadingSpinner />
      </div>
    );
  }

  const { kpis, riders: riderRows, pendingDeposits, pendingTpe } = data;
  const hasRiders = riderRows.length > 0;

  return (
    <div className="page">
      {header}

      <CashCircuitPanel kpis={kpis} pendingDeposits={pendingDeposits} pendingTpe={pendingTpe} />

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Livreurs</h2>
            <p className="panel-sub">Soldes de la date sélectionnée, cash et carte séparés</p>
          </div>
          <span className="panel-count">
            {filteredAndSortedRiders.length}{' '}
            {filteredAndSortedRiders.length === 1 ? 'livreur' : 'livreurs'}
          </span>
        </header>

        <div className="field market-search">
          <input
            type="search"
            value={riderSearch}
            onChange={(event) => setRiderSearch(event.target.value)}
            placeholder="Rechercher un livreur..."
            autoComplete="off"
            aria-label="Rechercher un livreur"
          />
        </div>

        {!hasRiders ? (
          <div className="empty">
            <p className="empty-title">Aucun livreur pour cette date</p>
            <p className="empty-text">
              Les soldes apparaîtront après l’import du rapport TIKTAK de cette date.
            </p>
          </div>
        ) : filteredAndSortedRiders.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun livreur trouvé</p>
            <p className="empty-text">Aucun livreur ne correspond à « {riderSearch} ».</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Livreur</th>
                  <th scope="col" className="numeric">
                    Cash dû
                  </th>
                  <th scope="col" className="numeric">
                    Carte due
                  </th>
                  <th scope="col" className="numeric">
                    Encaissé
                  </th>
                  <th
                    scope="col"
                    className="numeric"
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() =>
                      setRemainingSort((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setRemainingSort((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                      }
                    }}
                    title="Trier par reste"
                    aria-sort={remainingSort === 'desc' ? 'descending' : 'ascending'}
                  >
                    Reste {remainingSort === 'desc' ? '↓' : '↑'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRiders.map((rider) => (
                  <tr key={rider.riderId}>
                    <td>
                      {rider.riderUserId ? (
                        <Link
                          to={`/admin/riders/${rider.riderUserId}`}
                          className="table-link"
                        >
                          {rider.name}
                        </Link>
                      ) : (
                        rider.name
                      )}
                    </td>
                    <td className="numeric amount">{formatMAD(rider.cashDue)}</td>
                    <td className="numeric amount">{formatMAD(rider.cardDue)}</td>
                    <td className="numeric amount">{formatMAD(rider.collected)}</td>
                    <td className={`numeric amount${rider.remaining > 0 ? ' is-due' : ''}`}>
                      {formatMAD(rider.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="pagination-controls">
            <button
              type="button"
              className="button-ghost"
              onClick={() => setCurrentPage((page) => page - 1)}
              disabled={currentPage === 1}
            >
              ← Précédent
            </button>
            <span className="pagination-info">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              type="button"
              className="button-ghost"
              onClick={() => setCurrentPage((page) => page + 1)}
              disabled={currentPage === totalPages}
            >
              Suivant →
            </button>
          </div>
        ) : null}
      </section>

      <p className="page-foot">
        Montants en centimes convertis à l’affichage · Total cash dû{' '}
        <span className="amount">{formatAmount(kpis.totalCashDue)}</span> MAD
      </p>
    </div>
  );
}
