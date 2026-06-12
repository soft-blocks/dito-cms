import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SecretRevealDialog } from "./secret-reveal-dialog";

import { createUserSchema, type CreateUserInput } from "@/shared/forms";
import { authClient } from "@/app/api/auth-client";
import { unwrap } from "@/app/api/client";
import { usersKeys } from "@/app/api/users";
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
import { generatePassword } from "@/app/lib/password";


interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "" },
  });

  const onSubmit = async (values: CreateUserInput): Promise<void> => {
    const tempPassword = generatePassword();
    try {
      unwrap(
        await authClient.admin.createUser({
          email: values.email,
          password: tempPassword,
          name: values.name,
          role: "admin",
        }),
      );
    } catch (error) {
      form.setError("email", { message: error instanceof Error ? error.message : "Could not create user" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: usersKeys.all });
    form.reset();
    onOpenChange(false);
    setRevealed({ email: values.email, password: tempPassword });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) form.reset(); onOpenChange(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              A temporary password is generated and shown once. The user changes it after signing in.
            </DialogDescription>
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
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@example.com" {...field} />
                    </FormControl>
                    <FormDescription>This is also their sign-in username.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {revealed ? (
        <SecretRevealDialog
          open={!!revealed}
          onOpenChange={(next) => {
            if (!next) {
              setRevealed(null);
              toast.success("User created");
            }
          }}
          title="User created"
          description="Share these credentials with the new user securely."
          secret={revealed.password}
          fields={[{ label: "Email", value: revealed.email }]}
        />
      ) : null}
    </>
  );
}
