import { VERDICTS } from "../lib/verifier.js";

const ICON = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

/** The 5 gate checks plus the big verdict banner. */
export default function VerifyResult({ result, compact = false }) {
  if (!result) return null;
  const v = VERDICTS[result.verdict];
  return (
    <div className="verify">
      <div className={`verdict verdict-${v.tone}`} role="status">
        <span className="verdict-label">{v.label}</span>
        <span className="verdict-text">{v.text}</span>
      </div>
      {!compact && (
        <ol className="checks">
          {result.checks.map((c, i) => (
            <li key={i} className={`check check-${c.status}`}>
              <span className="check-icon">{ICON[c.status]}</span>
              <span className="check-text">
                <strong>
                  {i + 1}. {c.label}
                </strong>
                <span>{c.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
