import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { formatMAD } from '@/lib/format';
import { downloadCSV } from '@/lib/export';

export interface RiderBalance {
  riderId: string;
  riderUserId?: string;
  name: string;
  cashDue: number;
  cardDue: number;
  collected: number;
  remaining: number;
}

interface RiderBalancesTableProps {
  riders: RiderBalance[];
  filteredAndSortedRiders: RiderBalance[];
  pagination: {
    currentPage: number;
    totalPages: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  };
  search: {
    riderSearch: string;
    setRiderSearch: (v: string) => void;
    remainingSort: 'desc' | 'asc';
    setRemainingSort: React.Dispatch<React.SetStateAction<'desc' | 'asc'>>;
  };
}

export default function RiderBalancesTable({
  riders,
  filteredAndSortedRiders,
  pagination,
  search,
}: RiderBalancesTableProps) {
  const { riderSearch, setRiderSearch, remainingSort, setRemainingSort } = search;
  const { currentPage, setCurrentPage } = pagination;

  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    debt: false,
    credit: false,
    settled: false,
  });

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  const displayedRiders = useMemo(() => {
    const anyFilterActive = activeFilters.debt || activeFilters.credit || activeFilters.settled;
    if (!anyFilterActive) return filteredAndSortedRiders;
    return filteredAndSortedRiders.filter((rider) => {
      let match = false;
      if (activeFilters.debt && rider.remaining > 0) match = true;
      if (activeFilters.credit && rider.remaining < 0) match = true;
      if (activeFilters.settled && rider.remaining === 0) match = true;
      return match;
    });
  }, [filteredAndSortedRiders, activeFilters]);

  const totalPagesLocal = Math.max(1, Math.ceil(displayedRiders.length / 15));

  useEffect(() => {
    if (currentPage > totalPagesLocal) {
      setCurrentPage(1);
    }
  }, [totalPagesLocal, currentPage, setCurrentPage]);

  const paginatedRiders = useMemo(() => {
    const start = (currentPage - 1) * 15;
    return displayedRiders.slice(start, start + 15);
  }, [displayedRiders, currentPage]);

  const handleExport = () => {
    const headers = ['Livreur', 'Cash dû (MAD)', 'Carte due (MAD)', 'Encaissé (MAD)', 'Reste (MAD)'];
    
    let targetRiders = filteredAndSortedRiders;
    const hasActiveFilters = activeFilters.debt || activeFilters.credit || activeFilters.settled;

    if (selectedRiderIds.size > 0) {
      targetRiders = displayedRiders.filter((r) => selectedRiderIds.has(r.riderId));
    } else if (filteredAndSortedRiders.length !== riders.length || hasActiveFilters) {
      targetRiders = displayedRiders;
    } else {
      targetRiders = filteredAndSortedRiders;
    }

    const rows = targetRiders.map((rider) => [
      rider.name,
      Number((rider.cashDue / 100).toFixed(2)),
      Number((rider.cardDue / 100).toFixed(2)),
      Number((rider.collected / 100).toFixed(2)),
      Number((rider.remaining / 100).toFixed(2)),
    ]);

    const totals = targetRiders.reduce(
      (acc, rider) => {
        acc[1] += rider.cashDue;
        acc[2] += rider.cardDue;
        acc[3] += rider.collected;
        acc[4] += rider.remaining;
        return acc;
      },
      [0, 0, 0, 0, 0]
    );

    const totalRow = [
      'Total',
      Number((totals[1] / 100).toFixed(2)),
      Number((totals[2] / 100).toFixed(2)),
      Number((totals[3] / 100).toFixed(2)),
      Number((totals[4] / 100).toFixed(2)),
    ];

    const filename = `Soldes_Livreurs_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, [...rows, totalRow]);
  };

  return (
    <section className="panel">
      <header className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <div>
          <h2>Livreurs</h2>
          <p className="panel-sub">Soldes de la période sélectionnée, cash et carte séparés</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            type="button" 
            className="button-ghost" 
            onClick={handleExport}
            disabled={displayedRiders.length === 0}
          >
            Télécharger CSV
          </button>
          <span className="panel-count">
            {displayedRiders.length}{' '}
            {displayedRiders.length === 1 ? 'livreur' : 'livreurs'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', position: 'relative', marginBottom: '1rem' }}>
        <div className="field market-search" style={{ flex: 1, marginBottom: 0 }}>
          <input
            type="search"
            value={riderSearch}
            onChange={(event) => setRiderSearch(event.target.value)}
            placeholder="Rechercher un livreur..."
            autoComplete="off"
            aria-label="Rechercher un livreur"
          />
        </div>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="button-ghost"
            onClick={() => setShowFilters((prev) => !prev)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
            aria-expanded={showFilters}
          >
            <Filter size={16} aria-hidden="true" />
            <span>Filtres</span>
            {activeFilterCount > 0 ? (
              <span className="page-tag" style={{ padding: '1px 6px', fontSize: '11px', marginLeft: '2px' }}>
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          {showFilters ? (
            <div
              className="panel"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 4px)',
                zIndex: 50,
                width: '240px',
                padding: '12px',
                boxShadow: '0 10px 25px rgb(16 27 32 / 0.15)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                Filtrer par statut financier
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeFilters.debt}
                    onChange={(e) => setActiveFilters((prev) => ({ ...prev, debt: e.target.checked }))}
                  />
                  En dette (Reste &gt; 0)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeFilters.credit}
                    onChange={(e) => setActiveFilters((prev) => ({ ...prev, credit: e.target.checked }))}
                  />
                  Trop perçu (Reste &lt; 0)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeFilters.settled}
                    onChange={(e) => setActiveFilters((prev) => ({ ...prev, settled: e.target.checked }))}
                  />
                  Soldé (Reste = 0)
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {riders.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucun livreur sur la période</p>
          <p className="empty-text">
            Les soldes apparaîtront après l’import du rapport TIKTAK de cette période.
          </p>
        </div>
      ) : displayedRiders.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucun livreur trouvé</p>
          <p className="empty-text">Aucun livreur ne correspond aux filtres ou à « {riderSearch} ».</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={
                      paginatedRiders.length > 0 &&
                      paginatedRiders.every((r) => selectedRiderIds.has(r.riderId))
                    }
                    onChange={() => {
                      const paginatedIds = paginatedRiders.map((r) => r.riderId);
                      const allSelected = paginatedIds.length > 0 && paginatedIds.every((id) => selectedRiderIds.has(id));
                      setSelectedRiderIds((prev) => {
                        const next = new Set(prev);
                        if (allSelected) {
                          for (const id of paginatedIds) next.delete(id);
                        } else {
                          for (const id of paginatedIds) next.add(id);
                        }
                        return next;
                      });
                    }}
                    aria-label="Sélectionner tous les livreurs de cette page"
                  />
                </th>
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
              {paginatedRiders.map((rider) => {
                const isSelected = selectedRiderIds.has(rider.riderId);
                return (
                  <tr key={rider.riderId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedRiderIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(rider.riderId)) {
                              next.delete(rider.riderId);
                            } else {
                              next.add(rider.riderId);
                            }
                            return next;
                          });
                        }}
                        aria-label={`Sélectionner ${rider.name}`}
                      />
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPagesLocal > 1 ? (
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
            Page {currentPage} sur {totalPagesLocal}
          </span>
          <button
            type="button"
            className="button-ghost"
            onClick={() => setCurrentPage((page) => page + 1)}
            disabled={currentPage === totalPagesLocal}
          >
            Suivant →
          </button>
        </div>
      ) : null}
    </section>
  );
}