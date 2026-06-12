import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { SecretRevealDialog } from "./secret-reveal-dialog";

import { createApiKeySchema, type CreateApiKeyInput } from "@/shared/forms";
import { authClient } from "@/app/api/auth-client";
import { unwrap } from "@/app/api/client";
import { type ApiKeyRow, apiKeysKeys, apiKeysQueryOptions } from "@/app/api/api-keys";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
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
  const queryClient = useQueryClient();
  const { data: keys, isPending, isError, error, refetch } = useQuery(apiKeysQueryOptions);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: { name: "" },
  });

  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: apiKeysKeys.all });

  const createKey = async (values: CreateApiKeyInput): Promise<void> => {
    try {
      const result = unwrap(await authClient.apiKey.create({ name: values.name }));
      await invalidate();
      form.reset();
      setCreateOpen(false);
      setRevealKey((result as { key: string }).key);
    } catch (e) {
      form.setError("name", { message: e instanceof Error ? e.message : "Could not create key" });
    }
  };

  const revokeMutation = useMutation({
    mutationFn: async (key: ApiKeyRow) => unwrap(await authClient.apiKey.delete({ keyId: key.id })),
    onSuccess: async () => {
      await invalidate();
      setRevokeTarget(null);
      toast.success("API key revoked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke key"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Keys authenticate the Admin API and the MCP server with a <code className="font-mono">Bearer</code> token.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New key
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRoundIcon}
          title="No API keys"
          description="Create a key to connect external sites or AI tools."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
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
                      <Badge variant="secondary" className="ml-2">Disabled</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastRequest ? formatRelativeTime(new Date(key.lastRequest)) : "Never"}
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
                          Revoke
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

      <Dialog open={createOpen} onOpenChange={(next) => { if (!next) form.reset(); setCreateOpen(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>Give the key a name so you can recognise it later.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(createKey)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Production site" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {revealKey ? (
        <SecretRevealDialog
          open={!!revealKey}
          onOpenChange={(next) => { if (!next) setRevealKey(null); }}
          title="API key created"
          description="Use this as a Bearer token. Store it somewhere safe."
          secret={revealKey}
        />
      ) : null}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(next) => { if (!next) setRevokeTarget(null); }}
        title="Revoke this key?"
        description="Any site or tool using this key will immediately lose access. This cannot be undone."
        confirmLabel="Revoke key"
        destructive
        loading={revokeMutation.isPending}
        onConfirm={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget); }}
      />
    </div>
  );
}
