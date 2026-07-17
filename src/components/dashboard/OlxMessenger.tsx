"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  MessageSquare, Loader2, X, Send, ArrowLeft, User as UserIcon, ExternalLink, Tag,
} from "lucide-react";
import {
  getOlxThreads, getOlxConversation, replyOlxThread,
  type OlxAdvertRow, type OlxConversation,
} from "@/lib/actions/olx.actions";
import type { OlxThread } from "@/lib/olx/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export function OlxMessenger({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [threads, setThreads] = useState<OlxThread[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOlxThreads(businessId).then((r) => { if (!cancelled) setThreads("error" in r ? [] : r.threads); });
    return () => { cancelled = true; };
  }, [businessId]);

  const unreadTotal = (threads ?? []).reduce((n, t) => n + (t.unread_count ?? 0), 0);
  const count = threads?.length ?? 0;

  function markThreadRead(threadId: number) {
    setThreads((prev) => (prev ?? []).map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Mesaje de la cumpărători</h3>
          {unreadTotal > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{unreadTotal} noi</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={threads === null}>
          {threads === null ? <Loader2 className="animate-spin" /> : <MessageSquare />}
          Deschide{count > 0 ? ` (${count})` : ""}
        </Button>
      </div>

      {open && (
        <MessengerModal
          businessId={businessId}
          threads={threads ?? []}
          adverts={adverts}
          onClose={() => setOpen(false)}
          onThreadRead={markThreadRead}
        />
      )}
    </div>
  );
}

function MessengerModal({ businessId, threads, adverts, onClose, onThreadRead }: {
  businessId: string;
  threads: OlxThread[];
  adverts: OlxAdvertRow[];
  onClose: () => void;
  onThreadRead: (threadId: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [localThreads, setLocalThreads] = useState<OlxThread[]>(threads);

  // On desktop, pre-open the first conversation (two-pane view). On mobile we
  // leave nothing selected so the CONVERSATION LIST shows first (like OLX).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
        setSelectedId((cur) => cur ?? threads[0]?.id ?? null);
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map advert id -> product name for friendly list labels.
  const advertName = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of adverts) if (a.olx_advert_id) m.set(a.olx_advert_id, a.name);
    return m;
  }, [adverts]);

  const selected = localThreads.find((t) => t.id === selectedId) ?? null;

  function selectThread(id: number) {
    setSelectedId(id);
    setLocalThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread_count: 0 } : t)));
    onThreadRead(id);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-card shadow-xl sm:h-[85vh] sm:rounded-2xl sm:border sm:border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Mesaje OLX</h2>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: conversation list */}
          <aside className={cn(
            "w-full shrink-0 flex-col overflow-y-auto border-r border-border sm:w-72 sm:flex",
            selected ? "hidden sm:flex" : "flex",
          )}>
            {localThreads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nicio conversație încă.</div>
            ) : (
              localThreads.map((t) => {
                const name = t.advert_id ? advertName.get(t.advert_id) : undefined;
                const label = name ?? (t.advert_id ? `Anunț ${t.advert_id}` : `Conversație #${t.id}`);
                const active = t.id === selectedId;
                return (
                  <button key={t.id} onClick={() => selectThread(t.id)}
                    className={cn(
                      "flex items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors",
                      active ? "bg-primary/5" : "hover:bg-muted/50",
                    )}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{label}</span>
                        {(t.unread_count ?? 0) > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {t.total_count ?? 0} mesaje{t.created_at ? ` · ${t.created_at.slice(0, 10)}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </aside>

          {/* Right: active conversation */}
          <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden sm:flex")}>
            {selected ? (
              <ConversationView
                key={selected.id}
                businessId={businessId}
                thread={selected}
                fallbackTitle={selected.advert_id ? advertName.get(selected.advert_id) : undefined}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Selectează o conversație din stânga.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConversationView({ businessId, thread, fallbackTitle, onBack }: {
  businessId: string;
  thread: OlxThread;
  fallbackTitle?: string;
  onBack: () => void;
}) {
  const [convo, setConvo] = useState<OlxConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, startSend] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await getOlxConversation(businessId, thread.id, { advertId: thread.advert_id, interlocutorId: thread.interlocutor_id });
    setLoading(false);
    if ("error" in res) { toast.error(res.error); setConvo({ messages: [], buyer: null, advert: null }); return; }
    setConvo(res);
  }

  // The parent remounts this via key={thread.id}, so `loading` starts true fresh
  // per conversation — no synchronous setState needed here.
  useEffect(() => {
    let cancelled = false;
    getOlxConversation(businessId, thread.id, { advertId: thread.advert_id, interlocutorId: thread.interlocutor_id }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in res) { toast.error(res.error); setConvo({ messages: [], buyer: null, advert: null }); return; }
      setConvo(res);
    });
    return () => { cancelled = true; };
  }, [businessId, thread.id, thread.advert_id, thread.interlocutor_id]);

  // Auto-scroll to the newest message (DOM op — safe inside an effect).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo?.messages.length]);

  function send() {
    const text = reply.trim();
    if (!text) return;
    startSend(async () => {
      const res = await replyOlxThread(businessId, thread.id, text);
      if ("error" in res) { toast.error(res.error); return; }
      setReply("");
      await load();
    });
  }

  const buyerName = convo?.buyer?.name ?? "Utilizator OLX";
  const advert = convo?.advert;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Conversation header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onBack} aria-label="Înapoi" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"><ArrowLeft className="h-5 w-5" /></button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
          {convo?.buyer?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={convo.buyer.avatar} alt="" className="h-full w-full object-cover" />
          ) : <UserIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{buyerName}</p>
          <p className="truncate text-xs text-muted-foreground">{fallbackTitle ?? advert?.title ?? "Conversație"}</p>
        </div>
      </div>

      {/* Advert context card */}
      {advert && (advert.title || advert.image) && (
        <a href={advert.url ?? undefined} target="_blank" rel="noreferrer"
          className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {advert.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={advert.image} alt="" className="h-full w-full object-cover" />
            ) : <Tag className="h-5 w-5 text-muted-foreground" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{advert.title}</span>
            {advert.price && <span className="block text-xs font-semibold text-primary">{advert.price}</span>}
          </span>
          {advert.url && <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </a>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : convo && convo.messages.length > 0 ? (
          convo.messages.map((m) => (
            <div key={m.id} className={cn("flex", m.type === "sent" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                m.type === "sent" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground",
              )}>
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
                {m.created_at && <span className="mt-1 block text-[10px] opacity-70">{m.created_at.slice(0, 16).replace("T", " ")}</span>}
              </div>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Niciun mesaj în această conversație.</p>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Scrie un mesaj..."
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button onClick={send} disabled={sending || !reply.trim()} aria-label="Trimite">
          {sending ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
