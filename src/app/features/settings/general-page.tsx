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
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
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

export function GeneralSettingsPage(): React.ReactElement {
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
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });

  const origin = window.location.origin;
  const deliveryBaseUrl = `${origin}/api/v1`;
  const mcpUrl = `${origin}/mcp`;
  const dirty = data ? name.trim() !== data.projectName && name.trim() !== "" : false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
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
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dito CMS"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">Shown in this admin and used to identify the instance.</p>
              </div>
              <div>
                <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <UrlRow
            label="Delivery API (public, read-only)"
            value={deliveryBaseUrl}
            hint="Consuming sites read published content from here. No auth; CORS is open."
          />
          <UrlRow
            label="MCP endpoint"
            value={mcpUrl}
            hint={
              <>
                Connect Claude or any AI to manage content. Authenticate with a Bearer{" "}
                <Link to="/settings/api-keys" className="underline underline-offset-2 hover:text-foreground">
                  API key
                </Link>
                .
              </>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-medium">{APP_VERSION}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Documentation</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
