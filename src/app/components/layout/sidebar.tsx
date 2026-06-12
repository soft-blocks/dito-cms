import { Link } from "@tanstack/react-router";
import { ImageIcon, LayoutGridIcon, type LucideIcon, SettingsIcon } from "lucide-react";

import { UserMenu } from "./user-menu";

import { APP_NAME } from "@/shared/constants";
import { cn } from "@/app/lib/utils";


interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: "/collections", label: "Collections", icon: LayoutGridIcon },
  { to: "/media", label: "Media", icon: ImageIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar(): React.ReactElement {
  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 px-4">
        <img src="/favicon.svg" alt="" className="size-6" />
        <span className="text-sm font-semibold">{APP_NAME}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{ className: cn("bg-sidebar-accent text-sidebar-accent-foreground") }}
            activeOptions={{ exact: false }}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-3">
        <UserMenu />
      </div>
    </aside>
  );
}
