import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import MoneyChain from '@/components/MoneyChain';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatAmount, formatLongDate, formatMAD } from '@/lib/format';
import { dateInputToTimestamp, todayDateInputValue } from '@/lib/dates';

function readDateParam(searchParams: URLSearchParams): string | null {
  const value = searchParams.get('date');
  return value && dateInputToTimestamp(value) !== null ? value : null;
}

export default function SupervisorDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(
    () => readDateParam(searchParams) ?? todayDateInputValue()
  );
  const reportTimestamp =
    dateInputToTimestamp(selectedDate) ?? dateInputToTimestamp(todayDateInputValue())!;
  const isToday = selectedDate === todayDateInputValue();

  const data = useQuery(api.reconciliation.getSupervisorDashboardData, {
    reportDate: reportTimestamp,
  });

  const updateDate = (value: string) => {
    if (!value || dateInputToTimestamp(value) === null) return;
    setSelectedDate(value);
    const next = new URLSearchParams(searchParams);
    next.set('date', value);
    setSearchParams(next, { replace: true });
  };

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDate(event.target.value);
  };

  const resetToToday = () => {
    setSelectedDate(todayDateInputValue());
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  };

  const header = (
    <header className="page-head">
      <div>
        <h1>Tableau de bord</h1>
        <p className="page-sub">
          {isToday ? 'Aujourd’hui, ' : 'Rapport du '}
          {formatLongDate(reportTimestamp)} · Africa/Casablanca
        </p>
      </div>
      <div className="page-actions">
        <label className="date-filter" htmlFor="supervisor-report-date">
          <span className="date-filter-label">Date du rapport</span>
          <input
            id="supervisor-report-date"
            type="date"
            value={selectedDate}
            max={todayDateInputValue()}
            onChange={handleDateChange}
          />
        </label>
        {!isToday ? (
          <button type="button" className="button-ghost" onClick={resetToToday}>
            Aujourd’hui
          </button>
        ) : null}
        <span className="page-tag">Superviseur</span>
      </div>
    </header>
  );

  if (data === undefined) {
    return (
      <div className="page">
        {header}
        <LoadingSpinner />
      </div>
    );
  }

  const { kpis, riders: riderRows, pendingDeposits, pendingTpe } = data;
  const hasRiders = riderRows.length > 0;

  return (
    <div className="page">
      {header}

      <MoneyChain
        title="Circuit cash"
        description="Trois états distincts, jamais additionnés."
        stages={[
          {
            label: 'Reste dû par les livreurs',
            value: formatMAD(kpis.cashOutstanding),
            meta: `Sur ${formatMAD(kpis.totalCashDue)} dûs en cash`,
            emphasis: true,
          },
          {
            label: 'Encaissé',
            value: formatMAD(kpis.totalCollected),
            meta: 'Saisi par les superviseurs',
          },
          {
            label: 'Déposé et approuvé',
            value: formatMAD(kpis.totalDeposited),
            meta:
              kpis.totalPendingDeposit > 0
                ? `${formatMAD(kpis.totalPendingDeposit)} en attente d’approbation`
                : 'Aucun dépôt en attente',
          },
        ]}
        footer="Un dépôt en attente ne réduit pas le reste dû tant qu’il n’est pas approuvé."
      />

      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Circuit carte</h2>
              <p className="panel-sub">Preuves TPE et écart restant</p>
            </div>
          </header>
          <dl className="metric-list">
            <div className="metric-row">
              <dt>Carte due</dt>
              <dd className="amount">{formatMAD(kpis.totalCardDue)}</dd>
            </div>
            <div className="metric-row">
              <dt>TPE approuvé</dt>
              <dd className="amount">{formatMAD(kpis.totalTpeApproved)}</dd>
            </div>
            <div className="metric-row">
              <dt>TPE en attente</dt>
              <dd className="amount">{formatMAD(kpis.totalTpePending)}</dd>
            </div>
            <div className={`metric-row${kpis.cardVariance > 0 ? ' is-alert' : ''}`}>
              <dt>Écart carte</dt>
              <dd className="amount">{formatMAD(kpis.cardVariance)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>À traiter</h2>
              <p className="panel-sub">Éléments en attente de décision</p>
            </div>
          </header>
          <dl className="metric-list">
            <div className="metric-row">
              <dt>Dépôts bancaires</dt>
              <dd>
                <span className="amount">{formatMAD(kpis.totalPendingDeposit)}</span>
                <span className="metric-count">
                  {pendingDeposits.length} {pendingDeposits.length === 1 ? 'dépôt' : 'dépôts'}
                </span>
              </dd>
            </div>
            <div className="metric-row">
              <dt>Preuves TPE</dt>
              <dd>
                <span className="amount">{formatMAD(kpis.totalTpePending)}</span>
                <span className="metric-count">
                  {pendingTpe.length} {pendingTpe.length === 1 ? 'preuve' : 'preuves'}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Livreurs</h2>
            <p className="panel-sub">Soldes de la date sélectionnée, cash et carte séparés</p>
          </div>
          <span className="panel-count">
            {riderRows.length} {riderRows.length === 1 ? 'livreur' : 'livreurs'}
          </span>
        </header>

        {hasRiders ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Livreur</th>
                  <th scope="col" className="numeric">
                    Cash dû
                  </th>
                  <th scope="col" className="numeric">
                    Carte due
                  </th>
                  <th scope="col" className="numeric">
                    Encaissé
                  </th>
                  <th scope="col" className="numeric">
                    Reste
                  </th>
                </tr>
              </thead>
              <tbody>
                {riderRows.map((rider) => (
                  <tr key={rider.riderId}>
                    <td>{rider.name}</td>
                    <td className="numeric amount">{formatMAD(rider.cashDue)}</td>
                    <td className="numeric amount">{formatMAD(rider.cardDue)}</td>
                    <td className="numeric amount">{formatMAD(rider.collected)}</td>
                    <td className={`numeric amount${rider.remaining > 0 ? ' is-due' : ''}`}>
                      {formatMAD(rider.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p className="empty-title">Aucun livreur pour cette date</p>
            <p className="empty-text">
              Les soldes apparaîtront après l’import du rapport TIKTAK de cette date.
            </p>
          </div>
        )}
      </section>

      <p className="page-foot">
        Montants en centimes convertis à l’affichage · Total cash dû{' '}
        <span className="amount">{formatAmount(kpis.totalCashDue)}</span> MAD
      </p>
    </div>
  );
}