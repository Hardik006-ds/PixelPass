import { publicKeyFor } from "./crypto.js";

// The people in the demo. Each has a wallet (rupees) and a digital key.
export const ROLES = [
  {
    key: "organizer",
    label: "Organizer",
    desc: "Runs the concerts. Creates events and receives ticket money.",
    color: "var(--yellow)",
    start: 0,
  },
  {
    key: "fan1",
    label: "Fan 1",
    desc: "A music fan who buys tickets.",
    color: "var(--cyan)",
    start: 50000,
  },
  {
    key: "fan2",
    label: "Fan 2",
    desc: "Another fan. Can receive or buy tickets from others.",
    color: "var(--cyan)",
    start: 50000,
  },
  {
    key: "fan3",
    label: "Fan 3",
    desc: "A third fan, used for the resale market.",
    color: "var(--cyan)",
    start: 50000,
  },
  {
    key: "attacker",
    label: "Attacker",
    desc: "A cheater who tries to steal, fake or scalp tickets.",
    color: "var(--red)",
    start: 50000,
  },
  {
    key: "staff",
    label: "Gate Staff",
    desc: "Checks tickets at the entrance and lets people in.",
    color: "var(--green)",
    start: 0,
  },
];

const PUBLIC_KEYS = Object.fromEntries(ROLES.map((r) => [r.key, publicKeyFor(r.key)]));

export function role(key) {
  return ROLES.find((r) => r.key === key) || null;
}

export function nameOf(key) {
  return role(key)?.label || key;
}

export function publicKey(key) {
  return PUBLIC_KEYS[key];
}

/** Short "digital ID" shown in the UI (first characters of the public key). */
export function digitalId(key) {
  const pk = PUBLIC_KEYS[key];
  return pk ? `${pk.slice(0, 6)}...${pk.slice(-4)}` : "?";
}
