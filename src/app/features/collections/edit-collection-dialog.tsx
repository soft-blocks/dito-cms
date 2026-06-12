import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { editCollectionSchema, type EditCollectionInput } from "@/shared/forms";
import { collectionsKeys, updateCollection } from "@/app/api/collections";
import { isApiError } from "@/app/api/client";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type { CollectionDetail } from "@/shared/api-types";

interface EditCollectionDialogProps {
  collection: CollectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NONE = "__none__";

export function EditCollectionDialog({
  collection,
  open,
  onOpenChange,
}: EditCollectionDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const form = useForm<EditCollectionInput>({
    resolver: zodResolver(editCollectionSchema),
    defaultValues: {
      name: collection.name,
      description: collection.description ?? "",
      titleField: collection.titleField,
    },
  });

  // Re-seed when the dialog opens for a (possibly refreshed) collection.
  useEffect(() => {
    if (open) {
      form.reset({
        name: collection.name,
        description: collection.description ?? "",
        titleField: collection.titleField,
      });
    }
  }, [open, collection, form]);

  const mutation = useMutation({
    mutationFn: (values: EditCollectionInput) =>
      updateCollection(collection.slug, {
        name: values.name,
        description: values.description || null,
        titleField: values.titleField ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: collectionsKeys.all });
      onOpenChange(false);
      toast.success("Collection updated");
    },
    onError: (error) => {
      if (isApiError(error) && error.fieldErrors) {
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          if (key === "name" || key === "titleField") form.setError(key, { message });
        }
        if (error.fieldErrors.name || error.fieldErrors.titleField) return;
      }
      toast.error(error instanceof Error ? error.message : "Could not update collection");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collection details</DialogTitle>
          <DialogDescription>
            Slug (<span className="font-mono">{collection.slug}</span>) and kind are fixed.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="titleField"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title field</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {collection.fields.map((f) => (
                        <SelectItem key={f.id} value={f.name}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Shown as the entry title in lists and previews.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
