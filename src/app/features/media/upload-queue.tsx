import { CheckCircle2Icon, FilmIcon, ImageIcon, RotateCwIcon, XIcon } from "lucide-react";

import type { UploadTask, UseMediaUpload } from "./use-media-upload";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { formatBytes } from "@/app/lib/format";
import { cn } from "@/app/lib/utils";

function TaskRow({
  task,
  onCancel,
  onRetry,
  onRemove,
}: {
  task: UploadTask;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}): React.ReactElement {
  const Icon = task.kind === "video" ? FilmIcon : ImageIcon;
  return (
    <div className="space-y-1.5 px-3 py-2">
      <div className="flex items-center gap-2">
        {task.status === "success" ? (
          <CheckCircle2Icon className="size-4 shrink-0 text-success" />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={task.file.name}>
          {task.file.name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(task.file.size)}</span>
        {task.status === "uploading" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={onCancel}>
            <XIcon className="size-3.5" />
          </Button>
        ) : task.status === "error" || task.status === "canceled" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Retry" onClick={onRetry}>
            <RotateCwIcon className="size-3.5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onRemove}>
            <XIcon className="size-3.5" />
          </Button>
        )}
      </div>
      {task.status === "uploading" ? (
        <Progress value={Math.round(task.progress * 100)} className="h-1" />
      ) : task.status === "error" ? (
        <p className="text-[11px] text-destructive">{task.error ?? "Upload failed"}</p>
      ) : task.status === "canceled" ? (
        <p className="text-[11px] text-muted-foreground">Canceled</p>
      ) : null}
    </div>
  );
}

/** Floating bottom-right queue. Renders nothing when there is nothing to show. */
export function UploadQueue({ upload }: { upload: UseMediaUpload }): React.ReactElement | null {
  if (upload.tasks.length === 0) return null;
  const remaining = upload.activeCount;
  return (
    <div className={cn("fixed right-4 bottom-4 z-50 w-80 overflow-hidden rounded-lg border bg-background shadow-lg")}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">
          {remaining > 0 ? `Uploading ${remaining}…` : "Uploads"}
        </span>
        <Button variant="ghost" size="sm" onClick={upload.clearFinished} disabled={remaining === upload.tasks.length}>
          Clear
        </Button>
      </div>
      <div className="max-h-72 divide-y overflow-y-auto">
        {upload.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onCancel={() => upload.cancel(task.id)}
            onRetry={() => upload.retry(task.id)}
            onRemove={() => upload.remove(task.id)}
          />
        ))}
      </div>
    </div>
  );
}
