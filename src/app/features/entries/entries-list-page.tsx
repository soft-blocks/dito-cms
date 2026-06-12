import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteEntry,
  entriesKeys,
  entriesListQueryOptions,
  reorderEntries,
} from "@/app/api/entries";
import { collectionsKeys } from "@/app/api/collections";
import { isApiError } from "@/app/api/client";
import { StatusBadge } from "@/app/components/common/status-badge";
import { EmptyState } from "@/app/components/common/empty-state";
import { ErrorState } from "@/app/components/common/error-state";
import { ConfirmDialog } from "@/app/components/common/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/app/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { useDebounce } from "@/app/hooks/use-debounce";
import { formatRelativeTime } from "@/app/lib/format";
import type { CollectionDetail, EntryStatus, EntrySummary } from "@/shared/api-types";

const PAGE_SIZE = 50;

const STATUS_TABS: { value: EntryStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "changed", label: "Pending" },
];

function EntryRow({
  entry,
  slug,
  reorderable,
  onDelete,
}: {
  entry: EntrySummary;
  slug: string;
  reorderable: boolean;
  onDelete: () => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !reorderable,
  });
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 bg-muted" : undefined}
    >
      <TableCell className="w-8 pr-0">
        {reorderable ? (
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        ) : (
          <GripVerticalIcon className="size-4 text-muted-foreground/30" />
        )}
      </TableCell>
      <TableCell className="font-medium">
        <Link
          to="/collections/$slug/entries/$id"
          params={{ slug, id: entry.id }}
          className="hover:underline"
        >
          {entry.title}
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={entry.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatRelativeTime(entry.draftUpdatedAt)}
      </TableCell>
      <TableCell className="w-10 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/collections/$slug/entries/$id" params={{ slug, id: entry.id }}>
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function EntriesListPage({ collection }: { collection: CollectionDetail }): React.ReactElement {
  const slug = collection.slug;
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusTab, setStatusTab] = useState<EntryStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<EntrySummary | null>(null);

  const params = useMemo(
    () => ({
      status: statusTab === "all" ? undefined : statusTab,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [statusTab, search, page],
  );

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery(
    entriesListQueryOptions(slug, params),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderEntries(slug, ids),
    onError: (e) => {
      toast.error(isApiError(e) ? e.message : "Could not reorder");
      void queryClient.invalidateQueries({ queryKey: entriesKeys.lists(slug) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesKeys.lists(slug) });
      await queryClient.invalidateQueries({ queryKey: collectionsKeys.all });
      toast.success("Entry deleted");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Could not delete entry"),
    onSettled: () => setDeleteTarget(null),
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const canReorder = statusTab === "all" && !search && page === 0;

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(entries, oldIndex, newIndex);
    queryClient.setQueryData(entriesKeys.list(slug, params), {
      entries: reordered,
      total,
    });
    reorderMutation.mutate(reordered.map((e) => e.id));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/collections" className="text-sm text-muted-foreground hover:text-foreground">
          ← Collections
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{collection.name}</h1>
            {collection.description ? (
              <p className="text-sm text-muted-foreground">{collection.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/collections/$slug/schema" params={{ slug }}>
                <SlidersHorizontalIcon className="size-4" />
                Schema
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/collections/$slug/entries/new" params={{ slug }}>
                <PlusIcon className="size-4" />
                New entry
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search entries…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <ToggleGroup
          type="single"
          value={statusTab}
          onValueChange={(v) => {
            if (v) setStatusTab(v as EntryStatus | "all");
            setPage(0);
          }}
          variant="outline"
          size="sm"
        >
          {STATUS_TABS.map((tab) => (
            <ToggleGroupItem key={tab.value} value={tab.value} className="px-3">
              {tab.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontalIcon}
          title={search || statusTab !== "all" ? "No matching entries" : "No entries yet"}
          description={
            search || statusTab !== "all"
              ? "Try a different search or filter."
              : "Create your first entry to start authoring content."
          }
          action={
            !search && statusTab === "all" ? (
              <Button asChild>
                <Link to="/collections/$slug/entries/new" params={{ slug }}>
                  <PlusIcon className="size-4" />
                  New entry
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={entries.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      slug={slug}
                      reorderable={canReorder}
                      onDelete={() => setDeleteTarget(entry)}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} {total === 1 ? "entry" : "entries"}
              {!canReorder && entries.length > 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-help underline decoration-dotted">
                      reorder disabled
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear search, filters and pagination to drag-reorder.
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.title ?? "entry"}”?`}
        description={
          deleteTarget?.status === "draft"
            ? "This permanently deletes the entry."
            : "This entry is live — it disappears from the delivery API immediately."
        }
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
