import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD, formatShortDate } from '@/lib/format';
import { dateInputToTimestamp, timestampToDateInputValue, todayDateInputValue } from '@/lib/dates';
import DiscrepanciesPanel from './DiscrepanciesPanel';
import ExcelImportPanel from './ExcelImportPanel';
import ImportsPanel from './ImportsPanel';
import PendingReceipts from './PendingReceipts';
import PendingDeposits from './PendingDeposits';

const DEFAULT_RANGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function readDateParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  return value && dateInputToTimestamp(value) !== null ? value : null;
}

function initialRange(searchParams: URLSearchParams): { from: string; to: string } {
  let from =
    readDateParam(searchParams, 'from') ??
    timestampToDateInputValue(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS);
  let to = readDateParam(searchParams, 'to') ?? todayDateInputValue();
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState(() => initialRange(searchParams));
  const [riderSearch, setRiderSearch] = useState('');
  const [remainingSort, setRemainingSort] = useState<'desc' | 'asc'>('desc');

  const fromTimestamp = dateInputToTimestamp(range.from);
  const toTimestamp = dateInputToTimestamp(range.to);

  const data = useQuery(api.reconciliation.getAdminDashboardData, {
    fromDate: fromTimestamp ?? undefined,
    toDate: toTimestamp ?? undefined,
  });

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

  const persistRange = (next: { from: string; to: string }) => {
    const params = new URLSearchParams(searchParams);
    params.set('from', next.from);
    params.set('to', next.to);
    setSearchParams(params, { replace: true });
  };

  const applyRange = (next: { from: string; to: string }) => {
    setRange(next);
    persistRange(next);
  };

  const handleFromChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value || dateInputToTimestamp(value) === null) return;
    applyRange({ from: value, to: value > range.to ? value : range.to });
  };

  const handleToChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value || dateInputToTimestamp(value) === null) return;
    applyRange({ from: value < range.from ? value : range.from, to: value });
  };

  const resetRange = () => {
    const next = {
      from: timestampToDateInputValue(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS),
      to: todayDateInputValue(),
    };
    setRange(next);
    const params = new URLSearchParams(searchParams);
    params.delete('from');
    params.delete('to');
    setSearchParams(params, { replace: true });
  };

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
        <span className="page-tag">Administrateur</span>
      </div>
    </header>
  );

  if (data === undefined) {
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

      <PendingDeposits />

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

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Livreurs</h2>
            <p className="panel-sub">Soldes de la période sélectionnée, cash et carte séparés</p>
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

        {data.riders.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Aucun livreur sur la période</p>
            <p className="empty-text">
              Les soldes apparaîtront après l’import du rapport TIKTAK de cette période.
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
                {filteredAndSortedRiders.map((rider) => (
                  <tr key={rider.riderId}>
                    <td>{rider.name}</td>
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
      </section>

      <p className="page-foot">
        {imports.duplicateRows} doublon(s) · {imports.rejectedRows} ligne(s) rejetée(s) sur la
        période
      </p>
    </div>
  );
}
