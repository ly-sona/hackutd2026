"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function LoginForm({
  returnTo,
  state,
}: {
  returnTo: string;
  state?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ redirect: string }>("auth/login", {
        login: form.get("login"),
        password: form.get("password"),
        returnTo,
      });
      router.replace(result.redirect);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {state === "expired" && (
        <p
          role="status"
          className="rounded-md border border-amber-400/25 p-3 text-sm text-amber-300"
        >
          Your session expired. Sign in again to continue.
        </p>
      )}
      <div className="space-y-2">
        <label htmlFor="login" className="text-sm">
          AEGIS account
        </label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          placeholder="Your independent account name"
          required
          maxLength={100}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={pending}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <Button className="h-10 w-full" type="submit" disabled={pending}>
        {pending ? "Authenticating…" : "Sign in"}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Use your AEGIS account. Corporate SSO and email credentials do not grant
        access.
      </p>
    </form>
  );
}
