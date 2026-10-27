import { TIER_NAMES } from "../lib/engine.js";

const TIER_CLASS = ["tier-ga", "tier-vip", "tier-front"];

export function PageHeader({ title, kicker, children }) {
  return (
    <header className="page-header">
      {kicker && <div className="kicker">{kicker}</div>}
      <h1>{title}</h1>
      {children && <p className="lead">{children}</p>}
    </header>
  );
}

/** A friendly "what is going on here" box for the audience. */
export function Explain({ title = "WHAT'S HAPPENING?", children }) {
  return (
    <aside className="explain">
      <div className="explain-title">{title}</div>
      <div className="explain-body">{children}</div>
    </aside>
  );
}

export function Notice({ tone = "info", title, children }) {
  return (
    <div className={`msg msg-${tone}`}>
      {title && <strong className="msg-title">{title}</strong>}
      <span>{children}</span>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function TierBadge({ tier }) {
  return <span className={`badge ${TIER_CLASS[tier] || "tier-bad"}`}>{TIER_NAMES[tier] ?? `TIER ${tier}`}</span>;
}

export function Stamp({ text, tone = "red" }) {
  return <div className={`stamp stamp-${tone}`}>{text}</div>;
}

export function Locked({ title, children }) {
  return (
    <section className="panel locked">
      <div className="lock-icon" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
