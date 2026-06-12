import { useRef, useState } from "react";
import { UploadCloudIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import type { MediaKind } from "@/shared/api-types";

interface UploadDropzoneProps {
  accept: string;
  kind?: MediaKind;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
}

/** Click-to-browse + drag-and-drop file picker used by the library and the picker dialog. */
export function UploadDropzone({ accept, kind, onFiles, multiple = true }: UploadDropzoneProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (list: FileList | null): void => {
    if (list && list.length > 0) onFiles(Array.from(list));
  };

  const label = kind === "image" ? "images" : kind === "video" ? "videos" : "files";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
        dragging && "border-primary bg-accent/40",
      )}
    >
      <UploadCloudIcon className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Drag &amp; drop {label} here, or</p>
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        Browse
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
