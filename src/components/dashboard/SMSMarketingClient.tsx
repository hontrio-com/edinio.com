"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  MessageSquare, Users, Send, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle, XCircle, Filter,
  Calendar, MapPin, Banknote, RefreshCw,
} from "lucide-react";
import { previewSmsRecipients, sendSmsCampaign } from "@/lib/actions/sms.actions";
import type { SmsoConfig } from "@/lib/smso";
import type { SmsFilters } from "@/lib/actions/sms.actions";
import { formatDate } from "@/lib/utils/format";

const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

const ORDER_STATUSES = [
  { value: "pending",    label: "In asteptare" },
  { value: "confirmed",  label: "Confirmata" },
  { value: "processing", label: "In procesare" },
  { value: "shipped",    label: "Expediata" },
  { value: "delivered",  label: "Livrata" },
  { value: "cancelled",  label: "Anulata" },
];

const SMS_MAX_CHARS = 160;

type Campaign = {
  id: string;
  message: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sent" | "partial" | "failed";
  created_at: string;
};

interface Props {
  businessId: string;
  smsoConfig: SmsoConfig;
  initialCampaigns: Campaign[];
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: Campaign["status"] }) {
  if (status === "sent")    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" />Trimis</span>;
  if (status === "partial") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><AlertCircle className="h-3 w-3" />Partial</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Esuat</span>;
}

export function SMSMarketingClient({ businessId, smsoConfig, initialCampaigns }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);

  // Filters state
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<SmsFilters>({});
  const [countiesOpen, setCountiesOpen] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<{ uniqueCount: number; totalCount: number; duplicatesRemoved: number } | null>(null);
  const [previewing, startPreviewTransition] = useTransition();

  // Message state
  const [message, setMessage] = useState("");
  const charCount = message.length;
  const smsCount = charCount === 0 ? 1 : Math.ceil(charCount / SMS_MAX_CHARS);

  // Send state
  const [sending, startSendTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Credit (fetched client-side)
  const [credit, setCredit] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  async function fetchCredit() {
    setCreditLoading(true);
    try {
      const res = await fetch(`/api/sms/credit?businessId=${businessId}`);
      const data = await res.json() as { credit?: number; error?: string };
      if (data.credit !== undefined) setCredit(data.credit);
      else toast.error(data.error ?? "Nu am putut obtine creditul.");
    } catch {
      toast.error("Eroare la obtinerea creditului.");
    } finally {
      setCreditLoading(false);
    }
  }

  function handlePreview() {
    startPreviewTransition(async () => {
      const result = await previewSmsRecipients(businessId, filters);
      if ("error" in result) { toast.error(result.error); return; }
      setPreview(result);
    });
  }

  function handleSend() {
    if (!message.trim()) { toast.error("Mesajul nu poate fi gol."); return; }
    if (!preview || preview.uniqueCount === 0) { toast.error("Nu exista destinatari. Fa preview mai intai."); return; }
    setConfirmOpen(true);
  }

  function confirmSend() {
    setConfirmOpen(false);
    startSendTransition(async () => {
      const result = await sendSmsCampaign(businessId, message, filters);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success(`Campanie trimisa: ${result.sent} SMS-uri trimise${result.failed > 0 ? `, ${result.failed} esuate` : ""}.`);
      setMessage("");
      setPreview(null);
      // Refresh campaigns list
      setCampaigns(prev => [{
        id: result.campaignId,
        message,
        recipient_count: (preview?.uniqueCount ?? 0),
        sent_count: result.sent,
        failed_count: result.failed,
        status: result.failed === 0 ? "sent" : result.sent === 0 ? "failed" : "partial",
        created_at: new Date().toISOString(),
      }, ...prev]);
    });
  }

  const selectedCounties = filters.counties ?? [];

  function toggleCounty(county: string) {
    setFilters(f => {
      const current = f.counties ?? [];
      const next = current.includes(county) ? current.filter(c => c !== county) : [...current, county];
      return { ...f, counties: next.length > 0 ? next : undefined };
    });
    setPreview(null);
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">SMS Marketing</h1>
          <p className="text-sm text-muted-foreground mt-1">Trimite campanii SMS catre clientii tai</p>
        </div>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-4 py-2.5">
          <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Credit SMSO</p>
            {credit !== null
              ? <p className="text-sm font-bold text-foreground">{credit.toFixed(2)} lei</p>
              : <button type="button" onClick={fetchCredit} disabled={creditLoading} className="text-xs text-primary hover:underline flex items-center gap-1">
                  {creditLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {creditLoading ? "..." : "Vezi creditul"}
                </button>
            }
          </div>
        </div>
      </div>

      {/* Filters card */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Filtreaza destinatarii</p>
            {Object.keys(filters).filter(k => {
              const v = filters[k as keyof SmsFilters];
              return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
            }).length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-white rounded-full">
                {Object.keys(filters).filter(k => {
                  const v = filters[k as keyof SmsFilters];
                  return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
                }).length} filtre active
              </span>
            )}
          </div>
          {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {filtersOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-border">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Comenzi de la
                </label>
                <input
                  type="date"
                  value={filters.date_from ?? ""}
                  onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value || undefined })); setPreview(null); }}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Pana la
                </label>
                <input
                  type="date"
                  value={filters.date_to ?? ""}
                  onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value || undefined })); setPreview(null); }}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Min amount */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <Banknote className="h-3.5 w-3.5" /> Suma minima comanda (lei)
              </label>
              <input
                type="number"
                min="0"
                value={filters.min_amount ?? ""}
                onChange={e => { setFilters(f => ({ ...f, min_amount: e.target.value ? Number(e.target.value) : undefined })); setPreview(null); }}
                placeholder="ex: 100"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Order statuses */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Status comanda</label>
              <div className="flex flex-wrap gap-2">
                {ORDER_STATUSES.map(s => {
                  const active = (filters.order_statuses ?? []).includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        setFilters(f => {
                          const cur = f.order_statuses ?? [];
                          const next = active ? cur.filter(v => v !== s.value) : [...cur, s.value];
                          return { ...f, order_statuses: next.length > 0 ? next : undefined };
                        });
                        setPreview(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${active ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40 bg-background"}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Counties */}
            <div>
              <button
                type="button"
                onClick={() => setCountiesOpen(o => !o)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors"
              >
                <MapPin className="h-3.5 w-3.5" />
                Judete
                {selectedCounties.length > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded">{selectedCounties.length} selectate</span>}
                {countiesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {countiesOpen && (
                <div className="border border-border rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
                  {JUDETE.map(j => {
                    const active = selectedCounties.includes(j);
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => toggleCounty(j)}
                        className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${active ? "bg-primary text-white border-primary" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                      >
                        {j}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reset + Preview */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setFilters({}); setPreview(null); setCountiesOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reseteaza filtrele
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewing}
                className="flex items-center gap-2 ml-auto px-4 py-2 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50"
              >
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                {previewing ? "Se calculeaza..." : "Preview destinatari"}
              </button>
            </div>

            {/* Preview result */}
            {preview && (
              <div className={`rounded-xl p-4 border ${preview.uniqueCount > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                {preview.uniqueCount > 0 ? (
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{preview.uniqueCount} clienti unici</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {preview.totalCount} comenzi totale
                        {preview.duplicatesRemoved > 0 && ` — ${preview.duplicatesRemoved} duplicate eliminate`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">Niciun client gasit pentru filtrele selectate.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message composer */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Compune mesajul</p>
          <div className="text-right">
            <span className={`text-xs font-mono font-semibold ${charCount > SMS_MAX_CHARS ? "text-amber-600" : "text-muted-foreground"}`}>
              {charCount}/{SMS_MAX_CHARS}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {smsCount} SMS/destinatar
            </span>
          </div>
        </div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="Scrie mesajul campaniei tale SMS. Caracterele speciale (ș, ț, ă, â, î) vor fi convertite automat la trimitere."
          className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-colors"
        />
        {charCount > SMS_MAX_CHARS && (
          <p className="text-xs text-amber-600">
            Mesajul depaseste 160 de caractere. Va fi trimis ca {smsCount} SMS-uri per destinatar, ceea ce va creste costul campaniei.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Caracterele speciale romanesti (ș, ț, ă, â, î) sunt inlocuite automat cu echivalentele lor ASCII la trimitere, pastrand mesajul in 1 SMS la 160 caractere.
        </p>
      </div>

      {/* Send button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !message.trim() || !preview || preview.uniqueCount === 0}
        className="w-full flex items-center justify-center gap-3 py-3.5 text-sm font-bold text-white rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {sending
          ? "Se trimite campania..."
          : preview && preview.uniqueCount > 0
            ? `Trimite la ${preview.uniqueCount} clienti`
            : "Trimite campania"}
      </button>

      {/* Confirmation dialog */}
      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground">Confirma trimiterea</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Vei trimite <strong>{preview.uniqueCount} SMS-uri</strong> ({smsCount} SMS/destinatar). Aceasta actiune nu poate fi anulata.
              </p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground italic leading-relaxed border border-border">
              &ldquo;{message.slice(0, 120)}{message.length > 120 ? "..." : ""}&rdquo;
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Anuleaza
              </button>
              <button
                type="button"
                onClick={confirmSend}
                className="flex-1 py-2.5 text-sm font-bold text-white rounded-lg bg-primary hover:bg-primary/90 transition-colors"
              >
                Trimite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign history */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Istoric campanii</p>
        </div>
        {campaigns.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nicio campanie trimisa inca.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map(c => (
              <div key={c.id} className="px-5 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground line-clamp-2 flex-1">{c.message}</p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.recipient_count} destinatari</span>
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{c.sent_count} trimise</span>
                  {c.failed_count > 0 && <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" />{c.failed_count} esuate</span>}
                  <span>{formatDate(c.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
