"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle, ClipboardCheck, Clock, Info, Layers,
  Loader2, RefreshCw, ThumbsUp, Unplug, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import {
  connectTrendyol, disconnectTrendyol, getTrendyolAddresses,
  pornesteSincronizareaAdoptatelor, saveTrendyolSettings,
  subscribeTrendyolWebhook, unsubscribeTrendyolWebhook,
  type TrendyolStatus,
} from "@/lib/actions/trendyol.actions";
import {
  TRENDYOL_STOREFRONTS, curieriVitrina, esteAdresaDe, infoVitrina,
  type TrendyolStoreFront, type TrendyolSupplierAddress,
} from "@/lib/trendyol/types";

/*
  ⚠ CELE PATRU CERINTE SUNT ALE LOR, NU ALE NOASTRE, si de-aia se spun de la
  inceput: fiecare dintre ele respinge listarea la Trendyol, nu in Edinio, unde
  mesajul e al lor si nu spune intotdeauna care dintre ele lipseste.

  Erau un bloc galben cu buline. Acum au titlu si lamurire, ca sa se poata citi
  dintr-o privire care lipseste, nu citite rand cu rand.
*/
const PREREQUISITES: { titlu: string; text: string }[] = [
  {
    titlu: "Cont de vânzător aprobat",
    text: "Înregistrarea la Trendyol trebuie să fie finalizată, nu doar începută.",
  },
  {
    titlu: "Cele trei credențiale",
    text: "Seller ID, API Key și API Secret, din panoul Trendyol la Informații cont > Detalii integrare.",
  },
  {
    titlu: "Barcode (EAN) pe fiecare variantă",
    text: "Și un brand care există deja în catalogul Trendyol.",
  },
  {
    titlu: "Categorie fără subcategorii",
    text: "Împreună cu atributele pe care categoria aceea le cere obligatoriu.",
  },
];

type Actiune = null | "conectare" | "deconectare" | "setari" | "webhook";

export function TrendyolClient({ businessId, status }: { businessId: string; status: TrendyolStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
   * ⚠ Se confirmă înainte. Cele preluate au prețul pus de comerciant DIRECT în panoul
   * Trendyol, poate dinadins altul decât cel din magazin (comision, concurență).
   * Aprinderea îi șterge exact acea hotărâre, pe toate deodată.
   */
  function pornesteAdoptatele() {
    /* ⚠ `status?.` fiindca ingustarea de mai jos nu trece in inchidere. */
    const cate = status?.counts.preluate ?? 0;
    if (!window.confirm(
      `Preiei conducerea prețului și stocului pentru ${cate} ${cate === 1 ? "produs" : "produse"}?

`
      + "De acum valorile din Edinio le vor rescrie pe cele puse de tine în panoul Trendyol.",
    )) return;
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof pornesteSincronizareaAdoptatelor>>;
      try {
        r = await pornesteSincronizareaAdoptatelor(businessId);
      } catch {
        /* ⚠ Porneste trimiterea pretului si stocului catre Trendyol pentru produsele adoptate.
           Mesajul nu pretinde cate au apucat sa plece: nu am masurat, si nu e nevoie sa stiu ca
           sa spun ce nu stiu. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca pornirea a apucat sa se inregistreze. "
          + "Pagina se reincarca: uita-te la starea produselor inainte sa apesi din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(
        r.cate === 0
          ? "Nu era nimic de pornit."
          : `Gata: ${r.cate} ${r.cate === 1 ? "produs își trimite" : "produse își trimit"} de acum prețul și stocul din Edinio.`,
      );
      router.refresh();
    });
  }
  // Care buton a pornit tranzitia. `useTransition` da un singur `pending` pe toata
  // componenta, deci fara asta salvarea setarilor punea spinner si pe butonul de
  // webhook, de parca s-ar fi intamplat doua lucruri deodata.
  const [actiune, setActiune] = useState<Actiune>(null);
  const ruleaza = (a: Actiune) => pending && actiune === a;

  const [supplierId, setSupplierId] = useState(status?.supplierId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [environment, setEnvironment] = useState<"stage" | "production">(status?.environment ?? "production");
  const [storefront, setStorefront] = useState<TrendyolStoreFront>(status?.storefront ?? "RO");

  const [shipmentAddressId, setShipmentAddressId] = useState(status?.shipmentAddressId != null ? String(status.shipmentAddressId) : "");
  const [returningAddressId, setReturningAddressId] = useState(status?.returningAddressId != null ? String(status.returningAddressId) : "");
  const [carrierCode, setCarrierCode] = useState(status?.defaultCarrierCode ?? "");
  /* „" = nu trimitem campul, deci Trendyol pastreaza termenul contului. Vezi eticheta. */
  const [termenExpediere, setTermenExpediere] = useState(
    status?.deliveryDuration != null ? String(status.deliveryDuration) : "");
  const [autoSync, setAutoSync] = useState(status?.autoSync ?? true);
  const [autoPublish, setAutoPublish] = useState(status?.autoPublish ?? false);
  const [taraOrigine, setTaraOrigine] = useState(status?.defaultCountryOfOrigin ?? "");
  const [facturam, setFacturam] = useState(status?.factureazaClientul ?? false);
  const [addresses, setAddresses] = useState<TrendyolSupplierAddress[]>([]);
  // Eticheta si butonul de webhook se schimba instant; actiunea reuseste sau nu,
  // nu are alt rezultat de aratat. La eroare React readuce singur starea reala.
  const [webhookActiv, aplicaWebhook] = useOptimistic(status?.webhookActive ?? false, (_stare, nou: boolean) => nou);

  useEffect(() => {
    if (!status?.connected) return;
    let alive = true;
    (async () => {
      const res = await getTrendyolAddresses(businessId);
      if (alive && !("error" in res)) setAddresses(res.addresses);
    })();
    return () => { alive = false; };
  }, [businessId, status?.connected]);

  if (!status) {
    return <p className="text-sm text-red-600">Nu am putut încărca starea integrării. Reîncarcă pagina.</p>;
  }

  if (!status.globallyEnabled) {
    return (
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-5 text-sm text-muted-foreground">
        Integrarea Trendyol este momentan indisponibilă. Revino în curând.
      </div>
    );
  }

  const curieri = curieriVitrina(status.storefront);
  const vitrinaAleasa = infoVitrina(storefront);

  /*
    ⚠ `preluate` NU E AICI, dinadins. E o EXCEPTIE de la comutatorul de
    sincronizare, nu o statistica, si se scrie chiar sub comutatorul pe care il
    contrazice. Pusa intre cifre, ar fi aratat ca inca o numaratoare oarecare,
    iar intelesul ei („produsele astea nu asculta de bifa") s-ar fi pierdut.
  */
  const cifre = [
    {
      label: "Listări", value: status.counts.listings, icon: Layers,
      explicatie: "Câte produse are Edinio trimise sau pregătite pentru Trendyol, în orice stare.",
    },
    {
      label: "Aprobate", value: status.counts.approved, icon: ThumbsUp,
      explicatie: "Listările pe care Trendyol le-a acceptat. Doar ele se pot vinde.",
    },
    {
      label: "Respinse", value: status.counts.rejected, icon: XCircle,
      explicatie: "Listările pe care Trendyol le-a refuzat. Motivul lor se vede pe fiecare rând, în lista de mai jos.",
    },
    {
      label: "În coadă", value: status.counts.queued, icon: Clock,
      explicatie: "Schimbări de produs, stoc sau preț care așteaptă să plece către Trendyol. Coada se golește singură.",
    },
  ];
  const marimeCifre = marimeaRandului(cifre.map((c) => c.value));

  const handleConnect = () => {
    if (!supplierId.trim() || !apiKey.trim() || apiSecret.trim().length < 8) {
      toast.error("Completează Seller ID, API Key și API Secret.");
      return;
    }
    setActiune("conectare");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof connectTrendyol>>;
      try {
        res = await connectTrendyol(businessId, {
          supplierId: supplierId.trim(), apiKey, apiSecret, environment, storefront,
        });
      } catch {
        /* ⚠ Cheile pleaca la Trendyol ca sa fie validate. Nestiut: daca s-a legat contul. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a conectat contul Trendyol. "
          + "Pagina se reincarca: uita-te daca apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont Trendyol conectat.");
      setApiKey(""); setApiSecret("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    if (!window.confirm("Sigur deconectezi Trendyol? Listările locale se șterg (produsele rămân pe Trendyol).")) return;
    setActiune("deconectare");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof disconnectTrendyol>>;
      try {
        res = await disconnectTrendyol(businessId);
      } catch {
        /* ⚠ Confirmarea de pe ecran spune ca listarile LOCALE se sterg si produsele raman pe
           Trendyol. Mesajul nu pretinde mai mult decat atat: n-am masurat ce face actiunea la ei. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Pagina se reincarca: uita-te daca mai apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont deconectat.");
      router.refresh();
    });
  };

  const handleSaveSettings = () => {
    const nOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    const ship = nOrNull(shipmentAddressId);
    const ret = nOrNull(returningAddressId);
    for (const [v, label] of [[ship, "adresa de expediere"], [ret, "adresa de retur"]] as const) {
      if (v != null && (!Number.isInteger(v) || v <= 0)) { toast.error(`ID invalid pentru ${label}.`); return; }
    }
    setActiune("setari");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveTrendyolSettings>>;
      try {
        res = await saveTrendyolSettings(businessId, {
          shipment_address_id: ship, returning_address_id: ret,
          /* „" inseamna „las cum e in contul Trendyol", nu zero. Vezi eticheta campului. */
          delivery_duration: termenExpediere === "" ? null : Number(termenExpediere),
          default_carrier_code: carrierCode.trim() === "" ? null : carrierCode,
          auto_sync: autoSync,
          /*
           * ⚠ SE TRIMITE CE A BIFAT OMUL (26.08.2026).
           *
           * Era `autoSync && autoPublish`, cu explicatia ca „publicarea automata n-are sens fara
           * sincronizare". A fost adevarat, si a incetat sa fie: coada lasa acum sa treaca un
           * produs NOU cand `auto_publish` e aprins, chiar cu `auto_sync` stins (`queue.ts`).
           *
           * ⚠ Deci ecranul mintea: omul bifa „Publicare automata", vedea bifa ramasa bifata dupa
           * salvare, si in baza se scria `false`. Comentariul de aici a supravietuit codului pe
           * care il descria — chiar felul de defect care nu da nicio eroare.
           *
           * Cele doua comutatoare sunt acum ce par: unul pentru schimbarile la produsele DEJA
           * publicate, altul pentru produsele NOI.
           */
          auto_publish: autoPublish,
          default_country_of_origin: taraOrigine,
          factureaza_clientul: facturam,
        });
      } catch {
        /* ⚠ Scrie la noi. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca setarile s-au salvat. "
          + "Pagina se reincarca: uita-te la comutatoare inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Setări salvate.");
      router.refresh();
    });
  };

  const handleSubscribeWebhook = () => {
    setActiune("webhook");
    startTransition(async () => {
      aplicaWebhook(true);
      let res: Awaited<ReturnType<typeof subscribeTrendyolWebhook>>;
      try {
        res = await subscribeTrendyolWebhook(businessId);
      } catch {
        /* ⚠ FARA `router.refresh()`, ca si pe calea de eroare de mai jos: eticheta s-a schimbat
           optimist, iar `useOptimistic` o retrage singur cand tranzitia se incheie. Hotararea e a
           casei si ramane adevarata si cu `catch` pus. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca webhookul s-a activat la Trendyol. "
          + "Uita-te la eticheta dupa ce se reincarca pagina inainte sa apesi din nou.",
          { duration: 12000 },
        );
        return;
      }
      // La eroare NU dam refresh: React face singur revenirea la starea reala.
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Webhook comenzi activat.");
      router.refresh();
    });
  };

  const handleUnsubscribeWebhook = () => {
    setActiune("webhook");
    startTransition(async () => {
      aplicaWebhook(false);
      let res: Awaited<ReturnType<typeof unsubscribeTrendyolWebhook>>;
      try {
        res = await unsubscribeTrendyolWebhook(businessId);
      } catch {
        /* ⚠ Acelasi lucru ca la abonare, in cealalta directie. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca webhookul s-a dezactivat la Trendyol. "
          + "Uita-te la eticheta dupa ce se reincarca pagina inainte sa apesi din nou.",
          { duration: 12000 },
        );
        return;
      }
      // La eroare NU dam refresh: React face singur revenirea la starea reala.
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Webhook dezactivat.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/*
        ═══ ÎNAINTE DE A ÎNCEPE ═══

        ⚠ NU MAI E UN BLOC GALBEN. Galbenul din panou înseamnă „uită-te aici,
        ceva e în neregulă”, iar aici nu e nimic în neregulă: sunt patru lucruri
        de bifat o singură dată. Pe o pagină pe care comerciantul intră zilnic,
        avertismentul care nu avertizează nimic se învață și apoi nu se mai
        vede, inclusiv atunci când chiar apare unul adevărat dedesubt.
      */}
      <Panel className="p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Înainte de a începe</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Patru lucruri cerute de Trendyol. Fără ele, listarea e respinsă la ei, iar mesajul
          lor nu spune întotdeauna care dintre ele lipsește.
        </p>
        <ul className="mt-4 grid gap-x-10 gap-y-3.5 sm:grid-cols-2">
          {PREREQUISITES.map((p) => (
            <li key={p.titlu} className="flex gap-2.5">
              <Check className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-foreground">{p.titlu}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {!status.connected ? (
        /*
          ── Formularul de conectare ──

          ⚠ MARGINIT LA `max-w-3xl`, desi pagina e pe tot ecranul. Restul paginii
          are nevoie de latime (tabelul de listari are opt coloane), dar patru
          campuri intinse pe 1900px sunt mai greu de citit, nu mai usor.
        */
        <Panel step={1} title="Conectează contul Trendyol" className="max-w-3xl">
          <p className="text-sm text-muted-foreground">
            În panoul Trendyol mergi la <span className="font-medium text-foreground">Informații cont &gt; Detalii integrare</span> (vizibil
            doar utilizatorului principal al contului). Ai nevoie de exact trei valori: Seller ID, API Key și API Secret.
          </p>
          <Callout variant="neutral" icon={Info}>
            Vei mai vedea acolo un <span className="font-medium text-foreground">cod de referință al integrării</span> și
            un <span className="font-medium text-foreground">token</span>. Nu îți trebuie aici: codul de referință se folosește doar când
            deschizi un tichet la suportul Trendyol.
          </Callout>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Field label="Seller ID" required hint="Doar cifre.">
              <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                placeholder="ex. 123456" inputMode="numeric" />
            </Field>
            <Field
              label="Țara magazinului"
              required
              hint={`Prețurile vor fi citite de Trendyol în ${vitrinaAleasa.moneda}.`}
            >
              <select value={storefront} onChange={(e) => setStorefront(e.target.value as TrendyolStoreFront)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                {TRENDYOL_STOREFRONTS.map((s) => <option key={s.code} value={s.code}>{s.tara}</option>)}
              </select>
            </Field>
            <Field label="API Key" required>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cheia API" className="font-mono" />
            </Field>
            <Field label="API Secret" required>
              <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Cheia secretă API" className="font-mono" />
            </Field>
            <Field label="Mediu" required>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value as "stage" | "production")}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                <option value="production">Producție</option>
                <option value="stage">Stage (testare)</option>
              </select>
            </Field>
          </div>

          {environment === "stage" && (
            <Callout variant="warning" icon={AlertTriangle}>
              Stage-ul are chei separate și cere ca Trendyol să autorizeze IP-ul serverului nostru.
              Dacă nu ai cerut asta, folosește Producție.
            </Callout>
          )}

          <Button onClick={handleConnect} disabled={pending}>
            {ruleaza("conectare") ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            {ruleaza("conectare") ? "Se verifică..." : "Conectează și testează"}
          </Button>
        </Panel>
      ) : (
        /* ── Conectat ── */
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0 text-success" />
                  <span className="text-sm font-semibold text-foreground">Cont conectat</span>
                  {/* Stage nu e o stare buna, e una de proba: galben, nu verde. */}
                  <EtichetaStare ton={status.environment === "stage" ? "asteptare" : "bun"} marime="mic">
                    {status.environment === "stage" ? "Stage (testare)" : "Producție"}
                  </EtichetaStare>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Seller <span className="font-mono text-foreground">{status.supplierId}</span>
                  {" · "}cheie <span className="font-mono text-foreground">{status.apiKeyMasked}</span>
                  {" · "}{status.storefrontLabel} ({status.currency})
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={ruleaza("deconectare")}>
                {ruleaza("deconectare") ? <Loader2 className="animate-spin" /> : <Unplug />}
                Deconectează
              </Button>
            </div>
          </Panel>

          {/*
            ═══ CIFRELE ═══

            ⚠ ACELASI `CardStatistica` ca la Panou, Oferte, Statistici, Clienti si
            Discounturi, cerut de el pe 22.09.2026. Erau patru cutii gri desenate aici,
            cu cifra la 18px si eticheta dedesubt: semanau cu cardurile casei fara sa
            fie ele, deci se retusau separat si divergeau.

            ⚠ `marimeaRandului` se socoteste o data, din TOATE cifrele randului. Lasata
            pe seama fiecarui card, „3" ar fi iesit la 44px langa „1300" la 30px, adica
            patru cutii care nu mai arata ca un set.
          */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cifre.map((c) => (
              <CardStatistica
                key={c.label}
                marime={marimeCifre}
                icon={c.icon}
                label={c.label}
                value={c.value}
                explicatie={c.explicatie}
                empty={c.value === 0}
              />
            ))}
          </div>

          {/*
            ⚠ AVERTISMENTELE IES DIN CARTONASUL CONTULUI, pe toata latimea. Inghesuite
            inauntru, sub randul cu seller si cheie, aratau ca o nota de subsol a
            contului; aici sunt ce sunt: lucruri care opresc vanzarea.
          */}
          {status.needsReconnect && (
            <Callout variant="danger" icon={AlertTriangle} title="Sesiunea a expirat">
              Reconectează credențialele Trendyol ca să reia trimiterile.
            </Callout>
          )}
          {status.readinessError && (
            <Callout variant="warning" icon={Info}>{status.readinessError}</Callout>
          )}
          {status.currency !== "RON" && (
            <Callout variant="warning" icon={Info} title={`Vitrina ${status.storefrontLabel} citește prețurile ca ${status.currency}`}>
              Prețurile din Edinio sunt în lei. Setează manual prețul de vânzare pe fiecare
              listare înainte de a trimite produse.
            </Callout>
          )}

          {/* Setări */}
          <Panel title="Setări" className="p-5">
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Adresă expediere">
                {addresses.length > 0 ? (
                  <select value={shipmentAddressId} onChange={(e) => setShipmentAddressId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Implicită din contul Trendyol</option>
                    {addresses.filter((a) => esteAdresaDe(a, "Shipment")).map((a) => (
                      <option key={a.id} value={a.id}>{a.fullAddress || a.city || `#${a.id}`}</option>
                    ))}
                  </select>
                ) : (
                  <Input type="number" min="0" inputMode="numeric" value={shipmentAddressId}
                    onChange={(e) => setShipmentAddressId(e.target.value)} placeholder="ID adresă" />
                )}
              </Field>
              <Field label="În câte zile expediezi">
                <select value={termenExpediere} onChange={(e) => setTermenExpediere(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  {/*
                    * ⚠ DOUA OPTIUNI, NU O LISTA DE ZILE, si nu din lene.
                    *
                    * La eMAG comerciantul alege dintr-o lista pe care ei ne-o dau
                    * (`/handling_time/read`). Trendyol n-are asa ceva: documentatia lor da inteles
                    * doar lui `0` („azi in curier") si `1` („cel tarziu maine"), iar OpenAPI-ul
                    * spune atat, `integer`, fara minim, maxim sau lista. Fraza lor e „poti
                    * introduce durate in intervalele indicate de echipele de operatiuni" — un
                    * interval care nu e publicat nicaieri.
                    *
                    * Un camp liber ar fi lasat omul sa scrie 3, iar noi n-avem cum sa stim daca
                    * il primesc. Cand se probeaza pe un cont adevarat si se afla plaja, aici se
                    * adauga optiuni; pana atunci nu promitem ce nu stim.
                    */}
                  <option value="">Cum e setat în contul Trendyol</option>
                  <option value="0">În aceeași zi</option>
                  <option value="1">Cel târziu a doua zi</option>
                </select>
              </Field>
              <Field label="Adresă retur">
                {addresses.length > 0 ? (
                  <select value={returningAddressId} onChange={(e) => setReturningAddressId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Implicită din contul Trendyol</option>
                    {addresses.filter((a) => esteAdresaDe(a, "Returning")).map((a) => (
                      <option key={a.id} value={a.id}>{a.fullAddress || a.city || `#${a.id}`}</option>
                    ))}
                  </select>
                ) : (
                  <Input type="number" min="0" inputMode="numeric" value={returningAddressId}
                    onChange={(e) => setReturningAddressId(e.target.value)} placeholder="ID adresă" />
                )}
              </Field>
              <Field label="Curier implicit">
                <select value={carrierCode} onChange={(e) => setCarrierCode(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">Fără curier implicit</option>
                  {curieri.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}{c.platesteVanzatorul ? " (plătit de tine)" : " (plătit de Trendyol)"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Adresele se încarcă din contul tău Trendyol; lăsate goale, se folosesc cele implicite de acolo. Curierii
              „plătiți de Trendyol” își completează singuri AWB-ul; la cei plătiți de tine, trimiți tu numărul AWB din pagina comenzii.
            </p>

            {/*
              ═══ ⚠ CONDUCTA EXISTA DE-O SAPTAMANA, ROBINETUL NU (26.08.2026) ═══

              `trendyol_listings.country_of_origin`, `config.default_country_of_origin` si
              `payload.origin` erau toate scrise si legate. Dar nicaieri in panoul Trendyol nu
              se putea COMPLETA vreuna — deci campul pleca gol la toata lumea, mereu.

              ⚠ Din 23.10.2026 ei il cer obligatoriu. Pana atunci lipsa lui nu strica nimic, si
              de-aia nu se blocheaza publicarea azi: ar opri magazine care merg, pentru o regula
              care inca nu e in vigoare.

              ⚠ SI NU SE PUNE „RO" DE LA SINE. Un magazin din Romania vinde hrana facuta in
              Germania si jucarii facute in China; un „RO" pus de noi peste tot ar fi o
              declaratie falsa despre marfa lui, nu o completare la indemana.
            */}
            {/* ⚠ Campul e ingust (doua litere), lamurirea nu: lasata la `max-w-xl`, se
                rupea pe trei randuri sub un ecran de 1300px, langa paragraful de deasupra
                care sta pe unul singur. */}
            <Field
              label="Țara de fabricație implicită"
              hint="Codul de țară din două litere unde se fabrică marfa, nu unde ești tu. Se folosește la produsele care n-au una a lor. Trendyol o cere obligatoriu de la 23 octombrie 2026; lasă câmpul gol dacă produsele tale vin din țări diferite și completeaz-o pe fiecare listare în parte."
            >
              <Input
                value={taraOrigine}
                onChange={(e) => setTaraOrigine(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="ex. DE"
                maxLength={2}
                className="w-24 font-mono uppercase"
              />
            </Field>

            {/*
              ⚠ COMUTATOARE, NU BIFE. Cele trei hotarari de mai jos sunt aceleasi ca la
              „Mediu de test" de la curieri, iar acolo casa foloseste `Switch`. Trei
              `<input type="checkbox">` desenate de mana nu se potriveau cu nimic altceva
              din panou, si se citeau ca un formular de pe alt site.
            */}
            <RandDeComutator
              titlu="Sincronizează automat schimbările de produs, stoc și preț"
              text="Când schimbi ceva în magazin, pleacă singur către Trendyol."
              pornit={autoSync}
              comuta={setAutoSync}
            />

            {/*
              ═══ ⚠ BIFA DE DEASUPRA NU E ÎNTREGUL ADEVĂR (24.08.2026) ═══

              Sunt două comutatoare, la două niveluri. Bifa hotărăște dacă integrarea
              PORNEȘTE la o schimbare. `trendyol_listings.auto_inventory` hotărăște dacă
              schimbarea AJUNGE la Trendyol, iar la o listare adoptată e stinsă.

              Deci modificarea de preț trece de bifă, intră în coadă, ajunge la
              `sync.ts:854` și se oprește tăcut: `return null`. Bifa rămâne bifată, coada
              se golește, zero erori. Din panou arată identic cu „totul e sincronizat".

              ⚠ CE A COSTAT: 29 de listări înghețate la prețul din 19.08, cu bifa pornită.
              Comerciantul a aflat dintr-o comandă vândută cu 39,99 pentru un produs care
              în magazin e 43,99. Singurul semn contrar era o bulină „Preluat" pe rândul
              produsului, în ALTĂ listă, cu explicația într-un tooltip.

              Deci excepția se scrie chiar sub comutatorul pe care îl contrazice.
            */}
            {status.counts.preluate > 0 && (
              <Callout
                variant="warning"
                icon={AlertTriangle}
                title={`${status.counts.preluate} ${status.counts.preluate === 1 ? "produs nu ascultă" : "produse nu ascultă"} de comutatorul de mai sus`}
                action={
                  <Button variant="outline" size="sm" onClick={pornesteAdoptatele} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Preia conducerea prețului
                  </Button>
                }
              >
                {status.counts.preluate === 1 ? "E preluat" : "Sunt preluate"} din contul tău
                Trendyol, unde {status.counts.preluate === 1 ? "exista" : "existau"} dinainte cu
                prețul pus de tine acolo. Edinio nu-l suprascrie fără să ceri, deci prețul lor de
                pe Trendyol rămâne cel vechi oricâte modificări faci în magazin.
              </Callout>
            )}

            {/*
              ═══ ⚠ LA TRENDYOL, COMERCIANTUL FACTUREAZĂ CLIENTUL FINAL (26.08.2026) ═══

              Codul casei credea opusul — „marketplace-urile facturează ele clientul" — și de-aia
              niciuna dintre comenzile Trendyol ale comerciantului n-a fost vreodată facturată.
              Măsurat pe API-ul lor: `invoiceStatus: "NotInvoiced"` și `invoiceNumber: ""` pe
              toate, iar `invoiceAddress` poartă numele CLIENTULUI.

              ⚠ STINS DIN START, și rămâne alegerea lui: răspunderea fiscală e a comerciantului,
              iar el poate emite deja facturile astea de mână în altă parte. Pornit de noi, ar
              ieși două documente fiscale pentru aceeași marfă.

              ⚠ Și se spune că nu se poate desface: ei n-au niciun capăt de corecție sau
              ștergere, iar la a doua trimitere pe același pachet răspund 409.
            */}
            <RandDeComutator
              titlu="Emite și trimite facturile către Trendyol"
              text="La Trendyol tu facturezi clientul final, nu marketplace-ul. Cu comutatorul pornit, Edinio emite factura prin SmartBill, Oblio sau fGO și îi trimite linkul lui Trendyol, care o arată clientului."
              atentie="Pornește-l doar dacă nu emiți deja facturile astea în altă parte: o factură trimisă la ei nu se mai poate corecta sau șterge."
              pornit={facturam}
              comuta={setFacturam}
            />

            {/*
              ⚠ COMUTATORUL ASTA MERGE SI FARA CEL DE SINCRONIZARE, si asta se spune pe
              fata: pana azi era stins cand sincronizarea era stinsa, desi coada le trata
              deja separat. Cine vrea sa listeze produse noi fara sa lase Edinio sa umble
              la preturile celor vechi are chiar nevoie de combinatia asta.
            */}
            <RandDeComutator
              titlu="Publicare automată"
              text="Fiecare produs nou din magazin pleacă singur pe Trendyol, folosind categoria mapată și brandul ei. Produsele cu categoria nemapată rămân pe loc și îți apar ca eroare aici."
              atentie={!autoSync && autoPublish
                ? "Cu sincronizarea stinsă, produsele noi tot pleacă pe Trendyol, dar schimbările de preț și stoc de la cele deja publicate nu mai pleacă."
                : undefined}
              pornit={autoPublish}
              comuta={setAutoPublish}
            />

            <Button onClick={handleSaveSettings} disabled={pending}>
              {ruleaza("setari") ? <Loader2 className="animate-spin" /> : null}
              {ruleaza("setari") ? "Se salvează..." : "Salvează setările"}
            </Button>
          </Panel>

          {/* Comenzi și webhook */}
          <Panel title="Comenzi Trendyol" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  Comenzile intră automat în „Comenzi”. Activează webhook-ul pentru livrare instant; altfel sincronizarea are loc periodic.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {status.counts.orders} comenzi importate
                  {status.ordersSyncedAt ? ` · ultima sincronizare ${new Date(status.ordersSyncedAt).toLocaleString("ro-RO")}` : ""}
                </p>
              </div>
              <EtichetaStare ton={webhookActiv ? "bun" : "neutru"} marime="mic" className="flex-shrink-0">
                {webhookActiv ? "Webhook activ" : "Webhook inactiv"}
              </EtichetaStare>
            </div>
            {webhookActiv ? (
              <Button variant="outline" size="sm" onClick={handleUnsubscribeWebhook} disabled={pending}>
                {ruleaza("webhook") ? <Loader2 className="animate-spin" /> : null}
                {ruleaza("webhook") ? "Se procesează..." : "Dezactivează webhook"}
              </Button>
            ) : (
              <Button onClick={handleSubscribeWebhook} disabled={pending}>
                {ruleaza("webhook") ? <Loader2 className="animate-spin" /> : null}
                {ruleaza("webhook") ? "Se activează..." : "Activează webhook comenzi"}
              </Button>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * Un rând de setare cu comutator: titlu, lămurire, și o notă de atenție când
 * alegerea are un cost.
 *
 * ⚠ ACELASI DESEN CA LA CURIERI (vezi „Mediu de test" la GLS), ca sa nu fie al
 * treilea fel de comutator din panou. Scris o data aici fiindca pagina are trei.
 */
function RandDeComutator({
  titlu, text, atentie, pornit, comuta,
}: {
  titlu: string;
  text: string;
  atentie?: string;
  pornit: boolean;
  comuta: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{titlu}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
        {atentie && <p className="mt-1.5 text-xs leading-relaxed text-warning">{atentie}</p>}
      </div>
      <Switch checked={pornit} onCheckedChange={comuta} className="mt-0.5 flex-shrink-0" />
    </div>
  );
}
