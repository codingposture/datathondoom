// Small inline SVG icon set (no icon font dependency).
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

export const IconDialogs = (p: P) => (<svg {...base} {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>);
export const IconChecklist = (p: P) => (<svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>);
export const IconAppeal = (p: P) => (<svg {...base} {...p}><path d="M12 3v3M5.6 6.6l2.1 2.1M3 13h3M18 13h3M16.3 8.7l2.1-2.1" /><path d="M8 21h8M9 17h6l-1-4h-4z" /></svg>);
export const IconAnalytics = (p: P) => (<svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const IconPlay = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 4.5v15l13-7.5z" /></svg>);
export const IconPause = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>);
export const IconBack = (p: P) => (<svg {...base} {...p}><path d="m15 18-6-6 6-6" /></svg>);
export const IconUp = (p: P) => (<svg {...base} {...p}><path d="m18 15-6-6-6 6" /></svg>);
export const IconDown = (p: P) => (<svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>);
export const IconTrash = (p: P) => (<svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IconPlus = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IconExternal = (p: P) => (<svg {...base} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
export const IconAlert = (p: P) => (<svg {...base} {...p}><path d="M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>);
export const IconFreedom = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}><path d="M3 3h18v8.5c0 5.5-4.2 8.6-9 9.5-4.8-.9-9-4-9-9.5z" fill="#b6f295" /><path d="M9 7h7v2.4h-4.4v2h3.8v2.3h-3.8V18H9z" fill="#10372c" /></svg>
);
