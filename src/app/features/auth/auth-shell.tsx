import { APP_NAME } from "@/shared/constants";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps): React.ReactElement {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg" alt="" className="size-10" />
          <span className="text-sm font-medium text-muted-foreground">{APP_NAME}</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-lg font-semibold">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
        {footer ? <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}
