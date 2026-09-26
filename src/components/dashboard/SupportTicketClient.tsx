"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Download, FileText, ImageIcon, LifeBuoy, Loader2, Paperclip,
  Plus, Reply, RotateCcw, Send, X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import {
  DESPRE_STARE, numarulTichetului, numeleCategoriei, numelePrioritatii, stareaTichetului,
} from "@/lib/support/tichete";
import { ACCEPT, CATE_FISIERE, ICONITA_CATEGORIEI, adaugaFisiere, incarcaFisiere, marimeaFisierului } from "./suport/atasamente";

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

const ora = (d: string) => new Date(d).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
const ziua = (d: string) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
const dataScurta = (d: string) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });

function esteImagine(url: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(url);
}

function Atasament({ a }: { a: { url: string; name: string } }) {
  if (esteImagine(a.url)) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <Image src={a.url} alt={a.name} width={320} height={200} className="h-32 w-auto max-w-full object-cover transition-opacity hover:opacity-90" />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      download={a.name}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-xs items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{a.name}</span>
      <Download className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════════════
  UN TICHET                                                       (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CONVERSATIA SE CITESTE CA UN FIR, nu ca un chat. Bulele din stanga si din
  dreapta taiau textele lungi (un pas cu pas de la suport, o eroare copiata) in
  coloane de 75%, iar pe telefon ramanea un sfert din ecran pe rand. Acum
  fiecare mesaj are toata latimea, cu cine l-a scris deasupra.

  ⚠ Starea se socoteste AICI, din mesajele de pe ecran, cu aceeasi regula ca
  in lista (`stareaTichetului`). Venita de pe server, n-ar fi aflat de un
  raspuns sosit in timp ce pagina e deschisa.
*/
export function SupportTicketClient({ ticket: initialTicket, numeMagazin, initialMessages }: {
  ticket: Ticket;
  numeMagazin: string | null;
  initialMessages: Message[];
}) {
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tras, setTras] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Marcat ca citit la deschidere, daca avea un raspuns necitit.
  useEffect(() => {
    if (initialTicket.has_unread_reply) {
      fetch(`/api/support/tickets/${initialTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ has_unread_reply: false }),
      }).catch(() => {});
    }
  }, [initialTicket.id, initialTicket.has_unread_reply]);

  // Mesajele si starea noi, pe loc.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          if (newMsg.sender_type === "agent") {
            setTicket((prev) => ({ ...prev, has_unread_reply: false, status: prev.status === "open" ? "in_progress" : prev.status }));
            toast.success("Echipa Edinio ți-a răspuns");
            fetch(`/api/support/tickets/${ticket.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ has_unread_reply: false }),
            }).catch(() => {});
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticket.id}` },
        (payload) => setTicket((prev) => ({ ...prev, ...(payload.new as Partial<Ticket>) })),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const t = textareaRef.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = `${Math.min(t.scrollHeight, 220)}px`;
    }
  }, [reply]);

  const handleSend = useCallback(async () => {
    if (!reply.trim() || ticket.status === "closed" || sending) return;
    setSending(true);
    try {
      const adrese = await incarcaFisiere(files);
      const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim(), attachment_urls: adrese }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: Message };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Mesajul nu a plecat. Încearcă din nou.");
      const message = data.message;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setReply("");
      setFiles([]);
      // Baza redeschide singura un tichet rezolvat cand scrii (`handle_support_message_insert`).
      if (ticket.status === "resolved") setTicket((prev) => ({ ...prev, status: "open" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mesajul nu a plecat. Încearcă din nou.");
    } finally {
      setSending(false);
    }
  }, [reply, files, ticket.id, ticket.status, sending]);

  async function updateStatus(status: "resolved" | "open") {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setTicket((prev) => ({ ...prev, status }));
      toast.success(status === "resolved" ? "Tichetul e marcat ca rezolvat" : "Tichetul e redeschis");
    } catch {
      toast.error("Starea tichetului nu s-a putut schimba. Încearcă din nou.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const ultimul = messages.at(-1);
  const stare = stareaTichetului({
    status: ticket.status,
    ultimulMesajDe: ultimul ? (ultimul.sender_type === "agent" ? "agent" : "user") : null,
  });
  const despre = DESPRE_STARE[stare];
  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";
  const IconCategorie = ICONITA_CATEGORIEI[ticket.category] ?? LifeBuoy;

  return (
    <>
      <Link
        href="/dashboard/suport"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Toate tichetele
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-snug text-foreground">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <EtichetaStare ton={despre.ton} marime="mic" title={despre.explicatie}>{despre.text}</EtichetaStare>
            <span className="inline-flex items-center gap-1.5">
              <IconCategorie className="h-3.5 w-3.5" strokeWidth={1.75} />
              {numeleCategoriei(ticket.category)}
            </span>
            <span className="font-mono">{numarulTichetului(ticket.id)}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
          {!isClosed && !isResolved && (
            <Button variant="outline" onClick={() => updateStatus("resolved")} disabled={updatingStatus}>
              {updatingStatus ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Marchează rezolvat
            </Button>
          )}
          {isResolved && (
            <Button variant="outline" onClick={() => updateStatus("open")} disabled={updatingStatus}>
              {updatingStatus ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Redeschide
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Conversatia */}
        <div className="min-w-0">
          <ol className="space-y-3">
            {messages.map((m, i) => {
              const eEchipa = m.sender_type === "agent";
              const atasamente = Array.isArray(m.attachments) ? m.attachments : [];
              const ziNoua = i === 0 || ziua(messages[i - 1].created_at) !== ziua(m.created_at);
              return (
                <Fragment key={m.id}>
                  {ziNoua && (
                    <li aria-hidden className="flex items-center gap-3 py-1">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[11px] font-medium text-muted-foreground">{ziua(m.created_at)}</span>
                      <span className="h-px flex-1 bg-border" />
                    </li>
                  )}
                  <li
                    className={cn(
                      "rounded-xl p-4 ring-1 sm:p-5",
                      eEchipa ? "bg-card ring-foreground/10" : "bg-muted/40 ring-transparent",
                    )}
                  >
                    <div className="mb-2.5 flex items-center gap-2.5">
                      {eEchipa ? (
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-background ring-1 ring-foreground/10">
                          <Image src="/logo.png" alt="" width={18} height={18} className="object-contain" />
                        </span>
                      ) : (
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                          Tu
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground">{eEchipa ? "Echipa Edinio" : "Tu"}</span>
                      <span className="text-xs text-muted-foreground">{ora(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{m.content}</p>
                    {atasamente.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {atasamente.map((a, j) => <Atasament key={j} a={a} />)}
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}

            {(isResolved || isClosed) && (
              <li className="flex items-center gap-3 py-2">
                <span className="h-px flex-1 bg-border" />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isResolved ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5" />}
                  {isResolved ? "Tichet marcat ca rezolvat" : "Tichet închis"}
                </span>
                <span className="h-px flex-1 bg-border" />
              </li>
            )}
          </ol>
          <div ref={bottomRef} />

          {/* Raspunsul */}
          {isClosed ? (
            <div className="mt-5 rounded-xl bg-card p-5 text-center ring-1 ring-foreground/10">
              <p className="text-sm text-muted-foreground">
                Tichetul e închis. Dacă ai nevoie de ajutor cu altceva, deschide unul nou.
              </p>
              <Link href="/dashboard/suport?nou=1" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
                <Plus />
                Tichet nou
              </Link>
            </div>
          ) : (
            <div className="sticky bottom-4 mt-5">
              {stare === "raspunsul_tau" && (
                <p className="mb-2 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-foreground">
                  <Reply className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
                  Echipa Edinio așteaptă răspunsul tău ca să meargă mai departe.
                </p>
              )}
              <div
                onDragOver={(e) => { e.preventDefault(); setTras(true); }}
                onDragLeave={() => setTras(false)}
                onDrop={(e) => { e.preventDefault(); setTras(false); setFiles((f) => adaugaFisiere(f, e.dataTransfer.files)); }}
                className={cn(
                  "rounded-xl bg-card shadow-[0_18px_32px_-24px_rgba(15,23,20,0.25)] ring-1 transition-colors",
                  tras ? "ring-2 ring-primary" : "ring-foreground/10 focus-within:ring-foreground/25",
                )}
              >
                <textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={isResolved ? "Scrie un mesaj și tichetul se redeschide…" : "Scrie răspunsul tău…"}
                  aria-label="Răspunsul tău"
                  rows={2}
                  className="block w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                />

                {files.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 px-3 pt-2">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-xs">
                        {f.type.startsWith("image/")
                          ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <span className="tabular-nums text-muted-foreground">{marimeaFisierului(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                          aria-label={`Scoate ${f.name}`}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between gap-2 px-2.5 py-2.5">
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => { setFiles((f) => adaugaFisiere(f, e.target.files)); e.target.value = ""; }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={files.length >= CATE_FISIERE}
                    className="text-muted-foreground"
                  >
                    <Paperclip />
                    <span className="hidden sm:inline">Atașează</span>
                  </Button>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter</span>
                    <Button type="button" size="sm" onClick={() => void handleSend()} disabled={sending || !reply.trim()}>
                      {sending ? <Loader2 className="animate-spin" /> : <Send />}
                      Trimite
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detaliile */}
        <aside className="hidden lg:block">
          <dl className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-foreground/10 lg:sticky lg:top-6">
            <Rand eticheta="Stare"><span title={despre.explicatie}>{despre.text}</span></Rand>
            <Rand eticheta="Categorie">{numeleCategoriei(ticket.category)}</Rand>
            <Rand eticheta="Prioritate">{numelePrioritatii(ticket.priority)}</Rand>
            {numeMagazin && <Rand eticheta="Magazin">{numeMagazin}</Rand>}
            <Rand eticheta="Deschis">{dataScurta(ticket.created_at)}</Rand>
            <Rand eticheta="Mesaje">{messages.length}</Rand>
          </dl>
        </aside>
      </div>
    </>
  );
}

function Rand({ eticheta, children }: { eticheta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{eticheta}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-foreground">{children}</dd>
    </div>
  );
}
