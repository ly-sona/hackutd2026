"use client";
import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs text-foreground ${small ? "size-7" : "size-9"}`}
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function AccountMenu({ name, role }: { name: string; role?: string }) {
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(false);
  async function logout() {
    try {
      await api("auth/logout", {});
      window.location.replace("/login");
    } catch {
      setError("Sign out failed. Please try again.");
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar name={name} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            {name}
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              {role ?? "Independent AEGIS account"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfile(true)}>
            <UserRound />
            Account profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={logout}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
          {error && (
            <p role="alert" className="p-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={profile} onOpenChange={setProfile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account profile</DialogTitle>
            <DialogDescription>
              Your independently managed AEGIS identity.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar name={name} />
            <div>
              <p>{name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {role ?? "No selected organization"}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
