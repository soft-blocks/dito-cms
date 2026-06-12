import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { AuthShell } from "./auth-shell";

import { setupSchema, type SetupInput } from "@/shared/forms";
import { authClient } from "@/app/api/auth-client";
import { sessionQueryOptions } from "@/app/api/session";
import { setupStatusQueryOptions } from "@/app/api/system";
import { Button } from "@/app/components/ui/button";
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


export function SetupPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = async (values: SetupInput): Promise<void> => {
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (error) {
      form.setError("email", { message: error.message ?? "Could not create the admin account" });
      return;
    }
    // Clear (not just invalidate) so route guards refetch the fresh session/status
    // rather than returning the stale cached values from before signup.
    queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
    queryClient.removeQueries({ queryKey: setupStatusQueryOptions.queryKey });
    navigate({ to: "/collections" });
  };

  return (
    <AuthShell
      title="Create your admin account"
      description="This is the first run. The account you create becomes the owner of this CMS."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Jane Doe" {...field} />
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
                  <Input type="email" autoComplete="username" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>At least 8 characters.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create account"}
          </Button>
        </form>
      </Form>
    </AuthShell>
  );
}
