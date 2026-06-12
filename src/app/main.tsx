import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { type AnyRouter, createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "./router";
import { createQueryClient } from "./api/query-client";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles.css";

// queryClient ↔ router are mutually referential: the 401 handler navigates via the
// router, and the router reads queryClient from its context. Resolve with a late ref.
const routerHolder: { current?: AnyRouter } = {};
const queryClient = createQueryClient(() => {
  void routerHolder.current?.navigate({ to: "/login" });
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});
routerHolder.current = router;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Keep the document title in sync with the active route (deepest match's title wins).
router.subscribe("onResolved", () => {
  let title: string | undefined;
  for (const match of router.state.matches) {
    if (match.staticData.title) title = match.staticData.title;
  }
  document.title = title ? `${title} · Dito CMS` : "Dito CMS";
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" closeButton richColors />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
