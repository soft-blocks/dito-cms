import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";

import { canEncodeToWebp, encodeToWebp } from "./webp";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { useDebounce } from "@/app/hooks/use-debounce";
import { useI18n } from "@/app/i18n";
import { formatBytes } from "@/app/lib/format";

const DEFAULT_QUALITY = 80;

/**
 * Gate that decides whether a batch of picked files needs the WebP dialog.
 * If any file is a re-encodable image it stashes the batch and opens the
 * dialog; otherwise (videos, GIFs, SVGs) it uploads straight away.
 */
export function useWebpGate(enqueue: (files: File[]) => void): {
  pending: File[] | null;
  request: (files: File[]) => void;
  cancel: () => void;
  complete: (files: File[]) => void;
} {
  const [pending, setPending] = useState<File[] | null>(null);

  const request = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (files.some(canEncodeToWebp)) setPending(files);
      else enqueue(files);
    },
    [enqueue],
  );

  const cancel = useCallback(() => setPending(null), []);
  const complete = useCallback(
    (files: File[]) => {
      setPending(null);
      enqueue(files);
    },
    [enqueue],
  );

  return { pending, request, cancel, complete };
}

interface WebpConvertDialogProps {
  /** The picked batch, or `null` when the dialog is closed. */
  files: File[] | null;
  onCancel: () => void;
  /** Receives the final batch to upload (converted images + untouched rest). */
  onComplete: (files: File[]) => void;
}

export function WebpConvertDialog({ files, onCancel, onComplete }: WebpConvertDialogProps): React.ReactElement {
  const { t } = useI18n();
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [converting, setConverting] = useState(false);

  const open = files !== null;
  const convertible = useMemo(() => (files ?? []).filter(canEncodeToWebp), [files]);
  const passthroughCount = (files?.length ?? 0) - convertible.length;
  const sample = convertible[0] ?? null;

  const debouncedQuality = useDebounce(quality, 250);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ before: number; after: number } | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Fresh batch: reset controls to defaults.
  useEffect(() => {
    if (open) {
      setQuality(DEFAULT_QUALITY);
      setConverting(false);
    }
  }, [open]);

  // Preview thumbnail for the first convertible image.
  useEffect(() => {
    if (!sample) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(sample);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);

  // Re-encode the sample at the (debounced) quality to show a real size estimate.
  useEffect(() => {
    if (!sample) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    encodeToWebp(sample, debouncedQuality / 100)
      .then((webp) => {
        if (!cancelled) setEstimate({ before: sample.size, after: webp.size });
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setEstimating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sample, debouncedQuality]);

  const handleConvert = async (): Promise<void> => {
    if (!files) return;
    setConverting(true);
    let failures = 0;
    const out = await Promise.all(
      files.map(async (file) => {
        if (!canEncodeToWebp(file)) return file;
        try {
          return await encodeToWebp(file, quality / 100);
        } catch {
          failures += 1;
          return file; // fall back to the original on a per-file failure
        }
      }),
    );
    setConverting(false);
    if (failures > 0) toast.error(t("media.webp.convertError"));
    onComplete(out);
  };

  const delta = estimate && estimate.before > 0 ? Math.round((1 - estimate.after / estimate.before) * 100) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !converting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("media.webp.title")}</DialogTitle>
          <DialogDescription>{t("media.webp.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border p-3">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className="size-16 shrink-0 rounded-sm border bg-muted object-cover"
            />
          ) : (
            <div className="size-16 shrink-0 rounded-sm border bg-muted" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            {sample ? <p className="truncate font-medium">{sample.name}</p> : null}
            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              {estimate ? (
                <>
                  <span>{formatBytes(estimate.before)}</span>
                  <ArrowRightIcon className="size-3.5" />
                  <span className="font-medium text-foreground">{formatBytes(estimate.after)}</span>
                  {delta !== null ? (
                    <span className={delta >= 0 ? "text-success" : "text-muted-foreground"}>
                      {delta >= 0
                        ? t("media.webp.smaller", { percent: delta })
                        : t("media.webp.larger", { percent: Math.abs(delta) })}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  {t("media.webp.estimating")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("media.webp.quality")}</Label>
            <span className="text-sm font-medium tabular-nums">{quality}%</span>
          </div>
          <Slider
            value={[quality]}
            onValueChange={(v) => setQuality(v[0] ?? DEFAULT_QUALITY)}
            min={1}
            max={100}
            step={1}
            aria-label={t("media.webp.quality")}
          />
          <p className="text-xs text-muted-foreground">{t("media.webp.hint")}</p>
        </div>

        {convertible.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            {t("media.webp.batchNote", { count: convertible.length })}
          </p>
        ) : null}
        {passthroughCount > 0 ? (
          <p className="text-xs text-muted-foreground">{t("media.webp.othersNote")}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => files && onComplete(files)}
            disabled={converting}
          >
            {t("media.webp.keepOriginal")}
          </Button>
          <Button type="button" onClick={() => void handleConvert()} disabled={converting || estimating}>
            {converting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {t("media.webp.converting")}
              </>
            ) : (
              t("media.webp.convert")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
