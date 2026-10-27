import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context/Store.jsx";
import PixelTicket from "../components/PixelTicket.jsx";
import { Explain, PageHeader } from "../components/ui.jsx";
import { TIER_NAMES, ticketFingerprint } from "../lib/engine.js";
import { CHEATS } from "../lib/cheats.js";
import { shortHash } from "../lib/format.js";

const FIELDS = [
  { key: "id", label: "Ticket number" },
  { key: "concertId", label: "Concert number" },
  { key: "tier", label: "Tier" },
  { key: "seat", label: "Seat" },
  { key: "price", label: "Price paid (rupees)" },
];

function Tweaker() {
  const { state } = useStore();
  const [selected, setSelected] = useState(state.tickets[0]?.id ?? null);
  const real = state.tickets.find((t) => t.id === selected);
  const original = useMemo(
    () => (real ? { id: real.id, concertId: real.concertId, tier: real.tier, seat: real.seat, price: real.price } : null),
    // Only rebuild when a different ticket is picked, not on every new block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [real?.id, real?.fingerprint]
  );
  const [edit, setEdit] = useState(original);
  useEffect(() => {
    setEdit(original);
  }, [original]);

  if (!real || !edit) return <p className="muted">No tickets yet.</p>;

  const num = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
  const fp = ticketFingerprint({
    concertId: num(edit.concertId),
    ticketId: num(edit.id),
    tier: num(edit.tier),
    seat: num(edit.seat),
    price: num(edit.price),
  });
  const match = fp === real.fingerprint;
  const changed = FIELDS.filter((f) => String(edit[f.key]).trim() !== String(original[f.key]));
  const shown = { ...real, id: edit.id, concertId: num(edit.concertId), tier: num(edit.tier), seat: edit.seat, price: num(edit.price) || 0, listing: null };

  return (
    <div className="tweaker">
      <div className="tweaker-controls">
        <label>
          Pick a real ticket
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {state.tickets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} {state.concerts[t.concertId].name}, {TIER_NAMES[t.tier]} seat {t.seat}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-yellow" onClick={() => setEdit(original)}>
          Undo my changes
        </button>
      </div>

      <div className="tweaker-grid">
        <div className="tweaker-fields">
          <p className="hint">This is a COPY of the ticket (what the QR code holds). Change anything:</p>
          {FIELDS.map((f) => {
            const isChanged = changed.some((c) => c.key === f.key);
            return (
              <label key={f.key} className={isChanged ? "changed" : ""}>
                <span>
                  {f.label} {isChanged && <b className="changed-tag">CHANGED</b>}
                </span>
                {f.key === "tier" ? (
                  <select value={edit.tier} onChange={(e) => setEdit((s) => ({ ...s, tier: Number(e.target.value) }))}>
                    {TIER_NAMES.map((n, i) => (
                      <option key={i} value={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={edit[f.key]} onChange={(e) => setEdit((s) => ({ ...s, [f.key]: e.target.value }))} />
                )}
              </label>
            );
          })}
        </div>
        <div className="tweaker-result">
          <div className="hash-row onchain">
            <span className="hash-label">FINGERPRINT STORED ON THE BLOCKCHAIN</span>
            <code className="break">{shortHash(real.fingerprint, 40)}</code>
          </div>
          <div className={`hash-row ${match ? "match" : "nomatch"}`}>
            <span className="hash-label">FINGERPRINT OF YOUR COPY</span>
            <code className="break">{shortHash(fp, 40)}</code>
          </div>
          <div className={`msg ${match ? "msg-ok" : "msg-error"}`}>
            <strong className="msg-title">{match ? "MATCH" : "NO MATCH"}</strong>
            <span>
              {match
                ? "The copy is identical to the blockchain record."
                : `You changed: ${changed.map((c) => c.label).join(", ")}. Even one small change gives a totally different fingerprint, so the gate will say TAMPERED.`}
            </span>
          </div>
          <PixelTicket
            ticket={shown}
            concert={state.concerts[num(edit.concertId)]}
            stamp={match ? null : { text: "TAMPERED", tone: "red" }}
          />
        </div>
      </div>
    </div>
  );
}

function CheatCard({ cheat }) {
  const store = useStore();
  const res = store.lab[cheat.key];
  return (
    <li className="cheat">
      <div className="cheat-head">
        <span className="cheat-title">{cheat.title}</span>
        <button className="btn btn-red" onClick={() => store.setLab((l) => ({ ...l, [cheat.key]: cheat.run(store) }))}>
          Try it
        </button>
      </div>
      <p className="cheat-trick">{cheat.trick}</p>
      {res && (
        <div className={`cheat-result ${res.kind}`}>
          <b>{res.headline}</b>
          {res.setup && <span className="cheat-setup">{res.setup}</span>}
          <span>{res.detail}</span>
        </div>
      )}
    </li>
  );
}

export default function FraudLab() {
  const store = useStore();
  const results = Object.values(store.lab);
  const stopped = results.filter((r) => r.kind === "blocked" || r.kind === "caught").length;
  const failed = results.filter((r) => r.kind === "unexpected").length;

  const tryAll = () => {
    const out = {};
    for (const c of CHEATS) out[c.key] = c.run(store);
    store.setLab(out);
  };

  return (
    <>
      <PageHeader title="FRAUD LAB" kicker="TEST THE BLOCKCHAIN">
        The data on the blockchain cannot be edited. These tools edit a ticket COPY and try real cheats, to prove the
        system catches every one.
      </PageHeader>

      <section className="panel">
        <h2 className="panel-title">EDIT A TICKET COPY</h2>
        <Tweaker />
      </section>

      <section className="panel">
        <div className="cheats-top">
          <h2 className="panel-title">TRY TO CHEAT</h2>
          <button className="btn btn-red btn-big" onClick={tryAll}>
            Try all {CHEATS.length} cheats
          </button>
          {results.length > 0 && (
            <span className={failed ? "bad" : "ok"}>
              {stopped} of {results.length} stopped{failed ? `, ${failed} got through!` : ""}
            </span>
          )}
        </div>
        <Explain>
          Each button really tries the cheat. Rule-breaking actions are refused before they reach the blockchain (you can
          see them under "Rejected attempts" on the Blockchain page). Fake, edited and screenshot tickets go through the
          same 5 checks as the Entry Gate.
        </Explain>
        <ul className="cheat-list">
          {CHEATS.map((c) => (
            <CheatCard key={c.key} cheat={c} />
          ))}
        </ul>
      </section>
    </>
  );
}
