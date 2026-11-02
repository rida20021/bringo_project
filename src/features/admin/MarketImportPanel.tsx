import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_ACCEPT = [
  '.xlsx',
  '.xls',
  '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
].join(',');
const EXCEL_MIME_FALLBACK =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function isAcceptedFile(name: string): boolean {
  const lower = name.toLocaleLowerCase('fr');
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
}

export default function MarketImportPanel() {
  const generateUploadUrl = useMutation(api.imports.generateAdminUploadUrl);
  const importMarketsFile = useAction(api.marketImport.importMarketsFile);

  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importMarketsFile>> | null>(
    null
  );

  const resetFile = () => {
    setFile(null);
    setFileError(null);
    setFileInputKey((key) => key + 1);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    setResult(null);
    setFileError(null);

    if (!selected) {
      setFile(null);
      return;
    }
    if (!isAcceptedFile(selected.name)) {
      setFile(null);
      setFileError('Formats acceptés : .xlsx, .xls ou .csv.');
      setFileInputKey((key) => key + 1);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError('Le fichier dépasse 10 Mo.');
      setFileInputKey((key) => key + 1);
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setFileError('Sélectionnez un fichier Excel ou CSV.');
      return;
    }

    setFileError(null);
    setSubmitting(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const isCsv = file.name.toLocaleLowerCase('fr').endsWith('.csv');
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || (isCsv ? 'text/csv' : EXCEL_MIME_FALLBACK) },
        body: file,
      });
      if (!response.ok) throw new Error('Le téléversement du fichier a échoué.');
      const payload = (await response.json()) as { storageId: Id<'_storage'> };

      const importResult = await importMarketsFile({
        storageId: payload.storageId,
        fileName: file.name,
      });
      setResult(importResult);
      resetFile();
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="market-import-title">
      <header className="panel-head">
        <div>
          <h2 id="market-import-title">Importer des marchés</h2>
          <p className="panel-sub">
            Colonnes requises : nom/name, identifiant/external_id et ville/city.
          </p>
        </div>
        <span className="panel-count">Excel ou CSV · 10 Mo max.</span>
      </header>

      <form className="import-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Fichier des marchés</span>
          <input
            key={fileInputKey}
            type="file"
            name="marketFile"
            accept={FILE_ACCEPT}
            onChange={handleFileChange}
            disabled={submitting}
          />
          {file ? (
            <span className="file-name">
              {file.name} · {formatBytes(file.size)}
            </span>
          ) : null}
          <span className="field-hint">Une ligne par marché, avec les trois colonnes requises.</span>
          {fileError ? (
            <span className="field-error" role="alert">
              {fileError}
            </span>
          ) : null}
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="button button-primary"
          disabled={submitting || !file}
        >
          {submitting ? 'Import en cours…' : 'Importer les marchés'}
        </button>
      </form>

      <div aria-live="polite">
        {result ? (
          <div className="import-result">
            <p className={result.created > 0 ? 'form-success' : 'form-notice'}>
              {result.created} marché(s) créé(s), {result.skipped} ligne(s) ignorée(s).
            </p>
            <dl className="metric-list market-import-summary">
              <div className="metric-row">
                <dt>Lignes lues</dt>
                <dd className="amount">{result.totalRows}</dd>
              </div>
              <div className="metric-row">
                <dt>Marchés créés</dt>
                <dd className="amount">{result.created}</dd>
              </div>
              <div className="metric-row">
                <dt>Lignes ignorées</dt>
                <dd className="amount">{result.skipped}</dd>
              </div>
            </dl>
            {result.errors.length > 0 ? (
              <details className="import-errors">
                <summary>Afficher les détails ({result.errors.length})</summary>
                <ul>
                  {result.errors.map((message, index) => (
                    <li key={`${index}-${message}`}>{message}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
