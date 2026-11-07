// Sidebar-free layout for embedding a single view (iframe / Dynamics 365 HTML web resource).
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <main className="main main--embed">{children}</main>;
}
