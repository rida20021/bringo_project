import { useEffect, useMemo, useState } from 'react';
import type { Id } from '@convex/_generated/dataModel';
import { formatShortDate } from '@/lib/format/dates';
import ReportFilters from '@/components/ReportFilters';
import type { ImportBatchWithBreakdown } from './AmountControlCard';

interface FileSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  importBatches: ImportBatchWithBreakdown[];
  selectedIds: Id<'importBatches'>[];
  onApply: (ids: Id<'importBatches'>[]) => void;
}

/**
 * Multi-file selection modal for the "Contrôle des montants" card.
 * Maintains a local draft of the checked batch IDs and only commits them
 * through `onApply` when the user clicks "Appliquer". Includes search filtering.
 */
export default function FileSelectionModal({
  isOpen,
  onClose,
  importBatches,
  selectedIds,
  onApply,
}: FileSelectionModalProps) {
  const [draftIds, setDraftIds] = useState<Id<'importBatches'>[]>(selectedIds);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);

  const filteredBatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return importBatches;
    return importBatches.filter((batch) =>
      batch.attachmentName.toLowerCase().includes(query),
    );
  }, [importBatches, searchQuery]);

  if (!isOpen) return null;

  const allFilteredSelected =
    filteredBatches.length > 0 &&
    filteredBatches.every((batch) => draftSet.has(batch._id));

  const toggleAll = () => {
    const filteredIds = filteredBatches.map((batch) => batch._id);
    setDraftIds((prev) => {
      if (allFilteredSelected) {
        // Remove filtered batches from selection
        return prev.filter((id) => !filteredIds.includes(id));
      } else {
        // Add all filtered batches to selection
        const newSet = new Set(prev);
        for (const id of filteredIds) {
          newSet.add(id);
        }
        return Array.from(newSet);
      }
    });
  };

  const toggleBatch = (batchId: Id<'importBatches'>) => {
    setDraftIds((prev) =>
      prev.includes(batchId)
        ? prev.filter((id) => id !== batchId)
        : [...prev, batchId],
    );
  };

  const handleApply = () => {
    onApply(draftIds);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-selection-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 id="file-selection-title">Sélectionner les fichiers</h2>
            <p className="panel-sub">
              Choisissez les fichiers TikTak à inclure dans le contrôle des
              montants ({draftIds.length} sélectionné{draftIds.length > 1 ? 's' : ''}).
            </p>
          </div>
        </header>

        <div style={{ marginBottom: '12px' }}>
          <ReportFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        <label className="file-select-all">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            disabled={filteredBatches.length === 0}
          />
          Tout sélectionner ({filteredBatches.length} affichés)
        </label>

        <div className="file-list">
          {filteredBatches.length === 0 ? (
            <p className="table-muted file-list-empty">
              Aucun fichier ne correspond à la recherche.
            </p>
          ) : (
            filteredBatches.map((batch) => (
              <label key={batch._id} className="file-list-item">
                <input
                  type="checkbox"
                  checked={draftSet.has(batch._id)}
                  onChange={() => toggleBatch(batch._id)}
                />
                <span className="file-list-name">{batch.attachmentName}</span>
                <span className="file-list-date">
                  {formatShortDate(batch.reportDate)}
                </span>
              </label>
            ))
          )}
        </div>

        <footer className="modal-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleApply}
          >
            Appliquer
          </button>
        </footer>
      </div>
    </div>
  );
}