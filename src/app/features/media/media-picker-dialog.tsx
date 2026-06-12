import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, VideoIcon } from "lucide-react";

import { MediaGrid } from "./media-grid";
import { useMediaUpload } from "./use-media-upload";
import { UploadDropzone } from "./upload-dropzone";

import { mediaKeys, mediaListInfiniteQueryOptions } from "@/app/api/media";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/components/ui/toggle-group";
import { EmptyState } from "@/app/components/common/empty-state";
import { ErrorState } from "@/app/components/common/error-state";
import { Progress } from "@/app/components/ui/progress";
import { useDebounce } from "@/app/hooks/use-debounce";
import { useInfiniteScroll } from "@/app/hooks/use-infinite-scroll";
import type { MediaDTO, MediaKind } from "@/shared/api-types";

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MediaKind;
  onSelect: (media: MediaDTO) => void;
}

export function MediaPickerDialog({ open, onOpenChange, kind, onSelect }: MediaPickerDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const sentinel = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    ...mediaListInfiniteQueryOptions({ kind, search: search || undefined }),
    enabled: open,
  });
  const items = query.data?.pages.flatMap((p) => p.media) ?? [];

  useInfiniteScroll(sentinel, {
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetchingNextPage,
    onLoadMore: () => void query.fetchNextPage(),
  });

  const choose = (media: MediaDTO): void => {
    onSelect(media);
    onOpenChange(false);
  };

  const upload = useMediaUpload({
    onUploaded: (media) => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      choose(media); // auto-select the freshly uploaded asset
    },
  });

  const label = kind === "image" ? "image" : "video";
  const Icon = kind === "image" ? ImageIcon : VideoIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose {label}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as "library" | "upload")}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="library" className="px-3">
              Library
            </ToggleGroupItem>
            <ToggleGroupItem value="upload" className="px-3">
              Upload
            </ToggleGroupItem>
          </ToggleGroup>
          {tab === "library" ? (
            <Input
              placeholder={`Search ${label}s…`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="max-w-xs"
            />
          ) : null}
        </div>

        {tab === "library" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.isPending ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Icon}
                title={`No ${label}s${search ? " match" : " yet"}`}
                description={search ? "Try a different search." : `Switch to Upload to add a ${label}.`}
              />
            ) : (
              <>
                <MediaGrid items={items} onSelect={choose} />
                <div ref={sentinel} className="h-1" />
                {query.isFetchingNextPage ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">Loading…</p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <UploadDropzone
              accept={kind === "image" ? "image/*" : "video/*"}
              kind={kind}
              onFiles={(files) => upload.enqueue(files)}
            />
            <div className="space-y-2">
              {upload.tasks.map((task) => (
                <div key={task.id} className="space-y-1 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{task.file.name}</span>
                    {task.status === "uploading" ? (
                      <Button variant="ghost" size="sm" onClick={() => upload.cancel(task.id)}>
                        Cancel
                      </Button>
                    ) : task.status === "error" || task.status === "canceled" ? (
                      <Button variant="ghost" size="sm" onClick={() => upload.retry(task.id)}>
                        Retry
                      </Button>
                    ) : (
                      <span className="text-success">Done</span>
                    )}
                  </div>
                  {task.status === "uploading" ? (
                    <Progress value={Math.round(task.progress * 100)} className="h-1" />
                  ) : task.status === "error" ? (
                    <p className="text-[11px] text-destructive">{task.error}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
