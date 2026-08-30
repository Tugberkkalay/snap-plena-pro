/**
 * Unit test for isLSign geometry in /app/frontend/src/components/booth/LoginGate.jsx
 * The function source is EXTRACTED FROM THE REAL FILE (no copy-paste drift),
 * then a "legacy" variant is built by reverting the fixed thresholds, to prove
 * the relaxation actually changes behaviour for the reported slow-detection case.
 */
const fs = require("fs");

const SRC = "/app/frontend/src/components/booth/LoginGate.jsx";
const text = fs.readFileSync(SRC, "utf8");

const distSrc = text.match(/const dist = .*?;/s);
const fnSrc = text.match(/function isLSign\(lm\) \{[\s\S]*?\n\}/);
if (!distSrc || !fnSrc) {
  console.error("FAIL: could not extract dist/isLSign from source");
  process.exit(1);
}

function build(src) {
  // eslint-disable-next-line no-new-func
  return new Function(`${distSrc[0]}\n${src}\nreturn isLSign;`)();
}

const newSrc = fnSrc[0];
const oldSrc = newSrc
  .replace("scale * 0.55", "scale * 0.8")
  .replace("cos < 0.85", "cos < 0.7")
  .replace(/\* 1\.25/g, "* 1.15")
  .replace("lm[8].y < lm[5].y", "lm[8].y < lm[6].y");

const isLSign = build(newSrc);
const isLSignOld = build(oldSrc);

// --- constant checks ---
const constChecks = [
  ["HOLD_MS === 550", /const HOLD_MS = 550;/.test(text)],
  ["progress decay dt * 0.5", /heldRef\.current - dt \* 0\.5/.test(text)],
  ["minHandDetectionConfidence: 0.3", /minHandDetectionConfidence: 0\.3/.test(text)],
  ["minHandPresenceConfidence: 0.3", /minHandPresenceConfidence: 0\.3/.test(text)],
  ["minTrackingConfidence: 0.3", /minTrackingConfidence: 0\.3/.test(text)],
  ["thumbExt uses 0.55*scale", /dist\(lm\[4\], lm\[5\]\) > scale \* 0\.55/.test(text)],
  ["angle cos < 0.85", /cos < 0\.85/.test(text)],
  ["fold multiplier 1.25 x3", (text.match(/\* 1\.25/g) || []).length === 3],
  ["indexExt vs lm[5].y", /lm\[8\]\.y < lm\[5\]\.y/.test(text)],
];

// --- fixture helpers ---
const P = (x, y) => ({ x, y });
function rotate(lms, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = lms[0];
  return lms.map((p) => ({
    x: o.x + (p.x - o.x) * c - (p.y - o.y) * s,
    y: o.y + (p.x - o.x) * s + (p.y - o.y) * c,
  }));
}

// (a) clean L sign: index straight up, thumb well out sideways, other fingers curled
const cleanL = [
  P(0.5, 0.9), // 0 wrist
  P(0.45, 0.8), P(0.4, 0.75), P(0.33, 0.73), P(0.27, 0.72), // thumb 1-4
  P(0.5, 0.6), P(0.5, 0.5), P(0.5, 0.4), P(0.5, 0.3), // index 5-8
  P(0.55, 0.62), P(0.56, 0.53), P(0.55, 0.58), P(0.54, 0.63), // middle 9-12 curled
  P(0.6, 0.63), P(0.61, 0.55), P(0.6, 0.6), P(0.59, 0.65), // ring 13-16 curled
  P(0.65, 0.66), P(0.66, 0.58), P(0.65, 0.62), P(0.64, 0.67), // pinky 17-20 curled
];

// (b) relaxed / tilted L: thumb only moderately extended (~0.62*scale from index MCP)
// and index/thumb angle ~40deg (cos ~0.77) -> the "real user" sloppy L.
const lazyLbase = [
  P(0.5, 0.9),
  P(0.46, 0.8), P(0.44, 0.74), P(0.3628, 0.6481), P(0.3243, 0.6021), // shorter, steeper thumb
  P(0.5, 0.6), P(0.5, 0.5), P(0.5, 0.4), P(0.5, 0.3),
  P(0.55, 0.62), P(0.56, 0.53), P(0.55, 0.58), P(0.54, 0.63),
  P(0.6, 0.63), P(0.61, 0.55), P(0.6, 0.6), P(0.59, 0.65),
  P(0.65, 0.66), P(0.66, 0.58), P(0.65, 0.62), P(0.64, 0.67),
];
const lazyLTilted = rotate(lazyLbase, 18);

// (c) closed fist: every tip pulled back toward the wrist
const fist = [
  P(0.5, 0.9),
  P(0.45, 0.82), P(0.42, 0.78), P(0.44, 0.74), P(0.47, 0.72),
  P(0.5, 0.68), P(0.5, 0.6), P(0.5, 0.66), P(0.5, 0.71),
  P(0.55, 0.69), P(0.56, 0.61), P(0.55, 0.66), P(0.54, 0.71),
  P(0.6, 0.7), P(0.61, 0.62), P(0.6, 0.67), P(0.59, 0.72),
  P(0.65, 0.72), P(0.66, 0.64), P(0.65, 0.69), P(0.64, 0.74),
];

// (d) open palm: all five fingers extended
const openPalm = [
  P(0.5, 0.9),
  P(0.44, 0.82), P(0.38, 0.77), P(0.31, 0.73), P(0.25, 0.7),
  P(0.47, 0.62), P(0.46, 0.5), P(0.45, 0.42), P(0.44, 0.34),
  P(0.53, 0.61), P(0.53, 0.48), P(0.53, 0.39), P(0.53, 0.31),
  P(0.59, 0.62), P(0.6, 0.5), P(0.61, 0.42), P(0.62, 0.34),
  P(0.65, 0.65), P(0.68, 0.55), P(0.7, 0.48), P(0.72, 0.42),
];

// (e) pointing up only: index extended, thumb folded across the palm
const pointOnly = [
  P(0.5, 0.9),
  P(0.46, 0.81), P(0.44, 0.76), P(0.47, 0.72), P(0.52, 0.7), // thumb tucked in
  P(0.5, 0.6), P(0.5, 0.5), P(0.5, 0.4), P(0.5, 0.3),
  P(0.55, 0.62), P(0.56, 0.53), P(0.55, 0.58), P(0.54, 0.63),
  P(0.6, 0.63), P(0.61, 0.55), P(0.6, 0.6), P(0.59, 0.65),
  P(0.65, 0.66), P(0.66, 0.58), P(0.65, 0.62), P(0.64, 0.67),
];

const cases = [
  ["(a) clean L sign", cleanL, true],
  ["(b) tilted 18deg + moderately extended thumb (bug case)", lazyLTilted, true],
  ["(b2) same lazy L untilted", lazyLbase, true],
  ["(c) closed fist", fist, false],
  ["(d) open palm", openPalm, false],
  ["(e) pointing up only (thumb folded)", pointOnly, false],
  ["(f) null / short input", [], false],
];

let failures = 0;
console.log("=== constant verification ===");
for (const [name, ok] of constChecks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  if (!ok) failures++;
}

console.log("\n=== isLSign (current thresholds) ===");
for (const [name, lm, expected] of cases) {
  const got = isLSign(lm);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${name} -> ${got} (expected ${expected})`);
}

console.log("\n=== regression proof: legacy thresholds (0.8*scale / cos<0.7 / 1.15 / lm[6].y) ===");
const legacy = [
  ["(a) clean L (old should still accept)", cleanL, true],
  ["(b) lazy tilted L (old MUST reject -> proves fix matters)", lazyLTilted, false],
  ["(b2) lazy L untilted (old MUST reject)", lazyLbase, false],
];
for (const [name, lm, expected] of legacy) {
  const got = isLSignOld(lm);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${name} -> old=${got} (expected ${expected})`);
}

// diagnostics for the bug case
(function diag() {
  const lm = lazyLTilted;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const scale = d(lm[0], lm[9]);
  const thumbRatio = d(lm[4], lm[5]) / scale;
  const ix = lm[8].x - lm[5].x;
  const iy = lm[8].y - lm[5].y;
  const tx = lm[4].x - lm[2].x;
  const ty = lm[4].y - lm[2].y;
  const cos = (ix * tx + iy * ty) / (Math.hypot(ix, iy) * Math.hypot(tx, ty));
  console.log(
    `\nDIAG bug-case: thumbExt ratio=${thumbRatio.toFixed(3)} (new>0.55, old>0.8), ` +
      `cos=${cos.toFixed(3)} (new<0.85, old<0.7), angle=${((Math.acos(cos) * 180) / Math.PI).toFixed(1)}deg`
  );
})();

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
