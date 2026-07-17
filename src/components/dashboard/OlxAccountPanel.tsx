"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wallet, Loader2, ChevronDown, Package, Megaphone, MessageSquare, ShoppingCart, Send,
} from "lucide-react";
import {
  getOlxAccountInfo, getOlxPackets, buyOlxCategoryPacket,
  getOlxPaidFeatures, buyOlxPaidFeature, getOlxThreads,
  getOlxThreadMessages, replyOlxThread,
  type OlxAdvertRow, type OlxAccountInfo,
} from "@/lib/actions/olx.actions";
import type { OlxBoughtPacket, OlxMessage, OlxPacket, OlxPaidFeature, OlxPaymentMethod, OlxThread } from "@/lib/olx/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/lib/ui";

function money(value: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(value) || 0;
  return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ${currency || "RON"}`;
}

export function OlxAccountPanel({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<OlxAccountInfo | null>(null);
  const [packets, setPackets] = useState<{ available: OlxPacket[]; bought: OlxBoughtPacket[] } | null>(null);
  const [features, setFeatures] = useState<OlxPaidFeature[] | null>(null);
  const [threads, setThreads] = useState<OlxThread[] | null>(null);

  async function loadAll() {
    setLoading(true);
    const [acc, pk, ft, th] = await Promise.all([
      getOlxAccountInfo(businessId), getOlxPackets(businessId), getOlxPaidFeatures(businessId), getOlxThreads(businessId),
    ]);
    if (!("error" in acc)) setAccount(acc);
    if (!("error" in pk)) setPackets(pk);
    if (!("error" in ft)) setFeatures(ft.features);
    if (!("error" in th)) setThreads(th.threads);
    if ("error" in acc) toast.error(acc.error);
    setLoading(false);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && account === null && !loading) void loadAll();
  }

  const methods = account?.paymentMethods ?? [];
  const activeAdverts = adverts.filter((a) => a.olx_advert_id && ["active", "limited"].includes(a.status));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left">
        <span className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Cont OLX: sold, pachete și promovări</span>
        </span>
        <span className="flex items-center gap-2">
          {account?.balance && <span className="text-sm font-semibold tabular-nums text-foreground">{money(account.balance.sum, account.balance.currency)}</span>}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Balance */}
              {account?.balance ? (
                <div className="grid grid-cols-3 gap-3">
                  <BalanceTile label="Sold total" value={money(account.balance.sum, account.balance.currency)} strong />
                  <BalanceTile label="Portofel" value={money(account.balance.wallet, account.balance.currency)} />
                  <BalanceTile label="Bonus" value={money(account.balance.bonus, account.balance.currency)} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nu am putut încărca soldul contului OLX.</p>
              )}
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Plățile se fac din creditul contului tău OLX. Alimentarea portofelului cu cardul se face pe olx.ro (nu prin API);
                cumpărarea pachetelor și a promovărilor de mai jos se face direct de aici.
                {methods.includes("postpaid") && " Ai activată și plata pe factură (postpaid)."}
              </p>

              {/* Bought packets */}
              {packets && packets.bought.length > 0 && (
                <div>
                  <SectionLabel icon={Package}>Pachete active</SectionLabel>
                  <div className="space-y-1.5">
                    {packets.bought.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">{p.name ?? `Pachet ${p.size ?? ""}`}{p.categories_labels?.length ? ` · ${p.categories_labels.join(", ")}` : ""}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{p.left != null ? `${p.left} rămase` : ""}{p.active_to ? ` · până ${p.active_to.slice(0, 10)}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buy category packet */}
              <BuyPacket businessId={businessId} packets={packets?.available ?? []} methods={methods} />

              {/* Promote advert */}
              <PromoteAdvert businessId={businessId} adverts={activeAdverts} features={features ?? []} methods={methods} />

              {/* Inbox */}
              <Inbox businessId={businessId} threads={threads ?? []} adverts={adverts} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BuyPacket({ businessId, packets, methods }: { businessId: string; packets: OlxPacket[]; methods: OlxPaymentMethod[] }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [selected, setSelected] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(methods[0] ?? "account");

  if (packets.length === 0) return null;
  // Group by a stable key of category+size+type.
  const options = packets.map((p, i) => ({ key: `${p.category_id}:${p.size}:${p.type ?? "base"}:${i}`, p }));
  const chosen = options.find((o) => o.key === selected)?.p;

  return (
    <div>
      <SectionLabel icon={ShoppingCart}>Cumpără pachet de anunțuri</SectionLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label="Pachet" value={selected} onChange={(e) => setSelected(e.target.value)} className={cn(selectCls, "flex-1")}>
          <option value="">— alege pachet —</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {(o.p.name ?? `${o.p.size} anunțuri`)}{o.p.price != null ? ` — ${o.p.price} RON` : ""}
            </option>
          ))}
        </select>
        {methods.length > 1 && (
          <select aria-label="Metodă de plată" value={method} onChange={(e) => setMethod(e.target.value as OlxPaymentMethod)} className={selectCls}>
            {methods.map((m) => <option key={m} value={m}>{m === "account" ? "Din credit" : "Pe factură"}</option>)}
          </select>
        )}
        <Button
          disabled={saving || !chosen}
          onClick={() => chosen && startSave(async () => {
            const res = await buyOlxCategoryPacket(businessId, chosen.category_id, chosen.size, method, (chosen.type as "base" | "mega") ?? "base");
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Pachet cumpărat.");
            router.refresh();
          })}>
          {saving ? <Loader2 className="animate-spin" /> : "Cumpără"}
        </Button>
      </div>
    </div>
  );
}

function PromoteAdvert({ businessId, adverts, features, methods }: {
  businessId: string; adverts: OlxAdvertRow[]; features: OlxPaidFeature[]; methods: OlxPaymentMethod[];
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [advertId, setAdvertId] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(methods[0] ?? "account");

  if (adverts.length === 0 || features.length === 0) return null;

  return (
    <div>
      <SectionLabel icon={Megaphone}>Promovează un anunț</SectionLabel>
      <div className="flex flex-col gap-2">
        <select aria-label="Anunț" value={advertId} onChange={(e) => setAdvertId(e.target.value)} className={selectCls}>
          <option value="">— alege anunțul —</option>
          {adverts.map((a) => <option key={a.offer_id} value={String(a.olx_advert_id)}>{a.name}</option>)}
        </select>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Promovare" value={code} onChange={(e) => setCode(e.target.value)} className={cn(selectCls, "flex-1")}>
            <option value="">— alege promovarea —</option>
            {features.map((f) => <option key={f.code} value={f.code}>{f.name ?? f.code}{f.duration ? ` (${f.duration} zile)` : ""}</option>)}
          </select>
          {methods.length > 1 && (
            <select aria-label="Metodă de plată" value={method} onChange={(e) => setMethod(e.target.value as OlxPaymentMethod)} className={selectCls}>
              {methods.map((m) => <option key={m} value={m}>{m === "account" ? "Din credit" : "Pe factură"}</option>)}
            </select>
          )}
          <Button
            disabled={saving || !advertId || !code}
            onClick={() => startSave(async () => {
              const res = await buyOlxPaidFeature(businessId, Number(advertId), code, method);
              if ("error" in res) { toast.error(res.error); return; }
              toast.success("Promovare activată.");
              router.refresh();
            })}>
            {saving ? <Loader2 className="animate-spin" /> : "Promovează"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BalanceTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums text-foreground", strong ? "text-lg font-bold" : "text-sm font-semibold")}>{value}</p>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {children}
    </p>
  );
}

function Inbox({ businessId, threads, adverts }: { businessId: string; threads: OlxThread[]; adverts: OlxAdvertRow[] }) {
  // Map an OLX advert id back to the product name for a friendly thread title.
  const advertName = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of adverts) if (a.olx_advert_id) m.set(a.olx_advert_id, a.name);
    return m;
  }, [adverts]);

  return (
    <div>
      <SectionLabel icon={MessageSquare}>Mesaje de la cumpărători</SectionLabel>
      {threads.length > 0 ? (
        <div className="space-y-1.5">
          {threads.map((t) => (
            <InboxThread key={t.id} businessId={businessId} thread={t} advertName={t.advert_id ? advertName.get(t.advert_id) : undefined} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nicio conversație încă.</p>
      )}
    </div>
  );
}

function InboxThread({ businessId, thread, advertName }: { businessId: string; thread: OlxThread; advertName?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<OlxMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, startSend] = useTransition();
  const [unread, setUnread] = useState(thread.unread_count ?? 0);

  async function load() {
    setLoading(true);
    const res = await getOlxThreadMessages(businessId, thread.id);
    setLoading(false);
    if ("error" in res) { toast.error(res.error); setMessages([]); return; }
    setMessages(res.messages);
    setUnread(0);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && messages === null && !loading) void load();
  }

  function send() {
    const text = reply.trim();
    if (!text) return;
    startSend(async () => {
      const res = await replyOlxThread(businessId, thread.id, text);
      if ("error" in res) { toast.error(res.error); return; }
      setReply("");
      toast.success("Mesaj trimis.");
      void load();
    });
  }

  const title = advertName ?? (thread.advert_id ? `Anunț ${thread.advert_id}` : `Conversație #${thread.id}`);

  return (
    <div className="rounded-xl border border-border">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="min-w-0 truncate text-sm text-foreground">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {unread > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{unread} noi</span>}
          {thread.total_count ?? 0} mesaje
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : messages && messages.length > 0 ? (
            <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.type === "sent" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.type === "sent" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    <span className="whitespace-pre-wrap break-words">{m.text}</span>
                    {m.created_at && <span className="mt-0.5 block text-[10px] opacity-70">{m.created_at.slice(0, 16)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-center text-xs text-muted-foreground">Niciun mesaj în această conversație.</p>
          )}
          <div className="flex gap-2">
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Scrie un răspuns..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button size="sm" onClick={send} disabled={sending || !reply.trim()} aria-label="Trimite">
              {sending ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
