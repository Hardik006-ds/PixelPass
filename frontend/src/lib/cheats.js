// Every way the Fraud Lab tries to cheat. Each really goes through the rules or the gate check.
import { TIER_LABELS, isUpcoming, resaleCap } from "./engine.js";
import { money } from "./format.js";
import { nameOf, role as roleInfo } from "./roles.js";
import { VERDICTS, holderSigns, newChallenge, ticketCopy, verifyEntry } from "./verifier.js";

const isFan = (k) => ["fan1", "fan2", "fan3"].includes(k);

function openTicket(s, filter = () => true) {
  return s.tickets.find((t) => !t.used && isFan(t.owner) && isUpcoming(s.concerts[t.concertId]) && filter(t));
}

/** Makes sure a usable ticket exists (Fan 1 buys one if needed). */
function ensureOpenTicket(store, filter) {
  let t = openTicket(store.getState(), filter);
  if (t) return t;
  const c = store.getState().concerts.find((x) => x.active && isUpcoming(x) && x.tiers[0].sold < x.tiers[0].capacity);
  store.act({ type: "BUY", by: "fan1", concertId: c.id, tier: 0 }, { quiet: true });
  return openTicket(store.getState(), filter);
}

/** Makes sure a used ticket exists (Fan 3 buys one and staff check it in if needed). */
function ensureUsedTicket(store) {
  let t = store.getState().tickets.find((x) => x.used && isFan(x.owner));
  if (t) return { ticket: t, setup: null };
  const c = store.getState().concerts.find((x) => x.active && isUpcoming(x) && x.tiers[0].sold < x.tiers[0].capacity);
  const r = store.act({ type: "BUY", by: "fan3", concertId: c.id, tier: 0 }, { quiet: true });
  store.act({ type: "CHECK_IN", by: "staff", ticketId: r.result.ticketId }, { quiet: true });
  t = store.getState().tickets.find((x) => x.id === r.result.ticketId);
  return { ticket: t, setup: `Setup: Fan 3 bought ticket #${t.id} and used it at the gate.` };
}

const blocked = (r, setup) =>
  r.ok
    ? { kind: "unexpected", headline: "THE CHEAT WORKED (this should never happen)", detail: "The rules did not stop it." }
    : { kind: "blocked", headline: "BLOCKED BY THE RULES", detail: r.message, setup };

const caught = (res, setup) => {
  const v = VERDICTS[res.verdict];
  const failed = res.checks.find((c) => c.status === "fail");
  return res.verdict === "VALID"
    ? { kind: "unexpected", headline: "THE GATE LET THEM IN (this should never happen)", detail: "" }
    : { kind: "caught", headline: `CAUGHT AT THE GATE: ${v.label}`, detail: failed?.detail || v.text, setup, verdict: res.verdict };
};

export const CHEATS = [
  {
    key: "fake",
    title: "Print a fake ticket",
    trick: "Make up a ticket number that looks real and show it at the gate.",
    run(store) {
      const s = store.getState();
      const id = s.tickets.length + 100;
      const ch = newChallenge();
      const copy = { app: "PIXELPASS", ticket: id, concert: 0, tier: 2, seat: 1, price: 9000 };
      return caught(verifyEntry(s, copy, holderSigns("attacker", id, ch), ch));
    },
  },
  {
    key: "edit",
    title: "Edit a ticket to upgrade it",
    trick: "Change a General ticket to FRONT ROW in the ticket details.",
    run(store) {
      const t = ensureOpenTicket(store, (x) => x.tier !== 2);
      const s = store.getState();
      const ch = newChallenge();
      const copy = { ...ticketCopy(t), tier: 2 };
      const res = caught(verifyEntry(s, copy, holderSigns(t.owner, t.id, ch), ch));
      return { ...res, setup: `A cheater changed a copy of ticket #${t.id} from ${TIER_LABELS[t.tier]} to Front Row.` };
    },
  },
  {
    key: "screenshot",
    title: "Use a screenshot of someone's ticket",
    trick: "Copy another fan's QR code perfectly and walk in with it.",
    run(store) {
      const t = ensureOpenTicket(store);
      const s = store.getState();
      const ch = newChallenge();
      const res = caught(verifyEntry(s, ticketCopy(t), holderSigns("attacker", t.id, ch), ch));
      return { ...res, setup: `The Attacker shows a screenshot of ${nameOf(t.owner)}'s ticket #${t.id}.` };
    },
  },
  {
    key: "twice",
    title: "Enter twice with one ticket",
    trick: "Go in, come back out, and scan the same ticket again (or give it to a friend).",
    run(store) {
      const { ticket, setup } = ensureUsedTicket(store);
      const s = store.getState();
      const ch = newChallenge();
      const res = caught(verifyEntry(s, ticketCopy(ticket), holderSigns(ticket.owner, ticket.id, ch), ch), setup);
      return { ...res, setup: [setup, `${nameOf(ticket.owner)} scans used ticket #${ticket.id} again.`].filter(Boolean).join(" ") };
    },
  },
  {
    key: "steal",
    title: "Steal someone's ticket",
    trick: "The Attacker tries to move another fan's ticket into their own wallet.",
    run(store) {
      const t = ensureOpenTicket(store);
      const r = store.act({ type: "TRANSFER", by: "attacker", ticketId: t.id, to: "attacker" }, { quiet: true });
      return { ...blocked(r), setup: `Attacker tries to take ticket #${t.id} from ${nameOf(t.owner)}.` };
    },
  },
  {
    key: "scalp",
    title: "Resell for 5 times the price",
    trick: "A fan tries to list their ticket at 5x what they paid (scalping).",
    run(store) {
      const t = ensureOpenTicket(store);
      const price = t.price * 5;
      const r = store.act({ type: "LIST", by: t.owner, ticketId: t.id, price }, { quiet: true });
      return {
        ...blocked(r),
        setup: `${nameOf(t.owner)} lists ticket #${t.id} for ${money(price)}. The limit is ${money(resaleCap(store.getState(), t))}.`,
      };
    },
  },
  {
    key: "soldout",
    title: "Buy a seat that does not exist",
    trick: "Buy a ticket in a tier that is already sold out (create extra seats).",
    run(store) {
      const s = store.getState();
      let target = null;
      for (const c of s.concerts) {
        if (!c.active || !isUpcoming(c)) continue;
        const tier = c.tiers.findIndex((t) => t.sold >= t.capacity);
        if (tier >= 0) {
          target = { c, tier };
          break;
        }
      }
      if (!target) return { kind: "error", headline: "NO SOLD-OUT TIER", detail: "Reset the demo to get the sold-out Front Row back." };
      const r = store.act({ type: "BUY", by: "attacker", concertId: target.c.id, tier: target.tier }, { quiet: true });
      return { ...blocked(r), setup: `Attacker tries to buy ${TIER_LABELS[target.tier]} for ${target.c.name} (sold out).` };
    },
  },
  {
    key: "fakestaff",
    title: "Pretend to be gate staff",
    trick: "The Attacker tries to mark tickets as used so real fans cannot enter.",
    run(store) {
      const t = ensureOpenTicket(store);
      const r = store.act({ type: "CHECK_IN", by: "attacker", ticketId: t.id }, { quiet: true });
      return { ...blocked(r), setup: `Attacker tries to check in ticket #${t.id}.` };
    },
  },
  {
    key: "sellused",
    title: "Pass on a used ticket",
    trick: "After entering, give the used ticket to a friend outside.",
    run(store) {
      const { ticket, setup } = ensureUsedTicket(store);
      const to = ticket.owner === "fan2" ? "fan3" : "fan2";
      const r = store.act({ type: "TRANSFER", by: ticket.owner, ticketId: ticket.id, to }, { quiet: true });
      return {
        ...blocked(r, setup),
        setup: [setup, `${roleInfo(ticket.owner).label} tries to give used ticket #${ticket.id} to ${nameOf(to)}.`]
          .filter(Boolean)
          .join(" "),
      };
    },
  },
];
