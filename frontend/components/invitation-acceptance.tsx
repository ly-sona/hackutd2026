"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { incidentBase, roleLabels } from "@/lib/roles";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export interface InvitationPreview {
  status: string;
  organizationName?: string;
  incidentId?: string;
  role?: string;
  existingAccount?: boolean;
  recipient?: string;
}
export function InvitationAcceptance({
  token,
  invitation,
  accountName,
}: {
  token: string;
  invitation: InvitationPreview;
  accountName?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const usable = invitation.status === "pending";
  async function accept(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPending(true);
    setError("");
    try {
      const form = event ? new FormData(event.currentTarget) : undefined;
      const result = await api<{ organizationId: string; incidentId: string }>(
        form ? "invitations/register" : "invitations/accept",
        form
          ? {
              token,
              name: form.get("name"),
              login: form.get("login"),
              password: form.get("password"),
            }
          : { token },
      );
      router.replace(
        `${incidentBase(result.organizationId, result.incidentId)}/team`,
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The invitation could not be accepted.",
      );
    } finally {
      setPending(false);
    }
  }
  if (!usable)
    return (
      <>
        <h1 className="text-2xl font-medium">
          {invitation.status === "expired"
            ? "Invitation expired"
            : invitation.status === "accepted"
              ? "Invitation already accepted"
              : "Invitation unavailable"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {invitation.status === "expired"
            ? "This link is more than one hour old. Ask an AEGIS administrator to generate a replacement."
            : "This link is invalid, revoked, or already used. Ask an administrator for a new invitation."}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          Go to sign in
        </Link>
      </>
    );
  return (
    <>
      <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        Independent workspace invitation
      </p>
      <h1 className="text-2xl font-medium">
        Join {invitation.organizationName}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        You are invited as {roleLabels[invitation.role ?? ""]} to{" "}
        {invitation.incidentId}.
      </p>
      <div className="my-6 rounded-md border border-border p-4 text-sm">
        <span className="text-muted-foreground">Intended responder</span>
        <p className="mt-1">{invitation.recipient}</p>
      </div>
      {accountName ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{accountName}</span>.
          </p>
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => accept()}
          >
            {pending ? "Accepting…" : "Accept invitation"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={async () => {
              try {
                await api("auth/logout", {});
                window.location.reload();
              } catch {
                setError("Sign out failed. Try again.");
              }
            }}
          >
            Use another account
          </Button>
        </div>
      ) : invitation.existingAccount ? (
        <Button className="w-full" asChild>
          <Link
            href={`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
          >
            Sign in to accept
          </Link>
        </Button>
      ) : (
        <form className="space-y-4" onSubmit={accept}>
          <p className="text-xs leading-5 text-muted-foreground">
            Create your independent AEGIS account. Possession of this one-time
            link is the enrollment check in this simulated-delivery demo.
          </p>
          <div>
            <label htmlFor="name" className="mb-2 block text-sm">
              Full name
            </label>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="new-login" className="mb-2 block text-sm">
              Choose an AEGIS account name
            </label>
            <Input
              id="new-login"
              name="login"
              required
              minLength={3}
              maxLength={61}
              pattern="[a-z0-9][a-z0-9._-]{2,60}"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm">
              Password (12 characters minimum)
            </label>
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </div>
          <Button className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account and accept"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Demo delivery · Never share this activation link publicly.
      </p>
    </>
  );
}
