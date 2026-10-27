import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useStore } from "../context/Store.jsx";
import { ROLES, role as roleInfo } from "../lib/roles.js";
import { money } from "../lib/format.js";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/concerts", label: "Concerts" },
  { to: "/tickets", label: "My Tickets" },
  { to: "/gate", label: "Entry Gate" },
  { to: "/organizer", label: "Organizer" },
  { to: "/blockchain", label: "Blockchain" },
  { to: "/fraud", label: "Fraud Lab" },
];

export default function TopBar() {
  const { role, setRole, state, presenterOpen, setPresenterOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const me = roleInfo(role);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <NavLink to="/" className="logo" aria-label="PIXELPASS home">
          <span className="logo-mark" aria-hidden="true" />
          PIXEL<span>PASS</span>
        </NavLink>
        <button
          className={`btn btn-small ${presenterOpen ? "btn-yellow" : "btn-pink"} presenter-toggle`}
          onClick={() => setPresenterOpen(!presenterOpen)}
        >
          {presenterOpen ? "Close guided demo" : "Guided demo"}
        </button>
        <button className="btn btn-small nav-toggle" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className="whoami">
        <span className="whoami-label">YOU ARE:</span>
        <div className="role-pills" role="radiogroup" aria-label="Choose who you are">
          {ROLES.map((r) => (
            <button
              key={r.key}
              role="radio"
              aria-checked={role === r.key}
              className={`role-pill ${role === r.key ? "active" : ""}`}
              style={{ "--role-color": r.color }}
              onClick={() => setRole(r.key)}
            >
              <span className="role-dot" aria-hidden="true" />
              {r.label}
            </button>
          ))}
        </div>
        <div className="whoami-info">
          <span className="whoami-desc">{me.desc}</span>
          <span className="whoami-wallet">Wallet: {money(state.wallets[role])}</span>
        </div>
      </div>

      <nav className={`nav ${menuOpen ? "open" : ""}`} aria-label="Main">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setMenuOpen(false)}>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
