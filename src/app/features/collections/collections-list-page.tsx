import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileIcon, LayersIcon, LayoutGridIcon, PlusIcon } from "lucide-react";

import { CreateCollectionDialog } from "./create-collection-dialog";

import { collectionsListQueryOptions } from "@/app/api/collections";
import { useI18n } from "@/app/i18n";
import { PageHeader } from "@/app/components/common/page-header";
import { EmptyState } from "@/app/components/common/empty-state";
import { ErrorState } from "@/app/components/common/error-state";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import type { CollectionSummary } from "@/shared/api-types";

function CollectionCard({ collection }: { collection: CollectionSummary }): React.ReactElement {
  const { t } = useI18n();
  const isSingleton = collection.type === "singleton";
  return (
    <Link
      to="/collections/$slug"
      params={{ slug: collection.slug }}
      className="group flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-medium">{collection.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{collection.slug}</div>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {isSingleton ? <FileIcon className="size-3" /> : <LayersIcon className="size-3" />}
          {isSingleton ? t("collections.badge.singleton") : t("collections.badge.collection")}
        </Badge>
      </div>
      {collection.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{collection.description}</p>
      ) : null}
      <div className="mt-auto flex gap-3 pt-1 text-xs text-muted-foreground">
        <span>
          {collection.fieldCount === 1
            ? t("collections.fieldCount.one", { count: collection.fieldCount })
            : t("collections.fieldCount.other", { count: collection.fieldCount })}
        </span>
        {!isSingleton ? (
          <span>
            {collection.entryCount === 1
              ? t("collections.entryCount.one", { count: collection.entryCount })
              : t("collections.entryCount.other", { count: collection.entryCount })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Group({ title, items }: { title: string; items: CollectionSummary[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CollectionCard key={c.id} collection={c} />
        ))}
      </div>
    </section>
  );
}

export function CollectionsListPage(): React.ReactElement {
  const { t } = useI18n();
  const { data, isPending, isError, error, refetch } = useQuery(collectionsListQueryOptions);
  const [createOpen, setCreateOpen] = useState(false);

  const collections = (data ?? []).filter((c) => c.type === "collection");
  const singletons = (data ?? []).filter((c) => c.type === "singleton");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("collections.title")}
        description={t("collections.description")}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            {t("collections.newCollection")}
          </Button>
        }
      />

      {isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title={t("collections.empty.title")}
          description={t("collections.empty.description")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              {t("collections.newCollection")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <Group title={t("collections.group.collections")} items={collections} />
          <Group title={t("collections.group.singletons")} items={singletons} />
        </div>
      )}

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
