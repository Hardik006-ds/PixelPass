import { useNavigate } from "react-router-dom";
import { useStore } from "../context/Store.jsx";
import { CHEATS } from "../lib/cheats.js";
import { tamperBlock } from "../lib/engine.js";
import { check, scan, sign } from "../lib/gateFlow.js";
import { VERDICTS } from "../lib/verifier.js";

const DAY = 864e5;

// Each step: what to SAY to the audience, and a button that DOES it.
const STEPS = [
  {
    title: "The organizer creates a concert",
    say: "Only the organizer can create concerts. Creating it is a transaction, so a new block is added to the blockchain.",
    run({ store, go }) {
      store.setRole("organizer");
      const n = store.getState().concerts.length + 1;
      const r = store.act({
        type: "CREATE_CONCERT",
        by: "organizer",
        name: `Viva Night ${n}`,
        artist: "The Block Party",
        venue: "College Auditorium, Bengaluru",
        date: Date.now() + 10 * DAY,
        prices: [1000, 2500, 6000],
        capacities: [100, 20, 2],
        resaleCap: 110,
      });
      if (!r.ok) return { ok: false, text: r.message };
      store.setDemo((d) => ({ ...d, concertId: r.result.concertId, ticketId: null }));
      go("/concerts");
      return { ok: true, text: `"Viva Night ${n}" created in block #${r.block.index}. It is at the top of the Concerts page.` };
    },
  },
  {
    title: "Fan 1 buys a VIP ticket",
    say: "Fan 1 pays and gets a ticket. The ticket's owner and fingerprint are written into a new block.",
    run({ store, go, demo }) {
      if (demo.concertId === null) return { ok: false, text: "Run step 1 first." };
      store.setRole("fan1");
      const r = store.act({ type: "BUY", by: "fan1", concertId: demo.concertId, tier: 1 });
      if (!r.ok) return { ok: false, text: r.message };
      store.setDemo((d) => ({ ...d, ticketId: r.result.ticketId }));
      go("/tickets");
      return { ok: true, text: `Ticket #${r.result.ticketId} (VIP seat ${r.result.seat}) now belongs to Fan 1. Block #${r.block.index}.` };
    },
  },
  {
    title: "Fan 1 gives the ticket to Fan 2",
    say: "Fan 1 cannot go, so they give it to a friend. The blockchain now says Fan 2 is the owner.",
    run({ store, go, demo }) {
      if (!demo.ticketId) return { ok: false, text: "Run step 2 first." };
      const r = store.act({ type: "TRANSFER", by: "fan1", ticketId: demo.ticketId, to: "fan2" });
      if (!r.ok) return { ok: false, text: r.message };
      store.setRole("fan2");
      go("/tickets");
      return { ok: true, text: `Ticket #${demo.ticketId} moved to Fan 2 (block #${r.block.index}). It is now in Fan 2's tickets.` };
    },
  },
  {
    title: "Fan 1 tries to get in anyway",
    say: "Fan 1 still has a screenshot of the QR. At the gate they sign the random code, but with Fan 1's key, not the owner's.",
    run({ store, go, demo }) {
      if (!demo.ticketId) return { ok: false, text: "Run steps 1 to 3 first." };
      store.setRole("staff");
      const s = store.getState();
      const session = check(s, sign(scan(s, demo.ticketId), "fan1"));
      store.setGate(session);
      go("/gate");
      return { ok: session.result.verdict === "WRONG_OWNER", text: `Gate says: ${VERDICTS[session.result.verdict].label}.` };
    },
  },
  {
    title: "Fan 2, the real owner, gets in",
    say: "Fan 2 signs the code with their own key. All 5 checks pass, and the gate marks the ticket as used on the blockchain.",
    run({ store, go, demo }) {
      if (!demo.ticketId) return { ok: false, text: "Run steps 1 to 3 first." };
      store.setRole("staff");
      const s = store.getState();
      const session = check(s, sign(scan(s, demo.ticketId), "fan2"));
      store.setGate(session);
      go("/gate");
      if (session.result.verdict !== "VALID")
        return { ok: false, text: `Gate says: ${VERDICTS[session.result.verdict].label}.` };
      const r = store.act({ type: "CHECK_IN", by: "staff", ticketId: demo.ticketId });
      return { ok: r.ok, text: r.ok ? `VALID. Fan 2 is in. "Used" saved in block #${r.block.index}.` : r.message };
    },
  },
  {
    title: "Someone tries the same ticket again",
    say: "Fan 2 passes the phone to a friend outside. Same ticket, real owner's key, but the blockchain says it was already used.",
    run({ store, go, demo }) {
      if (!demo.ticketId) return { ok: false, text: "Run steps 1 to 5 first." };
      store.setRole("staff");
      const s = store.getState();
      const session = check(s, sign(scan(s, demo.ticketId), "fan2"));
      store.setGate(session);
      go("/gate");
      return { ok: session.result.verdict === "ALREADY_USED", text: `Gate says: ${VERDICTS[session.result.verdict].label}.` };
    },
  },
  {
    title: "A cheater edits a ticket",
    say: "Someone changes a General ticket to Front Row. The fingerprint no longer matches the one on the blockchain.",
    run({ store, go }) {
      const cheat = CHEATS.find((c) => c.key === "edit");
      const res = cheat.run(store);
      store.setLab((l) => ({ ...l, edit: res }));
      go("/fraud");
      return { ok: res.kind === "caught", text: res.headline };
    },
  },
  {
    title: "A scalper tries to resell at 5x",
    say: "The rules only allow resale up to the limit (110%). Listing for 5 times the price is refused.",
    run({ store, go }) {
      const cheat = CHEATS.find((c) => c.key === "scalp");
      const res = cheat.run(store);
      store.setLab((l) => ({ ...l, scalp: res }));
      go("/fraud");
      return { ok: res.kind === "blocked", text: `${res.headline}: ${res.detail}` };
    },
  },
  {
    title: "Someone edits the blockchain itself",
    say: "What if a hacker changes an old block to say they bought the ticket? Its fingerprint changes and the chain breaks.",
    run({ store, go, demo }) {
      const chain = store.getState().chain;
      let idx = chain.findIndex((b) => b.tx.type === "BUY" && b.tx.result?.ticketId === demo.ticketId);
      if (idx < 0) idx = chain.findIndex((b) => b.tx.type === "BUY");
      const target = chain[idx];
      store.setChainCopy(tamperBlock(chain, idx, target.tx.text.replace(/^Fan \d/, "Attacker")));
      go("/blockchain");
      return { ok: true, text: `Block #${idx} edited. The page now shows CHAIN IS BROKEN at block #${idx}.` };
    },
  },
  {
    title: "The network repairs it",
    say: "Other computers still have the honest copy. The edited copy is outvoted and replaced. The chain is valid again.",
    run({ store, go }) {
      store.setChainCopy(null);
      go("/blockchain");
      return { ok: true, text: "Honest copy restored. CHAIN IS VALID." };
    },
  },
];

export default function PresenterPanel() {
  const store = useStore();
  const navigate = useNavigate();
  const { presenterOpen, setPresenterOpen, demo, setDemo, resetDemo } = store;
  if (!presenterOpen) return null;

  const results = demo.results || {};
  const nextIndex = STEPS.findIndex((_, i) => !results[i]);

  const runStep = (i) => {
    const out = STEPS[i].run({ store, go: (p) => navigate(p), demo: store.demo });
    setDemo((d) => ({ ...d, results: { ...(d.results || {}), [i]: out } }));
    window.scrollTo(0, 0);
  };

  return (
    <aside className="presenter" aria-label="Guided demo">
      <div className="presenter-head">
        <strong>GUIDED DEMO</strong>
        <button className="toast-x" onClick={() => setPresenterOpen(false)} aria-label="Close guided demo">
          x
        </button>
      </div>
      <p className="presenter-intro">
        Press each step in order. It switches the person, does the action and opens the right page. Read the "Say" line
        to the audience.
      </p>
      <div className="presenter-actions">
        {nextIndex >= 0 ? (
          <button className="btn btn-pink" onClick={() => runStep(nextIndex)}>
            Run step {nextIndex + 1}
          </button>
        ) : (
          <span className="ok">All steps done!</span>
        )}
        <button
          className="btn btn-small btn-ghost"
          onClick={() => {
            resetDemo();
            setDemo({ concertId: null, ticketId: null, results: {} });
            navigate("/");
          }}
        >
          Start over
        </button>
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => {
          const r = results[i];
          return (
            <li key={i} className={`step ${i === nextIndex ? "current" : ""} ${r ? (r.ok ? "done" : "failed") : ""}`}>
              <div className="step-top">
                <span className="step-no">{i + 1}</span>
                <span className="step-name">{s.title}</span>
                <button className="btn btn-small" onClick={() => runStep(i)}>
                  {r ? "Again" : "Run"}
                </button>
              </div>
              <p className="step-say">
                <b>Say:</b> {s.say}
              </p>
              {r && <p className={`step-result ${r.ok ? "ok" : "bad"}`}>{r.text}</p>}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
