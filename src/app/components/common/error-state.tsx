import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { useI18n } from "@/app/i18n";
import { isApiError } from "@/app/api/client";
import { cn } from "@/app/lib/utils";

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, title, onRetry, className }: ErrorStateProps): React.ReactElement {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("error.title");
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : t("error.unexpected");
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="size-6" />
      </div>
      <h3 className="text-sm font-semibold">{resolvedTitle}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-6" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      ) : null}
    </div>
  );
}
