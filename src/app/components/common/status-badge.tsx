import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";
import type { EntryStatus } from "@/shared/api-types";

const STATUS_META: Record<EntryStatus, { label: string; dot: string }> = {
  draft: { label: "Draft", dot: "bg-muted-foreground/50" },
  published: { label: "Published", dot: "bg-emerald-500" },
  changed: { label: "Published · pending", dot: "bg-amber-500" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: EntryStatus;
  className?: string;
}): React.ReactElement {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}
