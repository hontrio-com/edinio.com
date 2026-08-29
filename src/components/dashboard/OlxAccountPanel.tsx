"use client";

import { useState, useTransition } from "react";
import {
  cePachetCategorie, cePromovare, incheieIntentia, intentiaPentru,
} from "@/lib/olx/intentie-de-cumparare";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wallet, Loader2, ChevronDown, Package, Megaphone, ShoppingCart,
} from "lucide-react";
import {
  getOlxAccountInfo, getOlxPackets, buyOlxCategoryPacket,
  getOlxPaidFeatures, buyOlxPaidFeature,
  type OlxAdvertRow, type OlxAccountInfo, type OlxPacketGroup, type OlxPacketsResult,
} from "@/lib/actions/olx.actions";
import type { OlxPaidFeature, OlxPaymentMethod } from "@/lib/olx/types";
import { OlxCont } from "./OlxCont";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/lib/ui";

/**
 * Intrebarea de dinaintea unei plati.
 *
 * ═══ TREI BUTOANE CU BANI, TREI PURTARI (02.09.2026) ═══
 *
 *   „Promovează"          — fara pret, fara confirmare
 *   „Cumpără" (pachet)    — pret in eticheta, fara confirmare
 *   „Cumpără pachet" (rand) — confirmare, dar fara suma
 *
 * ⚠ Nici macar cel cu confirmare nu spunea CAT. Iar plata nu se poate lua inapoi din Edinio: ce
 * pleaca din creditul lui OLX se intoarce doar prin ei.
 *
 * ⚠ SI CAND NU STIM PRETUL, SE SPUNE ASTA. `OlxPaidFeature` n-are camp de pret in raspunsul lor,
 * deci pentru promovari nu putem pune o suma. O suma inventata ar fi mai rea decat lipsa ei; un
 * „nu stiu cat" il face pe om sa se uite la sold inainte, ceea ce si trebuie.
 */
function confirmaPlata(ce: string, cat: string | null): boolean {
  return window.confirm(
    `${ce}\n\n${cat ? `Se plătește ${cat} din creditul contului tău OLX.` : "Se plătește din creditul contului tău OLX; suma o stabilește OLX și nu ne-o spune dinainte."}`
    + "\n\nPlata nu se poate anula din Edinio.",
  );
}

function money(value: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(value) || 0;
  return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ${currency || "RON"}`;
}

export function OlxAccountPanel({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<OlxAccountInfo | null>(null);
  const [packets, setPackets] = useState<OlxPacketsResult | null>(null);
  const [features, setFeatures] = useState<OlxPaidFeature[] | null>(null);

  /*
    ⚠ O CITIRE PICATĂ NU E UN „N-AI NIMIC" (02.09.2026)

    Se arăta doar eroarea de la sold. Dacă pica lista de pachete, ecranul scria „Nu sunt pachete
    disponibile pentru categoriile tale în acest moment" — o afirmație despre contul lui OLX, pe o
    citire care n-a reușit. Iar dacă pica lista de promovări, secțiunea de promovare DISPĂREA fără
    un cuvânt.

    ⚠ Amândouă sunt același zero care liniștește: omul pleacă convins că OLX nu-i oferă nimic, când
    de fapt noi n-am putut întreba.
  */
  const [erori, setErori] = useState<{ sold?: string; pachete?: string; promovari?: string }>({});

  async function loadAll() {
    setLoading(true);
    const [acc, pk, ft] = await Promise.all([
      getOlxAccountInfo(businessId), getOlxPackets(businessId), getOlxPaidFeatures(businessId),
    ]);
    const rele: { sold?: string; pachete?: string; promovari?: string } = {};
    if ("error" in acc) rele.sold = acc.error; else setAccount(acc);
    if ("error" in pk) rele.pachete = pk.error; else setPackets(pk);
    if ("error" in ft) rele.promovari = ft.error; else setFeatures(ft.features);
    setErori(rele);
    if (rele.sold) toast.error(rele.sold);
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
              <BuyPacket
                businessId={businessId}
                groups={packets?.groups ?? []}
                hasMappedCategories={packets?.hasMappedCategories ?? false}
                eroare={erori.pachete}
                moneda={account?.balance?.currency ?? null}
                methods={methods}
                defaultMethod={packets?.paymentMethod ?? "account"}
              />

              {/* Promote advert */}
              <PromoteAdvert businessId={businessId} adverts={activeAdverts} features={features ?? []} methods={methods} eroare={erori.promovari} />

              {/* Facturare, profil de firma si promovarile pe care anuntul le are deja */}
              <OlxCont businessId={businessId} adverts={activeAdverts} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BuyPacket({ businessId, groups, hasMappedCategories, methods, defaultMethod, eroare, moneda }: {
  businessId: string; groups: OlxPacketGroup[]; hasMappedCategories: boolean; methods: OlxPaymentMethod[];
  defaultMethod: OlxPaymentMethod;
  /** Lista n-a putut fi citita. Se spune, in loc sa se arate un gol linistitor. */
  eroare?: string;
  /** Moneda soldului, ca pretul din confirmare sa fie in ce plateste el. */
  moneda?: string | null;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [categoryId, setCategoryId] = useState<number | undefined>(groups[0]?.categoryId);
  const [selected, setSelected] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(defaultMethod);

  const group = groups.find((g) => g.categoryId === categoryId) ?? groups[0];
  const options = (group?.packets ?? []).map((p, i) => ({ key: `${p.size}:${p.type ?? "base"}:${i}`, p }));
  const chosen = options.find((o) => o.key === selected)?.p;

  return (
    <div>
      <SectionLabel icon={ShoppingCart}>Cumpără pachet de anunțuri</SectionLabel>
      {eroare ? (
        /* ⚠ „N-am putut citi" nu se scrie ca „nu există". Vezi nota de la `loadAll`. */
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Nu am putut citi pachetele de la OLX: {eroare} Lista de mai jos e goală fiindcă n-am putut
          întreba, nu fiindcă OLX nu are ce să-ți ofere.
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {hasMappedCategories
            ? "Nu sunt pachete disponibile pentru categoriile tale în acest moment."
            : "Mapează întâi o categorie la OLX ca să vezi pachetele de anunțuri (pachetele sunt per categorie)."}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.length > 1 && (
            <select aria-label="Categorie" value={String(categoryId ?? "")}
              onChange={(e) => { setCategoryId(Number(e.target.value)); setSelected(""); }} className={selectCls}>
              {groups.map((g) => <option key={g.categoryId} value={g.categoryId}>{g.label}</option>)}
            </select>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label="Pachet" value={selected} onChange={(e) => setSelected(e.target.value)} className={cn(selectCls, "flex-1")}>
              <option value="">— alege pachet —</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {(o.p.name ?? `${o.p.size} anunțuri`)}{o.p.price != null ? ` — ${o.p.price} RON` : ""}{o.p.is_premium ? " (premium)" : ""}
                </option>
              ))}
            </select>
            {methods.length > 1 && (
              <select aria-label="Metodă de plată" value={method} onChange={(e) => setMethod(e.target.value as OlxPaymentMethod)} className={selectCls}>
                {methods.map((m) => <option key={m} value={m}>{m === "account" ? "Din credit" : "Pe factură"}</option>)}
              </select>
            )}
            <Button
              disabled={saving || !chosen || !group}
              onClick={() => {
                if (!chosen || !group) return;
                const pret = typeof chosen.price === "number" ? money(chosen.price, moneda) : null;
                if (!confirmaPlata(
                  `Cumperi un pachet de ${chosen.size} anunțuri în „${group.label}"?`,
                  pret,
                )) return;
                startSave(async () => {
                /*
                  ⚠ INTENȚIA, NU APĂSAREA. Id-ul trăiește în `localStorage` sub numele a ceea ce se
                  cumpără, deci supraviețuiește închiderii panoului, reîncărcării paginii și celei
                  de-a doua file. Ținut într-un `useRef`, ar fi murit odată cu componenta — iar
                  panoul e un acordeon, deci ar fi murit des, exact în clipele proaste.
                */
                const tip = (chosen.type as "base" | "mega") ?? "base";
                const ce = cePachetCategorie(group.categoryId, chosen.size, tip);
                const res = await buyOlxCategoryPacket(
                  businessId, group.categoryId, chosen.size, method, intentiaPentru(businessId, ce), tip);
                if ("error" in res) { toast.error(res.error); return; }
                /*
                  ⚠ SE ARUNCA INTENȚIA ȘI CÂND RĂSPUNSUL E „era deja făcută". Altfel intenția veche
                  ar rămâne în `localStorage`, iar omul care chiar vrea al doilea pachet ar primi „gata"
                  la nesfârșit fără să cumpere nimic — exact defectul de la care a pornit runda asta,
                  doar mutat din cheie în browser.
                */
                incheieIntentia(businessId, ce);
                if (res.nou) toast.success("Pachet cumpărat.");
                else toast.info("Cumpărarea asta era deja făcută; nu s-a plătit a doua oară. Apasă din nou dacă vrei încă un pachet.");
                router.refresh();
                });
              }}>
              {saving ? <Loader2 className="animate-spin" /> : "Cumpără"}
            </Button>
          </div>
          {chosen?.features && chosen.features.length > 0 && (
            <p className="text-xs text-muted-foreground">Include: {chosen.features.map((f) => f.label).filter(Boolean).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PromoteAdvert({ businessId, adverts, features, methods, eroare }: {
  businessId: string; adverts: OlxAdvertRow[]; features: OlxPaidFeature[]; methods: OlxPaymentMethod[];
  /** Lista n-a putut fi citita: se spune, nu se ascunde sectiunea. */
  eroare?: string;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [advertId, setAdvertId] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(methods[0] ?? "account");

  /*
    ⚠ SECȚIUNEA NU MAI DISPARE ÎN TĂCERE (02.09.2026). Când citirea pica, `PromoteAdvert` întorcea
    `null` — deci promovarea dispărea din ecran fără un cuvânt, iar omul rămânea cu impresia că OLX
    nu-i oferă nicio promovare. Un gol care liniștește exact când n-ar trebui.
  */
  if (eroare) {
    return (
      <div>
        <SectionLabel icon={Megaphone}>Promovează un anunț</SectionLabel>
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Nu am putut citi promovările de la OLX: {eroare}
        </p>
      </div>
    );
  }
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
            onClick={() => {
              const numeAnunt = adverts.find((a) => String(a.olx_advert_id) === advertId)?.name ?? "anunțul ales";
              const numeProm = features.find((f) => f.code === code)?.name ?? code;
              if (!confirmaPlata(`Cumperi promovarea „${numeProm}" pe „${numeAnunt}"?`, null)) return;
              startSave(async () => {
              const ce = cePromovare(Number(advertId), code);
              const res = await buyOlxPaidFeature(
                businessId, Number(advertId), code, method, intentiaPentru(businessId, ce));
              if ("error" in res) { toast.error(res.error); return; }
              incheieIntentia(businessId, ce);
              if (res.nou) toast.success("Promovare activată.");
              else toast.info("Promovarea asta era deja cumpărată; nu s-a plătit a doua oară.");
              router.refresh();
              });
            }}>
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
