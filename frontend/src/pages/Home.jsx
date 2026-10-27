import { Link } from "react-router-dom";
import { useStore } from "../context/Store.jsx";
import { ROLES } from "../lib/roles.js";
import { checkChain } from "../lib/engine.js";
import { money } from "../lib/format.js";

const PROBLEMS = [
  {
    problem: "Fake tickets",
    fix: "Every real ticket is recorded on the blockchain with a fingerprint. A made-up or edited ticket does not match.",
  },
  {
    problem: "Screenshots and double entry",
    fix: "At the gate the owner signs a random code with their private key. A screenshot cannot do that, and a used ticket is marked forever.",
  },
  {
    problem: "Scalpers",
    fix: "The rules only allow resale up to a price limit (for example 110%). Nobody can list it higher.",
  },
];

const FLOW = [
  ["1. BUY", "A fan buys a ticket. The purchase becomes a new block on the blockchain."],
  ["2. RECORD", "The block stores the ticket's owner and fingerprint, and is linked to the block before it."],
  ["3. PROVE", "At the gate the fan signs a random code with their private key to prove it is theirs."],
  ["4. CHECK", "The gate checks the blockchain: real ticket, real owner, not used yet. Then lets them in."],
];

export default function Home() {
  const { state, setPresenterOpen, resetDemo } = useStore();
  const chainOk = checkChain(state.chain).ok;

  return (
    <>
      <section className="hero">
        <div className="kicker">COLLEGE PROJECT / BLOCKCHAIN CONCEPT DEMO</div>
        <h1>PIXELPASS</h1>
        <p className="hero-lead">Concert tickets that cannot be faked, copied, used twice or scalped, because every ticket lives on a blockchain.</p>
        <div className="hero-actions">
          <button className="btn btn-pink btn-big" onClick={() => setPresenterOpen(true)}>
            Start guided demo
          </button>
          <Link className="btn btn-cyan btn-big" to="/concerts">
            Browse concerts
          </Link>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-num">{state.chain.length}</span>
            <span>blocks</span>
          </div>
          <div className="stat">
            <span className="stat-num">{state.concerts.length}</span>
            <span>concerts</span>
          </div>
          <div className="stat">
            <span className="stat-num">{state.tickets.length}</span>
            <span>tickets</span>
          </div>
          <div className="stat">
            <span className={`stat-num ${chainOk ? "ok" : "bad"}`}>{chainOk ? "OK" : "BROKEN"}</span>
            <span>chain</span>
          </div>
        </div>
      </section>

      <h2 className="section-title">THE PROBLEMS IT SOLVES</h2>
      <div className="card-grid three">
        {PROBLEMS.map((p) => (
          <div className="panel problem" key={p.problem}>
            <div className="problem-title">{p.problem}</div>
            <p>{p.fix}</p>
          </div>
        ))}
      </div>

      <h2 className="section-title">HOW IT WORKS</h2>
      <ol className="flow">
        {FLOW.map(([t, d]) => (
          <li className="flow-step" key={t}>
            <span className="flow-title">{t}</span>
            <span>{d}</span>
          </li>
        ))}
      </ol>

      <h2 className="section-title">THE PEOPLE IN THE DEMO</h2>
      <p className="muted">Click a name in the "YOU ARE" bar at the top to become that person.</p>
      <div className="card-grid three">
        {ROLES.map((r) => (
          <div className="panel person" key={r.key} style={{ "--role-color": r.color }}>
            <div className="person-name">
              <span className="role-dot" aria-hidden="true" />
              {r.label}
            </div>
            <p>{r.desc}</p>
            <p className="muted">Wallet: {money(state.wallets[r.key])}</p>
          </div>
        ))}
      </div>

      <div className="panel reset-panel">
        <div>
          <strong>Start over?</strong> Resets everything to 3 concerts and 5 tickets. Use this before presenting.
        </div>
        <button className="btn btn-yellow" onClick={resetDemo}>
          Reset demo data
        </button>
      </div>
    </>
  );
}
