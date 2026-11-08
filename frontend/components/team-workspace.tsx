"use client";
import { useEffect, useRef, useState } from "react";
import Link from "./workspace-link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Users, Paperclip, MoreHorizontal } from "lucide-react";
import { useIncident } from "./incident-data";
import { useAccess } from "./workspace-provider";
import { useCoordination, useCoordinationCommand } from "./coordination-data";
import { Avatar } from "./account-menu";
import { InviteResponder, PendingInvitations } from "./member-administration";
import { FindingForm } from "./incident-forms";
import {
  TaskForm,
  TaskDialog,
  TaskList,
  ReferenceSelector,
  ReferenceLinks,
  formReferences,
} from "./coordination-tasks";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PageHeading } from "./workspace-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { roleLabels, incidentBase } from "@/lib/roles";
import { availabilityStatuses, type Reference } from "@/lib/coordination";
import { incidentTime } from "@/lib/incident-model";
export function TeamWorkspace() {
  const a = useAccess(),
    d = useCoordination(),
    incident = useIncident(),
    command = useCoordinationCommand(),
    read = useCoordinationCommand(),
    router = useRouter(),
    params = useSearchParams();
  const [query, setQuery] = useState(""),
    [directoryOpen, setDirectoryOpen] = useState(false),
    [tasksOpen, setTasksOpen] = useState(false),
    [references, setReferences] = useState(false),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    readPosition = useRef(""),
    form = useRef<HTMLFormElement>(null);
  const c =
    d.conversations.find((c) => c.id === params.get("conversation")) ??
    d.conversations.find((c) => c.type === "Incident Room");
  const messages = d.messages.filter((m) => m.conversationId === c?.id),
    latest = messages.at(-1),
    base = incidentBase(a.organizationId, a.incidentId);
  const reviewing =
    c?.type === "Direct Message" && !c.participants.includes(a.userId);
  const taskId =
    params.get("task") ??
    d.pages.find((p) => p.id === params.get("page"))?.taskId ??
    "";
  const task = taskId;
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const id = params.get("message");
    const source = id
      ? element.querySelector(
          `[data-message-id="${id.replace(/[^0-9]/g, "")}"]`,
        )
      : null;
    if (source) source.scrollIntoView({ block: "center" });
    else if (follow.current) element.scrollTop = element.scrollHeight;
  }, [latest?.id, c?.id, params]);
  useEffect(() => {
    if (!c || !latest) return;
    const key = `${a.userId}:${c.id}:${latest.id}`;
    if (readPosition.current === key) return;
    readPosition.current = key;
    read("message.read", { conversationId: c.id, messageId: latest.id }).catch(
      (e: Error) => {
        readPosition.current = "";
        setError(e.message);
      },
    );
  }, [c, latest, a.userId, read]);
  const display = (conv: NonNullable<typeof c>) =>
    conv.type === "Incident Room"
      ? `${a.incidentId} · Response team`
      : conv.participants
          .filter((id) => id !== a.userId)
          .map(d.name)
          .join(", ");
  async function startDM(userId: string) {
    try {
      const result = await command<{ conversationId: string }>("dm.create", {
        userId,
      });
      router.replace(
        `${base}/team?conversation=${encodeURIComponent(result.conversationId)}`,
      );
      follow.current = true;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title="Team"
        description={a.incidentId + " · Responders and conversations"}
        actions={
          <>
            {a.can("members:edit") && (
              <Button asChild variant="outline" size="sm">
                <Link
                  aria-label="Manage organization members"
                  href={`/org/${a.organizationId}/members`}
                >
                  Manage members
                </Link>
              </Button>
            )}
            <InviteResponder />
          </>
        }
      />
      {!a.can("messages:view") ? (
        <section className="space-y-5">
          <p className="rounded-md border border-border p-6 text-base text-muted-foreground">
            Your current role does not grant incident chat access.
          </p>
          <div className="flex gap-5 text-base">
            <Link
              className="underline underline-offset-4"
              href={`/org/${a.organizationId}/members`}
            >
              Manage members
            </Link>
            <Link
              className="underline underline-offset-4"
              href={`/org/${a.organizationId}/invitations`}
            >
              Invitations
            </Link>
          </div>
          <h2 className="text-2xl font-semibold">Incident responders</h2>
          <div className="divide-y divide-border border-y border-border">
            {incident.members.map((member) => (
              <div className="flex items-center gap-3 py-4" key={member.id}>
                <Avatar name={member.name} />
                <div>
                  <p className="text-base font-medium">{member.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {roleLabels[member.role]} · Active incident access
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          {!d.ready && <p role="status">Loading conversations…</p>}
          <Button
            variant="outline"
            className="mb-4 lg:hidden"
            aria-expanded={directoryOpen}
            aria-controls="conversation-directory"
            onClick={() => setDirectoryOpen((open) => !open)}
          >
            Conversations
          </Button>
          <div className="grid min-h-[560px] gap-8 lg:h-[660px] lg:min-h-0 lg:grid-cols-[28%_1fr]">
            <aside
              id="conversation-directory"
              aria-label="Conversation directory"
              className={`${directoryOpen ? "block" : "hidden"} min-h-0 overflow-y-auto border-b border-border pb-6 lg:block lg:border-r lg:border-b-0 lg:pr-6`}
            >
              <div className="relative mb-6">
                <Search
                  size={16}
                  className="absolute left-3 top-2.5 text-muted-foreground"
                />
                <Input
                  aria-label="Find a conversation"
                  placeholder="Find a conversation"
                  className="pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <h2 className="mb-3 text-sm font-semibold tracking-wide">
                INCIDENT CHAT
              </h2>
              {d.conversations
                .filter(
                  (conv) =>
                    conv.type === "Incident Room" &&
                    display(conv).toLowerCase().includes(query.toLowerCase()),
                )
                .map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      router.replace(
                        `${base}/team?conversation=${encodeURIComponent(conv.id)}`,
                      );
                      follow.current = true;
                    }}
                    className={`mb-6 flex w-full gap-3 rounded-md border-l-[3px] px-4 py-3 text-left ${c?.id === conv.id ? "border-white bg-muted/45" : "border-transparent hover:bg-muted/20"}`}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Users size={23} />
                    </span>
                    <span>
                      <strong className="block text-base">
                        {display(conv)}
                      </strong>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {conv.participants.length} members · Created
                        automatically
                      </span>
                      <span className="text-sm">
                        Incident group chat
                        {conv.unread > 0 ? ` · ${conv.unread} unread` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              <h2 className="mb-3 text-sm font-semibold tracking-wide">
                DIRECT MESSAGES
              </h2>
              {d.responders
                .filter(
                  (r) =>
                    r.id !== a.userId &&
                    (r.name + " " + roleLabels[r.role])
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((r) => {
                  const conv = d.conversations.find(
                    (c) =>
                      c.type === "Direct Message" &&
                      c.participants.includes(a.userId) &&
                      c.participants.includes(r.id),
                  );
                  return (
                    <button
                      key={r.id}
                      aria-label={`Message ${r.name}`}
                      className={`mb-2 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left ${c?.id === conv?.id ? "bg-muted/40" : "hover:bg-muted/20"}`}
                      onClick={() => void startDM(r.id)}
                    >
                      <Avatar name={r.name} />
                      <span>
                        <strong className="block text-lg">
                          {r.name}
                          {conv && conv.unread > 0
                            ? ` · ${conv.unread} unread`
                            : ""}
                        </strong>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {roleLabels[r.role]} ·{" "}
                          <span
                            className={
                              r.availability === "Available"
                                ? "text-emerald-400"
                                : r.availability === "Busy"
                                  ? "text-amber-400"
                                  : "text-muted-foreground"
                            }
                          >
                            ● {r.availability}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              <PendingInvitations />
              <div className="mt-5 border-t border-border pt-5">
                <label className="flex items-center gap-3 text-base">
                  You ·
                  <select
                    aria-label="Your availability"
                    className="min-w-0 flex-1 bg-transparent py-2 text-base"
                    value={
                      d.responders.find((r) => r.id === a.userId)
                        ?.availability ?? ""
                    }
                    onChange={async (e) => {
                      try {
                        await command("availability", {
                          status: e.target.value,
                        });
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Not declared
                    </option>
                    {availabilityStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
            </aside>
            <section
              aria-label="Selected conversation"
              className="flex min-h-0 min-w-0 flex-col"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 sm:flex-nowrap">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <div className="flex items-start gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Users size={25} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-semibold">
                        {c ? display(c) : "No conversation"}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c?.type === "Incident Room"
                          ? "Created with this incident"
                          : reviewing
                            ? "Read-only administrator review"
                            : "Participants and organization administrators"}{" "}
                        · {c?.participants.length ?? 0} members
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c?.participants.map((id) => (
                      <span key={id} title={d.name(id)}>
                        <Avatar name={d.name(id)} small />
                      </span>
                    ))}
                    {c?.type === "Incident Room" && (
                      <span className="ml-3 self-center text-sm">
                        <span className="mr-4 text-muted-foreground">|</span>
                        {[
                          ...new Set(
                            c.participants.map(
                              (id) =>
                                ({
                                  commander: "Commander",
                                  analyst: "Security",
                                  legal: "Legal",
                                  operations: "Operations",
                                  administrator: "Administrator",
                                })[
                                  d.responders.find(
                                    (person) => person.id === id,
                                  )?.role ?? ""
                                ] ?? "Responder",
                            ),
                          ),
                        ].join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Incident tasks"
                  title="Incident tasks"
                  onClick={() => setTasksOpen(true)}
                >
                  <MoreHorizontal size={21} />
                </Button>
              </div>
              <div
                ref={scroll}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  follow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                }}
                className="my-4 max-h-[500px] min-h-80 flex-1 space-y-7 overflow-y-auto pr-2"
                aria-label="Conversation messages"
                aria-live="polite"
                aria-relevant="additions"
              >
                {c?.type === "Incident Room" && (
                  <p className="text-center text-sm text-muted-foreground">
                    AEGIS created this conversation and added the incident’s
                    authorized responders.
                  </p>
                )}
                {!messages.length && d.ready && (
                  <p className="text-base text-muted-foreground">
                    No messages yet. Start a conversation.
                  </p>
                )}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    id={`message-${m.id}`}
                    data-message-id={m.id}
                    className="group relative flex gap-4"
                  >
                    <Avatar name={m.senderName} />
                    <div className="min-w-0 flex-1">
                      <p className="pr-8 text-base">
                        <strong>{m.senderName}</strong>
                        <time className="ml-3 text-sm text-muted-foreground">
                          {incidentTime(m.createdAt, false)}
                        </time>
                      </p>
                      {messages.some((item) => item.correctionOf === m.id) ? (
                        <details className="mt-1 text-muted-foreground">
                          <summary className="cursor-pointer text-sm">
                            Original message (corrected below)
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap break-words text-base leading-6">
                            {m.content}
                          </p>
                        </details>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words text-base leading-6">
                          {m.content}
                        </p>
                      )}
                      {m.correctionOf !== "0" && (
                        <p className="mt-1 text-sm text-amber-300">
                          Correction of message {m.correctionOf}; original
                          preserved.
                        </p>
                      )}
                      <div className="mt-2">
                        <ReferenceLinks
                          references={JSON.parse(m.references) as Reference[]}
                          compact
                        />
                      </div>
                      <details className="message-actions absolute right-0 top-0 z-10">
                        <summary
                          aria-label="Message actions"
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal size={20} />
                        </summary>
                        <div
                          data-testid="message-actions"
                          className="absolute right-0 mt-1 flex min-w-44 flex-col gap-3 rounded-md border border-border bg-card p-4 shadow-xl [&>button]:w-full"
                        >
                          <TaskForm source={m} />
                          {a.can("findings:create") && (
                            <FindingForm sourceMessage={m} />
                          )}
                        </div>
                      </details>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.tasks
                          .filter((t) => t.sourceMessageId === m.id)
                          .map((t) => (
                            <Link
                              key={t.id}
                              className="text-sm underline underline-offset-4"
                              href={`${base}/team?task=${encodeURIComponent(t.id)}`}
                            >
                              Task: {t.title}
                            </Link>
                          ))}
                        {d.findingSources
                          .filter((s) => s.sourceMessageId === m.id)
                          .map((s) => (
                            <Link
                              key={s.id}
                              className="text-sm underline"
                              href={`${base}/overview?finding=${encodeURIComponent(s.id)}`}
                            >
                              Open converted finding
                            </Link>
                          ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {error && (
                <p role="alert" className="mb-3 text-base text-red-400">
                  {error}
                </p>
              )}
              <form
                ref={form}
                className="flex flex-wrap items-end gap-3 border-b border-border pb-3 pt-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!c) return;
                  const f = new FormData(e.currentTarget);
                  setSending(true);
                  setError("");
                  try {
                    await command("message.send", {
                      conversationId: c.id,
                      content: value(f, "content"),
                      references: formReferences(f),
                    });
                    form.current?.reset();
                    setReferences(false);
                    follow.current = true;
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <textarea
                  aria-label="Message"
                  name="content"
                  placeholder={
                    c?.readOnly
                      ? reviewing
                        ? "Read-only administrator review"
                        : "A participant no longer has access. Conversation is read-only."
                      : c?.type === "Direct Message"
                        ? "Message " + display(c) + "…"
                        : "Message the response team…"
                  }
                  rows={1}
                  onInput={(event) => {
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height =
                      Math.min(event.currentTarget.scrollHeight, 160) + "px";
                  }}
                  className="h-10 min-h-10 min-w-32 flex-1 resize-none bg-transparent py-2 text-base outline-none"
                  required
                  maxLength={6000}
                  disabled={sending || !c || c.readOnly}
                />
                {references && (
                  <div className="order-last w-full">
                    <ReferenceSelector />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-44"
                    aria-expanded={references}
                    onClick={() => setReferences((v) => !v)}
                  >
                    <Paperclip size={16} />
                    Add references
                  </Button>
                  <span className="hidden text-sm text-muted-foreground sm:inline">
                    {c?.type === "Direct Message"
                      ? "Administrator oversight available"
                      : "Incident members only"}
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-44"
                    disabled={sending || !c || c.readOnly}
                  >
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </>
      )}
      <Dialog open={tasksOpen} onOpenChange={setTasksOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Incident tasks</DialogTitle>
            <DialogDescription>
              Work, paging, deadlines and independent verification for{" "}
              {a.incidentId}.
            </DialogDescription>
          </DialogHeader>
          <TaskList embedded />
        </DialogContent>
      </Dialog>
      {task && (
        <TaskDialog
          id={task}
          open
          onOpenChange={(open) => {
            if (!open) {
              router.replace(
                `${base}/team${c ? `?conversation=${encodeURIComponent(c.id)}` : ""}`,
              );
            }
          }}
        />
      )}
    </>
  );
}
const value = (f: FormData, k: string) => String(f.get(k) ?? "");
