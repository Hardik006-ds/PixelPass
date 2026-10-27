import { useStore } from "../context/Store.jsx";
import PixelTicket from "../components/PixelTicket.jsx";
import VerifyResult from "../components/VerifyResult.jsx";
import { Explain, Locked, PageHeader } from "../components/ui.jsx";
import { TIER_NAMES } from "../lib/engine.js";
import { shortHash } from "../lib/format.js";
import { nameOf, role as roleInfo } from "../lib/roles.js";
import { check, scan, sign } from "../lib/gateFlow.js";

const HOLDERS = ["fan1", "fan2", "fan3", "attacker"];

export default function Gate() {
  const { state, getState, role, act, gate, setGate } = useStore();

  if (role !== "staff" && role !== "organizer") {
    return (
      <Locked title="STAFF ONLY">
        The entry gate is used by <b>Gate Staff</b>. Click <b>Gate Staff</b> in the "YOU ARE" bar at the top.
      </Locked>
    );
  }

  const ticket = state.tickets.find((t) => t.id === Number(gate.ticketId));
  const concert = ticket ? state.concerts[ticket.concertId] : null;

  const letIn = () => {
    const r = act({ type: "CHECK_IN", by: role, ticketId: ticket.id });
    // Check again against the newest blockchain: it will now say ALREADY USED.
    if (r.ok) setGate((g) => check(getState(), g));
  };

  return (
    <>
      <PageHeader title="ENTRY GATE" kicker={`ON DUTY: ${roleInfo(role).label}`}>
        Three steps: scan the ticket, ask the person to sign a random code on their phone, then check it against the
        blockchain.
      </PageHeader>

      <div className="gate-steps">
        <section className="panel gate-step">
          <h2 className="step-title">
            <span className="step-num">1</span> SCAN THE TICKET
          </h2>
          <label>
            Which ticket is being shown?
            <select
              value={gate.ticketId}
              onChange={(e) => setGate(e.target.value ? scan(state, e.target.value) : { ...gate, ticketId: "" })}
            >
              <option value="">Choose a ticket...</option>
              {state.tickets.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.id} {state.concerts[t.concertId].name}, {TIER_NAMES[t.tier]} seat {t.seat}
                  {t.used ? " (used)" : ""}
                </option>
              ))}
            </select>
          </label>
          {gate.challenge && (
            <div className="challenge-box">
              <span>Random code for this scan:</span>
              <span className="challenge-code">{gate.challenge}</span>
              <button className="btn btn-small btn-ghost" onClick={() => setGate(scan(state, gate.ticketId))}>
                New code
              </button>
            </div>
          )}
        </section>

        <section className={`panel gate-step ${gate.challenge ? "" : "dim"}`}>
          <h2 className="step-title">
            <span className="step-num">2</span> WHO IS HOLDING THE PHONE?
          </h2>
          <p className="hint">That person signs the random code with their own private key.</p>
          <div className="holder-buttons">
            {HOLDERS.map((h) => (
              <button
                key={h}
                className={`btn ${gate.holder === h ? "btn-cyan" : ""}`}
                disabled={!gate.challenge}
                onClick={() => setGate(sign(gate, h))}
              >
                {nameOf(h)}
                {ticket?.owner === h ? " (owner)" : ""}
              </button>
            ))}
          </div>
          {gate.signature && (
            <div className="sig-box">
              <span>
                {nameOf(gate.holder)} signed code {gate.challenge}. Signature:
              </span>
              <code className="break">{shortHash(gate.signature, 32)}</code>
            </div>
          )}
        </section>

        <section className={`panel gate-step ${gate.signature ? "" : "dim"}`}>
          <h2 className="step-title">
            <span className="step-num">3</span> CHECK WITH THE BLOCKCHAIN
          </h2>
          <div className="verify-actions">
            <button
              className="btn btn-pink btn-big"
              disabled={!gate.signature}
              onClick={() => setGate(check(state, gate))}
            >
              Check ticket
            </button>
            <button className="btn btn-green btn-big" disabled={gate.result?.verdict !== "VALID"} onClick={letIn}>
              Let them in
            </button>
          </div>
          <VerifyResult result={gate.result} />
        </section>
      </div>

      <Explain title="WHY NOT JUST SCAN THE QR?">
        A QR code is just a picture. Anyone can screenshot it. The signature in step 2 can only be made with the owner's
        private key, and the code changes every scan, so an old signature or a screenshot is useless.
      </Explain>

      {ticket && (
        <section className="panel">
          <h2 className="panel-title">THE TICKET ON THE BLOCKCHAIN</h2>
          <PixelTicket ticket={ticket} concert={concert} showOwner />
        </section>
      )}
    </>
  );
}
