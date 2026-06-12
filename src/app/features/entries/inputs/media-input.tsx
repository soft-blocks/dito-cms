import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, FilmIcon, ImageIcon, VideoIcon } from "lucide-react";

import { RequiredMark } from "./field-frame";
import type { EntryFieldInputProps } from "./types";

import { MediaPickerDialog } from "@/app/features/media/media-picker-dialog";
import { mediaItemQueryOptions, mediaKeys } from "@/app/api/media";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import type { MediaDTO, MediaKind } from "@/shared/api-types";

/** Resolves a stored media id to a thumbnail; shows a placeholder if it's gone. */
function MediaPreview({
  id,
  kind,
  onReplace,
  onClear,
}: {
  id: string;
  kind: MediaKind;
  onReplace: () => void;
  onClear: () => void;
}): React.ReactElement {
  const { data, isPending, isError } = useQuery(mediaItemQueryOptions(id));

  if (isPending) {
    return <Skeleton className="h-20 w-full rounded-lg" />;
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <span className="flex items-center gap-2 text-sm text-amber-900">
          <AlertTriangleIcon className="size-4 shrink-0" />
          This {kind} is no longer available.
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
        {data.kind === "image" ? (
          <img src={data.url} alt={data.alt ?? ""} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FilmIcon className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={data.filename}>
          {data.filename}
        </p>
        {data.alt ? (
          <p className="truncate text-xs text-muted-foreground">{data.alt}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No alt text</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onReplace}>
          Replace
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

export function MediaFieldInput({ control, field }: EntryFieldInputProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const kind: MediaKind = field.type === "video" ? "video" : "image";
  const Icon = kind === "video" ? VideoIcon : ImageIcon;

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => {
        const select = (media: MediaDTO): void => {
          // Prime the cache so the preview resolves instantly without a round-trip.
          queryClient.setQueryData(mediaKeys.detail(media.id), media);
          rhf.onChange(media.id);
        };
        return (
          <FormItem>
            <FormLabel>
              {field.label}
              <RequiredMark field={field} />
            </FormLabel>
            {rhf.value ? (
              <MediaPreview
                id={String(rhf.value)}
                kind={kind}
                onReplace={() => setPickerOpen(true)}
                onClear={() => rhf.onChange(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <Icon className="size-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Choose {kind === "video" ? "a video" : "an image"}</span>
              </button>
            )}
            {field.options.help ? <FormDescription>{field.options.help}</FormDescription> : null}
            <FormMessage />
            <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} kind={kind} onSelect={select} />
          </FormItem>
        );
      }}
    />
  );
}
