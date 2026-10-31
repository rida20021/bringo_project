import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import StatusBadge from '@/components/StatusBadge';
import { formatShortDate } from '@/lib/format';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const EXCEL_ACCEPT = [
  '.xlsx',
  '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
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

function isExcelFileName(name: string): boolean {
  const lower = name.toLocaleLowerCase('fr');
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

export default function ExcelImportPanel() {
  const generateUploadUrl = useMutation(api.imports.generateAdminUploadUrl);
  const importExcelFile = useAction(api.excelImport.importExcelFile);

  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importExcelFile>> | null>(
    null
  );

  const resetFile = () => {
    setFile(null);
    setFileError(null);
    // Remount the native input so the previously chosen filename disappears.
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
    if (!isExcelFileName(selected.name)) {
      setFile(null);
      setFileError('Format accepté : .xlsx ou .xls.');
      setFileInputKey((key) => key + 1);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError('Le fichier dépasse 20 Mo.');
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
      setFileError('Sélectionnez un fichier Excel.');
      return;
    }
    setFileError(null);
    setSubmitting(true);

    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || EXCEL_MIME_FALLBACK },
        body: file,
      });
      if (!response.ok) {
        throw new Error('Le téléversement du fichier Excel a échoué.');
      }
      const payload = (await response.json()) as { storageId: Id<'_storage'> };

      const importResult = await importExcelFile({
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
    <section className="panel" aria-labelledby="excel-import-title">
      <header className="panel-head">
        <div>
          <h2 id="excel-import-title">Import Excel</h2>
          <p className="panel-sub">
            Chargez le rapport TikTak pour rapprocher les saisies livreurs.
          </p>
        </div>
        <span className="panel-count">Fichier .xlsx / .xls</span>
      </header>

      <form className="import-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Fichier Excel du rapport TikTak</span>
          <input
            key={fileInputKey}
            type="file"
            name="excelFile"
            accept={EXCEL_ACCEPT}
            onChange={handleFileChange}
            disabled={submitting}
          />
          {file ? (
            <span className="file-name">
              {file.name} · {formatBytes(file.size)}
            </span>
          ) : null}
          <span className="field-hint">
            Rapport TikTak au format .xlsx ou .xls, 20 Mo maximum.
          </span>
          {fileError ? (
            <span className="field-error" role="alert">
              {fileError}
            </span>
          ) : null}
        </label>

        <div aria-live="polite">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={submitting || !file}
        >
          {submitting ? 'Import en cours…' : 'Importer un fichier Excel'}
        </button>
      </form>

      <div aria-live="polite">
        {result ? (
          result.duplicateFile ? (
            <div className="import-result">
              <p className="form-notice">
                Ce fichier a déjà été importé. Aucune nouvelle ligne n’a été ajoutée.
              </p>
              <dl className="metric-list">
                <div className="metric-row">
                  <dt>Rapport du</dt>
                  <dd>{formatShortDate(result.reportDate)}</dd>
                </div>
                <div className="metric-row">
                  <dt>État du lot</dt>
                  <dd>
                    <StatusBadge status={result.summary.status} />
                  </dd>
                </div>
                <div className="metric-row">
                  <dt>Lignes acceptées</dt>
                  <dd className="amount">
                    {result.summary.acceptedRows}/{result.summary.totalRows}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="import-result">
              <p className="form-success">
                Rapport du {formatShortDate(result.reportDate)} importé (
                {result.sheetName}).
              </p>
              <div className="import-summary">
                <dl className="metric-list">
                  <div className="metric-row">
                    <dt>Lignes acceptées</dt>
                    <dd className="amount">{result.accepted}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Lignes rejetées</dt>
                    <dd className="amount">{result.rejected}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Doublons</dt>
                    <dd className="amount">{result.duplicate}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Conflits</dt>
                    <dd className="amount">{result.conflict}</dd>
                  </div>
                </dl>
                <dl className="metric-list">
                  <div className="metric-row">
                    <dt>Commandes rapprochées</dt>
                    <dd className="amount">{result.matched}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Absentes du fichier Excel</dt>
                    <dd className="amount">{result.missingInExcel}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Montants différents</dt>
                    <dd className="amount">{result.amountMismatch}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Écarts créés / mis à jour</dt>
                    <dd className="amount">
                      {result.discrepanciesCreated} / {result.discrepanciesUpdated}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
