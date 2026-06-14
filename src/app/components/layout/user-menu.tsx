import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDownIcon, KeyRoundIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react";

import { authClient } from "@/app/api/auth-client";
import { sessionQueryOptions } from "@/app/api/session";
import { useI18n } from "@/app/i18n";
import { useTheme } from "@/app/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/app/features/auth/change-password-dialog";

export function UserMenu(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions);
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isDark = resolvedTheme === "dark";

  const user = session?.user;
  const initials = (user?.name ?? user?.email ?? "?").slice(0, 2).toUpperCase();

  const signOut = async (): Promise<void> => {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey });
    queryClient.clear();
    navigate({ to: "/login" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{user?.name ?? t("userMenu.user")}</span>
            <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRoundIcon className="size-4" />
            {t("userMenu.changePassword")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTheme(isDark ? "light" : "dark");
            }}
          >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            {isDark ? t("userMenu.lightMode") : t("userMenu.darkMode")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOutIcon className="size-4" />
            {t("userMenu.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
