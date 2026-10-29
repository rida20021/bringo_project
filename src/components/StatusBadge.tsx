const statusMap: Record<string, { label: string; tone: 'neutral' | 'pending' | 'ok' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'pending' },
  processing: { label: 'En cours', tone: 'pending' },
  submitted: { label: 'À approuver', tone: 'pending' },
  pending_review: { label: 'À approuver', tone: 'pending' },
  needs_review: { label: 'À vérifier', tone: 'pending' },
  approved: { label: 'Approuvé', tone: 'ok' },
  completed: { label: 'Terminé', tone: 'ok' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  failed: { label: 'Échec', tone: 'danger' },
};

export default function StatusBadge({ status }: { status: string }) {
  const entry = statusMap[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <span className={`badge badge-${entry.tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {entry.label}
    </span>
  );
}
