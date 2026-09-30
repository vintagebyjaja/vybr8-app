/** Category tile colors, kept to the VYBR8 palette (literal class names so Tailwind keeps them). */
export const TONE: Record<string, { tile: string; chip: string; text: string }> = {
  orange: { tile: "from-orange/30 to-orange/5 border-orange/40", chip: "border-orange/50 bg-orange/15", text: "text-orange" },
  gold: { tile: "from-orange/25 to-coral/5 border-orange/30", chip: "border-orange/40 bg-orange/10", text: "text-orange" },
  coral: { tile: "from-coral/30 to-coral/5 border-coral/40", chip: "border-coral/50 bg-coral/15", text: "text-coral" },
  pink: { tile: "from-coral/30 to-lavender/10 border-coral/40", chip: "border-coral/50 bg-coral/15", text: "text-coral" },
  mint: { tile: "from-mint/25 to-mint/5 border-mint/35", chip: "border-mint/50 bg-mint/10", text: "text-mint" },
  sky: { tile: "from-sky/30 to-sky/5 border-sky/40", chip: "border-sky/50 bg-sky/10", text: "text-sky" },
  lavender: { tile: "from-lavender/30 to-lavender/5 border-lavender/40", chip: "border-lavender/50 bg-lavender/10", text: "text-lavender" },
};
export const tone = (t: string) => TONE[t] ?? TONE.coral!;
