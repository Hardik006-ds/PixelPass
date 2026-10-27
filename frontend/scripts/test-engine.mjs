// Tests for the in-browser blockchain simulation. Run: npm run test:sim
import { RuleError, checkChain, perform, resaleCap, seedState } from "../src/lib/engine.js";
import { holderSigns, newChallenge, ticketCopy, verifyEntry } from "../src/lib/verifier.js";

let passed = 0;
let failed = 0;
const ok = (cond, label) => {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
};
const rejects = (s, action, rule, label) => {
  try {
    perform(s, action);
    ok(false, `${label} (was NOT rejected)`);
  } catch (e) {
    ok(e instanceof RuleError && e.rule === rule, `${label} (rejected: ${e.rule})`);
  }
};

console.log("\n== PIXELPASS SIMULATION TESTS ==\n");
let s = seedState();
ok(checkChain(s.chain).ok, "Seeded blockchain is valid");
ok(s.chain.every((b) => b.hash.startsWith("000")), "Every block is mined (hash starts with 000)");
ok(s.concerts.length === 3 && s.tickets.length === 5, "3 concerts and 5 tickets seeded");

const run = (a) => {
  const r = perform(s, a);
  s = r.state;
  return r;
};

// Create + buy
rejects(s, { type: "CREATE_CONCERT", by: "fan1", name: "x", artist: "y", venue: "z", date: Date.now() + 1e9, prices: [1, 1, 1], capacities: [1, 1, 1], resaleCap: 110 }, "ONLY_ORGANIZER", "Fan cannot create a concert");
const c = run({ type: "CREATE_CONCERT", by: "organizer", name: "Test Night", artist: "Vectors", venue: "Hall", date: Date.now() + 5 * 864e5, prices: [1000, 2000, 5000], capacities: [10, 5, 1], resaleCap: 110 }).result.concertId;
const before = s.wallets.fan1;
const t = run({ type: "BUY", by: "fan1", concertId: c, tier: 1 }).result.ticketId;
ok(s.wallets.fan1 === before - 2000, "Buying takes the exact price from the wallet");
ok(s.tickets[t - 1].seat === 1, "First VIP seat is seat 1");
run({ type: "BUY", by: "fan3", concertId: c, tier: 2 });
rejects(s, { type: "BUY", by: "fan2", concertId: c, tier: 2 }, "SOLD_OUT", "Sold-out tier is rejected");

// Transfer
rejects(s, { type: "TRANSFER", by: "attacker", ticketId: t, to: "attacker" }, "NOT_OWNER", "Attacker cannot steal a ticket");
run({ type: "TRANSFER", by: "fan1", ticketId: t, to: "fan2" });
ok(s.tickets[t - 1].owner === "fan2", "Transfer changes the owner");
rejects(s, { type: "TRANSFER", by: "fan1", ticketId: t, to: "fan3" }, "NOT_OWNER", "Old owner cannot transfer again");

// Gate
const copy = ticketCopy(s.tickets[t - 1]);
let ch = newChallenge();
ok(verifyEntry(s, copy, holderSigns("fan1", t, ch), ch).verdict === "WRONG_OWNER", "Old owner at the gate: WRONG OWNER");
ok(verifyEntry(s, copy, "", ch).verdict === "WRONG_OWNER", "No signature (screenshot only): WRONG OWNER");
ok(verifyEntry(s, copy, holderSigns("fan2", t, ch), ch).verdict === "VALID", "Real owner at the gate: VALID");
const oldSig = holderSigns("fan2", t, ch);
ch = newChallenge();
ok(verifyEntry(s, copy, oldSig, ch).verdict === "WRONG_OWNER", "Re-using an old signature fails");
ok(verifyEntry(s, { ...copy, tier: 2 }, holderSigns("fan2", t, ch), ch).verdict === "TAMPERED", "Edited tier: TAMPERED");
ok(verifyEntry(s, { ...copy, seat: 9 }, holderSigns("fan2", t, ch), ch).verdict === "TAMPERED", "Edited seat: TAMPERED");
ok(verifyEntry(s, { ...copy, ticket: 999 }, "", ch).verdict === "FAKE", "Made-up ticket number: FAKE");
rejects(s, { type: "CHECK_IN", by: "fan2", ticketId: t }, "NOT_STAFF", "A fan cannot check tickets in");
run({ type: "CHECK_IN", by: "staff", ticketId: t });
ok(s.tickets[t - 1].used, "Staff marks the ticket used");
rejects(s, { type: "CHECK_IN", by: "staff", ticketId: t }, "USED", "Second check-in is rejected");
ok(verifyEntry(s, copy, holderSigns("fan2", t, ch), ch).verdict === "ALREADY_USED", "Second scan: ALREADY USED");
rejects(s, { type: "TRANSFER", by: "fan2", ticketId: t, to: "fan3" }, "USED", "Used ticket cannot be transferred");
rejects(s, { type: "LIST", by: "fan2", ticketId: t, price: 100 }, "USED", "Used ticket cannot be sold");

// Resale
const r = run({ type: "BUY", by: "fan1", concertId: c, tier: 0 }).result.ticketId;
const cap = resaleCap(s, s.tickets[r - 1]);
ok(cap === 1100, "Resale limit is 110% of 1000 = 1100");
rejects(s, { type: "LIST", by: "fan1", ticketId: r, price: cap + 1 }, "ABOVE_CAP", "Listing above the limit is rejected");
run({ type: "LIST", by: "fan1", ticketId: r, price: cap });
const sellerBefore = s.wallets.fan1;
run({ type: "BUY_RESALE", by: "fan3", ticketId: r });
ok(s.tickets[r - 1].owner === "fan3" && s.wallets.fan1 === sellerBefore + cap, "Resale moves the ticket and pays the seller");

// Chain
ok(checkChain(s.chain).ok, "Blockchain is still valid after all actions");
const broken = structuredClone(s.chain);
broken[3].tx.text = "Attacker bought everything";
const chk = checkChain(broken);
ok(!chk.ok && chk.firstBad === 3, "Editing an old block is detected at that block");

console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==\n`);
if (failed) process.exit(1);
