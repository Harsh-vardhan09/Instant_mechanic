// Shell shared by every dashboard route: sidebar, top bar, providers.
// Plain `children` typing — the global LayoutProps<'/route'> helper is added once the route settles.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
