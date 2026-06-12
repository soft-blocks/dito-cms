import { useCallback, useEffect, useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontalIcon } from "lucide-react";

import { EntryStatusBar } from "./entry-status-bar";
import { FieldInput } from "./inputs/field-input";
import { toEntryData, toFormValues, titleFromValue } from "./form-values";

import {
  createEntry,
  deleteEntry,
  discardDraft,
  entriesKeys,
  publishEntry,
  unpublishEntry,
  updateEntry,
} from "@/app/api/entries";
import { collectionsKeys } from "@/app/api/collections";
import { isApiError } from "@/app/api/client";
import { Form } from "@/app/components/ui/form";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/common/empty-state";
import { ConfirmDialog } from "@/app/components/common/confirm-dialog";
import { useUnsavedChangesGuard } from "@/app/hooks/use-unsaved-changes-guard";
import type { CollectionDetail, EntryDetail } from "@/shared/api-types";

interface EntryEditorProps {
  collection: CollectionDetail;
  /** null → authoring a brand-new entry. */
  entry: EntryDetail | null;
  /** Singletons have no list to return to → hide the status-bar back button. */
  hideBack?: boolean;
}

/** Maps server fieldErrors onto the form and focuses the first one. Returns true if any. */
function applyFieldErrors(
  setError: ReturnType<typeof useForm>["setError"],
  setFocus: ReturnType<typeof useForm>["setFocus"],
  fieldErrors?: Record<string, string>,
): boolean {
  if (!fieldErrors) return false;
  const keys = Object.keys(fieldErrors);
  for (const key of keys) setError(key, { message: fieldErrors[key] });
  if (keys[0]) {
    try {
      setFocus(keys[0]);
    } catch {
      /* rich-text / media inputs aren't focusable — ignore */
    }
  }
  return keys.length > 0;
}

function EntryEditorForm({
  collection,
  entry,
  hideBack,
  onReload,
}: EntryEditorProps & { onReload: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fields = collection.fields;
  const isNew = entry === null;
  const status = entry?.status ?? "draft";

  const form = useForm<FieldValues>({
    defaultValues: toFormValues(fields, entry?.draftData ?? {}),
  });
  const isDirty = form.formState.isDirty;
  const [busy, setBusy] = useState<null | "save" | "publish">(null);
  const [confirm, setConfirm] = useState<null | "discard" | "unpublish" | "delete">(null);

  useUnsavedChangesGuard(isDirty && busy === null);

  const titleValue = collection.titleField ? form.watch(collection.titleField) : undefined;
  const liveTitle = titleFromValue(titleValue) || (isNew ? "New entry" : "Untitled");

  const syncCaches = useCallback(
    (saved: EntryDetail) => {
      queryClient.setQueryData(entriesKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: entriesKeys.lists(collection.slug) });
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all });
    },
    [queryClient, collection.slug],
  );

  const onSaveDraft = form.handleSubmit(async (values) => {
    setBusy("save");
    try {
      const data = toEntryData(fields, values);
      const saved = isNew
        ? await createEntry(collection.slug, { data })
        : await updateEntry(entry.id, { data });
      syncCaches(saved);
      form.reset(values); // clear the dirty baseline before any navigation
      toast.success("Draft saved");
      if (isNew) {
        void navigate({
          to: "/collections/$slug/entries/$id",
          params: { slug: collection.slug, id: saved.id },
        });
      }
    } catch (e) {
      if (isApiError(e) && applyFieldErrors(form.setError, form.setFocus, e.fieldErrors)) {
        toast.error("Some fields need attention");
      } else {
        toast.error(isApiError(e) ? e.message : "Could not save draft");
      }
    } finally {
      setBusy(null);
    }
  });

  const onPublish = form.handleSubmit(async (values) => {
    setBusy("publish");
    try {
      const data = toEntryData(fields, values);
      let result: EntryDetail;
      if (isNew) {
        result = await createEntry(collection.slug, { data, publish: true });
      } else {
        await updateEntry(entry.id, { data });
        result = await publishEntry(entry.id);
      }
      syncCaches(result);
      form.reset(values);
      toast.success("Published");
      if (isNew) {
        void navigate({
          to: "/collections/$slug/entries/$id",
          params: { slug: collection.slug, id: result.id },
        });
      }
    } catch (e) {
      if (isApiError(e) && applyFieldErrors(form.setError, form.setFocus, e.fieldErrors)) {
        toast.error("Fix the highlighted fields before publishing");
      } else {
        toast.error(isApiError(e) ? e.message : "Could not publish");
      }
      if (!isNew) void queryClient.invalidateQueries({ queryKey: entriesKeys.detail(entry.id) });
    } finally {
      setBusy(null);
    }
  });

  // Cmd/Ctrl+S → save draft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (busy === null) void onSaveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSaveDraft, busy]);

  const doDiscard = async (): Promise<void> => {
    try {
      if (status === "changed" && entry) {
        const reverted = await discardDraft(entry.id);
        syncCaches(reverted);
      }
      form.reset(); // drop local unsaved edits
      onReload(); // remount from the (reverted) server draft
      toast.success("Changes discarded");
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not discard changes");
    } finally {
      setConfirm(null);
    }
  };

  const doUnpublish = async (): Promise<void> => {
    if (!entry) return;
    try {
      const updated = await unpublishEntry(entry.id);
      syncCaches(updated);
      toast.success("Unpublished");
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not unpublish");
    } finally {
      setConfirm(null);
    }
  };

  const doDelete = async (): Promise<void> => {
    if (!entry) return;
    try {
      await deleteEntry(entry.id);
      void queryClient.invalidateQueries({ queryKey: entriesKeys.lists(collection.slug) });
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all });
      form.reset(form.getValues()); // clear dirty so the guard doesn't block leaving
      toast.success("Entry deleted");
      void navigate({ to: "/collections/$slug", params: { slug: collection.slug } });
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not delete entry");
      setConfirm(null);
    }
  };

  const isSingleton = collection.type === "singleton";

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {fields.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontalIcon}
            title="No fields to fill in"
            description="Add fields to this collection's schema before authoring content."
            action={
              <Button asChild>
                <Link to="/collections/$slug/schema" params={{ slug: collection.slug }}>
                  Edit schema
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {fields.map((field) => (
              <FieldInput key={field.id} control={form.control} field={field} />
            ))}
          </div>
        )}

        <EntryStatusBar
          slug={collection.slug}
          title={liveTitle}
          status={status}
          isNew={isNew}
          hideBack={hideBack}
          isDirty={isDirty}
          savedAt={entry?.draftUpdatedAt ?? null}
          busy={busy}
          canDiscard={!isNew && (status === "changed" || isDirty)}
          canUnpublish={!isNew && (status === "published" || status === "changed")}
          canDelete={!isNew && !isSingleton}
          onSaveDraft={() => void onSaveDraft()}
          onPublish={() => void onPublish()}
          onDiscard={() => setConfirm("discard")}
          onUnpublish={() => setConfirm("unpublish")}
          onDelete={() => setConfirm("delete")}
        />
      </form>

      <ConfirmDialog
        open={confirm === "discard"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard changes?"
        description={
          status === "changed"
            ? "The draft reverts to the currently published version. This can't be undone."
            : "Unsaved changes will be lost."
        }
        confirmLabel="Discard"
        destructive
        onConfirm={() => void doDiscard()}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this entry?"
        description="It disappears from the delivery API immediately. The draft is kept."
        confirmLabel="Unpublish"
        destructive
        onConfirm={() => void doUnpublish()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this entry?"
        description={
          status === "draft"
            ? "This permanently deletes the entry. This can't be undone."
            : "This entry is published — it will disappear from the delivery API immediately. This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void doDelete()}
      />
    </Form>
  );
}

/** Remounts the form (resetting all inputs incl. the rich-text editor) when reloadKey bumps. */
export function EntryEditor({ collection, entry, hideBack }: EntryEditorProps): React.ReactElement {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <EntryEditorForm
      key={`${entry?.id ?? "new"}:${reloadKey}`}
      collection={collection}
      entry={entry}
      hideBack={hideBack}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}
