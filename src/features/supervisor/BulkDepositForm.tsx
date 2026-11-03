import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDateTime, formatMAD } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';
import { toast } from 'sonner';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface VaultItem {
  collectionId: Id<'cashCollections'>;
  riderId: Id<'riders'>;
  riderName: string;
  amount: number;
  collectedAt: number;
  sourceReportDate: number;
  cashStatus: 'held_by_supervisor' | 'deposited_pending' | 'cleared';
  linkedDepositId: Id<'bankDeposits'> | null;
  note: string | null;
}

interface BulkDepositFormProps {
  heldCollections: VaultItem[];
}

export default function BulkDepositForm({ heldCollections }: BulkDepositFormProps) {
  const generateUploadUrl = useMutation(api.imports.generateAdminUploadUrl);
  const createBulkBankDeposit = useMutation(api.deposits.createBulkBankDeposit);

  const [selectedIds, setSelectedIds] = useState<Set<Id<'cashCollections'>>>(new Set());
  const [depositAmount, setDepositAmount] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [depositFile, setDepositFile] = useState<File | null>(null);
  const [depositFileKey, setDepositFileKey] = useState(0);
  const [depositFileError, setDepositFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleSelectAll = () => {
    if (selectedIds.size === heldCollections.length) {
      setSelectedIds(new Set());
      setDepositAmount('');
    } else {
      const allIds = new Set(heldCollections.map((c) => c.collectionId));
      setSelectedIds(allIds);
      const totalCentimes = heldCollections.reduce((sum, c) => sum + c.amount, 0);
      setDepositAmount((totalCentimes / 100).toFixed(2));
    }
  };

  const toggleItem = (id: Id<'cashCollections'>) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);

    const totalSelected = heldCollections
      .filter((c) => next.has(c.collectionId))
      .reduce((sum, c) => sum + c.amount, 0);
    setDepositAmount(totalSelected > 0 ? (totalSelected / 100).toFixed(2) : '');
  };

  const selectedTotalCentimes = heldCollections
    .filter((c) => selectedIds.has(c.collectionId))
    .reduce((sum, c) => sum + c.amount, 0);

  const handleDepositFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setDepositFileError(null);

    if (!selected) {
      setDepositFile(null);
      return;
    }
    if (!ALLOWED_RECEIPT_TYPES.has(selected.type)) {
      setDepositFile(null);
      setDepositFileError('Format accepté : JPG, PNG, WEBP ou PDF.');
      setDepositFileKey((k) => k + 1);
      return;
    }
    if (selected.size > MAX_RECEIPT_BYTES) {
      setDepositFile(null);
      setDepositFileError('Le fichier dépasse 10 Mo.');
      setDepositFileKey((k) => k + 1);
      return;
    }
    setDepositFile(selected);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedIds.size === 0) {
      toast.error('Sélectionnez au moins un encaissement à déposer.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(depositAmount);
    if (amountCentimes === null || amountCentimes <= 0) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    if (!depositFile) {
      toast.error('Joignez le reçu bancaire unique.');
      return;
    }

    setSubmitting(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': depositFile.type },
        body: depositFile,
      });
      if (!response.ok) throw new Error('Le téléversement du reçu a échoué.');

      const payload = (await response.json()) as { storageId: Id<'_storage'> };

      await createBulkBankDeposit({
        amount: amountCentimes,
        storageId: payload.storageId,
        collectionIds: Array.from(selectedIds),
        bankReference: bankReference.trim() || undefined,
      });

      toast.success(
        `Dépôt groupé de ${formatMAD(amountCentimes)} enregistré (${selectedIds.size} livreur(s) couverts).`
      );

      setSelectedIds(new Set());
      setDepositAmount('');
      setBankReference('');
      setDepositFile(null);
      setDepositFileKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  if (heldCollections.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">Aucune espèce en caisse à déposer</p>
        <p className="empty-text">
          Encaissez d’abord les livreurs ci-dessus. Les montants physiques collectés
          apparaîtront ici pour préparer votre dépôt bancaire groupé.
        </p>
      </div>
    );
  }

  const allSelected = selectedIds.size === heldCollections.length && heldCollections.length > 0;

  return (
    <form className="rider-form" onSubmit={handleSubmit} noValidate>
      <div className="bulk-selection-bar">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
          />
          <strong>
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'} ({heldCollections.length})
          </strong>
        </label>
        <span className="amount">
          Sélectionné : {formatMAD(selectedTotalCentimes)}
        </span>
      </div>

      <div className="vault-table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '1.25rem' }}>
        <table className="chain-of-custody-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }} scope="col">
                <span className="sr-only">Sélection</span>
              </th>
              <th scope="col">Livreur</th>
              <th scope="col" className="numeric">Montant</th>
              <th scope="col">Collecté le</th>
            </tr>
          </thead>
          <tbody>
            {heldCollections.map((item) => {
              const isChecked = selectedIds.has(item.collectionId);
              return (
                <tr
                  key={item.collectionId}
                  onClick={() => toggleItem(item.collectionId)}
                  style={{ cursor: 'pointer', background: isChecked ? 'rgba(74, 57, 126, 0.05)' : undefined }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(item.collectionId)}
                    />
                  </td>
                  <td>
                    <strong>{item.riderName}</strong>
                    {item.note ? <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{item.note}</p> : null}
                  </td>
                  <td className="numeric amount">{formatMAD(item.amount)}</td>
                  <td style={{ fontSize: '0.8125rem' }}>{formatDateTime(item.collectedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="field">
        <span className="field-label">Montant déposé à la banque (MAD)</span>
        <input
          type="text"
          name="amount"
          value={depositAmount}
          onChange={(event) => setDepositAmount(event.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
        />
        <span className="field-hint">
          Pré-rempli avec la somme sélectionnée ({formatMAD(selectedTotalCentimes)}). Modifiable en cas d’écart physique.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Référence bancaire (optionnel)</span>
        <input
          type="text"
          name="bankReference"
          value={bankReference}
          onChange={(event) => setBankReference(event.target.value)}
          placeholder="N° de bordereau ou transaction"
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span className="field-label">Reçu de dépôt bancaire unique</span>
        <input
          key={`bulk-deposit-file-${depositFileKey}`}
          type="file"
          name="receipt"
          accept={RECEIPT_ACCEPT}
          onChange={handleDepositFileChange}
        />
        {depositFile ? (
          <span className="file-name">
            {depositFile.name} · {formatBytes(depositFile.size)}
          </span>
        ) : null}
        <span className="field-hint">
          Bordereau ou reçu bancaire couvrant l’ensemble des {selectedIds.size} encaissement(s) sélectionné(s). Max 10 Mo.
        </span>
        {depositFileError ? (
          <span className="field-error" role="alert">
            {depositFileError}
          </span>
        ) : null}
      </label>

      <button
        type="submit"
        className="button button-primary button-block"
        disabled={submitting || selectedIds.size === 0}
      >
        {submitting
          ? 'Enregistrement du dépôt…'
          : `Déposer ${depositAmount ? `${depositAmount} MAD` : ''} (${selectedIds.size} encaissements)`}
      </button>
    </form>
  );
}
