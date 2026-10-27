import { useStore } from "../context/Store.jsx";
import PixelPoster from "../components/PixelPoster.jsx";
import PixelTicket from "../components/PixelTicket.jsx";
import { Empty, Explain, PageHeader, TierBadge } from "../components/ui.jsx";
import { TIER_LABELS, isUpcoming, resaleCap } from "../lib/engine.js";
import { fmtDate, money } from "../lib/format.js";
import { nameOf, role as roleInfo } from "../lib/roles.js";

export default function Concerts() {
  const { state, role, act } = useStore();
  const me = roleInfo(role).label;
  const listings = state.tickets.filter((t) => t.listing);

  return (
    <>
      <PageHeader title="CONCERTS" kicker={`BUYING AS: ${me}`}>
        Pick a concert and a seat type, then press Buy. Each purchase is written into a new block on the blockchain.
      </PageHeader>

      <div className="concert-grid">
        {state.concerts
          .slice()
          .reverse()
          .map((c) => {
            const open = c.active && isUpcoming(c);
            return (
              <article className="card concert-card" key={c.id}>
                <div className="concert-poster">
                  <PixelPoster concertId={c.id} label={`Poster for ${c.name}`} />
                </div>
                <div className="concert-body">
                  <h2 className="concert-name">{c.name}</h2>
                  <div className="concert-artist">{c.artist}</div>
                  <div className="concert-meta">
                    <span>{c.venue}</span>
                    <span>{fmtDate(c.date)}</span>
                  </div>
                  <ul className="tier-list">
                    {c.tiers.map((t, i) => {
                      const left = t.capacity - t.sold;
                      return (
                        <li className="tier-row" key={i}>
                          <TierBadge tier={i} />
                          <span className="tier-price">{money(t.price)}</span>
                          <span className={`tier-left ${left <= 0 ? "sold-out" : left <= 3 ? "low" : ""}`}>
                            {left <= 0 ? "SOLD OUT" : `${left} left`}
                          </span>
                          <button
                            className="btn btn-small btn-pink"
                            disabled={left <= 0 || !open}
                            onClick={() => act({ type: "BUY", by: role, concertId: c.id, tier: i })}
                            title={`Buy ${TIER_LABELS[i]} as ${me}`}
                          >
                            Buy
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="concert-note">Resale limit: {c.resaleCap}% of the ticket price</div>
                </div>
              </article>
            );
          })}
      </div>

      <h2 className="section-title">RESALE: TICKETS FANS ARE SELLING</h2>
      <Explain>
        Fans can resell a ticket they cannot use, but the rules never allow a price above the concert's resale limit.
        The money goes to the seller and the ticket moves to the buyer in one block.
      </Explain>
      {listings.length === 0 && <Empty title="NOTHING FOR SALE">List a ticket from the My Tickets page.</Empty>}
      <div className="ticket-list">
        {listings.map((t) => {
          const c = state.concerts[t.concertId];
          const mine = t.owner === role;
          return (
            <PixelTicket
              key={t.id}
              ticket={t}
              concert={c}
              footer={
                <div className="market-row">
                  <div className="market-info">
                    <span>
                      Price <strong className="price-big">{money(t.listing.price)}</strong>
                    </span>
                    <span>
                      Original {money(t.price)}, limit {money(resaleCap(state, t))}. Seller: {nameOf(t.owner)}
                    </span>
                  </div>
                  <button
                    className="btn btn-pink"
                    disabled={mine}
                    onClick={() => act({ type: "BUY_RESALE", by: role, ticketId: t.id })}
                  >
                    {mine ? "Your ticket" : `Buy as ${me}`}
                  </button>
                </div>
              }
            />
          );
        })}
      </div>
    </>
  );
}
