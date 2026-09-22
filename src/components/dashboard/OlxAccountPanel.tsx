"use client";

import { useState, useTransition } from "react";
import {
  cePachetCategorie, cePromovare, incheieIntentia, intentiaPentru,
} from "@/lib/olx/intentie-de-cumparare";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Wallet, Loader2, ChevronDown, Package, Megaphone, ShoppingCart,
} from "lucide-react";
import {
  getOlxAccountInfo, getOlxPackets, buyOlxCategoryPacket, getOlxAnunturiVii,
  getOlxPaidFeatures, buyOlxPaidFeature,
  type OlxAnuntViu, type OlxAccountInfo, type OlxPacketGroup, type OlxPacketsResult,
} from "@/lib/actions/olx.actions";
import type { OlxPaidFeature, OlxPaymentMethod } from "@/lib/olx/types";
import { OlxCont } from "./OlxCont";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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

/**
 * ⚠ LISTA DE ANUNȚURI NU SE MAI ÎMPRUMUTĂ DE LA TABEL (22.09.2026)
 *
 * Panoul primea chiar rândurile tabelului de anunțuri. Cât timp acela aducea două sute deodată,
 * mergea; de când aduce o pagină de cincizeci, un anunț de pe pagina a doua n-ar mai fi fost de
 * găsit în „Promovează un anunț", iar omul ar fi crezut că nu se poate promova. O listă
 * împrumutată poartă filtrul vecinului, nu pe al tău.
 *
 * ⚠ Se cere O DATĂ, la deschiderea acordeonului, în aceeași așteptare cu soldul: panoul e închis
 * pe un ecran care are deja opt panouri, și n-are de ce să coste o citire pe cine nu-l deschide.
 */
export function OlxAccountPanel({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<OlxAccountInfo | null>(null);
  const [packets, setPackets] = useState<OlxPacketsResult | null>(null);
  const [features, setFeatures] = useState<OlxPaidFeature[] | null>(null);
  const [anunturi, setAnunturi] = useState<OlxAnuntViu[]>([]);

  /*
    ⚠ O CITIRE PICATĂ NU E UN „N-AI NIMIC" (02.09.2026)

    Se arăta doar eroarea de la sold. Dacă pica lista de pachete, ecranul scria „Nu sunt pachete
    disponibile pentru categoriile tale în acest moment" — o afirmație despre contul lui OLX, pe o
    citire care n-a reușit. Iar dacă pica lista de promovări, secțiunea de promovare DISPĂREA fără
    un cuvânt.

    ⚠ Amândouă sunt același zero care liniștește: omul pleacă convins că OLX nu-i oferă nimic, când
    de fapt noi n-am putut întreba.
  */
  const [erori, setErori] = useState<{ sold?: string; pachete?: string; promovari?: string; anunturi?: string }>({});

  async function loadAll() {
    setLoading(true);
    const [acc, pk, ft, an] = await Promise.all([
      getOlxAccountInfo(businessId), getOlxPackets(businessId), getOlxPaidFeatures(businessId),
      getOlxAnunturiVii(businessId),
    ]);
    const rele: { sold?: string; pachete?: string; promovari?: string; anunturi?: string } = {};
    if ("error" in acc) rele.sold = acc.error; else setAccount(acc);
    if ("error" in pk) rele.pachete = pk.error; else setPackets(pk);
    if ("error" in ft) rele.promovari = ft.error; else setFeatures(ft.features);
    /* ⚠ O citire picată nu se arată ca „n-ai niciun anunț de promovat": vezi nota de la `loadAll`. */
    if ("error" in an) rele.anunturi = an.error; else setAnunturi(an.anunturi);
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
  const activeAdverts = anunturi.filter((a) => ["active", "limited"].includes(a.status));

  return (
    <Panel className="overflow-hidden">
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
                /* ⚠ „N-am putut citi" nu se scrie ca „n-ai sold". Vezi nota de la `loadAll`. */
                <Callout variant="warning" icon={AlertTriangle}>
                  <span className="text-xs">Nu am putut încărca soldul contului OLX.</span>
                </Callout>
              )}
              <Callout variant="neutral">
                <span className="text-xs">
                  Plățile se fac din creditul contului tău OLX. Alimentarea portofelului cu cardul se face pe olx.ro (nu prin API);
                  cumpărarea pachetelor și a promovărilor de mai jos se face direct de aici.
                  {methods.includes("postpaid") && " Ai activată și plata pe factură (postpaid)."}
                </span>
              </Callout>

              {/* Bought packets */}
              {packets && packets.bought.length > 0 && (
                <div>
                  <SectionLabel icon={Package}>Pachete active</SectionLabel>
                  {/*
                    ⚠ O LISTĂ SCURTATĂ ARATĂ EXACT CA UNA COMPLETĂ. Paginația se oprea la prima
                    pagină picată și întorcea ce apucase — iar omul se uită aici tocmai ca să
                    hotărască dacă mai cumpără un pachet. Ștearsă pe jumătate, îl face să cumpere
                    ce are deja.
                  */}
                  {packets && !packets.boughtIntreg && (
                    <Callout variant="warning" icon={AlertTriangle} className="mb-2">
                      <span className="text-xs">Lista de mai jos poate fi incompletă: OLX n-a răspuns la toate paginile.</span>
                    </Callout>
                  )}
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
                onCumparat={loadAll}
                nereusite={packets?.nereusite ?? []}
                metodaGhicita={packets?.metodaGhicita ?? false}
                moneda={account?.balance?.currency ?? null}
                methods={methods}
                defaultMethod={packets?.paymentMethod ?? "account"}
              />

              {/* Promote advert */}
              <PromoteAdvert businessId={businessId} adverts={activeAdverts} features={features ?? []} methods={methods} eroare={erori.promovari} eroareAnunturi={erori.anunturi} onCumparat={loadAll} />

              {/* Facturare, profil de firma si promovarile pe care anuntul le are deja */}
              <OlxCont businessId={businessId} adverts={activeAdverts} eroareAnunturi={erori.anunturi} />
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function BuyPacket({ businessId, groups, hasMappedCategories, methods, defaultMethod, eroare, nereusite, metodaGhicita, moneda, onCumparat }: {
  businessId: string; groups: OlxPacketGroup[]; hasMappedCategories: boolean; methods: OlxPaymentMethod[];
  defaultMethod: OlxPaymentMethod;
  /** Lista n-a putut fi citita. Se spune, in loc sa se arate un gol linistitor. */
  eroare?: string;
  /** Categoriile pentru care intrebarea a picat. Golul lor NU inseamna „n-are pachete". */
  nereusite?: string[];
  /** Preturile sunt ale unei metode ghicite: lista adevarata n-a putut fi citita. */
  metodaGhicita?: boolean;
  /** Moneda soldului, ca pretul din confirmare sa fie in ce plateste el. */
  moneda?: string | null;
  /**
   * ⚠ SOLDUL SI PACHETELE SE RECITESC DUPA FIECARE CUMPARARE.
   *
   * Panoul le incarca o SINGURA data, la deschidere (`if (next && account === null …)`), iar
   * `router.refresh()` reimprospateaza numai componentele de SERVER — starea asta e in `useState`
   * intr-o componenta de client. Deci dupa o cumparare reusita soldul si „Pachete active" ramaneau
   * exact cele de acum cinci minute.
   *
   * ⚠ Si tocmai acolo se uita omul ca sa hotarasca daca mai cumpara unul — scrie chiar in fisier,
   * la lista de pachete. Un numar care nu se misca e chiar semnalul care il face sa apese a doua
   * oara, iar intentia tocmai a fost aruncata.
   */
  onCumparat?: () => void | Promise<void>;
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
      {metodaGhicita && (
        /* ⚠ Prețurile de mai jos sunt ale unei metode GHICITE: lista adevărată n-a putut fi citită. */
        <Callout variant="warning" icon={AlertTriangle} className="mb-2">
          <span className="text-xs">
            N-am putut citi metodele de plată din contul tău OLX, deci prețurile de mai jos sunt
            orientative. Cumpărarea nu pleacă până nu le putem citi.
          </span>
        </Callout>
      )}
      {nereusite && nereusite.length > 0 && (
        /* ⚠ O categorie a cărei citire a picat NU e o categorie fără pachete. */
        <Callout variant="warning" icon={AlertTriangle} className="mb-2">
          <span className="text-xs">
            N-am putut întreba OLX pentru: {nereusite.join(", ")}. Lipsa lor de mai jos nu înseamnă că
            n-au pachete.
          </span>
        </Callout>
      )}
      {eroare ? (
        /* ⚠ „N-am putut citi" nu se scrie ca „nu există". Vezi nota de la `loadAll`. */
        <Callout variant="danger" icon={AlertTriangle}>
          <span className="text-xs">
            Nu am putut citi pachetele de la OLX: {eroare} Lista de mai jos e goală fiindcă n-am putut
            întreba, nu fiindcă OLX nu are ce să-ți ofere.
          </span>
        </Callout>
      ) : groups.length === 0 ? (
        <Callout variant="neutral">
          <span className="text-xs">
            {hasMappedCategories
              ? "Nu sunt pachete disponibile pentru categoriile tale în acest moment."
              : "Mapează întâi o categorie la OLX ca să vezi pachetele de anunțuri (pachetele sunt per categorie)."}
          </span>
        </Callout>
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
              <option value="">Alege pachetul</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {(o.p.name ?? `${o.p.size} anunțuri`)}{o.p.price != null ? ` · ${o.p.price} RON` : ""}{o.p.is_premium ? " (premium)" : ""}
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
                  `Cumperi un pachet${chosen.is_premium ? " premium" : ""} de ${chosen.size} anunțuri în „${group.label}"?`,
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
                /*
                  ⚠ `premium` MERGE PESTE TOT, sau nicaieri. Ecranul arata de mult variantele premium,
                  dar cererea nu purta deloc câmpul: omul alegea premium și pleca `POST`-ul variantei
                  obișnuite. Și, pe deasupra, cele două cădeau pe aceeași cheie și pe aceeași țintă,
                  deci se blocau una pe alta degeaba.
                */
                const premium = Boolean(chosen.is_premium);
                const ce = cePachetCategorie(group.categoryId, chosen.size, tip, premium);
                let res: Awaited<ReturnType<typeof buyOlxCategoryPacket>>;
                try {
                  res = await buyOlxCategoryPacket(
                    businessId, group.categoryId, chosen.size, method,
                    intentiaPentru(businessId, ce), tip, premium);
                } catch {
                  /*
                   * ⚠⚠ AICI ADEVARUL E PE DOS FATA DE TOT RESTUL ARCULUI, si de aceea mesajul nu spune
                   * `nu apasa din nou`.
                   *
                   * `intentiaPentru` scrie o intentie in `localStorage`, sub numele lucrului cumparat, iar
                   * `incheieIntentia` o sterge abia dupa un raspuns bun. La o aruncare ea RAMANE scrisa, deci
                   * o a doua apasare nu plateste de doua ori: serverul raspunde ca era deja facuta.
                   */
                  toast.error(
                    "Nu am primit raspuns de la server, deci nu stim daca plata pentru pachet s-a facut. "
                    + "Intentia a ramas scrisa, deci daca apesi din nou NU se plateste a doua oara: ori se "
                    + "face acum, ori primesti raspunsul ca era deja facuta.",
                    { duration: 12000 },
                  );
                  return;
                }
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
                try {
                  await onCumparat?.();
                } catch {
                  /* ⚠ `onCumparat` e reimprospatarea PARINTELUI: daca pica, nu s-a schimbat nimic
                     nici la noi, nici la OLX. Se inghite, ca sa nu para o eroare de plata. */
                }
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

function PromoteAdvert({ businessId, adverts, features, methods, eroare, eroareAnunturi, onCumparat }: {
  businessId: string; adverts: OlxAnuntViu[]; features: OlxPaidFeature[]; methods: OlxPaymentMethod[];
  /** Lista n-a putut fi citita: se spune, nu se ascunde sectiunea. */
  eroare?: string;
  /** Lista de anunțuri n-a putut fi citită. Golul ei NU înseamnă „n-ai ce promova". */
  eroareAnunturi?: string;
  /** Soldul si promovarile se recitesc dupa cumparare. Vezi nota de la `BuyPacket`. */
  onCumparat?: () => void | Promise<void>;
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
        <Callout variant="danger" icon={AlertTriangle}>
          <span className="text-xs">Nu am putut citi promovările de la OLX: {eroare}</span>
        </Callout>
      </div>
    );
  }
  /* ⚠ Același zero care liniștește, de partea cealaltă: lista de anunțuri n-a putut fi citită. */
  if (eroareAnunturi) {
    return (
      <div>
        <SectionLabel icon={Megaphone}>Promovează un anunț</SectionLabel>
        <Callout variant="danger" icon={AlertTriangle}>
          <span className="text-xs">
            Nu am putut citi lista de anunțuri: {eroareAnunturi} Secțiunea e goală fiindcă n-am
            putut citi, nu fiindcă n-ai anunțuri de promovat.
          </span>
        </Callout>
      </div>
    );
  }
  if (adverts.length === 0 || features.length === 0) return null;

  return (
    <div>
      <SectionLabel icon={Megaphone}>Promovează un anunț</SectionLabel>
      <div className="flex flex-col gap-2">
        <select aria-label="Anunț" value={advertId} onChange={(e) => setAdvertId(e.target.value)} className={selectCls}>
          <option value="">Alege anunțul</option>
          {adverts.map((a) => <option key={a.offerId} value={String(a.advertId)}>{a.nume}</option>)}
        </select>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Promovare" value={code} onChange={(e) => setCode(e.target.value)} className={cn(selectCls, "flex-1")}>
            <option value="">Alege promovarea</option>
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
              const numeAnunt = adverts.find((a) => String(a.advertId) === advertId)?.nume ?? "anunțul ales";
              const numeProm = features.find((f) => f.code === code)?.name ?? code;
              if (!confirmaPlata(`Cumperi promovarea „${numeProm}" pe „${numeAnunt}"?`, null)) return;
              startSave(async () => {
              const ce = cePromovare(Number(advertId), code);
              let res: Awaited<ReturnType<typeof buyOlxPaidFeature>>;
              try {
                res = await buyOlxPaidFeature(
                  businessId, Number(advertId), code, method, intentiaPentru(businessId, ce));
              } catch {
                /*
                 * ⚠⚠ AICI ADEVARUL E PE DOS FATA DE TOT RESTUL ARCULUI, si de aceea mesajul nu spune
                 * `nu apasa din nou`.
                 *
                 * `intentiaPentru` scrie o intentie in `localStorage`, sub numele lucrului cumparat, iar
                 * `incheieIntentia` o sterge abia dupa un raspuns bun. La o aruncare ea RAMANE scrisa, deci
                 * o a doua apasare nu plateste de doua ori: serverul raspunde ca era deja facuta.
                 */
                toast.error(
                  "Nu am primit raspuns de la server, deci nu stim daca plata pentru promovare s-a facut. "
                  + "Intentia a ramas scrisa, deci daca apesi din nou NU se plateste a doua oara: ori se "
                  + "face acum, ori primesti raspunsul ca era deja cumparata.",
                  { duration: 12000 },
                );
                return;
              }
              if ("error" in res) { toast.error(res.error); return; }
              incheieIntentia(businessId, ce);
              if (res.nou) toast.success("Promovare activată.");
              else toast.info("Promovarea asta era deja cumpărată; nu s-a plătit a doua oară.");
              try {
                await onCumparat?.();
              } catch {
                /* ⚠ `onCumparat` e reimprospatarea PARINTELUI: daca pica, nu s-a schimbat nimic
                   nici la noi, nici la OLX. Se inghite, ca sa nu para o eroare de plata. */
              }
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
