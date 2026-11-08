"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Users, Send } from "lucide-react";
import { useIncident } from "./incident-data";
import { useAccess } from "./workspace-provider";
import { useCoordination, useCoordinationCommand } from "./coordination-data";
import { Avatar } from "./account-menu";
import { InviteResponder } from "./member-administration";
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
    [members, setMembers] = useState(false),
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
      <div className="mb-8 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Team
          </h1>
          <p className="mt-2 text-muted-foreground">
            {a.incidentId} · Responders and conversations
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
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
        </div>
      </div>
      {!a.can("messages:view") ? (
        <section className="space-y-5">
          <p className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Administrator access manages memberships and invitations. Incident
            chat requires an operational responder role and current incident
            assignment.
          </p>
          <div className="flex gap-5 text-sm">
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
          <h2 className="text-xl font-semibold">Incident responders</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {incident.members.map((member) => (
              <div
                className="flex items-center gap-3 rounded-md border border-border p-4"
                key={member.id}
              >
                <Avatar name={member.name} />
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
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
          <div className="grid min-h-[580px] gap-7 lg:grid-cols-[29%_1fr]">
            <aside className="border-b border-border pb-6 lg:border-r lg:border-b-0 lg:pr-6">
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
              <h2 className="mb-3 text-xs font-semibold tracking-wide">
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
                    <Users size={22} />
                    <span>
                      <strong className="block text-sm">{display(conv)}</strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {conv.participants.length} members · Created
                        automatically
                      </span>
                      <span className="text-xs">
                        Incident group chat
                        {conv.unread > 0 ? ` · ${conv.unread} unread` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              <h2 className="mb-3 text-xs font-semibold tracking-wide">
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
                        <strong className="block text-sm">
                          {r.name}
                          {conv && conv.unread > 0
                            ? ` · ${conv.unread} unread`
                            : ""}
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {roleLabels[r.role]}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${r.availability === "Available" ? "text-emerald-400" : r.availability === "Busy" ? "text-amber-300" : "text-muted-foreground"}`}
                        >
                          ● {r.availability}
                        </span>
                      </span>
                    </button>
                  );
                })}
              <div className="mt-5 border-t border-border pt-5">
                <label className="grid gap-2 text-sm">
                  Your availability
                  <select
                    aria-label="Your availability"
                    className="rounded-md border border-border bg-background p-2"
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Manually declared · not browser presence
                </p>
              </div>
            </aside>
            <section className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">
                    {c ? display(c) : "No conversation"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c?.type === "Incident Room"
                      ? "Created with this incident"
                      : "Private to its two current incident responders"}{" "}
                    · {c?.participants.length ?? 0} members
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c?.participants.map((id) => (
                      <span key={id} title={d.name(id)}>
                        <Avatar name={d.name(id)} small />
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMembers(true)}
                >
                  Members
                </Button>
              </div>
              <div
                ref={scroll}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  follow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                }}
                className="my-4 max-h-[560px] min-h-80 flex-1 space-y-7 overflow-y-auto pr-2"
                aria-label="Conversation messages"
                aria-live="polite"
                aria-relevant="additions"
              >
                {c?.type === "Incident Room" && (
                  <p className="text-center text-xs text-muted-foreground">
                    AEGIS created this incident room. Access follows active
                    incident membership.
                  </p>
                )}
                {!messages.length && d.ready && (
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Start a conversation.
                  </p>
                )}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    id={`message-${m.id}`}
                    data-message-id={m.id}
                    className="flex gap-3"
                  >
                    <Avatar name={m.senderName} small />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <strong>{m.senderName}</strong>
                        <time className="ml-3 text-xs text-muted-foreground">
                          {incidentTime(m.createdAt, false)}
                        </time>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                        {m.content}
                      </p>
                      {m.correctionOf !== "0" && (
                        <p className="mt-1 text-xs text-amber-300">
                          Correction of message {m.correctionOf}; original
                          preserved.
                        </p>
                      )}
                      <div className="mt-2">
                        <ReferenceLinks
                          references={JSON.parse(m.references) as Reference[]}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <TaskForm source={m} />
                        {a.can("findings:create") && (
                          <FindingForm sourceMessage={m} />
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.tasks
                          .filter((t) => t.sourceMessageId === m.id)
                          .map((t) => (
                            <Link
                              key={t.id}
                              className="text-xs underline"
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
                              className="text-xs underline"
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
                <p role="alert" className="mb-3 text-sm text-red-400">
                  {error}
                </p>
              )}
              <form
                ref={form}
                className="space-y-3 border-t border-border pt-4"
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
                      ? "A participant no longer has access. Conversation is read-only."
                      : "Message the response team…"
                  }
                  className="min-h-20 w-full resize-y bg-transparent text-sm outline-none"
                  required
                  maxLength={6000}
                  disabled={sending || !c || c.readOnly}
                />
                {references && <ReferenceSelector />}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setReferences((v) => !v)}
                  >
                    Reference evidence, finding, scope or task
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {c?.type === "Direct Message"
                      ? "Two participants only"
                      : "Incident members only"}
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={sending || !c || c.readOnly}
                  >
                    <Send size={14} />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </form>
            </section>
          </div>
          <TaskList />
        </>
      )}
      <Dialog open={members} onOpenChange={setMembers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conversation members</DialogTitle>
            <DialogDescription>
              Current incident authorization controls access; availability does
              not grant permissions.
            </DialogDescription>
          </DialogHeader>
          {c?.participants.map((id) => (
            <div key={id} className="flex gap-3 text-sm">
              <Avatar name={d.name(id)} small />
              <div>
                {d.name(id)}
                <p className="text-xs text-muted-foreground">
                  {roleLabels[
                    d.responders.find((r) => r.id === id)?.role ?? ""
                  ] ?? "Access no longer active"}
                </p>
              </div>
            </div>
          ))}
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
