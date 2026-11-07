import { Link } from 'react-router-dom';
import { formatMAD } from '@/lib/format';

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

  return (
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
