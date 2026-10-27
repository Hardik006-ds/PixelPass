// PIXELPASS simulated blockchain.
//
// This file plays two parts:
//  1. The BLOCKCHAIN: every accepted action becomes a transaction inside a new
//     block. Each block stores the previous block's hash, so the blocks form a
//     chain. Changing an old block changes its hash and breaks every link after it.
//  2. The SMART CONTRACT: the rules. Every action is checked against the rules
//     first. If a rule is broken the action is rejected and never reaches the chain.
import { sha256Hex } from "./crypto.js";
import { ROLES, nameOf } from "./roles.js";
import { money } from "./format.js";

export const TIER_NAMES = ["GA", "VIP", "FRONT ROW"];
export const TIER_LABELS = ["General Admission", "VIP", "Front Row"];
export const DIFFICULTY = "000"; // a block's hash must start with this ("proof of work")
const DAY = 24 * 3600 * 1000;

export class RuleError extends Error {
  constructor(rule, message) {
    super(message);
    this.rule = rule;
  }
}

// ---------------------------------------------------------------------------
// Hashing and mining
// ---------------------------------------------------------------------------

export function blockHash(b) {
  return sha256Hex(JSON.stringify([b.index, b.timestamp, b.tx, b.previousHash, b.nonce]));
}

/** Try nonce 0, 1, 2... until the hash starts with DIFFICULTY. */
export function mineBlock(index, tx, previousHash) {
  const block = { index, timestamp: Date.now(), tx, previousHash, nonce: 0, hash: "" };
  for (;;) {
    const h = blockHash(block);
    if (h.startsWith(DIFFICULTY)) {
      block.hash = h;
      return block;
    }
    block.nonce++;
  }
}

/** Ticket fingerprint: changes completely if any detail changes. */
export function ticketFingerprint({ concertId, ticketId, tier, seat, price }) {
  return sha256Hex(`${concertId}|${ticketId}|${tier}|${seat}|${price}`);
}

/** Checks every block: own hash correct, linked to the previous block, mined properly. */
export function checkChain(chain) {
  const results = chain.map((b, i) => {
    const hashOk = blockHash(b) === b.hash;
    const linkOk = i === 0 ? b.previousHash === "0".repeat(64) : b.previousHash === chain[i - 1].hash;
    const workOk = b.hash.startsWith(DIFFICULTY);
    return { index: b.index, hashOk, linkOk, workOk, ok: hashOk && linkOk && workOk };
  });
  return { ok: results.every((r) => r.ok), results, firstBad: results.find((r) => !r.ok)?.index ?? null };
}

/**
 * What an attacker would do: edit a block's text and recompute its hash
 * (without redoing the proof of work). Returns a NEW chain, the real one is untouched.
 */
export function tamperBlock(chain, index, newText) {
  const copy = structuredClone(chain);
  copy[index].tx.text = newText;
  copy[index].hash = blockHash(copy[index]);
  return copy;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function need(cond, rule, message) {
  if (!cond) throw new RuleError(rule, message);
}

export function isUpcoming(concert, now = Date.now()) {
  return concert.date > now;
}

export function resaleCap(state, ticket) {
  const c = state.concerts[ticket.concertId];
  return Math.floor((ticket.price * c.resaleCap) / 100);
}

function getTicket(state, id) {
  const t = state.tickets.find((x) => x.id === Number(id));
  need(t, "NO_TICKET", `Ticket #${id} does not exist on the blockchain.`);
  return t;
}

function getConcert(state, id) {
  const c = state.concerts[Number(id)];
  need(c, "NO_CONCERT", "That concert does not exist.");
  return c;
}

/** Short human sentence describing an action, used for rejected attempts too. */
export function describe(state, a) {
  const who = nameOf(a.by);
  try {
    switch (a.type) {
      case "CREATE_CONCERT":
        return `${who} creates concert "${a.name}"`;
      case "BUY": {
        const c = state.concerts[a.concertId];
        return `${who} buys a ${TIER_NAMES[a.tier]} ticket for ${c?.name ?? "a concert"}`;
      }
      case "TRANSFER":
        return `${who} gives ticket #${a.ticketId} to ${nameOf(a.to)}`;
      case "LIST":
        return `${who} puts ticket #${a.ticketId} up for resale at ${money(a.price)}`;
      case "CANCEL_LIST":
        return `${who} cancels the resale of ticket #${a.ticketId}`;
      case "BUY_RESALE":
        return `${who} buys resale ticket #${a.ticketId}`;
      case "CHECK_IN":
        return `${who} checks in ticket #${a.ticketId} at the gate`;
      default:
        return `${who}: ${a.type}`;
    }
  } catch {
    return `${who}: ${a.type}`;
  }
}

// ---------------------------------------------------------------------------
// The rules ("smart contract"). Each handler checks, then changes the state.
// ---------------------------------------------------------------------------

const HANDLERS = {
  CREATE_CONCERT(s, a) {
    need(a.by === "organizer", "ONLY_ORGANIZER", "Only the organizer can create concerts.");
    need(a.name?.trim() && a.artist?.trim() && a.venue?.trim(), "EMPTY", "Name, artist and venue are required.");
    need(a.date > Date.now(), "PAST_DATE", "The concert date must be in the future.");
    need(
      a.capacities.every((c) => Number.isInteger(c) && c > 0),
      "CAPACITY",
      "Every tier needs at least 1 seat."
    );
    need(a.prices.every((p) => Number.isFinite(p) && p > 0), "PRICE", "Every price must be more than zero.");
    need(a.resaleCap >= 100 && a.resaleCap <= 300, "CAP", "Resale limit must be between 100% and 300%.");
    const id = s.concerts.length;
    s.concerts.push({
      id,
      name: a.name.trim(),
      artist: a.artist.trim(),
      venue: a.venue.trim(),
      date: a.date,
      resaleCap: a.resaleCap,
      active: true,
      tiers: [0, 1, 2].map((i) => ({ price: a.prices[i], capacity: a.capacities[i], sold: 0 })),
    });
    return { concertId: id };
  },

  BUY(s, a) {
    const c = getConcert(s, a.concertId);
    need(a.tier >= 0 && a.tier <= 2, "TIER", "That ticket tier does not exist.");
    need(c.active && isUpcoming(c), "CLOSED", "This concert is not selling tickets any more.");
    const t = c.tiers[a.tier];
    need(t.sold < t.capacity, "SOLD_OUT", `${TIER_LABELS[a.tier]} is sold out. No more tickets can ever be created.`);
    need(s.wallets[a.by] >= t.price, "NO_MONEY", `Not enough money. The ticket costs ${money(t.price)}.`);
    s.wallets[a.by] -= t.price;
    s.wallets.organizer += t.price;
    t.sold += 1;
    const ticketId = s.tickets.length + 1;
    const ticket = {
      id: ticketId,
      concertId: c.id,
      tier: a.tier,
      seat: t.sold,
      price: t.price,
      owner: a.by,
      used: false,
      listing: null,
    };
    ticket.fingerprint = ticketFingerprint({ concertId: c.id, ticketId, tier: a.tier, seat: t.sold, price: t.price });
    s.tickets.push(ticket);
    return { ticketId, seat: t.sold, price: t.price, fingerprint: ticket.fingerprint };
  },

  TRANSFER(s, a) {
    const t = getTicket(s, a.ticketId);
    need(t.owner === a.by, "NOT_OWNER", `Only the owner (${nameOf(t.owner)}) can give away ticket #${t.id}.`);
    need(!t.used, "USED", `Ticket #${t.id} was already used at the gate. Used tickets are frozen forever.`);
    need(a.to && a.to !== a.by, "BAD_RECEIVER", "Choose someone else to receive the ticket.");
    t.owner = a.to;
    t.listing = null;
    return { from: a.by, to: a.to };
  },

  LIST(s, a) {
    const t = getTicket(s, a.ticketId);
    need(t.owner === a.by, "NOT_OWNER", `Only the owner (${nameOf(t.owner)}) can sell ticket #${t.id}.`);
    need(!t.used, "USED", `Ticket #${t.id} was already used. It cannot be sold.`);
    need(Number.isFinite(a.price) && a.price > 0, "PRICE", "Enter a price above zero.");
    const cap = resaleCap(s, t);
    need(
      a.price <= cap,
      "ABOVE_CAP",
      `${money(a.price)} is above the resale limit of ${money(cap)} (${s.concerts[t.concertId].resaleCap}% of ${money(
        t.price
      )}). Scalping is blocked.`
    );
    t.listing = { price: a.price };
    return { price: a.price, cap };
  },

  CANCEL_LIST(s, a) {
    const t = getTicket(s, a.ticketId);
    need(t.owner === a.by, "NOT_OWNER", "Only the owner can cancel this sale.");
    need(t.listing, "NOT_LISTED", "This ticket is not for sale.");
    t.listing = null;
    return {};
  },

  BUY_RESALE(s, a) {
    const t = getTicket(s, a.ticketId);
    need(t.listing, "NOT_LISTED", `Ticket #${t.id} is not for sale.`);
    need(t.owner !== a.by, "OWN", "You cannot buy your own ticket.");
    need(!t.used, "USED", "This ticket was already used.");
    const price = t.listing.price;
    need(s.wallets[a.by] >= price, "NO_MONEY", `Not enough money. It costs ${money(price)}.`);
    const seller = t.owner;
    s.wallets[a.by] -= price;
    s.wallets[seller] += price;
    t.owner = a.by;
    t.listing = null;
    return { seller, price };
  },

  CHECK_IN(s, a) {
    need(s.staff.includes(a.by) || a.by === "organizer", "NOT_STAFF", "Only gate staff can let people in.");
    const t = getTicket(s, a.ticketId);
    need(!t.used, "USED", `Ticket #${t.id} was ALREADY used. Nobody can enter twice with it.`);
    need(s.concerts[t.concertId].active, "CLOSED", "This concert is not active.");
    t.used = true;
    t.listing = null;
    return {};
  },
};

/**
 * Apply one action. Returns { state, block } on success.
 * Throws RuleError if the rules reject it (the chain is not changed).
 */
export function perform(state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) throw new RuleError("UNKNOWN", `Unknown action ${action.type}`);
  const next = structuredClone(state);
  const result = handler(next, action) || {};
  const tx = { type: action.type, by: action.by, text: describe(state, action), result };
  const prev = next.chain[next.chain.length - 1];
  const block = mineBlock(next.chain.length, tx, prev.hash);
  next.chain.push(block);
  return { state: next, block, result };
}

// ---------------------------------------------------------------------------
// Starting data
// ---------------------------------------------------------------------------

export function genesisState() {
  const genesis = mineBlock(
    0,
    { type: "GENESIS", by: "organizer", text: "Genesis block: the PIXELPASS blockchain starts", result: {} },
    "0".repeat(64)
  );
  return {
    version: 2,
    wallets: Object.fromEntries(ROLES.map((r) => [r.key, r.start])),
    concerts: [],
    tickets: [],
    staff: ["staff"],
    chain: [genesis],
    rejected: [],
  };
}

export function seedState() {
  let s = genesisState();
  const now = Date.now();
  const run = (a) => {
    s = perform(s, a).state;
  };
  run({
    type: "CREATE_CONCERT",
    by: "organizer",
    name: "Neon Skyline Tour",
    artist: "The Voltage Hearts",
    venue: "Arcadia Dome, Bengaluru",
    date: now + 21 * DAY,
    prices: [1500, 4000, 9000],
    capacities: [120, 40, 10],
    resaleCap: 110,
  });
  run({
    type: "CREATE_CONCERT",
    by: "organizer",
    name: "Midnight Cartridge",
    artist: "Lo-Fi Lanterns",
    venue: "Pixel Pier Amphitheatre, Mumbai",
    date: now + 45 * DAY,
    prices: [1200, 3000, 7500],
    capacities: [80, 20, 6],
    resaleCap: 120,
  });
  run({
    type: "CREATE_CONCERT",
    by: "organizer",
    name: "Bitcrush Festival Night",
    artist: "DJ Kilobyte",
    venue: "The Circuit Hall, Delhi",
    date: now + 75 * DAY,
    prices: [2500, 6000, 15000],
    capacities: [50, 10, 1],
    resaleCap: 110,
  });
  run({ type: "BUY", by: "fan1", concertId: 0, tier: 1 }); // #1
  run({ type: "BUY", by: "fan1", concertId: 1, tier: 0 }); // #2
  run({ type: "BUY", by: "fan2", concertId: 0, tier: 0 }); // #3
  run({ type: "BUY", by: "fan2", concertId: 2, tier: 0 }); // #4
  run({ type: "BUY", by: "fan3", concertId: 2, tier: 2 }); // #5, Front Row now sold out
  run({ type: "LIST", by: "fan2", ticketId: 4, price: 2750 }); // at the 110% limit
  return s;
}
