import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatMAD } from '@/lib/format/currency';
import { formatLongDate, formatShortDate } from '@/lib/format/dates';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReportFilters from '@/components/ReportFilters';

const MAX_BATCHES = 200;

function timestampToDateInput(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().split('T')[0];
}

function dateInputToTimestampStart(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function dateInputToTimestampEnd(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Standalone, print-friendly financial report with advanced filters.
 *
 * Route: /admin/reports/financials
 * Optional URL param: ?fileIds=id1,id2,id3
 */
export default function FinancialReportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const fileIdsParam = searchParams.get('fileIds');

  const batches = useQuery(api.imports.getImportBatches, {
    limit: MAX_BATCHES,
  });

  const requestedFileIds = useMemo(
    () =>
      fileIdsParam
        ? new Set(
            fileIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          )
        : null,
    [fileIdsParam],
  );

  const [searchQuery, setSearchQuery] = useState('');
  
  // Default date range: current month start to today (or all if requested via URL param)
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: timestampToDateInput(startOfMonth.getTime()),
      end: timestampToDateInput(now.getTime()),
    };
  });

  const [visibleColumns, setVisibleColumns] = useState({
    cash: true,
    card: true,
    online: true,
  });

  const handleColumnToggle = (col: 'cash' | 'card' | 'online') => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const rows = useMemo(() => {
    if (!batches) return [];

    let filtered = requestedFileIds
      ? batches.filter((batch) => requestedFileIds.has(batch._id))
      : batches;

    // Apply text search query
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((batch) =>
        batch.attachmentName.toLowerCase().includes(query),
      );
    }

    // Apply date range filter
    const startTime = dateInputToTimestampStart(dateRange.start);
    const endTime = dateInputToTimestampEnd(dateRange.end);
    if (startTime !== null) {
      filtered = filtered.filter((batch) => batch.reportDate >= startTime);
    }
    if (endTime !== null) {
      filtered = filtered.filter((batch) => batch.reportDate <= endTime);
    }

    return [...filtered].sort((a, b) => a.reportDate - b.reportDate);
  }, [batches, requestedFileIds, searchQuery, dateRange]);

  if (!batches) return <LoadingSpinner />;

  const totals = { cash: 0, card: 0, online: 0, total: 0 };
  for (const batch of rows) {
    const { breakdown } = batch;
    totals.cash += breakdown.cashAmount;
    totals.card += breakdown.cardAmount;
    totals.online += breakdown.onlineAmount;
    totals.total += breakdown.totalAmount;
  }

  const activeColumnCount = [visibleColumns.cash, visibleColumns.card, visibleColumns.online].filter(Boolean).length;
  const totalColSpan = 2 + activeColumnCount + 1; // Name + Date + active columns + Total column

  const scopeLabel = requestedFileIds
    ? `Fichiers sélectionnés (${requestedFileIds.size})`
    : 'Rapport filtré par date et recherche';

  return (
    <div className="report-page">
      <header className="page-head">
        <div>
          <h1>Rapport financier</h1>
          <p className="page-sub">
            {scopeLabel} · Généré le {formatLongDate(Date.now())}
          </p>
        </div>
        <div className="page-actions no-print">
          <button
            type="button"
            className="button-ghost"
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Retour</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            <span>Imprimer</span>
          </button>
        </div>
      </header>

      <div style={{ marginBottom: '20px' }}>
        <ReportFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateRange={dateRange}
          onDateRangeChange={(start, end) => setDateRange({ start, end })}
          visibleColumns={visibleColumns}
          onColumnToggle={handleColumnToggle}
        />
      </div>

      <section className="panel" aria-label="Détail des montants par fichier">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nom du fichier</th>
                <th scope="col">Date</th>
                {visibleColumns.cash && (
                  <th scope="col" className="numeric">
                    Cash
                  </th>
                )}
                {visibleColumns.card && (
                  <th scope="col" className="numeric">
                    Carte
                  </th>
                )}
                {visibleColumns.online && (
                  <th scope="col" className="numeric">
                    En ligne
                  </th>
                )}
                <th scope="col" className="numeric">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={totalColSpan} className="table-muted">
                    Aucun fichier ne correspond aux critères.
                  </td>
                </tr>
              ) : (
                rows.map((batch) => (
                  <tr key={batch._id}>
                    <td className="table-file">{batch.attachmentName}</td>
                    <td className="table-muted">
                      {formatShortDate(batch.reportDate)}
                    </td>
                    {visibleColumns.cash && (
                      <td className="numeric amount">
                        {formatMAD(batch.breakdown.cashAmount)}
                      </td>
                    )}
                    {visibleColumns.card && (
                      <td className="numeric amount">
                        {formatMAD(batch.breakdown.cardAmount)}
                      </td>
                    )}
                    {visibleColumns.online && (
                      <td className="numeric amount">
                        {formatMAD(batch.breakdown.onlineAmount)}
                      </td>
                    )}
                    <td className="numeric amount">
                      {formatMAD(batch.breakdown.totalAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>Grand Total</strong>
                </td>
                {visibleColumns.cash && (
                  <td className="numeric amount">
                    <strong>{formatMAD(totals.cash)}</strong>
                  </td>
                )}
                {visibleColumns.card && (
                  <td className="numeric amount">
                    <strong>{formatMAD(totals.card)}</strong>
                  </td>
                )}
                {visibleColumns.online && (
                  <td className="numeric amount">
                    <strong>{formatMAD(totals.online)}</strong>
                  </td>
                )}
                <td className="numeric amount">
                  <strong>{formatMAD(totals.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}