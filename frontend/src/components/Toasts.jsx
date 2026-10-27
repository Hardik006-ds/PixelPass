import { useStore } from "../context/Store.jsx";

/** Pop-up notes in the corner: green for a new block, red when the rules block something. */
export default function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <div className="toast-head">
            <strong>{t.title}</strong>
            <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Close">
              x
            </button>
          </div>
          <div className="toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
