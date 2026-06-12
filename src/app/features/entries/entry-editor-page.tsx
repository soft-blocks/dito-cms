import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { EntryEditor } from "./entry-editor";
import { titleFromValue } from "./form-values";

import { collectionDetailQueryOptions } from "@/app/api/collections";
import { entryDetailQueryOptions } from "@/app/api/entries";
import { ErrorState } from "@/app/components/common/error-state";
import { Skeleton } from "@/app/components/ui/skeleton";

function EditorSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-56" />
      <div className="space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

function EditorHeader({
  slug,
  name,
  heading,
}: {
  slug: string;
  name: string;
  heading: string;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <Link
        to="/collections/$slug"
        params={{ slug }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {name}
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
    </div>
  );
}

/** /collections/$slug/entries/new */
export function NewEntryPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { slug?: string };
  const slug = params.slug ?? "";
  const { data: collection, isPending, isError, error, refetch } = useQuery(
    collectionDetailQueryOptions(slug),
  );

  if (isPending) return <EditorSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <EditorHeader slug={slug} name={collection.name} heading="New entry" />
      <EntryEditor collection={collection} entry={null} />
    </div>
  );
}

/** /collections/$slug/entries/$id */
export function EditEntryPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { slug?: string; id?: string };
  const slug = params.slug ?? "";
  const id = params.id ?? "";

  const collectionQuery = useQuery(collectionDetailQueryOptions(slug));
  const entryQuery = useQuery(entryDetailQueryOptions(id));

  if (collectionQuery.isPending || entryQuery.isPending) return <EditorSkeleton />;
  if (collectionQuery.isError) {
    return <ErrorState error={collectionQuery.error} onRetry={() => void collectionQuery.refetch()} />;
  }
  if (entryQuery.isError) {
    return <ErrorState error={entryQuery.error} onRetry={() => void entryQuery.refetch()} />;
  }

  const collection = collectionQuery.data;
  const entry = entryQuery.data;
  const heading =
    (collection.titleField ? titleFromValue(entry.draftData[collection.titleField]) : "") ||
    "Edit entry";

  return (
    <div className="space-y-6">
      <EditorHeader slug={slug} name={collection.name} heading={heading} />
      <EntryEditor collection={collection} entry={entry} />
    </div>
  );
}
