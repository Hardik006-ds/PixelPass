import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { RuleError, checkChain, describe, perform, seedState } from "../lib/engine.js";
import { role as roleInfo } from "../lib/roles.js";

const Ctx = createContext(null);
const STATE_KEY = "pixelpass.sim.v2";
const ROLE_KEY = "pixelpass.role.v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.version === 2 && Array.isArray(s.chain) && checkChain(s.chain).ok) return s;
    }
  } catch {
    // storage blocked or corrupt, start fresh
  }
  return seedState();
}

function loadRole() {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    if (r && roleInfo(r)) return r;
  } catch {
    // ignore
  }
  return "fan1";
}

const EMPTY_GATE = { ticketId: "", presented: null, holder: null, challenge: null, signature: null, result: null };

export function StoreProvider({ children }) {
  const [state, setStateRaw] = useState(loadState);
  const stateRef = useRef(state);
  const [role, setRoleRaw] = useState(loadRole);
  const [toasts, setToasts] = useState([]);
  const [gate, setGate] = useState(EMPTY_GATE);
  const [lab, setLab] = useState({});
  const [chainCopy, setChainCopy] = useState(null); // a tampered copy shown on the Blockchain page
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [demo, setDemo] = useState({ concertId: null, ticketId: null, done: {} });

  const setState = useCallback((s) => {
    stateRef.current = s;
    setStateRaw(s);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch {
      // ignore
    }
  }, []);

  const setRole = useCallback((r) => {
    setRoleRaw(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {
      // ignore
    }
  }, []);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { id, ...t }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "red" ? 7000 : 5000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((l) => l.filter((x) => x.id !== id)), []);

  /**
   * Send an action to the blockchain. The rules check it first.
   * Returns { ok: true, block, result } or { ok: false, message, rule }.
   */
  const act = useCallback(
    (action, { quiet = false } = {}) => {
      const current = stateRef.current;
      try {
        const { state: next, block, result } = perform(current, action);
        setState(next);
        if (!quiet)
          toast({ tone: "green", title: `Block #${block.index} added to the blockchain`, body: block.tx.text });
        return { ok: true, block, result };
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
        const attempt = describe(current, action);
        const next = {
          ...current,
          rejected: [{ time: Date.now(), by: action.by, text: attempt, reason: e.message }, ...current.rejected].slice(
            0,
            30
          ),
        };
        setState(next);
        if (!quiet) toast({ tone: "red", title: "Blocked by the rules", body: e.message });
        return { ok: false, message: e.message, rule: e.rule };
      }
    },
    [setState, toast]
  );

  const resetDemo = useCallback(() => {
    setState(seedState());
    setGate(EMPTY_GATE);
    setLab({});
    setChainCopy(null);
    setDemo({ concertId: null, ticketId: null, done: {} });
    toast({ tone: "green", title: "Demo reset", body: "Fresh blockchain with 3 concerts and 5 tickets." });
  }, [setState, toast]);

  // Keep other browser tabs in sync (for example a second screen).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STATE_KEY && e.newValue) {
        try {
          const s = JSON.parse(e.newValue);
          stateRef.current = s;
          setStateRaw(s);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = {
    state,
    getState: () => stateRef.current,
    role,
    setRole,
    act,
    toast,
    toasts,
    dismissToast,
    resetDemo,
    gate,
    setGate,
    resetGate: () => setGate(EMPTY_GATE),
    lab,
    setLab,
    chainCopy,
    setChainCopy,
    presenterOpen,
    setPresenterOpen,
    demo,
    setDemo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside StoreProvider");
  return c;
}
