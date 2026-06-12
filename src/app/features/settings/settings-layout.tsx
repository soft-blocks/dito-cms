import { Link, Outlet } from "@tanstack/react-router";

import { PageHeader } from "@/app/components/common/page-header";
import { cn } from "@/app/lib/utils";

const TABS = [
  { to: "/settings/general", label: "General" },
  { to: "/settings/users", label: "Users" },
  { to: "/settings/api-keys", label: "API keys" },
];

export function SettingsLayout(): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: cn("border-primary text-foreground") }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
