import { useEffect, type RefObject } from "react";

interface Options {
  hasNextPage: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

/** Fire `onLoadMore` when the sentinel element scrolls into view (with prefetch margin). */
export function useInfiniteScroll(
  sentinel: RefObject<HTMLElement | null>,
  { hasNextPage, isFetching, onLoadMore }: Options,
): void {
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetching) onLoadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinel, hasNextPage, isFetching, onLoadMore]);
}
