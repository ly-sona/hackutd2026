import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Brand } from "./brand";
export function AccessState({
  title = "Access denied",
  message = "You do not have permission to open this workspace.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <main className="min-h-screen">
      <header className="border-b border-border px-6 py-5">
        <Brand />
      </header>
      <div className="mx-auto max-w-lg px-6 py-28">
        <ShieldAlert
          className="mb-6 text-amber-400"
          size={28}
          strokeWidth={1.5}
        />
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {message}
        </p>
        <div className="mt-7 flex gap-6 text-sm">
          <Link href="/organizations" className="underline underline-offset-4">
            Choose organization
          </Link>
          <Link
            href="/login"
            className="text-muted-foreground underline underline-offset-4"
          >
            Sign in again
          </Link>
        </div>
      </div>
    </main>
  );
}
