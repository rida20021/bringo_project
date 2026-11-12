import { useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { formatMAD, paymentMethodLabels } from '@/lib/format';

const DEBOUNCE_MS = 300;

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const result = useQuery(
    api.search.globalCommandSearch,
    debouncedQuery.length >= 2 ? { commandId: debouncedQuery } : 'skip'
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    setIsOpen(value.length >= 2);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const receiptStatusLabel = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'Approuvé';
      case 'rejected':
        return 'Rejeté';
      case 'pending_review':
        return 'En attente';
      default:
        return 'Inconnu';
    }
  };

  const receiptStatusBadge = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'badge-success';
      case 'rejected':
        return 'badge-danger';
      case 'pending_review':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div ref={containerRef} className="global-search">
      <div className="global-search-input-wrap">
        <span className="global-search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          type="search"
          className="global-search-input"
          placeholder="Rechercher une commande..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          aria-label="Rechercher une commande"
        />
      </div>

      {isOpen && debouncedQuery.length >= 2 && (
        <div className="global-search-dropdown">
          {result === undefined ? (
            <div className="global-search-loading">
              <span>Recherche...</span>
            </div>
          ) : result === null || (!result.liveEntry && result.excelOrders.length === 0) ? (
            <div className="global-search-empty">
              <p className="global-search-empty-title">Aucune commande trouvée</p>
              <p className="global-search-empty-text">
                Essayez un autre numéro de commande.
              </p>
            </div>
          ) : (
            <div className="global-search-result">
              {result.riderName && (
                <div className="global-search-rider">
                  <span className="global-search-label">Livreur</span>
                  <span className="global-search-value">{result.riderName}</span>
                </div>
              )}

              <div className="global-search-section">
                <h4 className="global-search-section-title">Application</h4>
                {result.liveEntry ? (
                  <div className="global-search-row">
                    <span className="global-search-label">Montant</span>
                    <span className="global-search-value amount">
                      {formatMAD(result.liveEntry.amount)}
                    </span>
                  </div>
                ) : (
                  <p className="global-search-missing">Absent de l'application</p>
                )}
                {result.liveEntry && (
                  <div className="global-search-row">
                    <span className="global-search-label">Paiement</span>
                    <span className="global-search-value">
                      {paymentMethodLabels[result.liveEntry.paymentMethod]}
                    </span>
                  </div>
                )}
              </div>

              <div className="global-search-section">
                <h4 className="global-search-section-title">Excel</h4>
                {result.excelOrders.length > 0 ? (
                  result.excelOrders.map((order, idx) => (
                    <div key={order._id} className="global-search-order-row">
                      <div className="global-search-row">
                        <span className="global-search-label">
                          {result.excelOrders.length > 1 ? `Ligne ${idx + 1}` : 'Montant'}
                        </span>
                        <span className="global-search-value amount">
                          {formatMAD(order.amount)}
                        </span>
                      </div>
                      <div className="global-search-row">
                        <span className="global-search-label">Paiement</span>
                        <span className="global-search-value">
                          {paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="global-search-missing">Absent du fichier Excel</p>
                )}
              </div>

              {result.receipts.length > 0 && (
                <div className="global-search-section">
                  <h4 className="global-search-section-title">Reçu</h4>
                  {result.receipts.map((receipt) => (
                    <div key={receipt._id} className="global-search-receipt">
                      <span className={`badge ${receiptStatusBadge(receipt.status)}`}>
                        {receiptStatusLabel(receipt.status)}
                      </span>
                      <span className="global-search-receipt-kind">
                        {receipt.kind === 'tpe' ? 'TPE' : 'Dépôt bancaire'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
