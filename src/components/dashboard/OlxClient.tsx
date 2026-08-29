"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive,
  Loader2, RefreshCw, Check, X, CircleCheck, Clock, CircleX, Settings as SettingsIcon,
  Plug, Tag, ExternalLink, AlertTriangle, Search, Ban, Play, Trash2, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { reincearcaOlxOprite,
  startOlxOAuth, disconnectOlx, saveOlxSettings, publishAllOlx,
  publishOlxProduct, deactivateOlxProduct, activateOlxProduct, deleteOlxAdvert, finishOlxAdvert,
  buyOlxAdvertPacket, searchCities, getCityDistricts,
  type OlxStatus, type OlxAdvertRow,
} from "@/lib/actions/olx.actions";
import type { OlxCity, OlxDistrict } from "@/lib/olx/types";
import { GpsrSettings } from "./GpsrSettings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import OlxConflicte from "./OlxConflicte";
import OlxSanatatePanel from "./OlxSanatate";
import { selectCls } from "@/lib/ui";
import { OlxCategoryMapper } from "./OlxCategoryMapper";
import { OlxAccountPanel } from "./OlxAccountPanel";
import { OlxMessenger } from "./OlxMessenger";

export function OlxClient({ businessId, status, adverts, categories }: {
  businessId: string;
  status: OlxStatus | null;
  adverts: OlxAdvertRow[];
  categories: string[];
}) {
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("olx");
    if (!p) return;
    if (p === "connected") toast.success("Cont OLX conectat.");
    else if (p === "norefresh") toast.error("Reconectează-te și acceptă accesul.");
    else if (p === "error") toast.error("Conectarea OLX a eșuat. Încearcă din nou.");
    /*
     * ⚠ „S-a autorizat la OLX, dar n-am putut salva" NU e acelasi lucru cu „autorizarea a
     * esuat". Codul de autorizare e de unica folosinta si a fost deja consumat, deci omul trebuie
     * sa reia TOT dansul — iar mesajul trebuie sa-i spuna asta, nu sa-l lase sa creada ca a gresit
     * el ceva.
     */
    else if (p === "save_failed") {
      toast.error("Autorizarea la OLX a mers, dar nu am putut salva conexiunea. Apasă din nou pe conectare.");
    }
    window.history.replaceState({}, "", "/dashboard/features/olx");
  }, []);

  if (!status) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Nu am putut încărca starea. Reîncarcă pagina.</div>;
  }

  if (!status.configured) {
    return (
      <EmptyState icon={Clock} title="Disponibil în curând">
        Integrarea OLX se activează în curând pentru magazinul tău. Revino mai târziu.
      </EmptyState>
    );
  }

  if (!status.connected) {
    return (
      <EmptyState icon={Tag} title="Conectează contul OLX">
        Publică-ți produsele ca anunțuri pe OLX.ro direct din Edinio. Sincronizăm automat produsele, stocul și prețurile,
        iar tu urmărești statusul fiecărui anunț dintr-un singur loc.
        <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Publicare produse ca anunțuri OLX</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sincronizare automată stoc și preț</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Pachete și promovări direct din panou</li>
        </ul>
        <Button
          size="lg"
          className="mt-6"
          onClick={() => startBusy(async () => {
            const res = await startOlxOAuth(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            window.location.href = res.url;
          })}
          disabled={busy}
        >
          {busy ? <><Loader2 className="animate-spin" /> Se deschide OLX...</> : <><Plug /> Conectează OLX</>}
        </Button>
      </EmptyState>
    );
  }

  return <ConnectedDashboard businessId={businessId} status={status} adverts={adverts} categories={categories} />;
}

function EmptyState({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-6 w-6" /></div>
      <h2 className="mb-2 text-lg font-bold text-foreground">{title}</h2>
      <div className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function ConnectedDashboard({ businessId, status, adverts, categories }: {
  businessId: string; status: OlxStatus; adverts: OlxAdvertRow[]; categories: string[];
}) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [showSettings, setShowSettings] = useState(!status.ready);
  const [showConflicte, setShowConflicte] = useState(false);

  const c = status.counts;

  // Poll while the queue drains so counts + statuses refresh without a reload.
  useEffect(() => {
    if (c.queued <= 0) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [c.queued, router]);

  return (
    <div className="space-y-6">
      {status.needsReconnect && (
        <Callout variant="warning" icon={AlertTriangle}>
          Sesiunea OLX a expirat. <button className="font-medium underline" onClick={() => startSync(async () => {
            const res = await startOlxOAuth(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            window.location.href = res.url;
          })}>Reconectează contul OLX</button> pentru a relua sincronizarea.
        </Callout>
      )}

      {/* Connection banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><CircleCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Conectat la OLX</p>
            <p className="truncate text-xs text-muted-foreground">{status.olxUserName ?? "Cont OLX"} · {status.advertiserType === "business" ? "Firmă" : "Persoană fizică"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)}>
            <SettingsIcon /> Setări
          </Button>
          <Button
            onClick={() => startSync(async () => {
              const res = await publishAllOlx(businessId);
              if ("error" in res) { toast.error(res.error); return; }
              /*
               * ⚠ CE S-A SARIT SE SPUNE, nu se tace. „Publică tot" nu invie anunturile pe care
               * omul le-a sters dinadins — dar daca numarul ar tace despre ele, el ar crede ca
               * pleaca si alea si s-ar mira mai tarziu ca nu apar.
               */
              const coada = res.queued > 0
                ? `${res.queued} produse adăugate la publicare.`
                : "Niciun produs mapat de publicat.";
              const sarite = res.sarite > 0
                ? ` ${res.sarite} ${res.sarite === 1 ? "anunț a fost șters" : "anunțuri au fost șterse"} de tine și nu se republică`
                  + " automat: publică-le individual dacă le vrei înapoi."
                : "";
              toast.success(coada + sarite);
              router.refresh();
            })}
            disabled={syncing || !status.ready}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Publică tot
          </Button>
        </div>
      </div>

      {!status.ready && status.readinessError && (
        <Callout variant="warning" icon={AlertTriangle}>{status.readinessError} Completează în „Setări”.</Callout>
      )}

      {/*
        ⚠ Sănătatea stă SUS, deasupra numerelor de anunțuri. Alea spun cum arată catalogul; asta
        spune dacă mașinăria care îl duce acolo mai merge — și numai a doua e o veste.
      */}
      <OlxSanatatePanel businessId={businessId} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Anunțuri" value={c.published} icon={Tag} />
        <Kpi label="Active" value={c.active} tone="success" icon={CircleCheck} />
        <Kpi label="În așteptare" value={c.pending} tone="warning" icon={Clock} />
        <Kpi label="Respinse" value={c.rejected} tone="danger" icon={CircleX} />
      </div>
      {c.limited > 0 && (
        <Callout variant="warning" icon={ShoppingBag}>
          {c.limited} {c.limited === 1 ? "anunț a atins" : "anunțuri au atins"} limita de anunțuri gratuite în categoria lor.
          Cumpără un pachet din secțiunea „Cont OLX” de mai jos ca să le activezi — sau închide-le
          din lista de mai jos, dacă nu vrei să plătești acum. {/*
            ⚠ „Limited" era un fund de sac: îi spuneam doar să cumpere. Dacă nu voia, anunțul rămânea
            acolo, numărat, pentru totdeauna. `finish` îl mută în „încheiate" la ei — nu e o ștergere,
            istoricul rămâne, și îl poate reactiva mai târziu cumpărând un pachet.
          */}
        </Callout>
      )}
      {c.queued > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Se publică {c.queued} {c.queued === 1 ? "produs" : "produse"} pe OLX…</p>
            <p className="text-xs text-muted-foreground">Se procesează automat, câteva pe minut. Poți rămâne pe pagină — statusul se actualizează singur.</p>
          </div>
        </div>
      )}
      {/*
        ⚠ „ÎN COADĂ" ȘI „OPRITĂ" NU SUNT ACELAȘI LUCRU (31.08.2026).

        Numărul de mai sus le lua pe toate, iar peste lucrări oprite rotița se învârtea la
        nesfârșit deasupra unei cozi în care nu se mai mișca nimic. Ecranul mințea, cu cea mai
        liniștitoare față cu putință — iar omul aștepta zile în șir ceva ce nu avea să se întâmple.

        ⚠ Cauza cea mai obișnuită e sesiunea expirată, iar aceea se repară singură la reconectare.
        Butonul e pentru celelalte: o pană lungă la ei, o limitare de o zi.
      */}
      {/*
        ⚠ DOUĂ ANUNȚURI PENTRU ACELAȘI PRODUS: ALEGE OMUL (01.09.2026).

        `external_id` n-are constrângere de unicitate la OLX, iar Edinio chiar a avut o fereastră
        în care un `POST` reușit urmat de o interogare anti-duplicat picată ducea la un al doilea.
        Când produsul e vandabil, „care dintre ele e cel bun?" n-are răspuns tehnic: unul poate
        purta istoricul, mesajele și o promovare plătită. Publicarea stă până alege el.
      */}
      {c.conflicte > 0 && (
        <Callout variant="danger" icon={AlertTriangle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {c.conflicte === 1
                ? "Un produs are două anunțuri pe OLX."
                : `${c.conflicte} produse au câte două anunțuri pe OLX.`}{" "}
              Publicarea lor e oprită până alegi pe care îl păstrezi — celălalt se retrage.
            </span>
            <Button variant="outline" size="sm" onClick={() => setShowConflicte((v) => !v)}>
              {showConflicte ? "Ascunde" : "Alege"}
            </Button>
          </div>
          {showConflicte && <OlxConflicte businessId={businessId} onRezolvat={() => router.refresh()} />}
        </Callout>
      )}
      {c.oprite > 0 && (
        <Callout variant="warning" icon={AlertTriangle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {c.oprite} {c.oprite === 1 ? "lucrare s-a oprit" : "lucrări s-au oprit"} după mai multe încercări eșuate.
              Modificările de preț și stoc din ele nu au ajuns la OLX.
            </span>
            <Button variant="outline" size="sm" disabled={syncing} onClick={() => startSync(async () => {
              const res = await reincearcaOlxOprite(businessId);
              if ("error" in res) { toast.error(res.error); return; }
              toast.success(res.reluate > 0
                ? `${res.reluate} ${res.reluate === 1 ? "lucrare reluată" : "lucrări reluate"}. Se procesează în câteva minute.`
                : "Nu mai era nimic oprit.");
              router.refresh();
            })}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reîncearcă
            </Button>
          </div>
        </Callout>
      )}

      {showSettings && <OlxSettings businessId={businessId} status={status} onSaved={() => router.refresh()} />}
      {/*
        ⚠ Sub setările OLX, dar NU o setare de OLX: aceleași date le cer și eMAG, și About You.
        Se arată aici fiindcă aici e comerciantul când conectează primul marketplace — iar textul
        panoului spune limpede că valorile se folosesc pe toate canalele.
      */}
      {showSettings && <GpsrSettings businessId={businessId} />}

      {/* Category mapping */}
      <OlxCategoryMapper businessId={businessId} categories={categories} initialMap={status.categoryMap} />

      {/* Account / monetization */}
      <OlxAccountPanel businessId={businessId} adverts={adverts} />

      {/* Buyer messages (OLX-style messenger) */}
      <OlxMessenger businessId={businessId} adverts={adverts} />

      {/* Advert table */}
      <AdvertTable businessId={businessId} adverts={adverts} ready={status.ready} />

      {/* Disconnect */}
      <div className="flex justify-end">
        <button
          onClick={() => startDisconnect(async () => {
            if (!window.confirm("Sigur deconectezi OLX? Anunțurile rămân pe OLX, dar Edinio nu le mai gestionează.")) return;
            const res = await disconnectOlx(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("OLX deconectat.");
            router.refresh();
          })}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50">
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Deconectează OLX
        </button>
      </div>
    </div>
  );
}

function OlxSettings({ businessId, status, onSaved }: { businessId: string; status: OlxStatus; onSaved: () => void }) {
  const [saving, startSave] = useTransition();
  const [advertiserType, setAdvertiserType] = useState(status.advertiserType);
  const [cityId, setCityId] = useState<number | undefined>(status.cityId);
  const [cityName, setCityName] = useState(status.cityName ?? "");
  const [districtId, setDistrictId] = useState<number | undefined>(status.districtId);
  const [districts, setDistricts] = useState<OlxDistrict[]>([]);
  const [contactName, setContactName] = useState(status.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(status.contactPhone ?? "");
  const [courier, setCourier] = useState(status.courierEnabled);
  const [autoSync, setAutoSync] = useState(status.autoSync);
  const [autoExtend, setAutoExtend] = useState(status.autoExtend);

  // City autocomplete
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<OlxCity[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatieCautare = useRef(0);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    getCityDistricts(businessId, cityId).then((r) => { if (!cancelled) setDistricts("error" in r ? [] : r.districts); });
    return () => { cancelled = true; };
  }, [businessId, cityId]);

  function onCityQuery(q: string) {
    setCityQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { generatieCautare.current++; setCityResults([]); return; }
    setSearching(true);
    // `clearTimeout` anuleaza doar un temporizator IN ASTEPTARE, nu o cerere
    // deja plecata. Fara numarul de generatie, raspunsul lent pentru „buc"
    // sosea dupa cel pentru „bucuresti" si il suprascria — omul vedea orase
    // care nu corespund cu ce scrisese.
    const a_mea = ++generatieCautare.current;
    searchTimer.current = setTimeout(async () => {
      const res = await searchCities(businessId, q);
      if (a_mea !== generatieCautare.current) return;
      setCityResults("error" in res ? [] : res.cities);
      setSearching(false);
    }, 350);
  }

  function pickCity(city: OlxCity) {
    setCityId(city.id);
    setCityName(city.name);
    setCityQuery("");
    setCityResults([]);
    setDistrictId(undefined);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Setări anunțuri OLX</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SettingField label="Tip vânzător">
          <select aria-label="Tip vânzător" value={advertiserType} onChange={(e) => setAdvertiserType(e.target.value as "private" | "business")} className={selectCls}>
            <option value="private">Persoană fizică</option>
            <option value="business">Firmă</option>
          </select>
        </SettingField>

        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-foreground">Localitate</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={cityQuery || cityName}
              onChange={(e) => onCityQuery(e.target.value)}
              placeholder="Caută orașul..."
            />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {cityResults.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
              {cityResults.map((city) => (
                <button key={city.id} onClick={() => pickCity(city)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted">
                  <span className="text-sm text-foreground">{city.name}</span>
                  {city.county && <span className="text-xs text-muted-foreground">jud. {city.county}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {districts.length > 0 && (
          <SettingField label="Cartier (opțional)">
            <select aria-label="Cartier" value={districtId ?? ""} onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : undefined)} className={selectCls}>
              <option value="">— fără cartier —</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </SettingField>
        )}

        <SettingField label="Nume de contact" required><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="numele afișat pe anunț" /></SettingField>
        <SettingField label="Telefon de contact" required><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="07xxxxxxxx" /></SettingField>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle checked={courier} onChange={setCourier} label="Livrare prin OLX" />
        <Toggle checked={autoSync} onChange={setAutoSync} label="Sincronizare automată" />
        <Toggle checked={autoExtend} onChange={setAutoExtend} label="Reînnoire automată" />
      </div>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => startSave(async () => {
            if (!cityId) { toast.error("Alege localitatea."); return; }
            if (!contactName.trim()) { toast.error("Completează numele de contact."); return; }
            if (!contactPhone.trim()) { toast.error("Completează telefonul de contact."); return; }
            const district = districts.find((d) => d.id === districtId);
            const res = await saveOlxSettings(businessId, {
              advertiser_type: advertiserType,
              city_id: cityId, city_name: cityName,
              district_id: districtId ?? null, district_name: district?.name ?? null,
              contact_name: contactName, contact_phone: contactPhone,
              courier_enabled: courier, auto_sync: autoSync, auto_extend: autoExtend,
            });
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Setări salvate.");
            onSaved();
          })}
          disabled={saving}>
          {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : "Salvează setările"}
        </Button>
      </div>
    </div>
  );
}

function AdvertTable({ businessId, adverts, ready }: { businessId: string; adverts: OlxAdvertRow[]; ready: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  function act(offerId: string, fn: () => Promise<{ success: true } | { error: string }>, okMsg: string) {
    setBusyId(offerId);
    fn().then((res) => {
      setBusyId(null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(okMsg);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Anunțuri pe OLX</h3>
        <span className="text-xs text-muted-foreground">({adverts.length})</span>
      </div>
      {adverts.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {ready ? "Încă niciun anunț publicat. Apasă „Publică tot” sau publică produse individual." : "Completează setările și mapează categoriile ca să poți publica anunțuri."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {adverts.map((a) => {
            const rowBusy = busyId === a.offer_id;
            const canDeactivate = ["active", "new", "unconfirmed"].includes(a.status);
            const canActivate = ["removed_by_user", "outdated"].includes(a.status);
            const isLimited = a.status === "limited" && !!a.olx_advert_id;
            return (
              <div key={a.offer_id} className="flex items-center gap-3 px-5 py-3">
                <AdvertStatusBadge status={a.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                    {a.olx_url && <a href={a.olx_url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                  {/*
                    ⚠ MOTIVUL LOR, CUVANT CU CUVANT (01.09.2026). Până azi omul vedea „Moderat" și
                    atât, iar singurul lui drum era suportul — care nu știa nici el, fiindcă nici
                    Edinio nu întrebase. Textul se arată ca atare: reformulat, ar deveni
                    presupunerea noastră despre ce au vrut ei să zică, și omul ar corecta altceva.
                  */}
                  {a.moderation_text ? (
                    <p className="text-xs text-destructive">
                      <span className="font-medium">OLX a respins anunțul:</span> {a.moderation_text}
                    </p>
                  ) : a.error ? (
                    <p className="truncate text-xs text-destructive">{a.error}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{a.last_synced_at ? "Sincronizat" : "În coadă"}</p>
                  )}
                  {/*
                    ⚠ `null` înseamnă „nu știm", nu „nimeni": de-aia nu se scrie zero, și de-aia
                    rândul lipsește cu totul până vine primul răspuns de la ei.
                  */}
                  {(a.stat_vizualizari != null || a.stat_telefon != null || a.stat_urmaritori != null) && (
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                      {a.stat_vizualizari != null && <span>{a.stat_vizualizari.toLocaleString("ro-RO")} vizualizări</span>}
                      {a.stat_telefon != null && <span>{a.stat_telefon.toLocaleString("ro-RO")} telefon afișat</span>}
                      {a.stat_urmaritori != null && <span>{a.stat_urmaritori.toLocaleString("ro-RO")} urmăritori</span>}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {rowBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {a.product_id && (
                        <IconBtn title="Republică" onClick={() => act(a.offer_id, () => publishOlxProduct(businessId, a.product_id!).then((r) => "error" in r ? r : { success: true as const }), "Anunț republicat.")}><RefreshCw className="h-3.5 w-3.5" /></IconBtn>
                      )}
                      {canDeactivate && a.product_id && (
                        <IconBtn title="Dezactivează" onClick={() => act(a.offer_id, () => deactivateOlxProduct(businessId, a.product_id!), "Anunț dezactivat.")}><Ban className="h-3.5 w-3.5" /></IconBtn>
                      )}
                      {canActivate && a.product_id && (
                        <IconBtn title="Activează" onClick={() => act(a.offer_id, () => activateOlxProduct(businessId, a.product_id!), "Anunț activat.")}><Play className="h-3.5 w-3.5" /></IconBtn>
                      )}
                      {isLimited && (
                        <IconBtn title="Cumpără pachet și activează" onClick={() => {
                          if (!window.confirm(`Cumperi un pachet pentru anunțul „${a.name}” (se plătește din creditul contului tău OLX) și îl activezi?`)) return;
                          act(a.offer_id, () => buyOlxAdvertPacket(businessId, a.olx_advert_id!), "Pachet cumpărat, anunț activat.");
                        }}><ShoppingCart className="h-3.5 w-3.5" /></IconBtn>
                      )}
                      {/*
                        ⚠ CEALALTĂ IEȘIRE DIN „LIMITED". Până azi îi spuneam doar să cumpere; dacă
                        nu voia, anunțul rămânea acolo, numărat, pentru totdeauna. `finish` îl mută
                        în „încheiate" la ei — nu e ștergere, istoricul rămâne, și poate reveni.
                      */}
                      {isLimited && a.olx_advert_id && (
                        <IconBtn title="Închide anunțul (fără să cumperi)" onClick={() => {
                          if (!window.confirm(`Închizi anunțul „${a.name}” pe OLX? Nu se șterge — îl poți reactiva mai târziu cumpărând un pachet.`)) return;
                          act(a.offer_id, () => finishOlxAdvert(businessId, a.olx_advert_id!), "Anunț închis pe OLX.");
                        }}><Archive className="h-3.5 w-3.5" /></IconBtn>
                      )}
                      <IconBtn title="Șterge anunțul" danger onClick={() => {
                        if (!window.confirm(`Sigur ștergi anunțul „${a.name}” de pe OLX? Acțiunea nu poate fi anulată.`)) return;
                        act(a.offer_id, () => deleteOlxAdvert(businessId, a.offer_id), "Anunț șters de pe OLX.");
                      }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick}
      className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted", danger ? "hover:text-destructive" : "hover:text-foreground")}>
      {children}
    </button>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone?: "success" | "warning" | "danger"; icon?: React.ElementType }) {
  const toneCls =
    tone === "success" ? "bg-success/10 text-success"
    : tone === "warning" ? "bg-warning/10 text-warning"
    : tone === "danger" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}>
          {Icon ? <Icon className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function AdvertStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active: { label: "Activ", cls: "bg-success/10 text-success", icon: CircleCheck },
    new: { label: "În moderare", cls: "bg-warning/10 text-warning", icon: Clock },
    unconfirmed: { label: "În moderare", cls: "bg-warning/10 text-warning", icon: Clock },
    unpaid: { label: "Neplătit", cls: "bg-warning/10 text-warning", icon: Clock },
    limited: { label: "Limită atinsă", cls: "bg-warning/10 text-warning", icon: ShoppingBag },
    removed_by_user: { label: "Dezactivat", cls: "bg-muted text-muted-foreground", icon: Ban },
    /* ⚠ Sters de om: randul ramane, ca sincronizarea sa nu recreeze anuntul. „Postează pe OLX" e iesirea. */
    sters_de_om: { label: "Șters de tine", cls: "bg-muted text-muted-foreground", icon: Ban },
    outdated: { label: "Expirat", cls: "bg-muted text-muted-foreground", icon: Clock },
    moderated: { label: "Respins", cls: "bg-destructive/10 text-destructive", icon: CircleX },
    blocked: { label: "Blocat", cls: "bg-destructive/10 text-destructive", icon: CircleX },
    disabled: { label: "Dezactivat de OLX", cls: "bg-destructive/10 text-destructive", icon: CircleX },
    removed_by_moderator: { label: "Șters de OLX", cls: "bg-destructive/10 text-destructive", icon: CircleX },
    error: { label: "Eroare", cls: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  };
  const s = map[status] ?? map.new;
  const Icon = s.icon;
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", s.cls)}><Icon className="h-3 w-3" /> {s.label}</span>;
}

function SettingField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <div><label className="mb-1 block text-xs font-medium text-foreground">{label}{required && <span className="text-destructive"> *</span>}</label>{children}</div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}
