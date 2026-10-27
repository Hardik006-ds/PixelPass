import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../context/Store.jsx";
import PixelTicket from "../components/PixelTicket.jsx";
import { Empty, Explain, PageHeader } from "../components/ui.jsx";
import { resaleCap } from "../lib/engine.js";
import { money } from "../lib/format.js";
import { ROLES, digitalId, role as roleInfo } from "../lib/roles.js";

function GiveForm({ ticket }) {
  const { role, act } = useStore();
  const others = ROLES.filter((r) => r.key !== role);
  const [to, setTo] = useState((others.find((r) => r.key.startsWith("fan")) || others[0]).key);
  return (
    <div className="inline-form">
      <label>
        Give to
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {others.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-cyan" onClick={() => act({ type: "TRANSFER", by: role, ticketId: ticket.id, to })}>
        Give ticket
      </button>
    </div>
  );
}

function SellForm({ ticket, concert }) {
  const { state, role, act } = useStore();
  const cap = resaleCap(state, ticket);
  const [price, setPrice] = useState(String(cap));
  if (ticket.listing) {
    return (
      <div className="inline-form">
        <span>
          For sale at <strong>{money(ticket.listing.price)}</strong>
        </span>
        <button className="btn btn-yellow" onClick={() => act({ type: "CANCEL_LIST", by: role, ticketId: ticket.id })}>
          Stop selling
        </button>
      </div>
    );
  }
  return (
    <div className="inline-form">
      <label>
        Price in rupees
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
      </label>
      <button
        className="btn btn-pink"
        onClick={() => act({ type: "LIST", by: role, ticketId: ticket.id, price: Number(price) || 0 })}
      >
        Sell ticket
      </button>
      <span className="cap-note">
        Limit: {money(cap)} ({concert.resaleCap}% of {money(ticket.price)}). Try more to see it blocked.
      </span>
    </div>
  );
}

function Actions({ ticket, concert }) {
  const [tab, setTab] = useState(null);
  if (ticket.used) return <p className="hint">Used at the gate. It is frozen forever: it cannot be given away or sold.</p>;
  return (
    <div className="ticket-actions">
      <div className="tabs">
        <button className={`tab ${tab === "give" ? "active" : ""}`} onClick={() => setTab(tab === "give" ? null : "give")}>
          Give to someone
        </button>
        <button className={`tab ${tab === "sell" ? "active" : ""}`} onClick={() => setTab(tab === "sell" ? null : "sell")}>
          {ticket.listing ? "On sale" : "Sell"}
        </button>
      </div>
      {tab === "give" && <GiveForm ticket={ticket} />}
      {tab === "sell" && <SellForm ticket={ticket} concert={concert} />}
    </div>
  );
}

export default function MyTickets() {
  const { state, role } = useStore();
  const me = roleInfo(role);
  const mine = state.tickets.filter((t) => t.owner === role);

  return (
    <>
      <PageHeader title="MY TICKETS" kicker={`WALLET OF: ${me.label}`}>
        These are the tickets the blockchain says belong to {me.label}. Switch person at the top to see someone else's.
      </PageHeader>
      <Explain>
        {me.label}'s digital ID is <code>{digitalId(role)}</code>. It comes from a private key that only {me.label} has.
        At the gate, {me.label} uses that key to sign a random code, which proves the ticket is really theirs.
      </Explain>
      {mine.length === 0 && (
        <Empty title="NO TICKETS">
          {me.label} has no tickets. <Link to="/concerts">Buy one on the Concerts page.</Link>
        </Empty>
      )}
      <div className="ticket-list">
        {mine.map((t) => (
          <PixelTicket
            key={t.id}
            ticket={t}
            concert={state.concerts[t.concertId]}
            footer={<Actions ticket={t} concert={state.concerts[t.concertId]} />}
          />
        ))}
      </div>
    </>
  );
}
