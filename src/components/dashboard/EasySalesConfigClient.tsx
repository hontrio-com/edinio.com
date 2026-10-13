"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Loader2, Pause, Play, Send, ShieldCheck } from "lucide-react";
import {
  aSositLivrareaEasySales, conecteazaEasySales, deconecteazaEasySales, numaraComenzileDeschiseEasySales,
  pauzaEasySales, salveazaSetarileEasySales, seteazaComenzileEasySales, testeazaConexiuneaEasySales,
  trimiteComenzileDeschiseEasySales, trimiteEvenimentDeProbaEasySales, verificaDateleEasySales,
} from "@/lib/actions/easysales.actions";
import type { StareEasySales } from "@/lib/easysales/panou";
import type { RaportSanatate } from "@/lib/easysales/sanatate";
import type { CanalDeclarat, ContEasySales } from "@/lib/easysales/tipuri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";

/**
 * Panoul easySales (planul, §7.4).
 *
 * ⚠ Conectarea e in DOUA TREPTE: „Verifica datele" (emite tokenul, citeste contul si website-urile)
 * si „Conecteaza" (alegerea website-ului, canalele, bifele). Nimic nu porneste automat: comenzile au
 * comutatorul lor, stins.
 *
 * ⚠ „Testeaza conexiunea" nu salveaza nimic si nu emite token: o emitere ar revoca tokenul in uz.
 */

/** Canalele pe care le poate vinde un comerciant prin easySales, pe tara. */
const CANALE: { canal: string; tara: string; eticheta: string }[] = [
  { canal: "emag", tara: "ro", eticheta: "eMAG România" },
  { canal: "emag", tara: "hu", eticheta: "eMAG Ungaria" },
  { canal: "emag", tara: "bg", eticheta: "eMAG Bulgaria" },
  { canal: "trendyol", tara: "ro", eticheta: "Trendyol România" },
  { canal: "trendyol", tara: "bg", eticheta: "Trendyol Bulgaria" },
  { canal: "trendyol", tara: "gr", eticheta: "Trendyol Grecia" },
  { canal: "aboutyou", tara: "ro", eticheta: "About You România" },
  { canal: "olx", tara: "ro", eticheta: "OLX România" },
  { canal: "pepita", tara: "hu", eticheta: "Pepita Ungaria" },
];

const NUME_STARE: Record<string, string> = {
  asteapta_plata: "Așteaptă plata",
  de_trimis: "De trimis",
  trimisa: "Trimisă",
  necunoscuta: "Se verifică",
  refuzata: "Refuzată de easySales",
  respinsa_local: "Oprită înainte de trimitere",
  blocata_plafon: "Plafon easySales atins",
  conflict: "De verificat în easySales",
  abandonata: "Netrimisă în 48 de ore",
  anulata_inainte: "Anulată înainte de trimitere",
  preluata_edinio: "Preluată în Edinio",
};

const SLUG_CITIBIL: Record<string, string> = {
  "order-created": "Comandă nouă",
  "order-updated": "Comandă modificată",
  "awb-created": "AWB emis",
  "invoice-created": "Factură emisă",
  "storno-invoice-created": "Factură stornată",
  "delivery-status-updated": "Stare livrare",
  "account-suspended": "Cont suspendat",
  "account-activated": "Cont reactivat",
  "products-refresh-requested": "Reîmprospătare produse",
  "stock-refresh-requested": "Reîmprospătare stoc",
};

function data(iso: string | null | undefined): string {
  if (!iso) return "niciodată";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "necunoscut" : d.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

function cheieCanal(c: { canal: string; tara: string }): string {
  return `${c.canal}:${c.tara}`;
}

function AlegereCanale({ alese, onChange }: { alese: CanalDeclarat[]; onChange: (c: CanalDeclarat[]) => void }) {
  const set = new Set(alese.map(cheieCanal));
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {CANALE.map((c) => (
        <label key={cheieCanal(c)} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={set.has(cheieCanal(c))}
            onChange={(e) => onChange(e.target.checked
              ? [...alese, { canal: c.canal, tara: c.tara }]
              : alese.filter((x) => cheieCanal(x) !== cheieCanal(c)))}
          />
          {c.eticheta}
        </label>
      ))}
    </div>
  );
}

function Cont({ cont }: { cont: ContEasySales | null }) {
  if (!cont) return <p className="text-sm text-muted-foreground">Datele contului nu se pot citi cu acest token (easySales nu le dă grantului de website).</p>;
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <dt className="text-muted-foreground">Firma</dt><dd>{cont.firma ?? "necunoscută"} {cont.vat_id ? `(${cont.vat_id})` : ""}</dd>
      <dt className="text-muted-foreground">CUI față de magazin</dt>
      <dd>{cont.potrivire_cui === "da" ? "Același" : cont.potrivire_cui === "nu" ? "Diferit: verifică dacă e contul potrivit" : cont.potrivire_cui === "cui_lipsa" ? "Magazinul n-are CUI în Edinio" : "Necunoscut"}</dd>
      <dt className="text-muted-foreground">Abonament</dt><dd>{cont.abonament_activ === false ? "Inactiv" : cont.abonament_activ ? (cont.proba ? "Perioadă de probă" : "Activ") : "Necunoscut"}</dd>
      <dt className="text-muted-foreground">Expiră</dt><dd>{cont.expira_la ? data(cont.expira_la) : "necunoscut"}</dd>
      <dt className="text-muted-foreground">Comenzi în abonament</dt><dd>{cont.comenzi_curente ?? "?"} din {cont.max_comenzi ?? "?"}</dd>
    </dl>
  );
}

export function EasySalesConfigClient({ businessId, stare }: { businessId: string; stare: StareEasySales }) {
  const router = useRouter();
  const [lucru, setLucru] = useState<string | null>(null);

  /* Treapta A */
  const [clientId, setClientId] = useState(stare.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [websiteToken, setWebsiteToken] = useState("");
  const [verificare, setVerificare] = useState<{ websiteuri: { name: string; url: string | null; status: string | null }[]; cont: ContEasySales | null; avertismente: string[] } | null>(null);

  /* Treapta B */
  const [website, setWebsite] = useState(stare.websiteNume ?? "");
  const [canale, setCanale] = useState<CanalDeclarat[]>(stare.setari.canale);
  const [bife, setBife] = useState({ sursaStocWebsite: false, clientDedicat: false, websiteInRon: false, statusCustomGol: false });

  /* Conectat */
  const [raport, setRaport] = useState<RaportSanatate | null>(null);
  const [proba, setProba] = useState<"" | "asteapta" | "sosita" | "nesosita">("");
  const [serie, setSerie] = useState(stare.setari.serieFacturi);
  const [varianta, setVarianta] = useState<"incasat" | "definitie">(stare.setari.variantaTotal);
  const [zile, setZile] = useState("7");
  const [deschise, setDeschise] = useState<number | null>(null);

  const conectat = stare.conectat;

  async function faCu<T>(eticheta: string, fn: () => Promise<T>): Promise<T | null> {
    setLucru(eticheta);
    try { return await fn(); } catch { toast.error("A apărut o eroare. Încearcă din nou."); return null; } finally { setLucru(null); }
  }

  async function verifica() {
    const r = await faCu("verifica", () => verificaDateleEasySales(businessId, { client_id: clientId, client_secret: secret, website_token: websiteToken }));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    setVerificare({ websiteuri: r.websiteuri, cont: r.cont, avertismente: r.avertismente });
    setSecret("");
    setWebsiteToken("");
    toast.success("Datele sunt bune. Alege website-ul.");
  }

  async function conecteaza() {
    const r = await faCu("conecteaza", () => conecteazaEasySales(businessId, { website_nume: website, canale, bife }));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    const esuate = Object.values(r.abonari.sluguri).filter((s) => s && (s.rezultat === "refuzata" || s.rezultat === "eroare")).length;
    toast.success(esuate ? `Conectat. ${esuate} notificări n-au putut fi abonate; se reîncearcă zilnic.` : "Conectat la easySales.");
    router.refresh();
  }

  async function testeaza() {
    const r = await faCu("test", () => testeazaConexiuneaEasySales(businessId));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    setRaport(r);
  }

  async function probaWebhook() {
    const r = await faCu("proba", () => trimiteEvenimentDeProbaEasySales(businessId));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    setProba("asteapta");
    for (let i = 0; i < 10; i++) {
      await new Promise((rez) => setTimeout(rez, 3000));
      const s = await aSositLivrareaEasySales(businessId, r.trimisLa);
      if (!("error" in s) && s.sosita) { setProba("sosita"); return; }
    }
    setProba("nesosita");
  }

  async function comutaComenzile(v: boolean) {
    const r = await faCu("comenzi", () => seteazaComenzileEasySales(businessId, v));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(v ? "Comenzile noi pleacă în easySales." : `Trimiterea s-a oprit.${r.intoarse ? ` ${r.intoarse} comenzi netrimise se procesează acum din Edinio.` : ""}`);
    router.refresh();
  }

  async function salveaza() {
    const r = await faCu("setari", () => salveazaSetarileEasySales(businessId, { serie_facturi: serie, varianta_total: varianta, canale }));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Setările s-au salvat.");
    router.refresh();
  }

  async function pauza(v: boolean) {
    const r = await faCu("pauza", () => pauzaEasySales(businessId, v));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    router.refresh();
  }

  async function deconecteaza() {
    const r = await faCu("deconectare", () => deconecteazaEasySales(businessId));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(r.intoarse ? `Deconectat. ${r.intoarse} comenzi netrimise se procesează din Edinio.` : "Deconectat de la easySales.");
    router.refresh();
  }

  async function numaraDeschise() {
    const r = await faCu("numara", () => numaraComenzileDeschiseEasySales(businessId, Number(zile)));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    setDeschise(r.cate);
  }

  async function trimiteDeschise() {
    const r = await faCu("deschise", () => trimiteComenzileDeschiseEasySales(businessId, Number(zile)));
    if (!r) return;
    if ("error" in r) { toast.error(r.error); return; }
    setDeschise(null);
    toast.success(`${r.trimise} comenzi pleacă în easySales${r.sarite ? `; ${r.sarite} n-au putut pleca (livrare sau plată nepotrivită)` : ""}.`);
    router.refresh();
  }

  if (!stare.disponibila && !conectat) {
    return (
      <Callout variant="neutral" icon={ShieldCheck} title="Integrarea easySales nu e încă deschisă tuturor magazinelor">
        O deschidem întâi unui magazin pilot. Dacă vrei să o folosești, scrie-ne la suport.
      </Callout>
    );
  }

  if (!conectat) {
    return (
      <div className="space-y-4">
        {stare.reconectare && <Callout variant="warning" icon={AlertTriangle} title="Reconectează integrarea">{stare.reconectare}</Callout>}
        <Panel title="Datele din easySales" step={1}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>În easySales: Integrări, Magazine, Conectare Website. Alege România, RON, cotele de TVA ca în magazin și „Sursă stoc produse: Website”. Lasă gol „Status custom pentru comanda nouă”. La API alege „API V2” și copiază <b>website token-ul</b>.</li>
            <li>În easySales: Setări, Setări API, client nou de tip <b>Website Grant</b>, numit „Edinio”. Copiază <b>ID Client</b> și <b>Secretul</b>.</li>
            <li>Folosește un client API și un website <b>noi</b>, numai pentru acest magazin.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ID Client"><Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
            <Field label="Secret" hint={stare.secrete.client_secret ? "Salvat. Lasă gol ca să-l păstrezi." : undefined}><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
            <Field label="Website token" hint={stare.secrete.website_token ? "Salvat. Lasă gol ca să-l păstrezi." : undefined}><Input type="password" value={websiteToken} onChange={(e) => setWebsiteToken(e.target.value)} /></Field>
          </div>
          <Callout variant="warning" icon={AlertTriangle}>Dacă acest client API e folosit de alt program, acela va fi deconectat: easySales ține un singur token pe client.</Callout>
          <Button onClick={verifica} disabled={lucru !== null || !clientId.trim()}>
            {lucru === "verifica" ? <Loader2 className="animate-spin" /> : <CheckCircle />} Verifică datele
          </Button>
          {verificare && (
            <div className="space-y-3">
              {verificare.avertismente.map((a) => <Callout key={a} variant="warning" icon={AlertTriangle}>{a}</Callout>)}
              <Cont cont={verificare.cont} />
            </div>
          )}
        </Panel>

        {(verificare || stare.secrete.token) && (
          <Panel title="Alege website-ul și conectează" step={2}>
            <Field label="Website-ul easySales al acestui magazin">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)}>
                <option value="">Alege…</option>
                {(verificare?.websiteuri ?? (stare.websiteNume ? [{ name: stare.websiteNume, url: null, status: null }] : [])).map((w) => (
                  <option key={w.name} value={w.name}>{w.name}{w.status && w.status !== "active" ? ` (${w.status})` : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Canalele pe care le vinzi prin easySales" hint="Un canal se vinde fie direct din Edinio, fie prin easySales, niciodată pe amândouă.">
              <AlegereCanale alese={canale} onChange={setCanale} />
            </Field>
            <div className="space-y-2 text-sm">
              {([
                ["sursaStocWebsite", "În easySales, „Sursă stoc produse” e „Website” la acest website."],
                ["clientDedicat", "Clientul API e folosit numai de Edinio."],
                ["websiteInRon", "Website-ul a fost creat în RON (moneda nu se mai poate schimba)."],
                ["statusCustomGol", "„Status custom pentru comanda nouă” e gol."],
              ] as const).map(([k, t]) => (
                <label key={k} className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={bife[k]} onChange={(e) => setBife({ ...bife, [k]: e.target.checked })} />
                  {t}
                </label>
              ))}
            </div>
            <Button onClick={conecteaza} disabled={lucru !== null || !website}>
              {lucru === "conecteaza" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Conectează
            </Button>
          </Panel>
        )}
      </div>
    );
  }

  const probleme = stare.probleme;
  return (
    <div className="space-y-4">
      {stare.reconectare && <Callout variant="danger" icon={AlertTriangle} title="Reconectează integrarea">{stare.reconectare}</Callout>}
      {stare.pauza && <Callout variant="warning" icon={Pause} title="Integrarea e în pauză">{stare.pauza} Comenzile așteaptă și pleacă la reluare.</Callout>}

      <Panel title="Conexiune">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p>Website: <b>{stare.websiteNume}</b></p>
            <p className="text-muted-foreground">Client API: {stare.clientId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={testeaza} disabled={lucru !== null}>
              {lucru === "test" ? <Loader2 className="animate-spin" /> : <CheckCircle />} Testează conexiunea
            </Button>
            <Button variant="outline" size="sm" onClick={probaWebhook} disabled={lucru !== null || proba === "asteapta"}>
              {proba === "asteapta" ? <Loader2 className="animate-spin" /> : <Send />} Trimite un eveniment de probă
            </Button>
            <Button variant="outline" size="sm" onClick={() => pauza(!stare.pauza)} disabled={lucru !== null}>
              {stare.pauza ? <Play /> : <Pause />} {stare.pauza ? "Reia" : "Pune pe pauză"}
            </Button>
            <ButonDeconectare
              nume="easySales"
              pending={lucru === "deconectare"}
              cePierzi="Se șterg din Edinio tokenul, secretul și website token-ul, iar notificările de la easySales se dezabonează. Comenzile netrimise trec în Edinio; cele deja trimise rămân în easySales. Apoi șterge clientul API din easySales (Setări API)."
              onConfirma={deconecteaza}
            />
          </div>
        </div>
        <Cont cont={stare.cont} />
        {proba === "sosita" && <Callout variant="success" icon={CheckCircle}>Evenimentul de probă a ajuns în Edinio.</Callout>}
        {proba === "nesosita" && <Callout variant="warning" icon={AlertTriangle}>Evenimentul de probă n-a ajuns în 30 de secunde. Starea comenzilor se aduce oricum la câteva minute.</Callout>}
        {raport && (
          <div className="space-y-2 text-sm">
            <p>Token: <b>{raport.token === "valabil" ? "valabil" : raport.token === "refuzat" ? "refuzat (reconectează)" : "nu s-a putut verifica acum"}</b>; website: <b>{raport.website === "activ" ? "activ" : raport.website === "neconfirmat_activ" ? "nu apare activ" : "necunoscut"}</b>.</p>
            {raport.mesaje.map((m) => <p key={m} className="text-muted-foreground">{m}</p>)}
            {raport.abonari.length > 0 && (
              <ul className="grid gap-1 sm:grid-cols-2">
                {raport.abonari.map((a) => (
                  <li key={`${a.slug}-${a.id}`}>{SLUG_CITIBIL[a.slug] ?? a.slug}: {a.reusita === null ? "fără livrări încă" : a.reusita ? "ultima livrare reușită" : `ultima livrare eșuată (${a.cod ?? "?"})`}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Notificări: {stare.abonari.filter((a) => a.abonat).length} din {stare.abonari.length} abonate; ultima primită: {data(stare.ultimaLivrare)}; semnătură {stare.semnatura.mod === "impune" ? "verificată" : "în măsurare"}.
        </div>
      </Panel>

      <Panel title="Comenzile magazinului în easySales">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Comenzile noi pleacă automat în easySales, unde se fac <b>factura și AWB-ul</b>. Statusul și AWB-ul se întorc aici.</p>
            <p>Rămân în Edinio: ridicarea personală, curierul propriu, punctele de ridicare (lockere), livrările în afara României, comenzile în altă monedă și cele cu fișiere de personalizare. Comenzile plătite online pleacă după încasare.</p>
          </div>
          <Switch checked={stare.comutatoare.comenzi} disabled={lucru !== null} onCheckedChange={(v) => comutaComenzile(v)} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(stare.contoare).map(([k, v]) => (
            <span key={k} className="rounded-md bg-muted px-2 py-1">{NUME_STARE[k] ?? k}: <b>{v}</b></span>
          ))}
        </div>
        {stare.comutatoare.comenzi && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Trimite și comenzile deschise din ultimele (zile)" hint="Numai cele fără factură și fără AWB din Edinio.">
              <Input className="w-24" type="number" min={1} max={30} value={zile} onChange={(e) => { setZile(e.target.value); setDeschise(null); }} />
            </Field>
            {deschise === null ? (
              <Button variant="outline" size="sm" onClick={numaraDeschise} disabled={lucru !== null}>Vezi câte sunt</Button>
            ) : (
              <Button size="sm" onClick={trimiteDeschise} disabled={lucru !== null || deschise === 0}>
                {lucru === "deschise" ? <Loader2 className="animate-spin" /> : <Send />} Trimite {deschise} comenzi
              </Button>
            )}
          </div>
        )}
        {deschise !== null && deschise > 0 && (
          <Callout variant="warning" icon={AlertTriangle}>Fiecare comandă trimisă intră în plafonul de comenzi al abonamentului easySales, iar automatizările lor (factură, AWB, SMS) se aplică și ei.</Callout>
        )}
      </Panel>

      {probleme.length > 0 && (
        <Panel title="Comenzi de verificat">
          <ul className="divide-y text-sm">
            {probleme.map((p) => (
              <li key={p.orderId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/dashboard/orders/${p.orderId}`} className="font-medium underline-offset-2 hover:underline">#{p.numar}</Link>
                <span>{NUME_STARE[p.stare] ?? p.stare}</span>
                <span className="w-full text-muted-foreground sm:w-auto">{p.motiv}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Setări">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seria de facturi easySales" hint="Gol: seria implicită a website-ului din easySales.">
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={20} />
          </Field>
          <Field label="Totalul trimis" hint="Cum citește easySales totalul comenzii.">
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={varianta} onChange={(e) => setVarianta(e.target.value as "incasat" | "definitie")}>
              <option value="incasat">Suma încasată de la client</option>
              <option value="definitie">Produsele și transportul (cum îl definesc ei)</option>
            </select>
          </Field>
        </div>
        <Field label="Canalele pe care le vinzi prin easySales">
          <AlegereCanale alese={canale} onChange={setCanale} />
        </Field>
        <Button onClick={salveaza} disabled={lucru !== null}>
          {lucru === "setari" ? <Loader2 className="animate-spin" /> : null} Salvează setările
        </Button>
      </Panel>

      <Panel title="Catalogul și stocul">
        <p className="text-sm text-muted-foreground">
          Trimiterea produselor și sincronizarea stocului cu easySales se pornesc după proba cu un cont real. Până atunci, produsele și stocul rămân cum le ai în easySales.
        </p>
      </Panel>
    </div>
  );
}
