import { formatMAD } from '@/lib/format';
import { downloadCSV } from '@/lib/export';
import type { Doc, Id } from '@convex/_generated/dataModel';

type ImportBatchWithBreakdown = Doc<'importBatches'> & {
  breakdown: {
    totalAmount: number;
    cashAmount: number;
    cardAmount: number;
    onlineAmount: number;
  };
};

interface AmountControlCardProps {
  importBatches: ImportBatchWithBreakdown[];
  selectedBatchId: Id<'importBatches'> | null;
  onSelectedBatchChange: (batchId: Id<'importBatches'>) => void;
}

export default function AmountControlCard({
  importBatches,
  selectedBatchId,
  onSelectedBatchChange,
}: AmountControlCardProps) {
  const selectedBatch = importBatches.find((batch) => batch._id === selectedBatchId);
  const breakdown = selectedBatch?.breakdown;
  const grandTotal = importBatches.reduce(
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

    const rows = importBatches.map((batch) => [
      batch.attachmentName,
      new Date(batch.reportDate).toISOString().split('T')[0],
      Number((batch.breakdown.cashAmount / 100).toFixed(2)),
      Number((batch.breakdown.cardAmount / 100).toFixed(2)),
      Number((batch.breakdown.onlineAmount / 100).toFixed(2)),
      Number((batch.breakdown.totalAmount / 100).toFixed(2)),
    ]);

    const totals = importBatches.reduce(
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

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2>Contrôle des montants</h2>
            <div className="field panel-sub">
              <select
                id="amount-control-batch"
                aria-label="Sélectionner un fichier TikTak"
                value={selectedBatchId ?? ''}
                onChange={(event) =>
                  onSelectedBatchChange(event.target.value as Id<'importBatches'>)
                }
                disabled={importBatches.length === 0}
              >
                {importBatches.length === 0 ? (
                  <option value="">Aucun fichier importé</option>
                ) : null}
                {importBatches.map((batch) => (
                  <option key={batch._id} value={batch._id}>
                    {batch.attachmentName}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
          <dd className="amount">{formatMAD(breakdown?.cashAmount ?? 0)}</dd>
        </div>
        <div className="metric-row">
          <dt>Carte éligible</dt>
          <dd className="amount">{formatMAD(breakdown?.cardAmount ?? 0)}</dd>
        </div>
        <div className="metric-row">
          <dt>Paiement en ligne exclu</dt>
          <dd className="amount">{formatMAD(breakdown?.onlineAmount ?? 0)}</dd>
        </div>
        <div className="metric-row is-subtotal">
          <dt>Total de ce fichier</dt>
          <dd className="amount">{formatMAD(breakdown?.totalAmount ?? 0)}</dd>
        </div>
        <div className="metric-row is-total is-grand-total">
          <dt>Total Général (Tous les fichiers)</dt>
          <dd className="amount">{formatMAD(grandTotal)}</dd>
        </div>
      </dl>
    </section>
  );
}
