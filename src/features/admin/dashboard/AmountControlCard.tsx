import { useCallback, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatMAD } from '@/lib/format';
import { downloadCSV } from '@/lib/export';
import type { Doc, Id } from '@convex/_generated/dataModel';
import FileSelectionModal from './FileSelectionModal';

export type ImportBatchWithBreakdown = Doc<'importBatches'> & {
  breakdown: {
    totalAmount: number;
    cashAmount: number;
    cardAmount: number;
    onlineAmount: number;
  };
};

interface AmountControlCardProps {
  importBatches: ImportBatchWithBreakdown[];
  selectedBatchIds: Id<'importBatches'>[];
  onSelectedBatchIdsChange: (ids: Id<'importBatches'>[]) => void;
}

export default function AmountControlCard({
  importBatches,
  selectedBatchIds,
  onSelectedBatchIdsChange,
}: AmountControlCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const selectedBatchIdsSet = new Set(selectedBatchIds);
  const selectedBatches = importBatches.filter((batch) =>
    selectedBatchIdsSet.has(batch._id),
  );

  const breakdown = selectedBatches.reduce(
    (acc, batch) => ({
      totalAmount: acc.totalAmount + batch.breakdown.totalAmount,
      cashAmount: acc.cashAmount + batch.breakdown.cashAmount,
      cardAmount: acc.cardAmount + batch.breakdown.cardAmount,
      onlineAmount: acc.onlineAmount + batch.breakdown.onlineAmount,
    }),
    { totalAmount: 0, cashAmount: 0, cardAmount: 0, onlineAmount: 0 },
  );
  const grandTotal = selectedBatches.reduce(
    (total, batch) => total + batch.breakdown.totalAmount,
    0
  );

  const handleExport = () => {
    const headers = [
      'Nom du fichier',
      'Date du rapport',
      'Cash Éligible (MAD)',
      'Carte Éligible (MAD)',
      'Paiement en ligne exclu (MAD)',
      'Total Fichier (MAD)',
    ];

    const rows = selectedBatches.map((batch) => [
      batch.attachmentName,
      new Date(batch.reportDate).toISOString().split('T')[0],
      Number((batch.breakdown.cashAmount / 100).toFixed(2)),
      Number((batch.breakdown.cardAmount / 100).toFixed(2)),
      Number((batch.breakdown.onlineAmount / 100).toFixed(2)),
      Number((batch.breakdown.totalAmount / 100).toFixed(2)),
    ]);

    const totals = selectedBatches.reduce(
      (acc, batch) => {
        acc[2] += batch.breakdown.cashAmount;
        acc[3] += batch.breakdown.cardAmount;
        acc[4] += batch.breakdown.onlineAmount;
        acc[5] += batch.breakdown.totalAmount;
        return acc;
      },
      [0, 0, 0, 0, 0, 0]
    );

    const grandTotalRow = [
      'Grand Total',
      '',
      Number((totals[2] / 100).toFixed(2)),
      Number((totals[3] / 100).toFixed(2)),
      Number((totals[4] / 100).toFixed(2)),
      Number((totals[5] / 100).toFixed(2)),
    ];

    const filename = `Controle_Montants_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, [...rows, grandTotalRow]);
  };

  const handleOpenReport = () => {
    const fileIds = selectedBatchIds.join(',');
    window.open(`/admin/reports/financials?fileIds=${fileIds}`, '_blank');
  };

  return (
    <section className="panel">
      <header className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <div>
          <h2>Contrôle des montants</h2>
          <div className="field panel-sub">
            <button
              type="button"
              className="button-ghost"
              onClick={() => setIsModalOpen(true)}
              disabled={importBatches.length === 0}
            >
              Sélectionner les fichiers ({selectedBatchIds.length})
            </button>
          </div>
        </div>
        <div className="panel-head-actions">
          <button
            type="button"
            className="button-ghost"
            onClick={handleOpenReport}
            disabled={importBatches.length === 0}
            title="Ouvrir dans une nouvelle page"
            aria-label="Ouvrir dans une nouvelle page"
          >
            <ExternalLink size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={handleExport}
            disabled={importBatches.length === 0}
          >
            Télécharger CSV
          </button>
        </div>
      </header>
      <dl className="metric-list">
        <div className="metric-row">
          <dt>Cash éligible</dt>
          <dd className="amount">{formatMAD(breakdown.cashAmount)}</dd>
        </div>
        <div className="metric-row">
          <dt>Carte éligible</dt>
          <dd className="amount">{formatMAD(breakdown.cardAmount)}</dd>
        </div>
        <div className="metric-row">
          <dt>Paiement en ligne exclu</dt>
          <dd className="amount">{formatMAD(breakdown.onlineAmount)}</dd>
        </div>
        <div className="metric-row is-subtotal">
          <dt>Total de la sélection</dt>
          <dd className="amount">{formatMAD(breakdown.totalAmount)}</dd>
        </div>
        <div className="metric-row is-total is-grand-total">
          <dt>Total Général</dt>
          <dd className="amount">{formatMAD(grandTotal)}</dd>
        </div>
      </dl>

      {isModalOpen ? (
        <FileSelectionModal
          isOpen
          onClose={closeModal}
          importBatches={importBatches}
          selectedIds={selectedBatchIds}
          onApply={onSelectedBatchIdsChange}
        />
      ) : null}
    </section>
  );
}
