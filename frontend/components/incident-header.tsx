"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";
import { incidentBase } from "@/lib/roles";
import { incidentTime } from "@/lib/incident-model";
import { api } from "@/lib/api";
export function IncidentSelector() {
  const d = useIncident(),
    a = useAccess(),
    router = useRouter();
  return (
    <select
      aria-label="Select incident"
      className="w-20 min-w-0 truncate bg-transparent text-sm sm:w-64"
      value={a.incidentId}
      onChange={(e) =>
        router.push(
          `${incidentBase(a.organizationId, e.target.value)}/overview`,
        )
      }
    >
      {d.incidents.length ? (
        d.incidents.map((i) => (
          <option key={i.id} value={i.incidentId}>
            {i.incidentId} · {i.title} · {i.severity}
          </option>
        ))
      ) : (
        <option>{a.incidentId}</option>
      )}
    </select>
  );
}
export function NotificationCenter() {
  const d = useIncident(),
    [error, setError] = useState("");
  const unread = d.notifications.filter((n) => n.readAt === "0");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative text-muted-foreground"
      >
        <Bell size={20} />
        {unread.length > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -top-2 -right-2 rounded-full bg-red-400 px-1 text-[10px] text-black"
          >
            {unread.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[65vh] w-80 overflow-y-auto"
      >
        <DropdownMenuLabel>
          Notifications · {unread.length} unread
        </DropdownMenuLabel>
        {error && (
          <p role="alert" className="px-2 text-xs text-red-400">
            {error}
          </p>
        )}
        {!d.notifications.length && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No notifications for your authorized incidents.
          </p>
        )}
        {d.notifications.map((n) => (
          <div
            key={n.id}
            data-testid="notification"
            className="border-t border-border p-3"
          >
            <Link
              className="block text-sm"
              href={`${incidentBase(n.organizationId, n.incidentId)}${n.type === "recovery" ? "/operations" : n.taskId ? `/team?task=${encodeURIComponent(n.taskId)}` : n.conversationId ? `/team?conversation=${encodeURIComponent(n.conversationId)}` : `/overview${n.findingId ? `?finding=${encodeURIComponent(n.findingId)}` : ""}`}`}
            >
              <span
                className={
                  n.readAt === "0" ? "text-white" : "text-muted-foreground"
                }
              >
                {n.readAt === "0" ? "● " : ""}
                {n.title}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.description}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {n.incidentId} · {incidentTime(n.createdAt)}
              </p>
            </Link>
            {n.readAt === "0" && (
              <button
                className="mt-2 text-xs underline underline-offset-4"
                onClick={async () => {
                  try {
                    await api("incident/notifications/read", {
                      organizationId: n.organizationId,
                      incidentId: n.incidentId,
                      notificationId: n.id,
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Mark notification read
              </button>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
