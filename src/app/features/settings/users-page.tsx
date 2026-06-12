import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { CreateUserDialog } from "./create-user-dialog";
import { SecretRevealDialog } from "./secret-reveal-dialog";

import { authClient } from "@/app/api/auth-client";
import { unwrap } from "@/app/api/client";
import { sessionQueryOptions } from "@/app/api/session";
import { type AdminUser, usersKeys, usersQueryOptions } from "@/app/api/users";
import { useI18n } from "@/app/i18n";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { EmptyState } from "@/app/components/common/empty-state";
import { ErrorState } from "@/app/components/common/error-state";
import { ConfirmDialog } from "@/app/components/common/confirm-dialog";
import { formatRelativeTime } from "@/app/lib/format";
import { generatePassword } from "@/app/lib/password";


export function UsersPage(): React.ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: users, isPending, isError, error, refetch } = useQuery(usersQueryOptions);
  const { data: session } = useQuery(sessionQueryOptions);
  const currentUserId = session?.user.id;

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [resetReveal, setResetReveal] = useState<{ email: string; password: string } | null>(null);

  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: usersKeys.all });

  const activeCount = (users ?? []).filter((u) => !u.banned).length;

  const banMutation = useMutation({
    mutationFn: async (vars: { userId: string; ban: boolean }) =>
      vars.ban
        ? unwrap(await authClient.admin.banUser({ userId: vars.userId }))
        : unwrap(await authClient.admin.unbanUser({ userId: vars.userId })),
    onSuccess: async (_data, vars) => {
      await invalidate();
      toast.success(vars.ban ? t("settings.users.deactivated") : t("settings.users.reactivated"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.users.actionFailed")),
  });

  const resetMutation = useMutation({
    mutationFn: async (user: AdminUser) => {
      const newPassword = generatePassword();
      unwrap(await authClient.admin.setUserPassword({ userId: user.id, newPassword }));
      return { email: user.email, password: newPassword };
    },
    onSuccess: (result) => setResetReveal(result),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.users.resetError")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: AdminUser) => unwrap(await authClient.admin.removeUser({ userId: user.id })),
    onSuccess: async () => {
      await invalidate();
      setDeleteTarget(null);
      toast.success(t("settings.users.deleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.users.deleteError")),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("settings.users.invite")}</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          {t("settings.users.addUser")}
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t("settings.users.empty")} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.users.table.name")}</TableHead>
                <TableHead>{t("settings.users.table.status")}</TableHead>
                <TableHead>{t("settings.users.table.created")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isLastActive = !user.banned && activeCount <= 1;
                const protectedRow = isSelf || isLastActive;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">
                        {user.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">({t("settings.users.you")})</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="secondary">{t("settings.users.status.deactivated")}</Badge>
                      ) : (
                        <Badge className="bg-success text-success-foreground">{t("settings.users.status.active")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(new Date(user.createdAt))}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => resetMutation.mutate(user)}>
                            {t("settings.users.actions.resetPassword")}
                          </DropdownMenuItem>
                          {user.banned ? (
                            <DropdownMenuItem onSelect={() => banMutation.mutate({ userId: user.id, ban: false })}>
                              {t("settings.users.actions.reactivate")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={protectedRow}
                              onSelect={() => banMutation.mutate({ userId: user.id, ban: true })}
                            >
                              {t("settings.users.actions.deactivate")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={protectedRow}
                            onSelect={() => setDeleteTarget(user)}
                          >
                            {t("settings.users.actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        title={t("settings.users.delete.title", { name: deleteTarget?.name ?? "" })}
        description={t("settings.users.delete.description")}
        confirmLabel={t("settings.users.delete.confirm")}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}
      />

      {resetReveal ? (
        <SecretRevealDialog
          open={!!resetReveal}
          onOpenChange={(next) => { if (!next) setResetReveal(null); }}
          title={t("settings.users.passwordReset.title")}
          description={t("settings.users.passwordReset.description")}
          secret={resetReveal.password}
          fields={[{ label: t("auth.login.email"), value: resetReveal.email }]}
        />
      ) : null}
    </div>
  );
}
