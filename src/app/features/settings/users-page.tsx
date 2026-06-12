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
      toast.success(vars.ban ? "User deactivated" : "User reactivated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const resetMutation = useMutation({
    mutationFn: async (user: AdminUser) => {
      const newPassword = generatePassword();
      unwrap(await authClient.admin.setUserPassword({ userId: user.id, newPassword }));
      return { email: user.email, password: newPassword };
    },
    onSuccess: (result) => setResetReveal(result),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reset password"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: AdminUser) => unwrap(await authClient.admin.removeUser({ userId: user.id })),
    onSuccess: async () => {
      await invalidate();
      setDeleteTarget(null);
      toast.success("User deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete user"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Invite-only. Every user has full admin access.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          Add user
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
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
                        {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="secondary">Deactivated</Badge>
                      ) : (
                        <Badge className="bg-success text-success-foreground">Active</Badge>
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
                            Reset password
                          </DropdownMenuItem>
                          {user.banned ? (
                            <DropdownMenuItem onSelect={() => banMutation.mutate({ userId: user.id, ban: false })}>
                              Reactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={protectedRow}
                              onSelect={() => banMutation.mutate({ userId: user.id, ban: true })}
                            >
                              Deactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={protectedRow}
                            onSelect={() => setDeleteTarget(user)}
                          >
                            Delete
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
        title={`Delete ${deleteTarget?.name ?? "user"}?`}
        description="This permanently removes the user and revokes their access. This cannot be undone."
        confirmLabel="Delete user"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}
      />

      {resetReveal ? (
        <SecretRevealDialog
          open={!!resetReveal}
          onOpenChange={(next) => { if (!next) setResetReveal(null); }}
          title="Password reset"
          description="Share the new temporary password with the user."
          secret={resetReveal.password}
          fields={[{ label: "Email", value: resetReveal.email }]}
        />
      ) : null}
    </div>
  );
}
