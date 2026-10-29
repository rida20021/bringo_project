export default function LoadingSpinner() {
  return (
    <div className="loading-page" role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <span className="loading-label">Chargement…</span>
    </div>
  );
}
