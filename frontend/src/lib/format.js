const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function money(n) {
  return `₹${inr.format(Math.round(Number(n) || 0))}`;
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function shortHash(h, n = 10) {
  if (!h) return "";
  return h.length > n + 4 ? `${h.slice(0, n)}...` : h;
}
