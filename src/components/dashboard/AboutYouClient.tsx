"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
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

const PREREQUISITES = [
  "Cont About You Seller Center aprobat (contract + verificare). Integrarea folosește cheia ta API.",
  "Produse fashion/lifestyle cu brand aprobat pe About You.",
  "Cod EAN (GTIN) pentru fiecare mărime a produsului.",
  "Prețurile pe About You sunt în EUR (conversia din RON o facem automat).",
];

export function AboutYouClient({ businessId, status }: { businessId: string; status: AboutYouStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Integrarea About You este momentan indisponibilă. Revino în curând.
      </div>
    );
  }

  const handleConnect = () => {
    if (apiKey.trim().length < 8) { toast.error("Introdu cheia API din Seller Center."); return; }
    startTransition(async () => {
      const res = await connectAboutYou(businessId, apiKey, environment);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont About You conectat.");
      setApiKey("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    if (!window.confirm("Sigur deconectezi About You? Listările locale se șterg (produsele rămân pe About You).")) return;
    startTransition(async () => {
      const res = await disconnectAboutYou(businessId);
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

    startTransition(async () => {
      const res = await saveAboutYouSettings(businessId, {
        fx_rate: rate,
        fx_margin_pct: margin,
        brand_id: bId,
        brand_name: bId == null ? null : (brands?.find((b) => b.id === bId)?.name ?? null),
        ship_countries: shipCountries,
        default_country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
        auto_sync: autoSync,
        target_audience: targetAudience,
      });
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
    startTransition(async () => {
      aplicaNotificari(noua);
      const res = noua
        ? await subscribeAboutYouWebhook(businessId)
        : await unsubscribeAboutYouWebhook(businessId);
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
  const verificaWebhook = () => startTransition(async () => {
    const d = await getAboutYouWebhookDiagnoza(businessId);
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

  return (
    <div className="space-y-6">
      {/* Prerequisites */}
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-900">Înainte de a începe</p>
        </div>
        <ul className="space-y-1.5">
          {PREREQUISITES.map((p) => (
            <li key={p} className="text-xs text-amber-900/90 flex gap-2">
              <span className="text-amber-600">•</span><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {!status.connected ? (
        /* ── Connect form ── */
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Conectează contul About You</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Generează o cheie API în Seller Center: Settings {">"} API Keys {">"} + Add. Copiaz-o aici (se afișează o singură dată).
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mediu</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="production">Producție (date reale)</option>
                <option value="sandbox">Sandbox (testare)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Cheie API</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Lipește cheia API About You"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Se verifică..." : "Conectează și testează"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Connected ── */
        <>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-foreground">Cont conectat</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {status.environment === "sandbox" ? "Sandbox" : "Producție"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Cheie: <span className="font-mono">{status.apiKeyMasked}</span>
                  {status.sellerName ? ` · ${status.sellerName}` : ""}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                Deconectează
              </button>
            </div>

            {status.needsReconnect && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                Sesiunea a expirat. Reconectează cheia API.
              </div>
            )}
            {status.readinessError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{status.readinessError}</span>
              </div>
            )}
            {status.ready && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                {/* Nu „vin in pasul urmator": sunt chiar mai jos, pe aceeasi
                    pagina. Un om care citea asta inchidea pagina si aștepta. */}
                Configurarea de bază este completă. Continuă mai jos, pe aceeași pagină: maparea categoriilor,
                apoi listarea fiecărui produs.
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Listări", value: status.counts.listings },
                { label: "Publicate", value: status.counts.published },
                { label: "Respinse", value: status.counts.rejected },
                { label: "În coadă", value: status.counts.queued },
              ].map((c) => (
                <div key={c.label} className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="text-lg font-semibold text-foreground">{c.value}</div>
                  <div className="text-[11px] text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-foreground mb-4">Setări</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Curs 1 EUR (în RON)</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={fxRate} onChange={(e) => setFxRate(e.target.value)}
                  placeholder="ex. 4.97"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {status.fxUpdatedAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Actualizat: {new Date(status.fxUpdatedAt).toLocaleDateString("ro-RO")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Marjă preț (%)</label>
                <input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  value={fxMargin} onChange={(e) => setFxMargin(e.target.value)}
                  placeholder="ex. 5"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Brand About You</label>
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={brands === null}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">{brands === null ? "Se încarcă..." : "Alege brandul"}</option>
                  {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {brands !== null && brands.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Contul tău About You nu are încă niciun brand aprobat. Adaugă-l în Seller Center.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Țară de origine (ISO2)</label>
                <input
                  type="text" maxLength={2}
                  value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)}
                  placeholder="RO"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Public țintă</label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value as PublicTinta)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {PUBLICURI.map((p) => <option key={p.valoare} value={p.valoare}>{p.eticheta}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  About You împarte catalogul pe Femei / Bărbați / Copii. Folosim asta la maparea automată a categoriilor.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Țări de listare</label>
                {countries === null ? (
                  <p className="text-xs text-muted-foreground">Se încarcă...</p>
                ) : countries.length === 0 ? (
                  <p className="text-xs text-amber-700">
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
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Țările cu altă monedă decât euro sunt indisponibile deocamdată: prețul se trimite în euro
                        și acolo ar fi citit în moneda locală.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="rounded" />
              Sincronizează automat schimbările de produs, stoc și preț
            </label>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Notificări About You (stoc)</p>
                <p className="text-xs text-muted-foreground">
                  {notificariActive ? "Active — stocul se sincronizează în ambele sensuri." : "Inactive."}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* „Activ" la noi nu inseamna „viu la ei": abonamentul poate fi
                    sters din Seller Center sau creat cu alte evenimente, si atunci
                    tace la nesfarsit. Acum se poate intreba. */}
                {notificariActive && (
                  <button onClick={verificaWebhook} disabled={pending}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60">
                    Verifică
                  </button>
                )}
                <button
                  onClick={toggleWebhook}
                  disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {notificariActive ? "Dezactivează" : "Activează"}
                </button>
              </div>
            </div>

            {diagnoza && (
              <div className={`mt-2 rounded-lg px-3 py-2 text-xs border ${
                diagnoza.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-900"
              }`}>
                {diagnoza.text}
              </div>
            )}

            <div className="mt-4">
              <button
                onClick={handleSaveSettings}
                disabled={pending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? "Se salvează..." : "Salvează setările"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Livrarea folosește curierii tăi din Edinio (dropshipping); tracking-ul se trimite automat către About You.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
