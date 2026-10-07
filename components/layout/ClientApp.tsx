"use client";

import dynamic from "next/dynamic";

// The workspace depends on browser-only state (localStorage, matchMedia,
// EventSource, CodeMirror), so it is rendered on the client only.
const AppShell = dynamic(() => import("./AppShell").then((m) => m.AppShell), {
  ssr: false,
  loading: () => <ShellSkeleton />,
});

export function ClientApp() {
  return <AppShell />;
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh">
      <div className="hidden w-[272px] shrink-0 border-r border-border bg-sidebar md:block" />
      <div className="flex-1" />
    </div>
  );
}
