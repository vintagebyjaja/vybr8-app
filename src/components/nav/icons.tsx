type IconProps = { className?: string };
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const HomeIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>
);
export const ExploreIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
);
export const HealthIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
);
export const ProfileIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
);
/** The VYBR8 "8" drawn as an infinity loop, used for the VYBE action. */
export const InfinityIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4Zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4Z" />
  </svg>
);
