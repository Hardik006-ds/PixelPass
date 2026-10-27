import { QRCodeSVG } from "qrcode.react";
import PixelPoster from "./PixelPoster.jsx";
import { Stamp, TierBadge } from "./ui.jsx";
import { fmtDate, money } from "../lib/format.js";
import { nameOf } from "../lib/roles.js";
import { ticketCopy } from "../lib/verifier.js";

/**
 * The pixel ticket. `ticket` may be a real ticket or an edited copy.
 * A used ticket gets a USED stamp unless another stamp is given.
 */
export default function PixelTicket({ ticket, concert, stamp, footer, showOwner = false }) {
  const shown = stamp || (ticket.used ? { text: "USED", tone: "yellow" } : null);
  return (
    <article className={`ticket ${ticket.used ? "is-used" : ""}`}>
      <div className="ticket-main">
        <div className="ticket-poster">
          <PixelPoster concertId={concert?.id ?? ticket.concertId} />
        </div>
        <div className="ticket-info">
          <div className="ticket-kicker">PIXELPASS / ADMIT ONE</div>
          <h3 className="ticket-title">{concert?.name ?? `Concert #${ticket.concertId} (does not exist)`}</h3>
          {concert && <div className="ticket-artist">{concert.artist}</div>}
          {concert && (
            <div className="ticket-meta">
              <span>{concert.venue}</span>
              <span>{fmtDate(concert.date)}</span>
            </div>
          )}
          <div className="ticket-row">
            <TierBadge tier={Number(ticket.tier)} />
            <span className="ticket-field">
              <small>SEAT</small>
              {String(ticket.seat)}
            </span>
            <span className="ticket-field">
              <small>TICKET</small>#{String(ticket.id)}
            </span>
            <span className="ticket-field">
              <small>PAID</small>
              {money(ticket.price)}
            </span>
            {showOwner && ticket.owner && (
              <span className="ticket-field">
                <small>OWNER</small>
                {nameOf(ticket.owner)}
              </span>
            )}
          </div>
          {ticket.listing && <div className="ticket-listed">FOR RESALE: {money(ticket.listing.price)}</div>}
        </div>
      </div>
      <div className="ticket-perf" aria-hidden="true" />
      <div className="ticket-stub">
        <div className="qr-wrap">
          <QRCodeSVG value={JSON.stringify(ticketCopy(ticket))} size={104} level="M" marginSize={2} />
        </div>
        <div className="stub-id">#{String(ticket.id)}</div>
      </div>
      {shown && <Stamp text={shown.text} tone={shown.tone} />}
      {footer && <div className="ticket-footer">{footer}</div>}
    </article>
  );
}
