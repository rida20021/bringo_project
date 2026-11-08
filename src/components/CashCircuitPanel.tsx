import MoneyChain from '@/components/MoneyChain';
import { formatMAD } from '@/lib/format';

interface CashCircuitPanelProps {
  kpis: {
    cashOutstanding: number;
    totalCashDue: number;
    totalCollected: number;
    totalDeposited: number;
    totalPendingDeposit: number;
    totalCardDue: number;
    cardVariance: number;
    totalTpePending: number;
  };
  pendingDeposits: any[];
  pendingTpe: any[];
}

export default function CashCircuitPanel({
  kpis,
  pendingDeposits,
  pendingTpe,
}: CashCircuitPanelProps) {
  return (
    <>
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
              <p className="panel-sub">Carte due et écart restant</p>
            </div>
          </header>
          <dl className="metric-list">
            <div className="metric-row">
              <dt>Carte due</dt>
              <dd className="amount">{formatMAD(kpis.totalCardDue)}</dd>
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
    </>
  );
}
