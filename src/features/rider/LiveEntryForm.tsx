import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatMAD, paymentMethodLabels } from '@/lib/format';
import { parseAmountToCentimes } from '@/lib/money';
import { toast } from 'sonner';

type PaymentMethod = 'cash' | 'tpe' | 'card';
type ReceiptKind = 'tpe' | 'bank_deposit';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const methods: PaymentMethod[] = ['cash', 'tpe', 'card'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function LiveEntryForm() {
  const markets = useQuery(api.markets.listMarkets, {});
  const generateUploadUrl = useMutation(api.receipts.generateUploadUrl);
  const createLiveOrder = useMutation(api.orders.createLiveOrder);

  const [commandId, setCommandId] = useState('');
  const [marketId, setMarketId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeMarkets = markets ?? [];
  const lockedForMarkets = markets !== undefined && activeMarkets.length === 0;

  const resetFile = () => {
    setFile(null);
    setFileError(null);
    // Remount the native input so a previously chosen filename disappears.
    setFileInputKey((key) => key + 1);
  };

  const selectMethod = (next: PaymentMethod) => {
    if (next === method) return;
    setMethod(next);
    resetFile();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFileError(null);

    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_RECEIPT_TYPES.has(selected.type)) {
      setFile(null);
      setFileError('Format accepté : JPG, PNG, WEBP ou PDF.');
      setFileInputKey((key) => key + 1);
      return;
    }
    if (selected.size > MAX_RECEIPT_BYTES) {
      setFile(null);
      setFileError('Le fichier dépasse 10 Mo.');
      setFileInputKey((key) => key + 1);
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCommand = commandId.trim();
    if (!trimmedCommand) {
      toast.error('Le numéro de commande est obligatoire.');
      return;
    }
    if (!marketId) {
      toast.error('Sélectionnez un marché.');
      return;
    }

    const amountCentimes = parseAmountToCentimes(amount);
    if (amountCentimes === null) {
      toast.error('Saisissez un montant valide supérieur à 0.');
      return;
    }

    const kind: ReceiptKind | null =
      method === 'tpe' ? 'tpe' : method === 'cash' ? 'bank_deposit' : null;
    if (method === 'tpe' && !file) {
      toast.error('Le reçu TPE est obligatoire pour un paiement TPE.');
      return;
    }

    setSubmitting(true);
    try {
      let receipt:
        | {
            kind: ReceiptKind;
            storageId: Id<'_storage'>;
            fileName: string;
            mimeType: string;
            size: number;
          }
        | undefined;

      if (file && kind) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) throw new Error('Le téléversement du reçu a échoué.');
        const payload = (await response.json()) as { storageId: Id<'_storage'> };
        receipt = {
          kind,
          storageId: payload.storageId,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        };
      }

      await createLiveOrder({
        commandId: trimmedCommand,
        marketId: marketId as Id<'markets'>,
        amount: amountCentimes,
        paymentMethod: method,
        receipt,
      });

      toast.success(`Commande ${trimmedCommand} enregistrée (${formatMAD(amountCentimes)}).`);
      setCommandId('');
      setAmount('');
      setMethod('cash');
      resetFile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="live-entry-title">
      <header className="panel-head">
        <div>
          <h2 id="live-entry-title">Nouvelle commande</h2>
          <p className="panel-sub">Enregistrez une livraison dès qu’elle est terminée.</p>
        </div>
      </header>

      <form className="rider-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Numéro de commande</span>
          <input
            type="text"
            name="commandId"
            value={commandId}
            onChange={(event) => setCommandId(event.target.value)}
            placeholder="CMD-12345"
            autoComplete="off"
            maxLength={60}
          />
        </label>

        <label className="field">
          <span className="field-label">Marché</span>
          <select
            name="marketId"
            value={marketId}
            onChange={(event) => setMarketId(event.target.value)}
            disabled={markets === undefined || lockedForMarkets}
          >
            <option value="">
              {markets === undefined
                ? 'Chargement…'
                : lockedForMarkets
                  ? 'Aucun marché disponible'
                  : 'Sélectionner un marché'}
            </option>
            {activeMarkets.map((market) => (
              <option key={market._id} value={market._id}>
                {market.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Montant (MAD)</span>
          <input
            type="text"
            name="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            autoComplete="off"
          />
        </label>

        <div className="field">
          <span className="field-label">Mode de paiement</span>
          <div className="method-options" role="radiogroup" aria-label="Mode de paiement">
            {methods.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                className={`method-option${method === value ? ' is-active' : ''}`}
                onClick={() => selectMethod(value)}
              >
                {paymentMethodLabels[value]}
              </button>
            ))}
          </div>
        </div>

        {method !== 'card' ? (
          <label className="field">
            <span className="field-label">
              {method === 'tpe'
                ? 'Reçu TPE (obligatoire)'
                : 'Reçu de dépôt bancaire (facultatif)'}
            </span>
            <input
              key={`${method}-${fileInputKey}`}
              type="file"
              name="receipt"
              accept={RECEIPT_ACCEPT}
              onChange={handleFileChange}
            />
            {file ? (
              <span className="file-name">
                {file.name} · {formatBytes(file.size)}
              </span>
            ) : null}
            <span className="field-hint">
              {method === 'tpe'
                ? 'Photo ou PDF du ticket TPE, 10 Mo maximum.'
                : 'Ajoutez-le maintenant ou plus tard après le dépôt. 10 Mo maximum.'}
            </span>
            {fileError ? (
              <span className="field-error" role="alert">
                {fileError}
              </span>
            ) : null}
          </label>
        ) : (
          <p className="field-hint">
            Paiement en ligne via l’application Bringo : aucun justificatif requis.
          </p>
        )}

        <button
          type="submit"
          className="button button-primary button-block"
          disabled={submitting || markets === undefined || lockedForMarkets}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer la commande'}
        </button>
      </form>
    </section>
  );
}
