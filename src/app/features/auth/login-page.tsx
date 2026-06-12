import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { AuthShell } from "./auth-shell";

import { loginSchema, type LoginInput } from "@/shared/forms";
import { authClient } from "@/app/api/auth-client";
import { sessionQueryOptions } from "@/app/api/session";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";


export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginInput): Promise<void> => {
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      form.setError("password", { message: error.message ?? "Invalid email or password" });
      return;
    }
    // Clear (not just invalidate) so the route guard's ensureQueryData refetches the
    // fresh session instead of returning the stale cached null.
    queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
    navigate({ to: "/collections" });
  };

  return (
    <AuthShell title="Sign in" description="Welcome back. Sign in to manage your content.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Form>
    </AuthShell>
  );
}
