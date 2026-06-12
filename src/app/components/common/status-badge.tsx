import { useI18n } from "@/app/i18n";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";
import type { EntryStatus } from "@/shared/api-types";

const STATUS_DOT: Record<EntryStatus, string> = {
  draft: "bg-muted-foreground/50",
  published: "bg-emerald-500",
  changed: "bg-amber-500",
};

export function StatusBadge({
  status,
  className,
}: {
  status: EntryStatus;
  className?: string;
}): React.ReactElement {
  const { t } = useI18n();
  const labelKey = status === "draft"
    ? "status.draft"
    : status === "published"
      ? "status.published"
      : "status.changed";
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {t(labelKey)}
    </Badge>
  );
}
