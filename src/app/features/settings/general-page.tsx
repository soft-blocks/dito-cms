import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  projectSettingsQueryOptions,
  settingsKeys,
  updateProjectSettings,
} from "@/app/api/settings";
import { APP_VERSION, REPO_URL } from "@/shared/constants";
import type { ProjectSettings } from "@/shared/api-types";
import { useI18n, type Locale } from "@/app/i18n";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Skeleton } from "@/app/components/ui/skeleton";
import { CopyButton } from "@/app/components/common/copy-button";
import { ErrorState } from "@/app/components/common/error-state";

function UrlRow({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const LOCALES: { value: Locale; labelKey: "language.es" | "language.en" }[] = [
  { value: "es", labelKey: "language.es" },
  { value: "en", labelKey: "language.en" },
];

export function GeneralSettingsPage(): React.ReactElement {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery(projectSettingsQueryOptions);

  const [name, setName] = useState("");
  useEffect(() => {
    if (data) setName(data.projectName);
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateProjectSettings({ projectName: name.trim() }),
    onSuccess: (result) => {
      queryClient.setQueryData<ProjectSettings>(settingsKeys.all, result);
      setName(result.projectName);
      toast.success(t("settings.general.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("settings.general.saveError")),
  });

  const origin = window.location.origin;
  const deliveryBaseUrl = `${origin}/api/v1`;
  const mcpUrl = `${origin}/mcp`;
  const dirty = data ? name.trim() !== data.projectName && name.trim() !== "" : false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general.project")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-10 w-full max-w-sm" />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <form
              className="flex max-w-sm flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (dirty) save.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="project-name">{t("settings.general.projectName")}</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("settings.general.projectNamePlaceholder")}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">{t("settings.general.projectNameHint")}</p>
              </div>
              <div>
                <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
                  {save.isPending ? t("settings.general.saving") : t("settings.general.save")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general.connections")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <UrlRow
            label={t("settings.general.deliveryApi")}
            value={deliveryBaseUrl}
            hint={t("settings.general.deliveryApiHint")}
          />
          <UrlRow
            label={t("settings.general.mcpEndpoint")}
            value={mcpUrl}
            hint={
              <>
                {t("settings.general.mcpEndpointHint")}{" "}
                <Link to="/settings/api-keys" className="underline underline-offset-2 hover:text-foreground">
                  {t("settings.general.mcpEndpointHintLink")}
                </Link>
                .
              </>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger id="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {t(l.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.general.languageHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general.about")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.general.version")}</span>
            <span className="font-medium">{APP_VERSION}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.general.documentation")}</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              {t("settings.general.github")}
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
