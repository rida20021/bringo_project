import { Link } from 'react-router-dom';
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
  const { currentPage, totalPages, setCurrentPage } = pagination;

  const handleExport = () => {
    const headers = ['Livreur', 'Cash dû (MAD)', 'Carte due (MAD)', 'Encaissé (MAD)', 'Reste (MAD)'];
    
    const rows = filteredAndSortedRiders.map((rider) => [
      rider.name,
      Number((rider.cashDue / 100).toFixed(2)),
      Number((rider.cardDue / 100).toFixed(2)),
      Number((rider.collected / 100).toFixed(2)),
      Number((rider.remaining / 100).toFixed(2)),
    ]);

    const totals = filteredAndSortedRiders.reduce(
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
      <header className="panel-head">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2>Livreurs</h2>
            <p className="panel-sub">Soldes de la période sélectionnée, cash et carte séparés</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              className="button-ghost" 
              onClick={handleExport}
              disabled={filteredAndSortedRiders.length === 0}
            >
              Télécharger CSV
            </button>
            <span className="panel-count">
              {filteredAndSortedRiders.length}{' '}
              {filteredAndSortedRiders.length === 1 ? 'livreur' : 'livreurs'}
            </span>
          </div>
        </div>
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

      {riders.length === 0 ? (
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
              {filteredAndSortedRiders.slice(
                (currentPage - 1) * 15,
                (currentPage - 1) * 15 + 15
              ).map((rider) => (
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
  );
}
