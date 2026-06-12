import { Outlet } from "@tanstack/react-router";

import { Sidebar } from "./sidebar";

export function AppShell(): React.ReactElement {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
