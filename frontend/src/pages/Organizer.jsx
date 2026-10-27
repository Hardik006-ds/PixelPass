import { useState } from "react";
import { useStore } from "../context/Store.jsx";
import { Explain, Locked, PageHeader, TierBadge } from "../components/ui.jsx";
import { fmtDate, money } from "../lib/format.js";

function toLocalInput(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

const blankForm = () => ({
  name: "",
  artist: "",
  venue: "",
  date: toLocalInput(new Date(Date.now() + 14 * 864e5)),
  prices: ["1500", "4000", "9000"],
  caps: ["100", "30", "5"],
  resaleCap: "110",
});

function CreateForm() {
  const { act } = useStore();
  const [f, setF] = useState(blankForm);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setArr = (k, i, v) => setF((s) => ({ ...s, [k]: s[k].map((x, j) => (j === i ? v : x)) }));
  const digits = (v) => v.replace(/[^\d]/g, "");

  const submit = (e) => {
    e.preventDefault();
    const r = act({
      type: "CREATE_CONCERT",
      by: "organizer",
      name: f.name,
      artist: f.artist,
      venue: f.venue,
      date: new Date(f.date).getTime(),
      prices: f.prices.map(Number),
      capacities: f.caps.map(Number),
      resaleCap: Number(f.resaleCap),
    });
    if (r.ok) setF(blankForm());
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h2 className="panel-title">CREATE A CONCERT</h2>
      <div className="form-grid">
        <label>
          Concert name
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Starlight Arcade" />
        </label>
        <label>
          Artist
          <input value={f.artist} onChange={(e) => set("artist", e.target.value)} placeholder="e.g. The 8-Bit Hearts" />
        </label>
        <label>
          Venue
          <input value={f.venue} onChange={(e) => set("venue", e.target.value)} placeholder="e.g. Retro Hall, Pune" />
        </label>
        <label>
          Date and time
          <input type="datetime-local" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </label>
      </div>
      <div className="tier-inputs">
        {[0, 1, 2].map((i) => (
          <fieldset key={i}>
            <legend>
              <TierBadge tier={i} />
            </legend>
            <label>
              Price (rupees)
              <input value={f.prices[i]} onChange={(e) => setArr("prices", i, digits(e.target.value))} inputMode="numeric" />
            </label>
            <label>
              Seats
              <input value={f.caps[i]} onChange={(e) => setArr("caps", i, digits(e.target.value))} inputMode="numeric" />
            </label>
          </fieldset>
        ))}
      </div>
      <label className="narrow">
        Resale limit (% of ticket price)
        <input value={f.resaleCap} onChange={(e) => set("resaleCap", digits(e.target.value))} inputMode="numeric" />
      </label>
      <button className="btn btn-pink btn-big" type="submit">
        Create concert
      </button>
    </form>
  );
}

export default function Organizer() {
  const { state, role } = useStore();
  if (role !== "organizer") {
    return (
      <Locked title="ORGANIZER ONLY">
        Only the organizer can create concerts. Click <b>Organizer</b> in the "YOU ARE" bar at the top.
      </Locked>
    );
  }
  return (
    <>
      <PageHeader title="ORGANIZER" kicker="DASHBOARD">
        Create concerts and see what has been sold. Ticket money arrives in the organizer's wallet automatically.
      </PageHeader>
      <div className="org-grid">
        <CreateForm />
        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">MONEY RECEIVED</h2>
            <div className="balance-big">{money(state.wallets.organizer)}</div>
            <p className="hint">Paid by fans when they buy tickets. Resale money goes to the fan who resold.</p>
          </section>
          <Explain>
            Creating a concert is also a transaction. It gets its own block, so nobody can secretly change the number of
            seats later. Only the Organizer is allowed to do it.
          </Explain>
        </div>
      </div>
      <section className="panel">
        <h2 className="panel-title">TICKETS SOLD</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Concert</th>
                <th>Tier</th>
                <th>Sold</th>
                <th>Money</th>
              </tr>
            </thead>
            <tbody>
              {state.concerts.map((c) =>
                c.tiers.map((t, i) => (
                  <tr key={`${c.id}-${i}`} className={i === 2 ? "last-tier" : ""}>
                    {i === 0 && (
                      <td rowSpan={3} className="concert-cell">
                        <strong>{c.name}</strong>
                        <span>{fmtDate(c.date)}</span>
                      </td>
                    )}
                    <td>
                      <TierBadge tier={i} />
                    </td>
                    <td>
                      {t.sold} / {t.capacity}
                    </td>
                    <td>{money(t.sold * t.price)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
