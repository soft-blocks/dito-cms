import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileIcon, LayersIcon } from "lucide-react";
import { toast } from "sonner";

import { createCollectionSchema, type CreateCollectionInput } from "@/shared/forms";
import { slugify } from "@/shared/slug";
import { collectionsKeys, createCollection } from "@/app/api/collections";
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
import { cn } from "@/app/lib/utils";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_OPTIONS = [
  {
    value: "collection" as const,
    label: "Collection",
    description: "Many entries — blog posts, testimonials, team members.",
    icon: LayersIcon,
  },
  {
    value: "singleton" as const,
    label: "Singleton",
    description: "Exactly one entry — a hero, site settings, an about page.",
    icon: FileIcon,
  },
];

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const slugEdited = useRef(false);

  const form = useForm<CreateCollectionInput>({
    resolver: zodResolver(createCollectionSchema),
    defaultValues: { name: "", slug: "", type: "collection", description: "" },
  });

  const reset = (): void => {
    slugEdited.current = false;
    form.reset({ name: "", slug: "", type: "collection", description: "" });
  };

  const mutation = useMutation({
    mutationFn: createCollection,
    onSuccess: async (collection) => {
      await queryClient.invalidateQueries({ queryKey: collectionsKeys.all });
      onOpenChange(false);
      reset();
      toast.success(`Created "${collection.name}"`);
      void navigate({ to: "/collections/$slug/schema", params: { slug: collection.slug } });
    },
    onError: (error) => {
      if (isApiError(error) && error.fieldErrors) {
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          if (key === "slug" || key === "name") form.setError(key, { message });
        }
        if (error.fieldErrors.slug || error.fieldErrors.name) return;
      }
      toast.error(error instanceof Error ? error.message : "Could not create collection");
    },
  });

  const onSubmit = (values: CreateCollectionInput): void => {
    mutation.mutate({
      name: values.name,
      slug: values.slug,
      type: values.type,
      description: values.description || undefined,
    });
  };

  const selectedType = form.watch("type");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>Define a content type. Its slug and kind can't change later.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Testimonials"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugEdited.current) form.setValue("slug", slugify(e.target.value), { shouldValidate: true });
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="testimonials"
                      className="font-mono"
                      {...field}
                      onChange={(e) => {
                        slugEdited.current = true;
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormDescription>Used in delivery URLs. Lowercase, hyphenated, immutable.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kind</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {TYPE_OPTIONS.map((option) => {
                      const active = selectedType === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => field.onChange(option.value)}
                          aria-pressed={active}
                          className={cn(
                            "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors",
                            active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <option.icon className="size-4" />
                            {option.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
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
                    <Textarea placeholder="Optional — what this collection holds." rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create collection"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
