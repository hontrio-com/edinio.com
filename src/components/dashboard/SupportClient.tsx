"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, LifeBuoy, ChevronRight, Clock, CheckCircle2, XCircle,
  Loader2, Paperclip, X, AlertCircle, FileText, Phone, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
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

interface Business {
  id: string;
  business_name: string;
  store_name: string | null;
}

const STATUS_CONFIG = {
  open: { label: "Deschis", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "In lucru", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  resolved: { label: "Rezolvat", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "Inchis", color: "bg-muted text-muted-foreground" },
} as const;

const PRIORITY_CONFIG = {
  low: { label: "Scazuta", dot: "bg-zinc-400" },
  normal: { label: "Normala", dot: "bg-blue-500" },
  high: { label: "Mare", dot: "bg-orange-500" },
  urgent: { label: "Urgenta", dot: "bg-red-500" },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Tehnic",
  billing: "Facturare",
  feature: "Cerere functionalitate",
  other: "Altele",
};

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "acum";
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `acum ${d}z`;
  return new Date(dateStr).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "application/zip"];

export function SupportClient({ tickets, businesses, userEmail }: {
  tickets: Ticket[];
  businesses: Business[];
  userEmail: string;
}) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("technical");
  const [priority, setPriority] = useState("normal");
  const [content, setContent] = useState("");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = tickets.filter((t) => t.status === "open").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
  const unread = tickets.filter((t) => t.has_unread_reply).length;

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error(`Tipul fisierului ${f.name} nu este permis`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`Fisierul ${f.name} depaseste 10MB`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !content.trim()) return;
    setSubmitting(true);
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

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          content: content.trim(),
          business_id: businessId || null,
          attachment_urls: uploadedUrls,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Eroare");
      }

      const { ticket } = await res.json() as { ticket: { id: string } };
      toast.success("Tichetul a fost creat cu succes");
      setShowDialog(false);
      resetForm();
      router.push(`/dashboard/suport/${ticket.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la crearea tichetului");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSubject("");
    setCategory("technical");
    setPriority("normal");
    setContent("");
    setBusinessId(businesses[0]?.id ?? "");
    setFiles([]);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-foreground">Suport</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deschide un tichet si echipa noastra te va ajuta
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Tichet nou
        </button>
      </div>

      {/* Urgent contact */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-800 mb-0.5">Ai nevoie de ajutor urgent?</p>
          <p className="text-xs text-blue-600">Pentru probleme urgente, contacteaza-ne direct prin telefon sau WhatsApp.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="tel:0750456809"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <Phone className="h-3.5 w-3.5" />
            0750 456 809
          </a>
          <a href="https://wa.me/40750456809" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Deschise", value: open, icon: AlertCircle, color: "text-blue-500" },
          { label: "In lucru", value: inProgress, icon: Loader2, color: "text-amber-500" },
          { label: "Rezolvate", value: resolved, icon: CheckCircle2, color: "text-green-500" },
          { label: "Raspunsuri noi", value: unread, icon: LifeBuoy, color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("h-4 w-4", color)} />
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
            </div>
            <p className="text-2xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Tickets list */}
      {tickets.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <LifeBuoy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Niciun tichet de suport</p>
          <p className="text-sm text-muted-foreground mb-4">
            Ai o problema sau o intrebare? Deschide un tichet si te ajutam.
          </p>
          <button
            onClick={() => setShowDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Deschide primul tichet
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const status = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;
            const priority = PRIORITY_CONFIG[ticket.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal;
            return (
              <button
                key={ticket.id}
                onClick={() => router.push(`/dashboard/suport/${ticket.id}`)}
                className="w-full flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-accent/30 transition-all text-left group"
              >
                {/* Unread dot */}
                <div className="flex-shrink-0 w-2">
                  {ticket.has_unread_reply && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-sm font-semibold text-foreground truncate",
                      ticket.has_unread_reply && "font-bold"
                    )}>
                      {ticket.subject}
                    </span>
                    {ticket.has_unread_reply && (
                      <span className="flex-shrink-0 text-[10px] font-semibold bg-primary text-white px-1.5 py-0.5 rounded-full">
                        Raspuns nou
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", status.color)}>
                      {status.label}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priority.dot)} />
                      {priority.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </span>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelative(ticket.updated_at)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
            {/* Dialog header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">Tichet nou de suport</h2>
              </div>
              <button
                onClick={() => { setShowDialog(false); resetForm(); }}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Dialog body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="p-5 space-y-4">
                {/* Business select */}
                {businesses.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Magazin</label>
                    <select
                      value={businessId}
                      onChange={(e) => setBusinessId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">Cont general</option>
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>{b.store_name ?? b.business_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Subiect <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Descrie pe scurt problema ta"
                    required
                    maxLength={150}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* Category + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Categorie</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="technical">Tehnic</option>
                      <option value="billing">Facturare</option>
                      <option value="feature">Cerere functionalitate</option>
                      <option value="other">Altele</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Prioritate</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="low">Scazuta</option>
                      <option value="normal">Normala</option>
                      <option value="high">Mare</option>
                      <option value="urgent">Urgenta</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Descriere <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Explica in detaliu problema intampinata, pasii pentru a o reproduce si orice alte informatii relevante..."
                    required
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Atasamente <span className="text-muted-foreground font-normal">(optional, max 5 fisiere, 10MB fiecare)</span>
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.pdf,.txt,.zip"
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                  {files.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center"
                    >
                      <Paperclip className="h-4 w-4" />
                      Adauga fisier
                    </button>
                  )}
                  {files.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {files.map((file, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-accent/50 rounded-lg">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground truncate flex-1">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info box */}
                <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                  <LifeBuoy className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    Echipa noastra de suport raspunde in maxim <strong>24h</strong>. Vei primi un email la <strong>{userEmail}</strong> cand avem un raspuns.
                  </p>
                </div>
              </div>

              {/* Dialog footer */}
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowDialog(false); resetForm(); }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Anuleaza
                </button>
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !content.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {submitting ? "Se trimite..." : "Trimite tichetul"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
