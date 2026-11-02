import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatMAD } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';
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

interface RiderPickerProps {
  riders: Doc<'riders'>[];
  riderId: string;
  onRiderIdChange: (riderId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Distinct names keep the two forms' inputs independent. */
  searchName: string;
  selectName: string;
}

/**
 * Searchable rider dropdown shared by the cash collection and bank deposit
 * forms so supervisors can type a name instead of scrolling a long list.
 */
function RiderPicker({
  riders,
  riderId,
  onRiderIdChange,
  search,
  onSearchChange,
  searchName,
  selectName,
}: RiderPickerProps) {
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const filteredRiders = normalizedSearch
    ? riders.filter((rider) =>
        rider.canonicalName.toLocaleLowerCase('fr').includes(normalizedSearch)
      )
    : riders;
  const selectedRider = riders.find((rider) => rider._id === riderId);
  // Keep the current selection visible even if it no longer matches the search.
  const riderOptions =
    selectedRider && !filteredRiders.some((rider) => rider._id === selectedRider._id)
      ? [selectedRider, ...filteredRiders]
      : filteredRiders;

  return (
    <>
      <label className="field">
        <span className="field-label">Rechercher un livreur</span>
        <input
          type="search"
          name={searchName}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tapez un nom…"
          autoComplete="off"
        />
        <span className="field-hint">Filtre la liste ci-dessous en temps réel.</span>
      </label>

      <label className="field">
        <span className="field-label">Livreur</span>
        <select
          name={selectName}
          value={riderId}
          onChange={(event) => onRiderIdChange(event.target.value)}
          disabled={riders.length === 0}
        >
          <option value="">
            {riders.length === 0
              ? 'Aucun livreur disponible'
              : riderOptions.length === 0
                ? 'Aucun livreur trouvé'
                : 'Sélectionner un livreur'}
          </option>
          {riderOptions.map((rider) => (
            <option key={rider._id} value={rider._id}>
              {rider.canonicalName}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export default function SupervisorPage() {
  const riders = useQuery(api.riders.getRiders, {});
  const generateUploadUrl = useMutation(api.imports.generateAdminUploadUrl);
  const createCashCollection = useMutation(api.deposits.createCashCollection);
  const createBankDeposit = useMutation(api.deposits.createBankDeposit);

  const [collectionRiderId, setCollectionRiderId] = useState('');
  const [collectionRiderSearch, setCollectionRiderSearch] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  const [depositRiderId, setDepositRiderId] = useState('');
  const [riderSearch, setRiderSearch] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositFile, setDepositFile] = useState<File | null>(null);
  const [depositFileKey, setDepositFileKey] = useState(0);
  const [depositFileError, setDepositFileError] = useState<string | null>(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  if (riders === undefined) return <LoadingSpinner />;

  const activeRiders = riders;

  const resetDepositForm = () => {
    setDepositRiderId('');
    setRiderSearch('');
    setDepositAmount('');
    setDepositFile(null);
    setDepositFileError(null);
    setDepositFileKey((k) => k + 1);
  };

  const handleCollectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!collectionRiderId) {
      toast.error('Sélectionnez un livreur.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(collectionAmount);
    if (amountCentimes === null) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    // Collections settle on the current Casablanca business day; the backend
    // normalizes this instant to the start of that day.
    const sourceReportDate = dateInputToTimestamp(todayDateInputValue());
    if (sourceReportDate === null) {
      toast.error('Date du rapport invalide.');
      return;
    }

    setCollectionSubmitting(true);
    try {
      await createCashCollection({
        riderId: collectionRiderId as Id<'riders'>,
        amount: amountCentimes,
        sourceReportDate,
      });

      toast.success(`Encaissement de ${formatMAD(amountCentimes)} enregistré.`);
      setCollectionRiderId('');
      setCollectionRiderSearch('');
      setCollectionAmount('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setCollectionSubmitting(false);
    }
  };

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

  const handleDepositSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!depositRiderId) {
      toast.error('Sélectionnez un livreur.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(depositAmount);
    if (amountCentimes === null) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    if (!depositFile) {
      toast.error('Joignez le reçu de dépôt bancaire.');
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

      toast.success(`Dépôt de ${formatMAD(amountCentimes)} enregistré.`);
      resetDepositForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setDepositSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Supervision</h1>
          <p className="page-sub">Encaissements et dépôts bancaires</p>
        </div>
        <span className="page-tag">Superviseur</span>
      </header>

      <section className="panel" aria-labelledby="collection-form-title">
        <header className="panel-head">
          <div>
            <h2 id="collection-form-title">Encaisser un livreur</h2>
            <p className="panel-sub">
              Enregistrez les espèces physiquement remises par un livreur.
            </p>
          </div>
        </header>

        <form className="rider-form" onSubmit={handleCollectionSubmit} noValidate>
          <RiderPicker
            riders={activeRiders}
            riderId={collectionRiderId}
            onRiderIdChange={setCollectionRiderId}
            search={collectionRiderSearch}
            onSearchChange={setCollectionRiderSearch}
            searchName="collectionRiderSearch"
            selectName="collectionRiderId"
          />

          <label className="field">
            <span className="field-label">Montant encaissé (MAD)</span>
            <input
              type="text"
              name="collectionAmount"
              value={collectionAmount}
              onChange={(event) => setCollectionAmount(event.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>

          <button
            type="submit"
            className="button button-primary button-block"
            disabled={collectionSubmitting}
          >
            {collectionSubmitting ? 'Enregistrement…' : 'Enregistrer l’encaissement'}
          </button>
        </form>
      </section>

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
          <RiderPicker
            riders={activeRiders}
            riderId={depositRiderId}
            onRiderIdChange={setDepositRiderId}
            search={riderSearch}
            onSearchChange={setRiderSearch}
            searchName="riderSearch"
            selectName="riderId"
          />

          <label className="field">
            <span className="field-label">Montant du dépôt (MAD)</span>
            <input
              type="text"
              name="amount"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
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
