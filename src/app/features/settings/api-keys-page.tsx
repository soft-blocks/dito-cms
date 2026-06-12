import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, MoreHorizontalIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { createApiKeySchema, type CreateApiKeyInput } from "@/shared/forms";
import { authClient } from "@/app/api/auth-client";
import { unwrap } from "@/app/api/client";
import { type ApiKeyRow, apiKeysKeys, apiKeysQueryOptions } from "@/app/api/api-keys";
import { useI18n } from "@/app/i18n";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { CopyButton } from "@/app/components/common/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
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


export function ApiKeysPage(): React.ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: keys, isPending, isError, error, refetch } = useQuery(apiKeysQueryOptions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: { name: "" },
  });

  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: apiKeysKeys.all });

  const handleDialogClose = (): void => {
    setDialogOpen(false);
    setRevealKey(null);
    form.reset();
  };

  const createKey = async (values: CreateApiKeyInput): Promise<void> => {
    try {
      const result = unwrap(await authClient.apiKey.create({ name: values.name }));
      await invalidate();
      form.reset();
      setRevealKey((result as { key: string }).key);
    } catch (e) {
      form.setError("name", { message: e instanceof Error ? e.message : t("settings.apiKeys.create.error") });
    }
  };

  const revokeMutation = useMutation({
    mutationFn: async (key: ApiKeyRow) => unwrap(await authClient.apiKey.delete({ keyId: key.id })),
    onSuccess: async () => {
      await invalidate();
      setRevokeTarget(null);
      toast.success(t("settings.apiKeys.revoke.success"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.apiKeys.revoke.error")),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("settings.apiKeys.description")}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon className="size-4" />
          {t("settings.apiKeys.newKey")}
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRoundIcon}
          title={t("settings.apiKeys.empty.title")}
          description={t("settings.apiKeys.empty.description")}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.apiKeys.table.name")}</TableHead>
                <TableHead>{t("settings.apiKeys.table.key")}</TableHead>
                <TableHead>{t("settings.apiKeys.table.lastUsed")}</TableHead>
                <TableHead>{t("settings.apiKeys.table.created")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name ?? "—"}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">{key.start ?? key.prefix}…</code>
                    {key.enabled === false ? (
                      <Badge variant="secondary" className="ml-2">{t("settings.apiKeys.disabled")}</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastRequest ? formatRelativeTime(new Date(key.lastRequest)) : t("settings.apiKeys.never")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(new Date(key.createdAt))}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => setRevokeTarget(key)}>
                          {t("settings.apiKeys.actions.revoke")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(next) => { if (!next) handleDialogClose(); }}>
        <DialogContent>
          {revealKey ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("settings.apiKeys.reveal.title")}</DialogTitle>
                <DialogDescription>{t("settings.apiKeys.reveal.description")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">{revealKey}</code>
                  <CopyButton value={revealKey} />
                </div>
                <Alert className="border-warning/40 text-foreground">
                  <TriangleAlertIcon className="size-4 text-warning" />
                  <AlertDescription>Copy this now — it won&apos;t be shown again.</AlertDescription>
                </Alert>
              </div>
              <DialogFooter>
                <Button onClick={handleDialogClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("settings.apiKeys.create.title")}</DialogTitle>
                <DialogDescription>{t("settings.apiKeys.create.description")}</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(createKey)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.apiKeys.create.name")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("settings.apiKeys.create.namePlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleDialogClose}>
                      {t("settings.apiKeys.create.cancel")}
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? t("settings.apiKeys.create.submitting") : t("settings.apiKeys.create.submit")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(next) => { if (!next) setRevokeTarget(null); }}
        title={t("settings.apiKeys.revoke.title")}
        description={t("settings.apiKeys.revoke.description")}
        confirmLabel={t("settings.apiKeys.revoke.confirm")}
        destructive
        loading={revokeMutation.isPending}
        onConfirm={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget); }}
      />
    </div>
  );
}
