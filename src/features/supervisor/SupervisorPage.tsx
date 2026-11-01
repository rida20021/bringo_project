import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function SupervisorPage() {
  const riders = useQuery(api.riders.getRiders, {});
  const generateUploadUrl = useMutation(api.imports.generateAdminUploadUrl);
  const createBankDeposit = useMutation(api.deposits.createBankDeposit);

  const [depositRiderId, setDepositRiderId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositFile, setDepositFile] = useState<File | null>(null);
  const [depositFileKey, setDepositFileKey] = useState(0);
  const [depositFileError, setDepositFileError] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  if (riders === undefined) return <LoadingSpinner />;

  const activeRiders = riders;

  const resetDepositForm = () => {
    setDepositRiderId('');
    setDepositAmount('');
    setDepositFile(null);
    setDepositFileError(null);
    setDepositFileKey((k) => k + 1);
  };

  const handleDepositFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setDepositError(null);
    setDepositSuccess(null);
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

  const handleDepositSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDepositError(null);
    setDepositSuccess(null);

    if (!depositRiderId) {
      setDepositError('Sélectionnez un livreur.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(depositAmount);
    if (amountCentimes === null) {
      setDepositError('Saisissez un montant valide supérieur à 0.');
      return;
    }

    if (!depositFile) {
      setDepositError('Joignez le reçu de dépôt bancaire.');
      return;
    }

    setDepositSubmitting(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': depositFile.type },
        body: depositFile,
      });
      if (!response.ok) throw new Error("Le téléversement du reçu a échoué.");

      const payload = (await response.json()) as { storageId: Id<'_storage'> };

      await createBankDeposit({
        riderId: depositRiderId as Id<'riders'>,
        amount: amountCentimes,
        storageId: payload.storageId,
      });

      setDepositSuccess(`Dépôt de ${formatMAD(amountCentimes)} enregistré. Il sera examiné par l’administration.`);
      resetDepositForm();
    } catch (err) {
      setDepositError(readError(err));
    } finally {
      setDepositSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Supervision</h1>
          <p className="page-sub">Enregistrement des dépôts bancaires</p>
        </div>
        <span className="page-tag">Superviseur</span>
      </header>

      <section className="panel" aria-labelledby="deposit-form-title">
        <header className="panel-head">
          <div>
            <h2 id="deposit-form-title">Dépôt bancaire</h2>
            <p className="panel-sub">
              Enregistrez un dépôt en espèces effectué par un livreur.
            </p>
          </div>
        </header>

        <form className="rider-form" onSubmit={handleDepositSubmit} noValidate>
          <label className="field">
            <span className="field-label">Livreur</span>
            <select
              name="riderId"
              value={depositRiderId}
              onChange={(event) => {
                setDepositRiderId(event.target.value);
                setDepositError(null);
                setDepositSuccess(null);
              }}
              disabled={activeRiders.length === 0}
            >
              <option value="">
                {activeRiders.length === 0
                  ? 'Aucun livreur disponible'
                  : 'Sélectionner un livreur'}
              </option>
              {activeRiders.map((rider) => (
                <option key={rider._id} value={rider._id}>
                  {rider.canonicalName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Montant du dépôt (MAD)</span>
            <input
              type="text"
              name="amount"
              value={depositAmount}
              onChange={(event) => {
                setDepositAmount(event.target.value);
                setDepositError(null);
                setDepositSuccess(null);
              }}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Reçu de dépôt bancaire</span>
            <input
              key={`deposit-file-${depositFileKey}`}
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
              Photo ou PDF du bordereau de dépôt, 10 Mo maximum.
            </span>
            {depositFileError ? (
              <span className="field-error" role="alert">
                {depositFileError}
              </span>
            ) : null}
          </label>

          <div aria-live="polite">
            {depositError ? (
              <p className="form-error" role="alert">
                {depositError}
              </p>
            ) : null}
            {depositSuccess ? <p className="form-success">{depositSuccess}</p> : null}
          </div>

          <button
            type="submit"
            className="button button-primary button-block"
            disabled={depositSubmitting}
          >
            {depositSubmitting ? 'Enregistrement…' : 'Enregistrer le dépôt'}
          </button>
        </form>
      </section>
    </div>
  );
}