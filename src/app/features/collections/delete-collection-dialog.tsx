import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

interface DeleteCollectionDialogProps {
  slug: string;
  name: string;
  entryCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onConfirm: () => void;
}

export function DeleteCollectionDialog({
  slug,
  name,
  entryCount,
  open,
  onOpenChange,
  loading,
  onConfirm,
}: DeleteCollectionDialogProps): React.ReactElement {
  const [value, setValue] = useState("");
  const matches = value === slug;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setValue("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the collection, its {entryCount === 0 ? "fields" : `${entryCount} entries and fields`}, and
            removes it from the delivery API. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-slug">
            Type <span className="font-mono font-medium">{slug}</span> to confirm
          </Label>
          <Input
            id="confirm-slug"
            value={value}
            autoComplete="off"
            className="font-mono"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || loading}
            onClick={onConfirm}
          >
            {loading ? "Deleting…" : "Delete collection"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
