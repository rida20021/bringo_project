export interface ChainStage {
  label: string;
  value: string;
  meta?: string;
  emphasis?: boolean;
}

interface MoneyChainProps {
  title: string;
  description?: string;
  stages: ChainStage[];
  footer?: string;
}

/**
 * Horizontal representation of the cash lifecycle. Each stage is intentionally
 * distinct: money owed, money collected, and money deposited are never summed.
 */
export default function MoneyChain({ title, description, stages, footer }: MoneyChainProps) {
  return (
    <section className="chain-panel" aria-labelledby="chain-title">
      <header className="chain-head">
        <div>
          <h2 id="chain-title">{title}</h2>
          {description ? <p className="chain-description">{description}</p> : null}
        </div>
      </header>

      <ol className="chain">
        {stages.map((stage) => (
          <li className="chain-stage" key={stage.label}>
            <span className="chain-node" aria-hidden="true" />
            <span className="chain-label">{stage.label}</span>
            <span className={`chain-value${stage.emphasis ? ' is-emphasis' : ''}`}>{stage.value}</span>
            <span className="chain-meta">{stage.meta ?? '\u00a0'}</span>
          </li>
        ))}
      </ol>

      {footer ? <p className="chain-footer">{footer}</p> : null}
    </section>
  );
}
