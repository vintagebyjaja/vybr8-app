/**
 * Illustrated skylines for the 7 launch cities (flat silhouettes, drawn in code, no photos or brands).
 * Canvas is 400 × 200; ground is y = 200. Pure data, rendered by <CitySkyline>.
 */

export type Shape =
  | { t: "rect"; x: number; y: number; w: number; h?: number; lit?: boolean }
  | { t: "poly"; pts: string }
  | { t: "path"; d: string; stroke?: number }
  | { t: "circle"; cx: number; cy: number; r: number };

const tower = (x: number, y: number, w: number, lit = true): Shape => ({ t: "rect", x, y, w, lit });

export const SKYLINES: Record<string, { back: Shape[]; front: Shape[] }> = {
  // Crowned tower in the middle, a tall slab beside it.
  charlotte: {
    back: [tower(40, 120, 26), tower(70, 104, 22), tower(300, 110, 24), tower(330, 126, 30), tower(360, 140, 26)],
    front: [
      tower(96, 132, 30), tower(130, 96, 28), { t: "poly", pts: "130,96 144,82 158,96" },
      { t: "rect", x: 168, y: 58, w: 34, lit: true },
      { t: "poly", pts: "168,58 172,44 176,52 180,36 185,50 190,36 194,52 198,44 202,58" },
      tower(208, 88, 30), tower(242, 116, 24), tower(268, 100, 26), { t: "rect", x: 280, y: 84, w: 2, h: 16 },
      tower(10, 150, 28), tower(372, 156, 28),
    ],
  },
  // Pyramid-topped tower with a spire, a round hotel tower.
  atlanta: {
    back: [tower(30, 126, 28), tower(62, 112, 24), tower(310, 118, 28), tower(342, 132, 26)],
    front: [
      tower(90, 128, 26), { t: "rect", x: 120, y: 100, w: 22, lit: true }, { t: "path", d: "M120 100 Q131 92 142 100" },
      { t: "rect", x: 166, y: 70, w: 32, lit: true }, { t: "poly", pts: "166,70 182,42 198,70" }, { t: "rect", x: 181, y: 18, w: 2, h: 26 },
      tower(204, 92, 30), { t: "poly", pts: "204,92 219,80 234,92" },
      tower(240, 118, 26), tower(270, 104, 30), tower(8, 148, 26), tower(372, 150, 28),
    ],
  },
  // The two-eared tower, low river buildings.
  nashville: {
    back: [tower(34, 130, 26), tower(66, 118, 28), tower(292, 122, 30), tower(328, 136, 28)],
    front: [
      tower(98, 128, 30), tower(132, 110, 26),
      { t: "rect", x: 170, y: 72, w: 40, lit: true },
      { t: "poly", pts: "170,72 170,40 176,40 180,64 200,64 204,40 210,40 210,72" },
      tower(216, 104, 28), tower(248, 124, 30), tower(282, 140, 24), tower(8, 152, 28), tower(360, 150, 34),
    ],
  },
  // A wall of tall towers.
  houston: {
    back: [tower(20, 118, 24), tower(48, 100, 22), tower(300, 96, 24), tower(328, 112, 26), tower(358, 124, 28)],
    front: [
      tower(76, 110, 26), { t: "rect", x: 106, y: 70, w: 30, lit: true }, { t: "poly", pts: "106,70 121,58 136,70" },
      tower(140, 88, 26), { t: "rect", x: 170, y: 52, w: 30, lit: true }, { t: "poly", pts: "170,52 185,44 200,52" },
      tower(204, 80, 28), tower(236, 64, 24), { t: "poly", pts: "236,64 248,50 260,64" }, tower(264, 102, 30),
      tower(4, 146, 22), tower(376, 144, 24),
    ],
  },
  // Mountains, a saguaro, low towers.
  phoenix: {
    back: [{ t: "poly", pts: "0,200 0,120 40,96 80,118 120,84 170,112 220,90 270,116 320,94 360,112 400,100 400,200" }],
    front: [
      tower(120, 138, 26), tower(150, 118, 28), tower(182, 104, 30), tower(216, 124, 26), tower(246, 140, 28),
      { t: "path", d: "M60 200 V132 M60 160 H48 V144 M60 150 H72 V136", stroke: 9 },
      { t: "path", d: "M330 200 V148 M330 170 H320 V158 M330 164 H340 V154", stroke: 7 },
      tower(282, 156, 22),
    ],
  },
  // Dome and obelisk, a low skyline (no skyscrapers).
  dc: {
    back: [tower(0, 160, 60), tower(64, 150, 40), tower(300, 154, 50), tower(354, 162, 46)],
    front: [
      { t: "rect", x: 108, y: 150, w: 120, lit: true },
      { t: "rect", x: 146, y: 126, w: 44, h: 24 },
      { t: "path", d: "M146 128 Q168 76 190 128 Z" },
      { t: "rect", x: 165, y: 94, w: 6, h: 10 }, { t: "rect", x: 167, y: 86, w: 2, h: 8 },
      { t: "poly", pts: "262,200 266,60 272,60 276,200" }, { t: "poly", pts: "266,60 269,50 272,60" },
      tower(240, 168, 18), tower(284, 170, 16),
    ],
  },
  // Bridge towers and cables in front, the city across the river behind.
  brooklyn: {
    back: [
      tower(10, 118, 20), tower(34, 96, 18), tower(56, 128, 22), { t: "rect", x: 80, y: 62, w: 20, lit: true }, { t: "poly", pts: "80,62 90,50 100,62" }, { t: "rect", x: 89, y: 26, w: 2, h: 26 },
      tower(104, 108, 22), tower(300, 104, 22), tower(326, 88, 18), tower(348, 120, 24), tower(376, 110, 22),
    ],
    front: [
      { t: "rect", x: 0, y: 168, w: 400, h: 6 },
      { t: "path", d: "M130 200 V92 H166 V200 M138 200 V110 Q148 96 158 110 V200" },
      { t: "path", d: "M234 200 V92 H270 V200 M242 200 V110 Q252 96 262 110 V200" },
      { t: "path", d: "M0 150 Q70 150 148 94 Q200 168 252 94 Q330 150 400 150", stroke: 2 },
      { t: "path", d: "M0 160 Q70 160 148 104 Q200 168 252 104 Q330 160 400 160", stroke: 1.5 },
    ],
  },
};

/** Lit window positions for a tower: a stable pattern (no randomness, so server and browser match). */
export function windows(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let wy = y + 6; wy < y + h - 6; wy += 9) {
    for (let wx = x + 4; wx < x + w - 4; wx += 7) {
      if ((Math.floor(wx * 13 + wy * 7) % 5) < 2) out.push({ x: wx, y: wy });
    }
  }
  return out;
}
