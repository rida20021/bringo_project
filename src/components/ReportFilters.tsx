interface ReportFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  dateRange?: { start: string; end: string };
  onDateRangeChange?: (start: string, end: string) => void;
  visibleColumns?: { cash: boolean; card: boolean; online: boolean };
  onColumnToggle?: (col: 'cash' | 'card' | 'online') => void;
}

/**
 * Reusable, controlled presentational component for filtering reports and file selections.
 * Supports text search, optional date range (start/end), and optional column visibility toggles.
 */
export default function ReportFilters({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  visibleColumns,
  onColumnToggle,
}: ReportFiltersProps) {
  return (
    <div className="report-filters-bar no-print">
      <div className="report-filters-search">
        <input
          type="text"
          className="report-search-input"
          placeholder="Rechercher un fichier..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Rechercher un fichier"
        />
      </div>

      {dateRange && onDateRangeChange ? (
        <div className="report-filters-dates">
          <label className="date-filter">
            <span className="date-filter-label">Du</span>
            <input
              type="date"
              value={dateRange.start}
              max={dateRange.end}
              onChange={(event) =>
                onDateRangeChange(event.target.value, dateRange.end)
              }
              aria-label="Date de début"
            />
          </label>
          <label className="date-filter">
            <span className="date-filter-label">Au</span>
            <input
              type="date"
              value={dateRange.end}
              min={dateRange.start}
              onChange={(event) =>
                onDateRangeChange(dateRange.start, event.target.value)
              }
              aria-label="Date de fin"
            />
          </label>
        </div>
      ) : null}

      {visibleColumns && onColumnToggle ? (
        <div className="report-filters-columns">
          <span className="date-filter-label">Colonnes :</span>
          <div className="report-column-toggles">
            <label className="report-toggle-label">
              <input
                type="checkbox"
                checked={visibleColumns.cash}
                onChange={() => onColumnToggle('cash')}
              />
              Cash
            </label>
            <label className="report-toggle-label">
              <input
                type="checkbox"
                checked={visibleColumns.card}
                onChange={() => onColumnToggle('card')}
              />
              Carte
            </label>
            <label className="report-toggle-label">
              <input
                type="checkbox"
                checked={visibleColumns.online}
                onChange={() => onColumnToggle('online')}
              />
              En ligne
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}