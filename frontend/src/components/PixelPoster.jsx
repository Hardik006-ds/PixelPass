import { useEffect, useRef } from "react";

const W = 48;
const H = 64;

// Small seeded random generator so each concert always gets the same poster.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIES = [
  ["#0b0628", "#2a0f5c", "#6b1f8a", "#d6336c"],
  ["#020b24", "#0d2b5c", "#1b6f9e", "#38d6c9"],
  ["#120417", "#3d0b3f", "#8a1d4f", "#ff7a3d"],
  ["#050816", "#1c1446", "#3b2a8c", "#9b5de5"],
  ["#00140f", "#053a35", "#0f6b5b", "#9df26b"],
];
const SPOTS = ["#ff2e88", "#22e4ff", "#ffe23d", "#3dff8a", "#ff8a1f", "#b06bff"];

// 4x4 Bayer matrix for ordered dithering between sky bands.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function drawPoster(ctx, id) {
  const rnd = mulberry32(id * 7919 + 17);
  const sky = SKIES[id % SKIES.length];
  const spot = SPOTS[(id * 3 + 1) % SPOTS.length];
  const spot2 = SPOTS[(id * 5 + 4) % SPOTS.length];
  const px = (x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };

  // Sky: 4 colour bands with dithered edges.
  const skyH = 50;
  for (let y = 0; y < skyH; y++) {
    const pos = (y / skyH) * (sky.length - 1);
    const band = Math.floor(pos);
    const frac = pos - band;
    for (let x = 0; x < W; x++) {
      const threshold = (BAYER[y % 4][x % 4] + 0.5) / 16;
      const c = frac > threshold ? sky[Math.min(band + 1, sky.length - 1)] : sky[band];
      px(x, y, c);
    }
  }

  // Stars.
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 26);
    px(x, y, rnd() > 0.7 ? "#ffe23d" : "#ffffff");
    if (rnd() > 0.85 && x > 0 && x < W - 1) {
      px(x - 1, y, "#8a7bd6");
      px(x + 1, y, "#8a7bd6");
    }
  }

  // Moon or planet.
  const mx = 6 + Math.floor(rnd() * 34);
  const my = 4 + Math.floor(rnd() * 8);
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) px(mx + dx, my + dy, "#f6efd2");
  px(mx + 1, my - 1, "#d9cfa6");
  px(mx - 1, my + 1, "#d9cfa6");

  // Far city skyline.
  for (let x = 0; x < W; ) {
    const bw = 2 + Math.floor(rnd() * 4);
    const bh = 4 + Math.floor(rnd() * 9);
    for (let xx = x; xx < Math.min(W, x + bw); xx++)
      for (let y = skyH - bh; y < skyH; y++) px(xx, y, "#160b33");
    if (rnd() > 0.4) px(x + 1, skyH - bh + 2, "#ffe23d");
    x += bw;
  }

  // Stage truss.
  const trussC = "#0a0618";
  for (let y = 18; y < 52; y++) {
    px(6, y, trussC);
    px(41, y, trussC);
  }
  for (let x = 6; x <= 41; x++) {
    px(x, 18, trussC);
    px(x, 19, trussC);
  }

  // Spotlight beams (semi transparent).
  const beam = (fromX, toX1, toX2, color) => {
    ctx.globalAlpha = 0.38;
    for (let y = 20; y < 50; y++) {
      const t = (y - 20) / 30;
      const a = Math.round(fromX + (toX1 - fromX) * t);
      const b = Math.round(fromX + (toX2 - fromX) * t);
      for (let x = Math.min(a, b); x <= Math.max(a, b); x++) px(x, y, color);
    }
    ctx.globalAlpha = 1;
  };
  beam(12, 14, 26, spot);
  beam(35, 22, 34, spot2);
  if (id % 2 === 0) beam(24, 18, 30, "#ffffff");
  px(12, 20, "#ffffff");
  px(35, 20, "#ffffff");

  // Speaker stacks.
  for (let y = 38; y < 50; y++)
    for (let x = 8; x < 12; x++) px(x, y, (y + x) % 3 === 0 ? "#2a1f4d" : "#120a26");
  for (let y = 38; y < 50; y++)
    for (let x = 36; x < 40; x++) px(x, y, (y + x) % 3 === 0 ? "#2a1f4d" : "#120a26");

  // Performer.
  const pc = "#05020d";
  const cx = 23 + (id % 3);
  px(cx, 39, pc);
  px(cx + 1, 39, pc);
  px(cx, 40, pc);
  px(cx + 1, 40, pc);
  for (let y = 41; y < 47; y++) {
    px(cx, y, pc);
    px(cx + 1, y, pc);
  }
  px(cx - 1, 42, pc);
  px(cx - 2, 41, pc); // raised arm
  px(cx + 2, 43, pc);
  px(cx, 47, pc);
  px(cx + 1, 48, pc);
  px(cx - 1, 48, pc);

  // Stage floor.
  for (let x = 4; x < 44; x++) {
    px(x, 49, spot);
    for (let y = 50; y < 53; y++) px(x, y, "#1a1033");
  }

  // Crowd.
  for (let y = 53; y < H; y++) for (let x = 0; x < W; x++) px(x, y, "#07030f");
  for (let x = 0; x < W; x += 2) {
    const h = 53 - Math.floor(rnd() * 3);
    px(x, h, "#07030f");
    px(x + 1, h, "#07030f");
    if (rnd() > 0.82) {
      px(x, h - 1, "#07030f");
      px(x, h - 2, "#07030f");
      px(x, h - 3, rnd() > 0.5 ? "#ffe23d" : "#22e4ff"); // phone light
    }
  }
}

export default function PixelPoster({ concertId, className = "", label }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    drawPoster(ctx, Number(concertId) || 0);
  }, [concertId]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className={`pixel-poster ${className}`}
      role="img"
      aria-label={label || `Pixel poster for concert ${concertId}`}
    />
  );
}
