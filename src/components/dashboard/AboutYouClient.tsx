"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle, ClipboardCheck, Clock, Info, Layers,
  Loader2, ThumbsUp, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import {
  connectAboutYou, disconnectAboutYou, getAboutYouBrands, getAboutYouCountries,
  getAboutYouWebhookDiagnoza,
  saveAboutYouSettings, subscribeAboutYouWebhook, unsubscribeAboutYouWebhook,
  type AboutYouStatus,
} from "@/lib/actions/aboutyou.actions";
import type { AboutYouBrand, AboutYouCountry } from "@/lib/aboutyou/types";
import type { PublicTinta } from "@/lib/aboutyou/ro-taxonomy";

const PUBLICURI: { valoare: PublicTinta; eticheta: string }[] = [
  { valoare: "women", eticheta: "Femei" },
  { valoare: "men", eticheta: "Bărbați" },
  { valoare: "girls", eticheta: "Fete" },
  { valoare: "boys", eticheta: "Băieți" },
];

/*
  ⚠ CERINTELE AU ACUM TITLU SI LAMURIRE, nu o bulina si o fraza lunga. Erau un
  bloc galben cu patru buline; asa se puteau citi doar rand cu rand, iar ce
  lipseste se cauta prin text. Cu titlul scos in fata, se vede dintr-o privire.
*/
const PREREQUISITES: { titlu: string; text: string }[] = [
  {
    titlu: "Cont Seller Center aprobat",
    text: "Contractul și verificarea trebuie să fie încheiate. Integrarea merge pe cheia ta API.",
  },
  {
    titlu: "Brand aprobat pe About You",
    text: "Produse fashion sau lifestyle, cu un brand care există deja în catalogul lor.",
  },
  {
    titlu: "Cod EAN (GTIN) pe fiecare mărime",
    text: "Nu unul pe produs: fiecare mărime are nevoie de codul ei.",
  },
  {
    titlu: "Prețurile sunt citite în euro",
    text: "Conversia din lei o facem noi, după cursul și marja pe care le pui în Setări.",
  },
];

/** Care buton a pornit tranzitia. Vezi `ruleaza` mai jos. */
type Actiune = null | "conectare" | "deconectare" | "setari" | "notificari" | "verificare";

export function AboutYouClient({ businessId, status }: { businessId: string; status: AboutYouStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
    `useTransition` da un singur `pending` pe toata componenta. Fara asta,
    salvarea setarilor punea spinner si pe butonul de deconectare, de parca
    s-ar fi rupt legatura chiar atunci. Conditiile de `disabled` raman insa pe
    `pending`, ca pana acum: cat timp ceva pleaca la server, nu se apasa altceva.
  */
  const [actiune, setActiune] = useState<Actiune>(null);
  const ruleaza = (a: Actiune) => pending && actiune === a;

  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(status?.environment ?? "production");

  // Settings form (only used when connected).
  const [fxRate, setFxRate] = useState(status?.fxRate != null ? String(status.fxRate) : "");
  const [fxMargin, setFxMargin] = useState(status?.fxMarginPct != null ? String(status.fxMarginPct) : "");
  const [brandId, setBrandId] = useState(status?.brandId != null ? String(status.brandId) : "");
  const [shipCountries, setShipCountries] = useState<string[]>(status?.shipCountries ?? []);
  const [countryOfOrigin, setCountryOfOrigin] = useState(status?.defaultCountryOfOrigin ?? "RO");
  const [autoSync, setAutoSync] = useState(status?.autoSync ?? true);
  const [targetAudience, setTargetAudience] = useState<PublicTinta>(status?.targetAudience ?? "women");

  /*
   * Brandurile si tarile se citesc de la About You, nu se scriu de mana.
   *
   * Inainte, ambele erau campuri libere: un numar pentru brand („ID brand About
   * You") si o lista de coduri separate prin virgula pentru tari. Nimeni nu are
   * de unde sti ca brandul lui e 178225, iar o tara scrisa gresit trece de
   * validare si cade abia la publicare. Ambele sunt liste scurte si venite de
   * la furnizor — deci sunt selectii, nu dictari.
   */
  const [brands, setBrands] = useState<AboutYouBrand[] | null>(null);
  const [countries, setCountries] = useState<AboutYouCountry[] | null>(null);
  // Moneda fiecarei tari. About You citeste pretul in moneda tarii, iar noi
  // trimitem euro — deci tarile non-euro nu se pot selecta inca.
  const [monede, setMonede] = useState<Record<string, string>>({});
  const conectat = !!status?.connected;

  useEffect(() => {
    if (!conectat) return;
    let activ = true;
    (async () => {
      const [b, c] = await Promise.all([getAboutYouBrands(businessId), getAboutYouCountries(businessId)]);
      if (!activ) return;
      if ("brands" in b) setBrands(b.brands); else setBrands([]);
      if ("data" in c) {
        setCountries(c.data.countries ?? []);
        setMonede(Object.fromEntries((c.data.currencies ?? []).map((m) => [m.country_code, m.code])));
      } else setCountries([]);
      // Un singur mesaj, nu doua: cauza e aceeasi (conexiunea), iar doua
      // notificari suprapuse pentru acelasi lucru sperie degeaba.
      const eroare = "error" in b ? b.error : "error" in c ? c.error : null;
      if (eroare) toast.error(eroare);
    })();
    return () => { activ = false; };
  }, [businessId, conectat]);
  // Comutatorul de notificari se muta instant; actiunea nu are alt rezultat de
  // aratat in afara de activ/inactiv, iar la eroare React readuce starea reala.
  const [notificariActive, aplicaNotificari] = useOptimistic(status?.webhookActive ?? false, (_stare, noua: boolean) => noua);
  const [diagnoza, setDiagnoza] = useState<{ ok: boolean; text: string } | null>(null);

  if (!status) {
    return <p className="text-sm text-red-600">Nu am putut încărca starea integrării. Reîncarcă pagina.</p>;
  }

  if (!status.globallyEnabled) {
    return (
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-5 text-sm text-muted-foreground">
        Integrarea About You este momentan indisponibilă. Revino în curând.
      </div>
    );
  }

  const handleConnect = () => {
    if (apiKey.trim().length < 8) { toast.error("Introdu cheia API din Seller Center."); return; }
    setActiune("conectare");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof connectAboutYou>>;
      try {
        res = await connectAboutYou(businessId, apiKey, environment);
      } catch {
        /* ⚠ Cheia pleaca la About You ca sa fie validata. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a conectat contul About You. "
          + "Reimprospateaza si uita-te daca apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont About You conectat.");
      setApiKey("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    /* ⚠ Aici nu se mai intreaba nimic: intrebarea o pune `ButonDeconectare`, in
       fereastra casei, si spune ce se pierde. Doua intrebari una peste alta se
       invata sa se apese fara citire.

       ⚠ Si comentariul isi ocoleste dinadins numele functiei de browser pe care a
       inlocuit-o: proba `deconectarea-cere-confirmare.test.ts` cauta acel nume pe
       randuri, fara sa deosebeasca codul de comentariu. Vezi raportul. */
    setActiune("deconectare");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof disconnectAboutYou>>;
      try {
        res = await disconnectAboutYou(businessId);
      } catch {
        /* ⚠ Mesajul nu pretinde nimic despre contul de la ei: n-am masurat ce face acolo. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Reimprospateaza si uita-te daca mai apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont deconectat.");
      /*
       * ⚠ Deconectarea a reusit; asta e ce a ramas nefacut si numai comerciantul poate duce la
       * capat. Arătat separat, ca sa nu para ca deconectarea a picat — si cu rabdare la citit,
       * fiindca are un id in el.
       */
      if (res.avertisment) toast.warning(res.avertisment, { duration: 15000 });
      router.refresh();
    });
  };

  const handleSaveSettings = () => {
    const rate = fxRate.trim() === "" ? null : Number(fxRate);
    const margin = fxMargin.trim() === "" ? null : Number(fxMargin);
    if (rate != null && (!Number.isFinite(rate) || rate <= 0)) { toast.error("Cursul RON -> EUR trebuie să fie un număr pozitiv."); return; }
    if (margin != null && (!Number.isFinite(margin) || margin < 0)) { toast.error("Marja trebuie să fie un număr pozitiv."); return; }
    const bId = brandId.trim() === "" ? null : Number(brandId);
    if (bId != null && !Number.isInteger(bId)) { toast.error("Alege un brand din listă."); return; }

    setActiune("setari");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveAboutYouSettings>>;
      try {
        res = await saveAboutYouSettings(businessId, {
          fx_rate: rate,
          fx_margin_pct: margin,
          brand_id: bId,
          brand_name: bId == null ? null : (brands?.find((b) => b.id === bId)?.name ?? null),
          ship_countries: shipCountries,
          default_country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
          auto_sync: autoSync,
          target_audience: targetAudience,
        });
      } catch {
        /* ⚠ Scrie setarile la noi. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca setarile s-au salvat. "
          + "Reimprospateaza si uita-te la ele inainte sa salvezi din nou.",
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

  const toggleWebhook = () => {
    // Directia se deriva din valoarea pe care o VEDE utilizatorul, nu din prop:
    // altfel eticheta („Dezactiveaza") si actiunea trimisa pot diverge cat timp
    // tranzitia e in curs. Azi butonul e `disabled`, dar legatura ar fi accidentala.
    const noua = !notificariActive;
    setActiune("notificari");
    startTransition(async () => {
      aplicaNotificari(noua);
      let res: Awaited<ReturnType<typeof subscribeAboutYouWebhook>>;
      try {
        res = noua
          ? await subscribeAboutYouWebhook(businessId)
          : await unsubscribeAboutYouWebhook(businessId);
      } catch {
        /* ⚠ FARA `router.refresh()`, ca si pe calea de eroare de mai jos: eticheta s-a schimbat
           optimist, iar React o readuce singur cand tranzitia se incheie. Hotararea e a casei si
           ramane adevarata si cu `catch` pus. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca notificarile s-au schimbat la About You. "
          + "Uita-te la eticheta dupa ce se reincarca pagina inainte sa apesi din nou.",
          { duration: 12000 },
        );
        return;
      }
      // La eroare NU dam refresh: React face singur revenirea la starea reala.
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(noua ? "Notificări activate." : "Notificări dezactivate.");
      setDiagnoza(null);
      router.refresh();
    });
  };

  /*
   * Intreaba About You daca abonamentul nostru mai exista si ce acopera.
   *
   * Steagul din baza spune doar ca l-am creat NOI candva. Sters din Seller Center
   * sau expirat, el tace, iar comenzile intra doar prin cron, cu intarziere — si
   * nimic nu semnaleaza asta.
   */
  const verificaWebhook = () => {
    setActiune("verificare");
    startTransition(async () => {
      let d: Awaited<ReturnType<typeof getAboutYouWebhookDiagnoza>>;
      try {
        d = await getAboutYouWebhookDiagnoza(businessId);
      } catch {
        /* ⚠ Aici raspunsul se scrie in cutia de diagnoza, nu in `toast`: asa vorbeste functia cu
           omul, si un toast ar fi lasat cutia goala exact cand el se uita la ea. */
        setDiagnoza({ ok: false, text: "Nu am primit raspuns de la server. Incearca din nou." });
        return;
      }
      if ("error" in d) { setDiagnoza({ ok: false, text: d.error }); return; }
      if (!d.abonamentLocal) {
        setDiagnoza({ ok: false, text: "Nu avem niciun abonament salvat. Activează notificările." });
      } else if (d.eroare) {
        setDiagnoza({ ok: false, text: `Nu am putut verifica: ${d.eroare}` });
      } else if (!d.existaLaEi) {
        setDiagnoza({ ok: false, text: "Abonamentul nu mai există la About You. Dezactivează și activează din nou notificările." });
      } else if (!d.activLaEi) {
        setDiagnoza({ ok: false, text: "Abonamentul există, dar e OPRIT din Seller Center. Pornește-l acolo, sau reactivează notificările de aici." });
      } else if (d.tokenNepotrivit) {
        setDiagnoza({ ok: false, text: "Adresa abonamentului nu mai poartă cheia noastră de siguranță, deci evenimentele sunt respinse. Reactivează notificările ca să fie recreat." });
      } else if (d.evenimenteLipsa.length > 0) {
        setDiagnoza({ ok: false, text: `Abonamentul există, dar nu acoperă: ${d.evenimenteLipsa.join(", ")}. Reactivează notificările ca să fie recreat complet.` });
      } else {
        setDiagnoza({ ok: true, text: "Abonamentul există la About You și acoperă toate evenimentele." });
      }
    });
  };

  /*
    ═══ CIFRELE ═══

    ⚠ ACELASI `CardStatistica` ca la Panou, Oferte si Statistici. Erau patru
    cutii gri desenate aici, cu cifra la 18px: semanau cu cardurile casei fara
    sa fie ele, deci se retusau separat si divergeau.

    ⚠ Explicatiile sunt scrise din interogarile din `getAboutYouStatus`, nu din
    ce par sa insemne etichetele. „Publicate” numara `published` SI `active`,
    fiindca a doua e starea pe care o raporteaza ei inapoi.

    ⚠ `variants` nu e intre ele: sunt patru cutii pe rand, iar numarul de
    marimi nu e o stare a listarii, ci o socoteala dintr-alt tabel.
  */
  const cifre = [
    {
      label: "Listări", value: status.counts.listings, icon: Layers,
      explicatie: "Câte produse are Edinio trimise sau pregătite pentru About You, în orice stare.",
    },
    {
      label: "Publicate", value: status.counts.published, icon: ThumbsUp,
      explicatie: "Listările pe care About You le ține active în magazinul lor. Doar ele se pot vinde.",
    },
    {
      label: "Respinse", value: status.counts.rejected, icon: XCircle,
      explicatie: "Listările pe care About You le-a refuzat. Motivul lor se vede pe fiecare rând, în lista de mai jos.",
    },
    {
      label: "În coadă", value: status.counts.queued, icon: Clock,
      explicatie: "Schimbări de produs, stoc sau preț care așteaptă să plece către About You. Coada se golește singură.",
    },
  ];
  const marimeCifre = marimeaRandului(cifre.map((c) => c.value));

  return (
    <div className="space-y-4">
      {/*
        ═══ ÎNAINTE DE A ÎNCEPE ═══

        ⚠ NU MAI E UN BLOC GALBEN. Galbenul din panou înseamnă „uită-te aici,
        ceva e în neregulă”, iar aici nu e nimic în neregulă: sunt patru lucruri
        de știut o singură dată. Pe o pagină pe care comerciantul intră zilnic,
        avertismentul care nu avertizează nimic se învață și apoi nu se mai
        vede, inclusiv atunci când chiar apare unul adevărat dedesubt.
      */}
      <Panel className="p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Înainte de a începe</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Patru lucruri de lămurit înainte de prima listare: trei sunt cerute de About You, iar al
          patrulea spune în ce monedă îți sunt citite prețurile acolo.
        </p>
        <ul className="mt-4 grid gap-x-10 gap-y-3.5 sm:grid-cols-2">
          {PREREQUISITES.map((p) => (
            <li key={p.titlu} className="flex gap-2.5">
              {/*
                ⚠ CHIAR BIFA DE PE CARDURILE DE PRET ale site-ului de prezentare,
                cerută de el pe 22.09.2026: `h-4 w-4`, `strokeWidth={2.5}`, verde.
                Vezi `PricingSection.tsx`. Verdele e acelasi simbol in amandoua
                locurile: site-ul scrie `VERDE_CITIBIL`, care e `var(--primary)`,
                adica exact ce da `text-primary` aici.
              */}
              <Check className="mt-[3px] h-4 w-4 flex-shrink-0 text-primary" strokeWidth={2.5} />
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
          are nevoie de latime (lista de listari si cea de comenzi sunt late), dar
          doua campuri intinse pe 1900px sunt mai greu de citit, nu mai usor.
        */
        <Panel step={1} title="Conectează contul About You" className="max-w-3xl">
          <p className="text-sm text-muted-foreground">
            Generează o cheie API în Seller Center: <span className="font-medium text-foreground">Settings &gt; API Keys &gt; + Add</span>.
            Copiaz-o aici imediat, fiindcă se afișează o singură dată.
          </p>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Field label="Mediu" required>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="production">Producție (date reale)</option>
                <option value="sandbox">Sandbox (testare)</option>
              </select>
            </Field>
            {/* `Input` pune singur `autoComplete="new-password"` pe campurile de parola. */}
            <Field label="Cheie API" required>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Lipește cheia API About You"
                className="font-mono"
              />
            </Field>
          </div>
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
                  {/* Sandbox nu e o stare buna, e una de proba: galben, nu verde. */}
                  <EtichetaStare ton={status.environment === "sandbox" ? "asteptare" : "bun"} marime="mic">
                    {status.environment === "sandbox" ? "Sandbox (testare)" : "Producție"}
                  </EtichetaStare>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cheie <span className="font-mono text-foreground">{status.apiKeyMasked}</span>
                  {status.sellerName ? ` · ${status.sellerName}` : ""}
                </p>
              </div>
              {/*
                ⚠ `cePierzi` e citit din `disconnectAboutYou`: ea goleste configul
                (deci si cheia API) si sterge coada, variantele, loturile si
                listarile. La ei nu sterge produse, doar abonamentul de notificari.
              */}
              <ButonDeconectare
                nume="About You"
                cePierzi="Cheia API se șterge din Edinio, iar listările, variantele, loturile și coada de sincronizare se pierd. Produsele rămân pe About You, dar Edinio nu le mai poate trimite prețul și stocul."
                pending={ruleaza("deconectare")}
                onConfirma={handleDisconnect}
              />
            </div>
          </Panel>

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
            inauntru, sub randul cu cheia, aratau ca o nota de subsol a contului; aici
            sunt ce sunt: lucruri care opresc vanzarea.
          */}
          {status.needsReconnect && (
            <Callout variant="danger" icon={AlertTriangle} title="Sesiunea a expirat">
              Reconectează cheia API About You ca să reia trimiterile.
            </Callout>
          )}
          {status.readinessError && (
            <Callout variant="warning" icon={Info}>{status.readinessError}</Callout>
          )}
          {status.ready && (
            <Callout variant="success" icon={CheckCircle} title="Configurarea de bază este completă">
              {/* Nu „vin in pasul urmator": sunt chiar mai jos, pe aceeasi
                  pagina. Un om care citea asta inchidea pagina si aștepta. */}
              Continuă mai jos, pe aceeași pagină: maparea categoriilor, apoi listarea fiecărui produs.
            </Callout>
          )}

          {/* Setări */}
          <Panel title="Setări" className="p-5">
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Field
                label="Curs 1 EUR (în RON)"
                hint={status.fxUpdatedAt
                  ? `Actualizat: ${new Date(status.fxUpdatedAt).toLocaleDateString("ro-RO")}`
                  : undefined}
              >
                <Input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={fxRate} onChange={(e) => setFxRate(e.target.value)}
                  placeholder="ex. 4.97"
                />
              </Field>
              <Field label="Marjă preț (%)">
                <Input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  value={fxMargin} onChange={(e) => setFxMargin(e.target.value)}
                  placeholder="ex. 5"
                />
              </Field>
              <Field
                label="Brand About You"
                /* Lipsa brandului nu e o greseala de completare, deci nu se scrie
                   cu rosu de `error`: e o lipsa din contul lui de la ei. */
                hint={brands !== null && brands.length === 0
                  ? <span className="text-warning">Contul tău About You nu are încă niciun brand aprobat. Adaugă-l în Seller Center.</span>
                  : undefined}
              >
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={brands === null}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
                >
                  <option value="">{brands === null ? "Se încarcă..." : "Alege brandul"}</option>
                  {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Țară de origine (ISO2)">
                <Input
                  type="text" maxLength={2}
                  value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)}
                  placeholder="RO"
                  className="w-24 font-mono uppercase"
                />
              </Field>
              <Field
                label="Public țintă"
                hint="About You împarte catalogul pe Femei / Bărbați / Copii. Folosim asta la maparea automată a categoriilor."
              >
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value as PublicTinta)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {PUBLICURI.map((p) => <option key={p.valoare} value={p.valoare}>{p.eticheta}</option>)}
                </select>
              </Field>
              <Field label="Țări de listare" className="sm:col-span-2">
                {countries === null ? (
                  <p className="text-xs text-muted-foreground">Se încarcă...</p>
                ) : countries.length === 0 ? (
                  <p className="text-xs text-warning">
                    Contul tău About You nu are nicio țară de vânzare activată. Verifică în Seller Center.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {countries.map((c) => {
                        const bifat = shipCountries.includes(c.code);
                        const moneda = monede[c.code];
                        const euro = !moneda || moneda === "EUR";
                        // O tara non-euro deja bifata (mostenita dintr-o salvare
                        // veche) trebuie sa poata fi SCOASA: altfel serverul refuza
                        // orice salvare de setari si comerciantul ramane blocat.
                        return (
                          <button
                            key={c.code}
                            type="button"
                            disabled={!euro && !bifat}
                            title={euro ? undefined : `Prețurile se trimit în euro, iar ${c.name} vinde în ${moneda}.`}
                            onClick={() => setShipCountries((prev) =>
                              bifat ? prev.filter((x) => x !== c.code) : [...prev, c.code])}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                              bifat
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                          >
                            {c.name} ({c.code}){euro ? "" : ` · ${moneda}`}
                          </button>
                        );
                      })}
                    </div>
                    {countries.some((c) => monede[c.code] && monede[c.code] !== "EUR") && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Țările cu altă monedă decât euro sunt indisponibile deocamdată: prețul se trimite în euro
                        și acolo ar fi citit în moneda locală.
                      </p>
                    )}
                  </>
                )}
              </Field>
            </div>

            {/*
              ⚠ COMUTATOR, NU BIFA. Aceeasi hotarare ca la „Mediu de test” de la
              curieri, iar acolo casa foloseste `Switch`. Un `<input type="checkbox">`
              desenat de mana nu se potrivea cu nimic altceva din panou, si se citea
              ca un formular de pe alt site.
            */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Sincronizează automat schimbările de produs, stoc și preț
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Când schimbi ceva în magazin, pleacă singur către About You.
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} className="mt-0.5 flex-shrink-0" />
            </div>

            <Button onClick={handleSaveSettings} disabled={pending}>
              {ruleaza("setari") ? <Loader2 className="animate-spin" /> : null}
              {ruleaza("setari") ? "Se salvează..." : "Salvează setările"}
            </Button>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Livrarea folosește curierii tăi din Edinio (dropshipping); tracking-ul se trimite automat către About You.
            </p>
          </Panel>

          {/*
            ⚠ NOTIFICARILE AU PANOUL LOR, nu un rand la coada Setarilor. Ele nu se
            salveaza cu butonul de acolo: se aprind si se sting pe loc, cu un drum
            pana la About You. Puse langa campurile care asteapta „Salvează”, se
            citeau ca inca o setare nesalvata.
          */}
          <Panel title="Notificări de la About You" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                Cu ele pornite, comenzile, schimbările de stoc și starea produselor ajung în Edinio
                imediat ce se petrec. Fără ele, vin la sincronizarea periodică, cu întârziere.
              </p>
              <EtichetaStare ton={notificariActive ? "bun" : "neutru"} marime="mic" className="flex-shrink-0">
                {notificariActive ? "Notificări active" : "Notificări inactive"}
              </EtichetaStare>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* „Activ" la noi nu inseamna „viu la ei": abonamentul poate fi
                  sters din Seller Center sau creat cu alte evenimente, si atunci
                  tace la nesfarsit. Acum se poate intreba. */}
              {notificariActive && (
                <Button variant="outline" size="sm" onClick={verificaWebhook} disabled={pending}>
                  {ruleaza("verificare") ? <Loader2 className="animate-spin" /> : null}
                  {ruleaza("verificare") ? "Se verifică..." : "Verifică"}
                </Button>
              )}
              {notificariActive ? (
                <Button variant="outline" size="sm" onClick={toggleWebhook} disabled={pending}>
                  {ruleaza("notificari") ? <Loader2 className="animate-spin" /> : null}
                  {ruleaza("notificari") ? "Se procesează..." : "Dezactivează notificările"}
                </Button>
              ) : (
                <Button onClick={toggleWebhook} disabled={pending}>
                  {ruleaza("notificari") ? <Loader2 className="animate-spin" /> : null}
                  {ruleaza("notificari") ? "Se activează..." : "Activează notificările"}
                </Button>
              )}
            </div>

            {diagnoza && (
              <Callout
                variant={diagnoza.ok ? "success" : "warning"}
                icon={diagnoza.ok ? CheckCircle : AlertTriangle}
              >
                {diagnoza.text}
              </Callout>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
