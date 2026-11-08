import { ChevronDown } from "lucide-react";
import { cn } from "cn";

export function PageHeading({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-wrap items-start justify-between gap-5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 font-mono text-base tracking-wide">{eyebrow}</p>
        )}
        <h1
          className={`text-3xl font-semibold tracking-tight ${eyebrow ? "sm:text-[44px]" : "sm:text-[40px]"}`}
        >
          {title}
        </h1>
        <div className="mt-2 text-base text-muted-foreground sm:text-lg">
          {description}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-4 pt-3">{actions}</div>
      )}
    </div>
  );
}

export function Disclosure({
  title,
  children,
  className = "",
  open,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  open?: boolean;
}) {
  return (
    <details
      className={`aegis-disclosure border-t border-border py-5 ${className}`}
      open={open}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold">
        {title}
        <ChevronDown size={18} className="disclosure-chevron shrink-0" />
      </summary>
      <div className="pt-5">{children}</div>
    </details>
  );
}
