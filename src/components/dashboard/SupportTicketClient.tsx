"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Paperclip, X, Send, CheckCircle2,
  RotateCcw, FileText, Download, User, Headphones, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Ticket {
  id: string;
  created_at: string;
  updated_at: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  has_unread_reply: boolean;
  business_id: string | null;
}

interface Message {
  id: string;
  created_at: string;
  ticket_id: string;
  sender_type: string;
  content: string;
  attachments: { url: string; name: string }[] | null;
}

const STATUS_CONFIG = {
  open: { label: "Deschis", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "In lucru", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  resolved: { label: "Rezolvat", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "Inchis", color: "bg-muted text-muted-foreground" },
};

const PRIORITY_CONFIG = {
  low: { label: "Scazuta", dot: "bg-zinc-400" },
  normal: { label: "Normala", dot: "bg-blue-500" },
  high: { label: "Mare", dot: "bg-orange-500" },
  urgent: { label: "Urgenta", dot: "bg-red-500" },
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Tehnic",
  billing: "Facturare",
  feature: "Cerere functionalitate",
  other: "Altele",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "application/zip"];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ro-RO", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

function AttachmentItem({ att }: { att: { url: string; name: string } }) {
  if (isImage(att.url)) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={att.url} alt={att.name} className="max-h-48 rounded-lg border border-border object-cover cursor-pointer hover:opacity-90 transition-opacity" />
      </a>
    );
  }
  return (
    <a
      href={att.url}
      download={att.name}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-background/60 border border-border rounded-lg text-xs text-foreground hover:bg-accent transition-colors"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="truncate flex-1">{att.name}</span>
      <Download className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}

export function SupportTicketClient({ ticket: initialTicket, initialMessages, userId, userEmail }: {
  ticket: Ticket;
  initialMessages: Message[];
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mark as read on mount if there are unread replies
  useEffect(() => {
    if (initialTicket.has_unread_reply) {
      fetch(`/api/support/tickets/${initialTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ has_unread_reply: false }),
      }).catch(() => {});
      setTicket((prev) => ({ ...prev, has_unread_reply: false }));
    }
  }, [initialTicket.id, initialTicket.has_unread_reply]);

  // Real-time subscription for new messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_type === "agent") {
            setTicket((prev) => ({ ...prev, has_unread_reply: false, status: prev.status === "open" ? "in_progress" : prev.status }));
            toast.success("Raspuns nou de la echipa de suport");
            // Mark as read since we're on the page
            fetch(`/api/support/tickets/${ticket.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ has_unread_reply: false }),
            }).catch(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticket.id}` },
        (payload) => {
          setTicket((prev) => ({ ...prev, ...(payload.new as Partial<Ticket>) }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticket.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [reply]);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (!ALLOWED_TYPES.includes(f.type)) { toast.error(`Tipul ${f.name} nu este permis`); continue; }
      if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name} depaseste 10MB`); continue; }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  }

  const handleSend = useCallback(async () => {
    if (!reply.trim() && files.length === 0) return;
    if (ticket.status === "closed") return;
    setSending(true);
    try {
      let uploadedUrls: string[] = [];

      if (files.length > 0) {
        const { uploadImage } = await import("@/lib/upload");
        const uploads = await Promise.all(
          files.map(async (file) => {
            const result = await uploadImage(file, "avatars", "support");
            if ("error" in result) throw new Error(result.error);
            return result.url;
          })
        );
        uploadedUrls = uploads;
      }

      const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim(), attachment_urls: uploadedUrls }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Eroare");
      }

      const { message } = await res.json() as { message: Message };
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setReply("");
      setFiles([]);
      // If ticket was resolved, re-open it
      if (ticket.status === "resolved") {
        setTicket((prev) => ({ ...prev, status: "open" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la trimiterea mesajului");
    } finally {
      setSending(false);
    }
  }, [reply, files, ticket.id, ticket.status]);

  async function updateStatus(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setTicket((prev) => ({ ...prev, status }));
      toast.success(status === "resolved" ? "Tichetul a fost marcat ca rezolvat" : "Tichetul a fost redeschis");
    } catch {
      toast.error("Eroare la actualizarea statusului");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const statusConfig = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;
  const priorityConfig = PRIORITY_CONFIG[ticket.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal;
  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard/suport")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5 w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Inapoi la tichete
      </button>

      {/* Ticket header */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground mb-2 leading-tight">{ticket.subject}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", statusConfig.color)}>
                {statusConfig.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityConfig.dot)} />
                {priorityConfig.label}
              </span>
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
              <span className="text-xs text-muted-foreground">#{ticket.id.slice(0, 8)}</span>
            </div>
          </div>

          {/* Status actions */}
          <div className="flex-shrink-0">
            {!isClosed && !isResolved && (
              <button
                onClick={() => updateStatus("resolved")}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg transition-colors disabled:opacity-50"
              >
                {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Marcare rezolvat
              </button>
            )}
            {isResolved && (
              <button
                onClick={() => updateStatus("open")}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
              >
                {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Redeschide
              </button>
            )}
            {isClosed && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted rounded-lg">
                <XCircle className="h-3.5 w-3.5" />
                Inchis
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Deschis pe {formatDate(ticket.created_at)}
        </p>
      </div>

      {/* Messages thread */}
      <div className="flex-1 space-y-4 mb-5">
        {messages.map((msg) => {
          const isUser = msg.sender_type === "user";
          const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
          return (
            <div key={msg.id} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                isUser ? "bg-primary/10" : "bg-muted"
              )}>
                {isUser
                  ? <User className="h-4 w-4 text-primary" />
                  : <Headphones className="h-4 w-4 text-muted-foreground" />
                }
              </div>

              {/* Bubble */}
              <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start", "flex flex-col")}>
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  isUser
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-card border border-border text-foreground rounded-tl-sm"
                )}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>

                {/* Attachments */}
                {atts.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    {atts.map((att, i) => (
                      <AttachmentItem key={i} att={att} />
                    ))}
                  </div>
                )}

                <span className="text-[11px] text-muted-foreground px-1">
                  {isUser ? "Tu" : "Echipa Edinio"} &middot; {formatDate(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Resolved/Closed notice */}
        {(isResolved || isClosed) && (
          <div className="flex items-center justify-center gap-2 py-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground px-3 flex items-center gap-1.5">
              {isResolved
                ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Tichet marcat ca rezolvat</>
                : <><XCircle className="h-3.5 w-3.5" /> Tichet inchis</>
              }
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {!isClosed ? (
        <div className="bg-card border border-border rounded-2xl p-4 sticky bottom-4">
          {isResolved && (
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Trimiterea unui mesaj va redeschide tichetul automat.
            </p>
          )}

          {/* Files preview */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent rounded-lg text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Scrie un mesaj... (Ctrl+Enter pentru a trimite)"
              rows={1}
              className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[42px]"
            />

            {/* Attach */}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.zip"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={files.length >= 5}
              className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title="Adauga fisier"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Send */}
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!reply.trim() && files.length === 0)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-muted/50 border border-border rounded-2xl p-4 text-center">
          <p className="text-sm text-muted-foreground">Acest tichet este inchis. Deschide un tichet nou daca mai ai nevoie de ajutor.</p>
          <button
            onClick={() => router.push("/dashboard/suport")}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            Tichet nou
          </button>
        </div>
      )}
    </div>
  );
}
