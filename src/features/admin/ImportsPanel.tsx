import { Fragment, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, formatShortDate } from '@/lib/format';

const DELETE_CONFIRMATION =
  'Êtes-vous sûr ? Cela supprimera toutes les commandes et écarts associés.';

function readError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught Error:\s*(.+)$/);
    return match ? match[1] : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

function ImportIssues({ batchId }: { batchId: Id<'importBatches'> }) {
  const issues = useQuery(api.imports.getImportBatchIssues, { batchId });

  if (issues === undefined) {
    return <p className="review-loading">Chargement des détails…</p>;
  }

  if (issues.length === 0) {
    return <p className="review-loading">Aucune ligne en erreur pour cet import.</p>;
  }

  return (
    <ul className="import-issue-list">
      {issues.map((issue) => (
        <li className="import-issue" key={issue._id}>
          <div className="import-issue-head">
            <span
              className={`badge ${
                issue.validationState === 'conflict' ? 'badge-danger' : 'badge-pending'
              }`}
            >
              <span className="badge-dot" aria-hidden="true" />
              {issue.validationState === 'conflict' ? 'Conflit' : 'Invalide'}
            </span>
            <span className="import-issue-row">Ligne {issue.rowNumber}</span>
            {issue.commandId ? (
              <code className="import-issue-command">{issue.commandId}</code>
            ) : null}
          </div>
          {issue.errors.length > 0 ? (
            <ul className="import-issue-messages">
              {issue.errors.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          ) : (
            <p className="import-issue-messages">Aucun détail fourni.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ImportsPanelProps {
  batches: Doc<'importBatches'>[];
  conflictRows: number;
}

export default function ImportsPanel({ batches, conflictRows }: ImportsPanelProps) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const deleteImportBatch = useMutation(api.imports.deleteImportBatch);
  const convex = useConvex();

  const isAdmin = currentUser?.role === 'admin';
  const [expandedId, setExpandedId] = useState<Id<'importBatches'> | null>(null);
  const [downloadingId, setDownloadingId] = useState<Id<'importBatches'> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<'importBatches'> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleBatch = (batchId: Id<'importBatches'>) => {
    setError(null);
    setExpandedId((current) => (current === batchId ? null : batchId));
  };

  const handleDownload = async (batch: Doc<'importBatches'>) => {
    setError(null);
    setDownloadingId(batch._id);
    try {
      const url = await convex.query(api.imports.getImportFileUrl, { batchId: batch._id });
      if (!url) {
        setError('Le fichier original n’est pas disponible pour cet import.');
        return;
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = batch.attachmentName || 'import.xlsx';
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(readError(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (batch: Doc<'importBatches'>) => {
    setError(null);
    if (!window.confirm(DELETE_CONFIRMATION)) return;

    setDeletingId(batch._id);
    try {
      await deleteImportBatch({ batchId: batch._id });
      setExpandedId((current) => (current === batch._id ? null : current));
    } catch (err) {
      setError(readError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const columnCount = isAdmin ? 6 : 5;

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Imports récents</h2>
          <p className="panel-sub">
            Rapports reçus et état de traitement
            {isAdmin ? ' · cliquez sur un fichier pour voir le détail des erreurs' : ''}
          </p>
        </div>
        <span className="panel-count">{conflictRows} conflit(s)</span>
      </header>

      {isAdmin ? (
        <div aria-live="polite">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {batches.length > 0 ? (
        <div className="table-wrap">
          <table className="table import-table">
            <thead>
              <tr>
                <th scope="col">Fichier</th>
                <th scope="col">Rapport</th>
                <th scope="col" className="numeric">
                  Lignes
                </th>
                <th scope="col">État</th>
                <th scope="col">Reçu</th>
                {isAdmin ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const hasIssues = batch.rejectedRows > 0 || batch.conflictRows > 0;
                const isExpanded = expandedId === batch._id;
                const isDownloading = downloadingId === batch._id;
                const isDeleting = deletingId === batch._id;
                const issuesId = `import-issues-${batch._id}`;

                return (
                  <Fragment key={batch._id}>
                    <tr className={isExpanded ? 'import-row is-expanded' : 'import-row'}>
                      <td className="table-file">
                        {isAdmin && hasIssues ? (
                          <button
                            type="button"
                            className="import-file-toggle"
                            aria-expanded={isExpanded}
                            aria-controls={issuesId}
                            onClick={() => toggleBatch(batch._id)}
                          >
                            <span className="accordion-chevron" aria-hidden="true">
                              ▶
                            </span>
                            <span className="import-file-name">{batch.attachmentName}</span>
                          </button>
                        ) : (
                          <span className="import-file-name">{batch.attachmentName}</span>
                        )}
                      </td>
                      <td>{formatShortDate(batch.reportDate)}</td>
                      <td className="numeric amount">
                        {batch.acceptedRows}/{batch.totalRows}
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="table-muted">{formatDateTime(batch.receivedAt)}</td>
                      {isAdmin ? (
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="button-ghost"
                              onClick={() => handleDownload(batch)}
                              disabled={isDownloading || isDeleting || !batch.storageId}
                              title={
                                batch.storageId
                                  ? 'Télécharger le fichier original'
                                  : 'Fichier original non disponible'
                              }
                            >
                              {isDownloading ? 'Téléchargement…' : 'Télécharger'}
                            </button>
                            <button
                              type="button"
                              className="button-ghost is-danger"
                              onClick={() => handleDelete(batch)}
                              disabled={isDownloading || isDeleting}
                            >
                              {isDeleting ? 'Suppression…' : 'Supprimer'}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {isAdmin && isExpanded ? (
                      <tr className="import-details-row" id={issuesId}>
                        <td colSpan={columnCount}>
                          <ImportIssues batchId={batch._id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p className="empty-title">Aucun rapport sur la période</p>
          <p className="empty-text">
            Les rapports TIKTAK reçus par e-mail apparaîtront ici avec leur état de traitement.
          </p>
        </div>
      )}
    </section>
  );
}
