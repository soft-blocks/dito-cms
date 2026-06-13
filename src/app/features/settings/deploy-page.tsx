import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import {
  deployHookKeys,
  deployHookQueryOptions,
  testDeployHook,
  updateDeployHook,
} from "@/app/api/deploy-hook";
import type { DeployHookSettings, UpdateDeployHookInput } from "@/shared/api-types";
import { useI18n } from "@/app/i18n";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ErrorState } from "@/app/components/common/error-state";
import { formatRelativeTime } from "@/app/lib/format";
import { cn } from "@/app/lib/utils";

export function DeploySettingsPage(): React.ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery(deployHookQueryOptions);

  const [enabled, setEnabled] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");

  // Sync local form state from server data. The URL and header value are write-only — the
  // server never returns them — so we only seed the safe fields and reset the secrets.
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setHeaderName(data.authHeaderName ?? "");
    setHeaderValue("");
    setUrl("");
    setEditingUrl(!data.configured);
    if (data.hasAuthHeader) setAdvancedOpen(true);
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const patch: UpdateDeployHookInput = { enabled };
      // Send the URL only while actively editing AND non-empty — never auto-send an empty
      // URL, which the API treats as "clear the config".
      if (editingUrl && url.trim()) patch.url = url.trim();
      // The header name is safe to round-trip; send it only when it changed.
      if (headerName.trim() !== (data?.authHeaderName ?? "")) patch.authHeaderName = headerName.trim();
      // The header value is write-only — send it only when a new value was typed.
      if (headerValue.trim()) patch.authHeaderValue = headerValue.trim();
      return updateDeployHook(patch);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<DeployHookSettings>(deployHookKeys.all, result);
      toast.success(t("settings.deploy.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.deploy.saveError")),
  });

  const test = useMutation({
    mutationFn: testDeployHook,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t("settings.deploy.testSuccess", { status: result.status ?? 200 }));
      } else {
        toast.error(t("settings.deploy.testError", { error: result.error ?? "" }));
      }
      void queryClient.invalidateQueries({ queryKey: deployHookKeys.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.deploy.testError", { error: "" })),
  });

  const dirty = data
    ? enabled !== data.enabled ||
      (editingUrl && url.trim() !== "") ||
      headerName.trim() !== (data.authHeaderName ?? "") ||
      headerValue.trim() !== ""
    : false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.deploy.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("settings.deploy.description")}</p>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <form
              className="max-w-xl space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (dirty) save.mutate();
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="deploy-enabled">{t("settings.deploy.enable")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings.deploy.enableHint")}</p>
                </div>
                <Switch id="deploy-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deploy-url">{t("settings.deploy.url")}</Label>
                {data.configured && !editingUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
                      {data.urlPreview}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingUrl(true);
                        setUrl("");
                      }}
                    >
                      {t("settings.deploy.replace")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Input
                      id="deploy-url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={t("settings.deploy.urlPlaceholder")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {data.configured ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={() => {
                          setEditingUrl(false);
                          setUrl("");
                        }}
                      >
                        {t("settings.deploy.cancel")}
                      </button>
                    ) : null}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("settings.deploy.urlHint")}</p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRightIcon className={cn("size-4 transition-transform", advancedOpen && "rotate-90")} />
                  {t("settings.deploy.advanced")}
                </button>
                {advancedOpen ? (
                  <div className="space-y-3 border-l pl-4">
                    <p className="text-xs text-muted-foreground">{t("settings.deploy.advancedHint")}</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="deploy-header-name">{t("settings.deploy.headerName")}</Label>
                      <Input
                        id="deploy-header-name"
                        value={headerName}
                        onChange={(e) => setHeaderName(e.target.value)}
                        placeholder={t("settings.deploy.headerNamePlaceholder")}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="deploy-header-value">{t("settings.deploy.headerValue")}</Label>
                      <Input
                        id="deploy-header-value"
                        type="password"
                        value={headerValue}
                        onChange={(e) => setHeaderValue(e.target.value)}
                        placeholder={data.hasAuthHeader ? "••••••••" : t("settings.deploy.headerValuePlaceholder")}
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">{t("settings.deploy.headerValueHint")}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
                  {save.isPending ? t("settings.deploy.saving") : t("settings.deploy.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={test.isPending || !data.enabled || !data.configured}
                  onClick={() => test.mutate()}
                >
                  {test.isPending ? t("settings.deploy.testing") : t("settings.deploy.test")}
                </Button>
              </div>

              {data.lastFiredAt != null ? (
                <div className="flex items-start gap-2 border-t pt-4 text-xs">
                  {data.lastOk ? (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{t("settings.deploy.lastDelivery")}</span>{" "}
                    {data.lastOk ? t("settings.deploy.statusOk") : t("settings.deploy.statusFailed")}
                    {data.lastStatus != null ? ` · HTTP ${data.lastStatus}` : ""} ·{" "}
                    {formatRelativeTime(data.lastFiredAt)}
                    {!data.lastOk && data.lastError ? ` · ${data.lastError}` : ""}
                  </span>
                </div>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
