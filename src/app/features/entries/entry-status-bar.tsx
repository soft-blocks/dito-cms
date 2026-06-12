import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, MoreVerticalIcon } from "lucide-react";

import { StatusBadge } from "@/app/components/common/status-badge";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/app/lib/format";
import type { EntryStatus } from "@/shared/api-types";

export interface EntryStatusBarProps {
  slug: string;
  title: string;
  status: EntryStatus;
  isNew: boolean;
  hideBack?: boolean;
  isDirty: boolean;
  savedAt: number | null;
  busy: null | "save" | "publish";
  canDiscard: boolean;
  canUnpublish: boolean;
  canDelete: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}

export function EntryStatusBar(props: EntryStatusBarProps): React.ReactElement {
  const hasOverflow = props.canDiscard || props.canUnpublish || props.canDelete;
  return (
    <div className="sticky bottom-0 z-20 -mx-6 mt-8 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        {props.hideBack ? null : (
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to entries">
            <Link to="/collections/$slug" params={{ slug: props.slug }}>
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
        )}

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{props.title || "Untitled"}</span>
          {props.isNew ? (
            <span className="text-xs text-muted-foreground">New</span>
          ) : (
            <StatusBadge status={props.status} />
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {props.isDirty ? (
            <span className="text-amber-600">Unsaved changes</span>
          ) : props.savedAt ? (
            <span>Saved {formatRelativeTime(props.savedAt)}</span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={props.onSaveDraft}
            disabled={props.busy !== null || (!props.isDirty && !props.isNew)}
          >
            {props.busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          <Button size="sm" onClick={props.onPublish} disabled={props.busy !== null}>
            {props.busy === "publish"
              ? "Publishing…"
              : props.status === "changed"
                ? "Publish changes"
                : "Publish"}
          </Button>
          {hasOverflow ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More actions">
                  <MoreVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {props.canDiscard ? (
                  <DropdownMenuItem onSelect={props.onDiscard}>Discard changes</DropdownMenuItem>
                ) : null}
                {props.canUnpublish ? (
                  <DropdownMenuItem onSelect={props.onUnpublish}>Unpublish</DropdownMenuItem>
                ) : null}
                {(props.canDiscard || props.canUnpublish) && props.canDelete ? (
                  <DropdownMenuSeparator />
                ) : null}
                {props.canDelete ? (
                  <DropdownMenuItem variant="destructive" onSelect={props.onDelete}>
                    Delete entry
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}
