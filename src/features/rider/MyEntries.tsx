import { useRef, useState, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, formatMAD, paymentMethodLabels } from '@/lib/format';
import {
  dateInputToTimestamp,
  todayDateInputValue,
  timestampToDateInputValue,
} from '@/lib/dates';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const DEFAULT_RANGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 10;

function initialRange(): { from: string; to: string } {
  const today = todayDateInputValue();
  const fromTs = Date.now() - DEFAULT_RANGE_DAYS * DAY_MS;
  const from = timestampToDateInputValue(fromTs);
  return { from, to: today };
}

function readDateInput(value: string): number | null {
  const ts = dateInputToTimestamp(value);
  return ts !== null ? ts : null;
}

function formatEntryDate(date: number): string {
  const today = todayDateInputValue();
  const todayTimestamp = dateInputToTimestamp(today) ?? Date.now();
  const yesterday = timestampToDateInputValue(todayTimestamp - DAY_MS);
  const entryDay = timestampToDateInputValue(date);

  if (entryDay === today) return 'Aujourd’hui';
  if (entryDay === yesterday) return 'Hier';

  return `Le ${new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Casablanca',
  }).format(new Date(date))}`;
}

export default function MyEntries() {
  const generateUploadUrl = useMutation(api.receipts.generateUploadUrl);
  const replaceRejectedReceipt = useMutation(api.receipts.replaceRejectedReceipt);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReceiptRef = useRef<Id<'liveEntryReceipts'> | null>(null);
  const [replacingReceiptId, setReplacingReceiptId] = useState<Id<'liveEntryReceipts'> | null>(
    null
  );
  const [range, setRange] = useState(initialRange);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [marketFilter, setMarketFilter] = useState('');

  const fromTs = readDateInput(range.from);
  const toTs = readDateInput(range.to);
  const entries = useQuery(
    api.orders.getMyLiveEntries,
    fromTs !== null && toTs !== null
      ? { startDate: fromTs, endDate: toTs }
      : { startDate: undefined, endDate: undefined }
  );

  // Get unique markets from entries
  const markets = useMemo(() => {
    if (!entries) return [];
    const unique = new Set(entries.map((e) => e.marketName));
    return ['Tous les marchés', ...Array.from(unique).sort()];
  }, [entries]);

  const openFilePicker = (receiptId: Id<'liveEntryReceipts'>) => {
    pendingReceiptRef.current = receiptId;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const receiptId = pendingReceiptRef.current;
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    pendingReceiptRef.current = null;

    if (!receiptId || !file) return;

    if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
      toast.error('Format accepté : JPG, PNG, WEBP ou PDF.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error('Le fichier dépasse 10 Mo.');
      return;
    }

    setReplacingReceiptId(receiptId);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error('Le téléversement du reçu a échoué.');
      const payload = (await response.json()) as { storageId: Id<'_storage'> };

      await replaceRejectedReceipt({
        receiptId,
        storageId: payload.storageId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      });

      toast.success('Reçu remplacé. Il est de nouveau en attente de validation.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setReplacingReceiptId(null);
    }
  };

  const handleFromChange = (value: string) => {
    if (!value) return;
    setRange((prev) => {
      const to = dateInputToTimestamp(value)! > dateInputToTimestamp(prev.to)! ? value : prev.to;
      return { from: value, to };
    });
    setCurrentPage(1);
  };

  const handleToChange = (value: string) => {
    if (!value) return;
    setRange((prev) => {
      const from = dateInputToTimestamp(value)! < dateInputToTimestamp(prev.from)! ? value : prev.from;
      return { from, to: value };
    });
    setCurrentPage(1);
  };

  const resetToToday = () => {
    setRange(initialRange());
    setIsExpanded(false);
    setCurrentPage(1);
  };

  const formatRangeLabel = () => {
    const from = dateInputToTimestamp(range.from);
    const to = dateInputToTimestamp(range.to);
    if (from === null || to === null) return '';
    if (from === to) {
      const d = new Date(from);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    }
    const d1 = new Date(from);
    const d2 = new Date(to);
    const dd1 = String(d1.getDate()).padStart(2, '0');
    const mm1 = String(d1.getMonth() + 1).padStart(2, '0');
    const yy1 = String(d1.getFullYear()).slice(-2);
    const dd2 = String(d2.getDate()).padStart(2, '0');
    const mm2 = String(d2.getMonth() + 1).padStart(2, '0');
    const yy2 = String(d2.getFullYear()).slice(-2);
    return `${dd1}/${mm1}/${yy1} — ${dd2}/${mm2}/${yy2}`;
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter((entry) => {
      const q = searchQuery.trim().toLowerCase();
      const commandMatches = !q || entry.commandId.toLowerCase().includes(q);
      const marketMatches = !marketFilter || marketFilter === 'Tous les marchés' || entry.marketName === marketFilter;
      return commandMatches && marketMatches;
    });
  }, [entries, searchQuery, marketFilter]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);

  // Group only the current page so pagination never renders empty date headers.
  const groupedEntries = useMemo(() => {
    const groups = new Map<number, typeof paginatedEntries>();
    for (const entry of paginatedEntries) {
      const group = groups.get(entry.entryDate) ?? [];
      group.push(entry);
      groups.set(entry.entryDate, group);
    }

    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateB - dateA)
      .map(([date, groupEntries]) => ({
        date,
        label: formatEntryDate(date),
        entries: groupEntries,
      }));
  }, [paginatedEntries]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMarketChange = (value: string) => {
    setMarketFilter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
      scrollToTop();
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
      scrollToTop();
    }
  };

  const downloadCSV = () => {
    if (filteredEntries.length === 0) {
      toast.info('Aucune commande à exporter.');
      return;
    }

    const headers = [
      'Numéro de commande',
      'Marché',
      'Méthode de paiement',
      'Montant',
      'Date',
      'Statut du reçu',
    ];

    const rows = filteredEntries.map((entry) => {
      const receipt = [...entry.receipts].sort((a, b) => b.createdAt - a.createdAt)[0];
      const receiptStatus = receipt?.status === 'rejected'
        ? 'Rejeté'
        : receipt?.status === 'approved'
        ? 'Approuvé'
        : receipt?.status === 'pending_review'
        ? 'En attente'
        : 'Enregistrée';

      const d = new Date(entry.entryDate);
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

      return [
        entry.commandId,
        entry.marketName,
        paymentMethodLabels[entry.paymentMethod],
        (entry.amount / 100).toFixed(2),
        dateStr,
        receiptStatus,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `entrées-${formatRangeLabel()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV exporté avec succès.');
  };

  if (entries === undefined) return <LoadingSpinner />;

  const totals = filteredEntries.reduce(
    (acc, entry) => {
      acc[entry.paymentMethod] = (acc[entry.paymentMethod] || 0) + entry.amount;
      return acc;
    },
    { cash: 0, tpe: 0, online: 0 } as Record<'cash' | 'tpe' | 'online', number>
  );

  const grandTotal = totals.cash + totals.tpe + totals.online;

  return (
    <section className="rider-section" aria-labelledby="my-entries-title">
      <header className="rider-entries-header">
        <div className="rider-entries-title-row">
          <h2 id="my-entries-title">Mes entrées</h2>
          <button
            type="button"
            className="button-ghost rider-csv-button"
            onClick={downloadCSV}
            disabled={filteredEntries.length === 0}
          >
            Télécharger CSV
          </button>
        </div>

        <div className="rider-filter-bar">
          <button
            type="button"
            className="rider-date-range-card"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            aria-controls="rider-date-range-fields"
          >
            <span className="rider-date-range-icon" aria-hidden="true">📅</span>
            <span className="rider-date-range-text">{formatRangeLabel()}</span>
            <span className="rider-date-range-chevron" aria-hidden="true">
              {isExpanded ? '▲' : '▼'}
            </span>
          </button>

          <div className="rider-command-search">
            <input
              type="search"
              placeholder="Rechercher par commande…"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              aria-label="Rechercher par numéro de commande"
            />
            {searchQuery ? (
              <button
                type="button"
                className="rider-search-clear"
                onClick={() => handleSearchChange('')}
                aria-label="Effacer la recherche"
              >
                ×
              </button>
            ) : null}
          </div>

          <select
            className="rider-market-filter"
            value={marketFilter}
            onChange={(event) => handleMarketChange(event.target.value)}
            aria-label="Filtrer par marché"
          >
            {markets.map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
        </div>

        {isExpanded ? (
          <div id="rider-date-range-fields" className="rider-date-inputs">
            <label className="date-filter compact" htmlFor="rider-from-date">
              <span className="date-filter-label">Du</span>
              <input
                id="rider-from-date"
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) => handleFromChange(event.target.value)}
              />
            </label>
            <label className="date-filter compact" htmlFor="rider-to-date">
              <span className="date-filter-label">Au</span>
              <input
                id="rider-to-date"
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) => handleToChange(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="button-ghost rider-seven-day-button"
              onClick={resetToToday}
            >
              7j
            </button>
          </div>
        ) : null}

        <p className="rider-entries-count" aria-live="polite">
          {filteredEntries.length} commande{filteredEntries.length === 1 ? '' : 's'}
        </p>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        onChange={handleFileSelected}
        hidden
      />

      {entries.length > 0 ? (
        <div className="day-totals" aria-label="Totaux du jour">
          <div className="day-total">
            <span className="day-total-label">Espèces</span>
            <span className="amount">{formatMAD(totals.cash)}</span>
          </div>
          <div className="day-total">
            <span className="day-total-label">TPE</span>
            <span className="amount">{formatMAD(totals.tpe)}</span>
          </div>
          <div className="day-total">
            <span className="day-total-label">En ligne</span>
            <span className="amount">{formatMAD(totals.online)}</span>
          </div>
          <div className="day-total day-total-grand">
            <span className="day-total-label">Total</span>
            <span className="amount">{formatMAD(grandTotal)}</span>
          </div>
        </div>
      ) : null}

      {filteredEntries.length === 0 && entries.length > 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune commande trouvée</p>
          <p className="empty-text">Essayez un autre numéro de commande ou un autre marché.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune commande dans cette période</p>
          <p className="empty-text">
            Les commandes que vous enregistrez apparaîtront ici avec l'état de leurs
            justificatifs.
          </p>
        </div>
      ) : (
        <>
          <ul className="entry-list">
            {groupedEntries.map((group) => (
              <li key={group.date} className="entry-date-group">
                <div className="entry-date-header">
                  <span className="entry-date-label">{group.label}</span>
                </div>
                <ul className="entry-group-list">
                  {group.entries.map((entry) => {
                    const receipt = [...entry.receipts].sort((a, b) => b.createdAt - a.createdAt)[0];
                    const isRejected = receipt?.status === 'rejected';
                    const isReplacing = replacingReceiptId !== null && receipt?._id === replacingReceiptId;

                    return (
                      <li className="entry-card" key={entry._id}>
                        <div className="entry-head">
                          <span className="entry-command">#{entry.commandId}</span>
                          <span className="entry-amount">{formatMAD(entry.amount)}</span>
                        </div>

                        <p className="entry-meta">
                          {entry.marketName} · {paymentMethodLabels[entry.paymentMethod]}
                        </p>

                        <div className="entry-foot">
                          <span className="entry-time">{formatDateTime(entry.createdAt)}</span>
                          {receipt ? (
                            <StatusBadge status={receipt.status} />
                          ) : (
                            <span className="badge badge-neutral">
                              <span className="badge-dot" aria-hidden="true" />
                              Enregistrée
                            </span>
                          )}
                        </div>

                        {isRejected && receipt?.rejectionReason ? (
                          <div className="entry-rejection" role="alert">
                            <p className="entry-rejection-title">Reçu refusé par l'administrateur</p>
                            <p className="entry-rejection-reason">Motif : {receipt.rejectionReason}</p>
                            <button
                              type="button"
                              className="button button-ghost is-danger entry-replace-button"
                              onClick={() => openFilePicker(receipt._id)}
                              disabled={replacingReceiptId !== null}
                            >
                              {isReplacing ? 'Téléversement…' : 'Remplacer le reçu'}
                            </button>
                          </div>
                        ) : receipt?.status === 'rejected' ? (
                          <p className="entry-reason">Motif non précisé par l'administrateur.</p>
                        ) : null}

                        {receipt?.url ? (
                          <a
                            className="entry-link"
                            href={receipt.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Voir le reçu
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {/* Pagination Controls */}
          <div className="pagination-controls">
            <button
              type="button"
              className="button-ghost"
              onClick={handlePrevPage}
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
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Suivant →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
