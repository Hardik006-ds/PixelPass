// Small helpers for the 3-step gate flow, shared by the Gate page and the guided demo.
import { holderSigns, newChallenge, ticketCopy, verifyEntry } from "./verifier.js";

/** Step 1: staff scan a ticket. A fresh random challenge is made for every scan. */
export function scan(state, ticketId) {
  const t = state.tickets.find((x) => x.id === Number(ticketId));
  return {
    ticketId: String(ticketId),
    presented: t ? ticketCopy(t) : { app: "PIXELPASS", ticket: Number(ticketId) },
    challenge: newChallenge(),
    holder: null,
    signature: null,
    result: null,
  };
}

/** Step 2: the person at the gate signs the challenge on their phone. */
export function sign(session, holderKey) {
  return {
    ...session,
    holder: holderKey,
    signature: holderSigns(holderKey, session.presented.ticket, session.challenge),
    result: null,
  };
}

/** Step 3: check the 5 rules. */
export function check(state, session) {
  return { ...session, result: verifyEntry(state, session.presented, session.signature, session.challenge) };
}
