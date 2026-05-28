"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Loader2, CheckCircle2, XCircle, RotateCcw,
  User, Headphones, FileText, Download, Paperclip, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Ticket {
  id: string; subject: string; category: string; priority: string;
  status: string; created_at: string; updated_at: string; user_id: string; has_unread_reply: boolean;
}
interface Message {
  id: string; created_at: string; ticket_id: string;
  sender_type: string; content: string; attachments: { url: string; name: string }[] | null;
}

const STATUS_CONFIG = {
  open: { label: "Deschis", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In lucru", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Rezolvat", color: "bg-green-100 text-green-700" },
  closed: { label: "Inchis", color: "bg-zinc-100 text-zinc-500" },
};
const CATEGORY_LABELS: Record<string, string> = {
  technical: "Tehnic", billing: "Facturare", feature: "Functionalitate", other: "Altele",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "Scazuta", normal: "Normala", high: "Mare", urgent: "Urgenta",
};

function isImage(url: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(url); }

export function AdminSupportTicketClient({ ticket: initialTicket, initialMessages, userName, userEmail }: {
  ticket: Ticket;
  initialMessages: Message[];
  userName: string;
  userEmail: string;
}) {
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState(initialTicket.status);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`admin-ticket-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticket.id}` }, (payload) => {
        setTicket((prev) => ({ ...prev, ...(payload.new as Partial<Ticket>) }));
        setNewStatus((payload.new as Partial<Ticket>).status ?? ticket.status);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticket.id, ticket.status]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [reply]);

  const handleSend = useCallback(async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/${ticket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim(), status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const { message } = await res.json() as { message: Message };
      setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
      setTicket((prev) => ({ ...prev, status: newStatus }));
      setReply("");
      toast.success("Raspuns trimis");
    } catch {
      toast.error("Eroare la trimiterea raspunsului");
    } finally {
      setSending(false);
    }
  }, [reply, ticket.id, newStatus]);

  async function handleStatusChange(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/${ticket.id}/reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setTicket((prev) => ({ ...prev, status }));
      setNewStatus(status);
      toast.success("Status actualizat");
    } catch {
      toast.error("Eroare la actualizarea statusului");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const statusConf = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;

  return (
    <div className="space-y-5">
      <Link href="/admin/suport" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" /> Inapoi la tichete
      </Link>

      {/* Ticket header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-zinc-900 dark:text-white mb-2">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", statusConf.color)}>{statusConf.label}</span>
              <span className="text-xs text-zinc-500">{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</span>
              <span className="text-xs text-zinc-500">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
              <span className="text-xs text-zinc-400">#{ticket.id.slice(0, 8)}</span>
            </div>
          </div>

          {/* Status change */}
          <div className="flex items-center gap-2">
            {ticket.status !== "closed" && ticket.status !== "resolved" && (
              <button onClick={() => handleStatusChange("resolved")} disabled={updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50">
                {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Marcare rezolvat
              </button>
            )}
            {ticket.status !== "closed" && (
              <button onClick={() => handleStatusChange("closed")} disabled={updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors disabled:opacity-50">
                <XCircle className="h-3.5 w-3.5" /> Inchide
              </button>
            )}
            {(ticket.status === "closed" || ticket.status === "resolved") && (
              <button onClick={() => handleStatusChange("open")} disabled={updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> Redeschide
              </button>
            )}
          </div>
        </div>

        {/* User info */}
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 flex-shrink-0">
            {userName[0]?.toUpperCase()}
          </div>
          <div>
            <Link href={`/admin/utilizatori/${ticket.user_id}`} className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline">{userName}</Link>
            <p className="text-xs text-zinc-400">{userEmail}</p>
          </div>
          <p className="text-xs text-zinc-400 ml-auto">Deschis {new Date(ticket.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender_type === "user";
          const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
          return (
            <div key={msg.id} className={cn("flex gap-3", isUser ? "flex-row" : "flex-row-reverse")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                isUser ? "bg-zinc-100 dark:bg-zinc-800" : "bg-primary/10")}>
                {isUser ? <User className="h-4 w-4 text-zinc-500" /> : <Headphones className="h-4 w-4 text-primary" />}
              </div>
              <div className={cn("max-w-[75%] space-y-1 flex flex-col", isUser ? "items-start" : "items-end")}>
                <div className={cn("px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  isUser ? "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-tl-sm"
                         : "bg-primary text-white rounded-tr-sm")}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
                {atts.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    {atts.map((att, i) => isImage(att.url) ? (
                      <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                        <img src={att.url} alt={att.name} className="max-h-48 rounded-lg border border-border object-cover" />
                      </a>
                    ) : (
                      <a key={i} href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs text-zinc-600 hover:bg-zinc-200 transition-colors">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{att.name}</span><Download className="h-3.5 w-3.5 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-zinc-400 px-1">
                  {isUser ? userName : "Echipa Edinio"} &middot; {new Date(msg.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sticky bottom-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <Headphones className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Raspuns ca echipa Edinio</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-zinc-500">Status dupa raspuns:</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
              className="h-7 px-2 rounded border border-zinc-200 dark:border-zinc-700 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/20">
              <option value="open">Deschis</option>
              <option value="in_progress">In lucru</option>
              <option value="resolved">Rezolvat</option>
              <option value="closed">Inchis</option>
            </select>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); } }}
            placeholder="Scrie un raspuns... (Ctrl+Enter pentru trimitere)"
            rows={3}
            className="flex-1 px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button onClick={handleSend} disabled={sending || !reply.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
