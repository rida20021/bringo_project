import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { AlertTriangle, CheckCircle2, FileText, Calendar } from 'lucide-react';
import { formatMAD } from '@/lib/format/currency';
import LoadingSpinner from '@/components/LoadingSpinner';

function timestampToDateInput(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().split('T')[0];
}

function dateInputToTimestampStart(dateStr: string): number {
  if (!dateStr) return Date.now();
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function dateInputToTimestampEnd(dateStr: string): number {
  if (!dateStr) return Date.now();
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export default function ReconciliationPage() {
  const [startDate, setStartDate] = useState(() => timestampToDateInput(Date.now()));
  const [endDate, setEndDate] = useState(() => timestampToDateInput(Date.now()));

  const fromDate = dateInputToTimestampStart(startDate);
  const toDate = dateInputToTimestampEnd(endDate);

  const data = useQuery(api.reconciliation.getGlobalReconciliation, {
    fromDate,
    toDate,
  });

  if (!data) return <LoadingSpinner />;

  const { totals, alerts, mismatches, missingLive, liveOnly } = data;
  const hasAlerts = alerts.mismatchCount > 0 || alerts.missingLiveCount > 0;

  return (
    <div className="report-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <header className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary, #4a397e)' }}>
            Rapprochement Global
          </h1>
          <p className="page-sub" style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
            Fusion unifiée du Chiffre d'Affaires (CA) Excel et des saisies Live sans double compte.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <Calendar size={18} style={{ color: 'var(--primary, #4a397e)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Du:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Au:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
            />
          </div>
        </div>
      </header>

      {hasAlerts && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#991b1b',
          }}
          role="alert"
        >
          <AlertTriangle size={22} style={{ flexShrink: 0, color: '#dc2626' }} />
          <span style={{ fontSize: '15px', fontWeight: 600 }}>
            ⚠️ Attention : {alerts.mismatchCount} écart(s) de montant et {alerts.missingLiveCount} saisie(s) manquante(s) nécessitent votre attention.
          </span>
        </div>
      )}

      {/* KPI Summary Cards (4-column grid) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div className="panel" style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>CA Réel</span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary, #4a397e)', marginTop: '8px' }}>
            {formatMAD(totals.realCash)}
          </div>
        </div>
        <div className="panel" style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>CA Excel</span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginTop: '8px' }}>
            {formatMAD(totals.excelTotal)}
          </div>
        </div>
        <div className="panel" style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>CA Live (Non matché)</span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '8px' }}>
            {formatMAD(totals.liveOnlyTotal)}
          </div>
        </div>
        <div className="panel" style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Encaissé</span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669', marginTop: '8px' }}>
            {formatMAD(totals.collected)}
          </div>
        </div>
      </div>

      {/* Section A: Écarts de montant (Mismatches) */}
      <section className="panel" style={{ marginBottom: '28px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} style={{ color: '#dc2626' }} />
          Écarts de montant ({mismatches.length})
        </h2>
        {mismatches.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', padding: '12px 0', fontSize: '14px', fontWeight: 500 }}>
            <CheckCircle2 size={18} />
            <span>Aucun problème détecté</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '10px' }}>Commande</th>
                  <th scope="col" style={{ textAlign: 'right', padding: '10px' }}>Montant Live</th>
                  <th scope="col" style={{ textAlign: 'right', padding: '10px' }}>Montant Excel</th>
                  <th scope="col" style={{ textAlign: 'right', padding: '10px' }}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((item) => {
                  const diff = item.liveAmount - item.excelAmount;
                  return (
                    <tr key={item.commandId} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px', fontWeight: 500, color: '#1f2937' }}>{item.commandId}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{formatMAD(item.liveAmount)}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{formatMAD(item.excelAmount)}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <span className="badge badge-danger">
                          <span className="badge-dot" aria-hidden="true" />
                          {formatMAD(diff)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section B: Saisies manquantes (Missing Live) */}
      <section className="panel" style={{ marginBottom: '28px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: '#d97706' }} />
          Saisies manquantes ({missingLive.length})
        </h2>
        {missingLive.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', padding: '12px 0', fontSize: '14px', fontWeight: 500 }}>
            <CheckCircle2 size={18} />
            <span>Aucun problème détecté</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '10px' }}>Commande</th>
                  <th scope="col" style={{ textAlign: 'right', padding: '10px' }}>Montant Excel</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '10px' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {missingLive.map((item) => (
                  <tr key={item.commandId} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px', fontWeight: 500, color: '#1f2937' }}>{item.commandId}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatMAD(item.excelAmount)}</td>
                    <td style={{ padding: '10px', textAlign: 'left' }}>
                      <span className="badge badge-pending">
                        <span className="badge-dot" aria-hidden="true" />
                        Non saisi par le livreur
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section C: Saisies Live en attente d'Excel (Live Only) */}
      <section className="panel" style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: '#eab818' }} />
          Saisies Live en attente d'Excel ({liveOnly.length})
        </h2>
        {liveOnly.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', padding: '12px 0', fontSize: '14px', fontWeight: 500 }}>
            <CheckCircle2 size={18} />
            <span>Aucun problème détecté</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '10px' }}>Commande</th>
                  <th scope="col" style={{ textAlign: 'right', padding: '10px' }}>Montant Live</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '10px' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {liveOnly.map((item) => (
                  <tr key={item.commandId} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px', fontWeight: 500, color: '#1f2937' }}>{item.commandId}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatMAD(item.liveAmount)}</td>
                    <td style={{ padding: '10px', textAlign: 'left' }}>
                      <span className="badge badge-info">
                        <span className="badge-dot" aria-hidden="true" />
                        En attente du fichier TIKTAK
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
