import { FilmIcon } from "lucide-react";

import { cn } from "@/app/lib/utils";
import type { MediaDTO } from "@/shared/api-types";

/** mm:ss from seconds (e.g. 83 → "1:23"). */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extLabel(media: MediaDTO): string {
  const fromMime = media.mime.split("/")[1];
  const ext = fromMime || media.filename.split(".").pop() || media.kind;
  return ext.toUpperCase();
}

export function MediaThumb({ media }: { media: MediaDTO }): React.ReactElement {
  if (media.kind === "image") {
    return (
      <img
        src={media.url}
        alt={media.alt ?? ""}
        loading="lazy"
        className="size-full object-cover"
      />
    );
  }
  const duration = formatDuration(media.duration);
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
      <FilmIcon className="size-7" />
      <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
        {extLabel(media)}
        {duration ? ` · ${duration}` : ""}
      </span>
    </div>
  );
}

interface MediaGridProps {
  items: MediaDTO[];
  onSelect: (media: MediaDTO) => void;
  selectedId?: string | null;
}

export function MediaGrid({ items, onSelect, selectedId }: MediaGridProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((media) => (
        <button
          key={media.id}
          type="button"
          onClick={() => onSelect(media)}
          title={media.filename}
          className={cn(
            "group relative aspect-square overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none",
            selectedId === media.id && "ring-2 ring-primary ring-offset-2",
          )}
        >
          <MediaThumb media={media} />
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 font-mono text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {media.filename}
          </span>
        </button>
      ))}
    </div>
  );
}
