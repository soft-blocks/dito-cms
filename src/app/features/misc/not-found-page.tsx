import { Link } from "@tanstack/react-router";

import { Button } from "@/app/components/ui/button";

export function NotFoundPage(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Button asChild>
        <Link to="/collections">Back to collections</Link>
      </Button>
    </div>
  );
}
