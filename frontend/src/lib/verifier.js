// The gate check. Used by the Gate page, the Fraud Lab and the guided demo.
import { ROLES, nameOf, publicKey } from "./roles.js";
import { randomCode, signAs, verifySignature } from "./crypto.js";
import { TIER_NAMES, isUpcoming, ticketFingerprint } from "./engine.js";

export const VERDICTS = {
  VALID: { label: "VALID", tone: "green", text: "Real ticket, real owner. Let them in." },
  ALREADY_USED: { label: "ALREADY USED", tone: "yellow", text: "This ticket was already scanned. Do not let them in." },
  TAMPERED: { label: "TAMPERED", tone: "red", text: "The ticket details were edited. They do not match the blockchain." },
  FAKE: { label: "FAKE", tone: "red", text: "This ticket was never created on the blockchain." },
  WRONG_OWNER: { label: "WRONG OWNER", tone: "red", text: "This person is not the owner. Probably a screenshot or a stolen copy." },
  CLOSED: { label: "CONCERT CLOSED", tone: "red", text: "This concert is over or cancelled." },
};

export const newChallenge = () => randomCode(6);

export function entryMessage(ticketId, challenge) {
  return `PIXELPASS entry | ticket #${ticketId} | challenge ${challenge}`;
}

/** What the QR code / ticket copy contains. */
export function ticketCopy(ticket) {
  return {
    app: "PIXELPASS",
    ticket: ticket.id,
    concert: ticket.concertId,
    tier: ticket.tier,
    seat: ticket.seat,
    price: ticket.price,
  };
}

/** The person holding the phone signs the gate's challenge with THEIR key. */
export function holderSigns(holderKey, ticketId, challenge) {
  return signAs(holderKey, entryMessage(ticketId, challenge));
}

/** Find which demo person made a signature (for a friendly explanation). */
export function whoSigned(message, signature) {
  return ROLES.find((r) => verifySignature(publicKey(r.key), message, signature))?.key || null;
}

/**
 * Runs the 5 checks in order and returns { checks, verdict }.
 * presented: the ticket copy shown at the gate.
 */
export function verifyEntry(state, presented, signature, challenge) {
  const checks = [];
  const add = (label, status, detail) => checks.push({ label, status, detail });
  const id = Number(presented?.ticket);
  const real = state.tickets.find((t) => t.id === id);

  // 1. Exists
  if (!real) {
    add("Ticket exists on the blockchain", "fail", `No ticket #${presented?.ticket ?? "?"} was ever created.`);
    for (const l of [
      "Ticket details match the fingerprint",
      "Holder's signature matches the owner",
      "Ticket not used before",
      "Concert is on",
    ])
      add(l, "skip", "Skipped, the ticket does not exist.");
    return { checks, verdict: "FAKE" };
  }
  add("Ticket exists on the blockchain", "pass", `Ticket #${id} exists. Owner on the blockchain: ${nameOf(real.owner)}.`);

  // 2. Fingerprint
  const fp = ticketFingerprint({
    concertId: presented.concert,
    ticketId: presented.ticket,
    tier: presented.tier,
    seat: presented.seat,
    price: presented.price,
  });
  const fpOk = fp === real.fingerprint;
  add(
    "Ticket details match the fingerprint",
    fpOk ? "pass" : "fail",
    fpOk
      ? `${TIER_NAMES[real.tier]}, seat ${real.seat}: the fingerprint matches.`
      : "The fingerprint of these details does not match the one stored on the blockchain."
  );

  // 3. Signature
  let sigOk = false;
  if (!signature) {
    add("Holder's signature matches the owner", "fail", "No signature. A QR code or screenshot alone is not proof.");
  } else {
    const msg = entryMessage(id, challenge);
    sigOk = verifySignature(publicKey(real.owner), msg, signature);
    const signer = whoSigned(msg, signature);
    add(
      "Holder's signature matches the owner",
      sigOk ? "pass" : "fail",
      sigOk
        ? `Signed with ${nameOf(real.owner)}'s private key. This is the real owner.`
        : `Signed by ${signer ? nameOf(signer) : "an unknown key"}, but the owner is ${nameOf(real.owner)}.`
    );
  }

  // 4. Used
  add(
    "Ticket not used before",
    real.used ? "fail" : "pass",
    real.used ? "The blockchain says this ticket already entered." : "Never scanned before."
  );

  // 5. Concert
  const c = state.concerts[real.concertId];
  const on = c.active && isUpcoming(c);
  add("Concert is on", on ? "pass" : "fail", on ? `${c.name} is on.` : `${c.name} is over or cancelled.`);

  let verdict = "VALID";
  if (!fpOk) verdict = "TAMPERED";
  else if (!sigOk) verdict = "WRONG_OWNER";
  else if (real.used) verdict = "ALREADY_USED";
  else if (!on) verdict = "CLOSED";
  return { checks, verdict };
}
