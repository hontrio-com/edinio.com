"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Copy, Eye, Info, Loader2, Mail, Plug, RefreshCw, Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  activeazaPepita, deconecteazaPepita, dezvaluieAdresele, getComenziProblemaPepita,
  includeToateProdusePepita, listaProdusePepita, marcheazaTrimis, rotestePepita,
  salveazaSetariPepita, setareProdusePepita, verificaProdusePepita,
  type AdresePepita, type ComandaProblema, type RandProdusPepita, type RezumatProduse,
  type SetariPepita, type StarePepita,
} from "@/lib/actions/pepita.actions";
import { TIPURI_GARANTIE, type TipGarantie } from "@/lib/pepita/types";
import { sablonMesajPepita } from "@/lib/pepita/activare";

/**
 * Panoul integrarii Pepita.
 *
 * ═══ ⚠ CE NU ARE VOIE SA APARA AICI ═══
 *
 * Niciun buton care sa para ca trimite ceva spre Pepita: nici „confirmă comanda”,
 * nici „trimite AWB”, nici „schimbă statusul”. Documentatia lor descrie o singura
 * cale pentru comenzi, dinspre ei spre noi, iar confirmarea se face in panoul lor.
 * Un buton care ar parea ca face asta ar fi mai rau decat lipsa lui: comerciantul
 * ar apasa, ar crede ca a confirmat, si ar pierde termenul de o zi.
 *
 * ⚠ SI NICI „Conectat la Pepita”. Noi nu avem cum sa aflam ca ei au acceptat
 * conexiunea: nu exista niciun capat de stare. Ce stim e ca noi am pregatit totul
 * („Configurat în Edinio”) si, cel mult, ca ei au citit un feed. Atat se scrie.
 */

export function PepitaClient({ businessId, stare }: { businessId: string; stare: StarePepita }) {
  const router = useRouter();
  const [lucrez, setLucrez] = useState<string | null>(null);
  const config = stare.config;

  const cu = async (cheie: string, f: () => Promise<{ error?: string } | { ok: true }>) => {
    setLucrez(cheie);
    try {
      const r = await f();
      if ("error" in r && r.error) { toast.error(r.error); return false; }
      router.refresh();
      return true;
    } catch {
      /* ⚠ O actiune de server nu raspunde intotdeauna: cade reteaua, expira sesiunea, sau
         adresa actiunii nu mai exista dupa o livrare noua. Tacerea de aici ar lasa butonul
         invartindu-se la nesfarsit. */
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
      return false;
    } finally {
      setLucrez(null);
    }
  };

  return (
    <div className="space-y-6">
      <Callout variant="info" icon={Info}>
        <div className="space-y-1">
          <p className="font-medium text-foreground">Cum funcționează Pepita</p>
          <p className="text-xs text-muted-foreground">
            Edinio pregătește două adrese pe care Pepita le citește singură: una cu produsele și
            prețurile, una doar cu stocul. Comenzile sosesc automat în Edinio.
            {" "}
            <strong className="text-foreground">
              Confirmarea și statusul comenzilor se operează în Pepita Admin
            </strong>
            , pentru că Pepita nu are, deocamdată, o cale prin care Edinio să i le trimită înapoi.
          </p>
        </div>
      </Callout>

      <Conexiune
        stare={stare}
        lucrez={lucrez}
        porneste={() => cu("porneste", () => activeazaPepita(businessId))}
        opreste={() => cu("opreste", () => deconecteazaPepita(businessId))}
      />

      {config.activ && (
        <>
          <Adrese
            businessId={businessId}
            trimisLa={config.trimis_la}
            lucrez={lucrez}
            roteste={(fel) => cu(`rotire-${fel}`, () => rotestePepita(businessId, fel))}
            marcheaza={(v) => cu("trimis", () => marcheazaTrimis(businessId, v))}
          />
          <Setari businessId={businessId} config={config} />
          <Produse businessId={businessId} modImplicit={config.mod_includere} />
          <Catalog businessId={businessId} />
          <Comenzi businessId={businessId} stare={stare} />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONEXIUNEA
   ═══════════════════════════════════════════════════════════════════════════ */

function Conexiune({ stare, lucrez, porneste, opreste }: {
  stare: StarePepita;
  lucrez: string | null;
  porneste: () => void;
  opreste: () => void;
}) {
  const c = stare.config;
  const gata = c.activ && c.areFeedToken && c.areOrderKey;
  const aCitit = !!stare.ultimaCitire;

  return (
    <Panel title="Conexiune">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {!c.activ && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Plug className="h-4 w-4" /> Neconfigurat
            </p>
          )}
          {gata && !aCitit && (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Configurat în Edinio
            </p>
          )}
          {gata && aCitit && (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Pepita citește feedul
            </p>
          )}
          {/*
            ⚠ SE SPUNE CE STIM SI CE NU. „Pepita citește feedul” e un fapt: adresa a fost
            deschisă de cineva cu cheia noastră. „Conectat la Pepita” ar fi o presupunere,
            fiindcă nu avem nicio cale prin care să aflăm că au acceptat conexiunea.
          */}
          <p className="text-xs text-muted-foreground">
            {gata && aCitit
              ? `Ultima citire: ${cand(stare.ultimaCitire)}. Frecvența o stabilește Pepita: de obicei stocul o dată pe oră, prețurile și descrierile o dată pe zi.`
              : gata
                ? "Adresele sunt gata. Activarea conexiunii se face de către Pepita, după ce le trimiți."
                : "Pornește integrarea ca să genereze adresele pe care le trimiți la Pepita."}
          </p>
        </div>

        {c.activ ? (
          <Button variant="outline" size="sm" onClick={opreste} disabled={lucrez !== null}>
            {lucrez === "opreste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            Oprește integrarea
          </Button>
        ) : (
          <Button size="sm" onClick={porneste} disabled={lucrez !== null}>
            {lucrez === "porneste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Pornește integrarea
          </Button>
        )}
      </div>

      {c.activ && (
        <p className="text-[11px] text-muted-foreground">
          Oprirea închide imediat adresele: feedul nu mai răspunde, iar comenzile noi sunt refuzate.
          Comenzile deja primite, facturile și AWB-urile rămân neatinse. Anunță și Pepita, altfel
          vor continua să încerce.
        </p>
      )}
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADRESELE
   ═══════════════════════════════════════════════════════════════════════════ */

function Adrese({ businessId, trimisLa, lucrez, roteste, marcheaza }: {
  businessId: string;
  trimisLa: string | null;
  lucrez: string | null;
  roteste: (fel: "feed" | "comenzi") => void;
  marcheaza: (v: boolean) => void;
}) {
  const [adrese, setAdrese] = useState<AdresePepita | null>(null);
  const [incarc, setIncarc] = useState(false);

  const arata = async () => {
    setIncarc(true);
    try {
      const r = await dezvaluieAdresele(businessId);
      if ("error" in r) toast.error(r.error);
      else setAdrese(r.adrese);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  const copiaza = (v: string) => {
    navigator.clipboard?.writeText(v);
    toast.success("Copiat.");
  };

  return (
    <Panel title="Adresele pentru Pepita">
      <p className="text-xs text-muted-foreground">
        Cele trei adrese conțin fiecare o cheie proprie magazinului tău. Nu le publica și nu le
        trimite decât către Pepita: cine are adresa feedului îți poate citi catalogul, iar cine are
        adresa de comenzi îți poate crea comenzi.
      </p>

      {!adrese ? (
        <Button variant="outline" size="sm" onClick={arata} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Arată adresele
        </Button>
      ) : (
        <div className="space-y-3">
          <Rand eticheta="Feed produse" valoare={adrese.feedProduse} onCopy={copiaza} />
          <Rand eticheta="Feed stoc" valoare={adrese.feedStoc} onCopy={copiaza} />
          <Rand eticheta="Adresă comenzi (API)" valoare={adrese.comenzi} onCopy={copiaza} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline" size="sm" disabled={lucrez !== null}
              onClick={() => {
                if (!confirm("Cheia veche a feedurilor se oprește imediat. Va trebui să trimiți noile adrese la Pepita, altfel feedul lor se oprește. Continui?")) return;
                setAdrese(null);
                roteste("feed");
              }}
            >
              {lucrez === "rotire-feed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Schimbă cheia feedurilor
            </Button>
            <Button
              variant="outline" size="sm" disabled={lucrez !== null}
              onClick={() => {
                if (!confirm("Adresa veche de comenzi se oprește imediat. Până când Pepita primește adresa nouă, comenzile lor vor fi refuzate. Continui?")) return;
                setAdrese(null);
                roteste("comenzi");
              }}
            >
              {lucrez === "rotire-comenzi" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Schimbă cheia de comenzi
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => copiaza(sablonMesajPepita(adrese))}
            >
              <Mail className="h-4 w-4" /> Copiază mesajul pentru Pepita
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Ce trebuie trimis la Pepita</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1">
          <li>adresa feedului de produse și a celui de stoc;</li>
          <li>adresa de comenzi, ca să îți trimită comenzile automat;</li>
          <li>
            că feedul <strong className="text-foreground">nu conține produse cu variații</strong>:
            fiecare variantă pleacă drept produs de sine stătător, cu codul ei;
          </li>
          <li>dacă folosesc costul de transport și termenul de livrare din feed sau pe cele implicite.</li>
        </ul>
        <p className="mt-2">
          Trimite-le la contactul tău dedicat sau la adresa de suport pentru vânzători din
          Pepita Seller Center. Activarea conexiunii se face de ei, nu din Edinio.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={!!trimisLa}
          onChange={(e) => marcheaza(e.target.checked)}
        />
        Am trimis adresele către Pepita{trimisLa ? ` (${cand(trimisLa)})` : ""}
      </label>
    </Panel>
  );
}

function Rand({ eticheta, valoare, onCopy }: { eticheta: string; valoare: string; onCopy: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{eticheta}</p>
      <div className="flex items-center gap-2">
        <input
          readOnly value={valoare} onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-[11px] text-foreground"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => onCopy(valoare)}>
          <Copy className="h-3.5 w-3.5" /> Copiază
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETARILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Setari({ businessId, config }: { businessId: string; config: StarePepita["config"] }) {
  const router = useRouter();
  const [salvez, setSalvez] = useState(false);
  const [f, setF] = useState<SetariPepita>({
    strategie_fel: config.strategie_pret.fel,
    strategie_valoare: config.strategie_pret.valoare,
    safety_stock: config.safety_stock,
    shipping_delay: config.shipping_delay,
    shipping_price: config.shipping_price,
    garantie_tip: config.garantie?.tip ?? "",
    garantie_durata: config.garantie?.durata ?? 0,
    mod_includere: config.mod_includere,
    factureaza_clientul: config.factureaza_clientul,
  });

  const salveaza = async () => {
    setSalvez(true);
    try {
      const r = await salveazaSetariPepita(businessId, f);
      if ("error" in r && r.error) toast.error(r.error);
      else { toast.success("Setări salvate."); router.refresh(); }
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setSalvez(false);
    }
  };

  /* Exemplul se socotește pe loc, ca omul să vadă ce înseamnă adaosul înainte să salveze. */
  const exemplu = f.strategie_fel === "procent"
    ? 100 * (1 + (Number(f.strategie_valoare) || 0) / 100)
    : f.strategie_fel === "fix"
      ? 100 + (Number(f.strategie_valoare) || 0)
      : 100;

  return (
    <Panel title="Setări">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ce produse pleacă">
          <select
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            value={f.mod_includere}
            onChange={(e) => setF({ ...f, mod_includere: e.target.value as SetariPepita["mod_includere"] })}
          >
            <option value="selectate">Doar produsele alese de mine</option>
            <option value="toate">Toate produsele active</option>
          </select>
        </Field>

        <Field label="Preț pe Pepita">
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
              value={f.strategie_fel}
              onChange={(e) => setF({ ...f, strategie_fel: e.target.value as SetariPepita["strategie_fel"] })}
            >
              <option value="identic">La fel ca în magazin</option>
              <option value="procent">Adaos procentual</option>
              <option value="fix">Adaos fix</option>
            </select>
            {f.strategie_fel !== "identic" && (
              <Input
                type="number" step="0.01" className="w-28"
                value={f.strategie_valoare}
                onChange={(e) => setF({ ...f, strategie_valoare: Number(e.target.value) })}
              />
            )}
          </div>
          {f.strategie_fel !== "identic" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Un produs de 100 lei pleacă la Pepita cu {exemplu.toFixed(2)} lei.
            </p>
          )}
        </Field>

        <Field label="Stoc de siguranță">
          <Input
            type="number" min={0}
            value={f.safety_stock}
            onChange={(e) => setF({ ...f, safety_stock: Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Câte bucăți ții deoparte și nu le anunți la Pepita. Stocul real din Edinio nu se
            atinge: cu 5 pe stoc și 2 aici, Pepita vede 3.
          </p>
        </Field>

        <Field label="Termen de pregătire (zile lucrătoare)">
          <Input
            type="number" min={0} placeholder="implicit Pepita"
            value={f.shipping_delay ?? ""}
            onChange={(e) => setF({ ...f, shipping_delay: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Lăsat gol, Pepita folosește termenul stabilit la activare.
          </p>
        </Field>

        <Field label="Cost de transport pe bucată (lei)">
          <Input
            type="number" min={0} step="0.01" placeholder="implicit Pepita"
            value={f.shipping_price ?? ""}
            onChange={(e) => setF({ ...f, shipping_price: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se trimite pentru fiecare bucată, iar Pepita îl înmulțește singură cu cantitatea.
            Lăsat gol, folosesc costul implicit convenit cu ei.
          </p>
        </Field>

        <Field label="Garanție">
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
              value={f.garantie_tip}
              onChange={(e) => setF({ ...f, garantie_tip: e.target.value as TipGarantie | "" })}
            >
              <option value="">Nu trimit garanție</option>
              {TIPURI_GARANTIE.filter((t) => t !== "None").map((t) => (
                <option key={t} value={t}>{ETICHETE_GARANTIE[t]}</option>
              ))}
            </select>
            {f.garantie_tip && (
              <Input
                type="number" min={1} className="w-24"
                value={f.garantie_durata}
                onChange={(e) => setF({ ...f, garantie_durata: Number(e.target.value) })}
              />
            )}
          </div>
        </Field>
      </div>

      {/*
        ⚠ STINS DIN START, si scris de ce. Pepita nu spune public cine emite factura catre
        clientul final, si nu exista nicio cale prin care să i-o trimitem sau să aflăm ce a
        emis ea. O factură emisă degeaba nu se retrage, se stornează.
      */}
      <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <input
          type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input"
          checked={f.factureaza_clientul}
          onChange={(e) => setF({ ...f, factureaza_clientul: e.target.checked })}
        />
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Emit eu factura către client</span>
          <br />
          Pornit, comenzile Pepita intră în facturarea automată, ca oricare altă comandă. Lasă-l
          stins dacă nu ești sigur: Pepita nu ne poate spune dacă a emis ea factura, iar două
          documente pentru aceeași marfă se repară mai greu decât unul lipsă.
        </span>
      </label>

      <div className="flex justify-end">
        <Button size="sm" onClick={salveaza} disabled={salvez}>
          {salvez ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvează setările
        </Button>
      </div>
    </Panel>
  );
}

const ETICHETE_GARANTIE: Record<TipGarantie, string> = {
  None: "Fără garanție",
  Day: "Zile lucrătoare",
  Week: "Săptămâni",
  Month: "Luni",
  Year: "Ani",
};

/* ═══════════════════════════════════════════════════════════════════════════
   ALEGEREA PRODUSELOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce produse pleaca pe Pepita.
 *
 * ⚠ NU SE INCARCA TOT CATALOGUL. Un magazin cu zece mii de produse ar da o pagina
 * care nu se deschide pe telefon, iar nimeni nu bifeaza zece mii de randuri. Se
 * cauta si se bifeaza punctual; pentru „vreau tot” exista butonul de dedesubt si
 * comutatorul din Setari.
 */
function Produse({ businessId, modImplicit }: { businessId: string; modImplicit: "toate" | "selectate" }) {
  const [cauta, setCauta] = useState("");
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState<RandProdusPepita[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [incarc, setIncarc] = useState(false);
  const [lucrez, setLucrez] = useState(false);
  /* Cat s-a facut pana acum in trecerea curenta, ca butonul sa nu para inghetat. */
  const [progres, setProgres] = useState<{ facut: number; dinCate: number | null } | null>(null);
  /*
    Ce a ramas neterminat dupa o rulare oprita la mijloc. Toastul dispare in cateva secunde,
    iar o includere pe jumatate facuta arata exact ca una intreaga: asta ramane pe ecran.
  */
  const [ramas, setRamas] = useState<{ facut: number; dinCate: number | null } | null>(null);

  const incarca = async (p = pagina, termen = cauta) => {
    setIncarc(true);
    try {
      const r = await listaProdusePepita(businessId, termen, p);
      if ("error" in r) { toast.error(r.error); return; }
      setLista(r.produse);
      setMaiSunt(r.maiSunt);
      setPagina(p);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  const comuta = async (id: string, inclus: boolean) => {
    /*
     * ⚠ BIFA SE MUTA DUPA CE SERVERUL CONFIRMA, nu inainte. Mutata optimist, un refuz
     * ar fi lasat ecranul aratand „inclus” pentru un produs care nu pleaca nicaieri,
     * si comerciantul ar fi aflat din vanzari.
     */
    setLucrez(true);
    try {
      const r = await setareProdusePepita(businessId, [id], inclus);
      if ("error" in r && r.error) { toast.error(r.error); return; }
      setLista((l) => (l ?? []).map((p) => (p.id === id ? { ...p, inclus } : p)));
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setLucrez(false);
    }
  };

  return (
    <Panel title="Ce produse pleacă pe Pepita">
      <p className="text-xs text-muted-foreground">
        {modImplicit === "toate"
          ? "Setarea este „toate produsele active”, deci pleacă tot ce e activ în magazin. Aici poți scoate produse anume."
          : "Setarea este „doar produsele alese de mine”, deci pleacă doar ce bifezi aici."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Caută după nume"
          value={cauta}
          onChange={(e) => setCauta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void incarca(0, cauta); }}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" size="sm" onClick={() => void incarca(0, cauta)} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Caută
        </Button>
        <Button
          variant="ghost" size="sm" disabled={lucrez}
          onClick={async () => {
            if (!confirm("Toate produsele active din magazin vor fi incluse în feedul Pepita. Continui?")) return;
            setLucrez(true);
            setRamas(null);
            let facut = 0;
            let cursor: string | null = null;
            let dinCate: number | null = null;
            try {
              /*
                ⚠ BUCLA E AICI, LA APASARE, nu pe server. Serverul face o trecere marginita si
                spune de unde se reia; o singura cerere care ar merge pana la capat peste un
                catalog mare ar depasi timpul functiei si ar cadea tocmai la magazinele mari.
                Reluarea e sigura: scrierea e un upsert, deci a doua trecere peste acelasi
                produs nu strica nimic.
              */
              for (;;) {
                const r = await includeToateProdusePepita(businessId, cursor);
                if ("error" in r) {
                  toast.error(`${r.error} S-au inclus ${facut} produse până aici.`);
                  setRamas({ facut, dinCate });
                  break;
                }
                facut += r.scrise;
                dinCate = r.dinCate ?? dinCate;
                setProgres({ facut, dinCate });
                if (!r.incomplet) { toast.success(`${facut} produse incluse.`); break; }
                cursor = r.dupa;
              }
              void incarca(pagina, cauta);
            } catch {
              toast.error(`Cererea nu a ajuns. S-au inclus ${facut} produse până aici.`);
              setRamas({ facut, dinCate });
            } finally { setLucrez(false); setProgres(null); }
          }}
        >
          {lucrez && progres
            ? `Includ… ${progres.facut}${progres.dinCate ? ` din ${progres.dinCate}` : ""}`
            : "Include toate produsele active"}
        </Button>
      </div>

      {ramas && (
        <Callout variant="warning" icon={AlertTriangle}>
          S-au inclus {ramas.facut}{ramas.dinCate ? ` din ${ramas.dinCate}` : ""} produse, apoi
          includerea s-a oprit. Apasă din nou pe butonul de includere: se reia de unde a rămas,
          fără să scrie de două ori.
        </Callout>
      )}

      {lista === null && (
        <p className="text-xs text-muted-foreground">Caută un produs sau apasă „Caută” ca să vezi lista.</p>
      )}
      {lista !== null && lista.length === 0 && (
        <p className="text-xs text-muted-foreground">Niciun produs activ care să se potrivească.</p>
      )}

      {lista !== null && lista.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{p.nume}</p>
                  {p.sku && <p className="truncate text-[11px] text-muted-foreground">{p.sku}</p>}
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox" className="h-4 w-4 rounded border-input"
                    checked={p.inclus} disabled={lucrez}
                    onChange={(e) => void comuta(p.id, e.target.checked)}
                  />
                  În feed
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={pagina === 0 || incarc} onClick={() => void incarca(pagina - 1, cauta)}>
              Înapoi
            </Button>
            <span className="text-[11px] text-muted-foreground">Pagina {pagina + 1}</span>
            <Button variant="ghost" size="sm" disabled={!maiSunt || incarc} onClick={() => void incarca(pagina + 1, cauta)}>
              Înainte
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATALOGUL
   ═══════════════════════════════════════════════════════════════════════════ */

function Catalog({ businessId }: { businessId: string }) {
  const [r, setR] = useState<RezumatProduse | null>(null);
  const [incarc, setIncarc] = useState(false);

  const verifica = async () => {
    setIncarc(true);
    try {
      const raspuns = await verificaProdusePepita(businessId);
      if ("error" in raspuns) toast.error(raspuns.error);
      else setR(raspuns);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  return (
    <Panel title="Produsele din feed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Verificarea folosește exact regulile după care se scrie feedul, deci ce vezi aici este ce
          pleacă la Pepita.
        </p>
        <Button variant="outline" size="sm" onClick={verifica} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verifică produsele
        </Button>
      </div>

      {r && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra eticheta="Produse active" valoare={r.active} />
            <Cifra eticheta="Incluse în feed" valoare={r.incluse} />
            <Cifra eticheta="Cu erori" valoare={r.cuErori} accent={r.cuErori > 0} />
            <Cifra eticheta="Articole trimise" valoare={r.articole} />
          </div>

          {/*
            ⚠ „Articole” ≠ „produse”: o combinație aplatizată e un articol de sine stătător.
            Fără rândul ăsta, un catalog de 40 de produse care trimite 300 de articole ar
            părea o greșeală.
          */}
          <p className="text-[11px] text-muted-foreground">
            Un produs cu variante pleacă drept mai multe articole, câte unul pentru fiecare
            combinație activă. Așa rămâne exactă legătura dintre ce se vinde și ce stoc scade.
          </p>

          {r.partial && (
            <Callout variant="warning" icon={AlertTriangle}>
              Verificarea s-a oprit după primele 10.000 de produse. Cifrele de mai sus nu acoperă
              tot catalogul.
            </Callout>
          )}

          {r.orfane > 0 && (
            <Callout variant="warning" icon={AlertTriangle}>
              <div className="space-y-1">
                <p className="text-xs text-foreground">
                  {r.orfane === 1
                    ? "Un articol trimis anterior la Pepita nu mai este generat de feed."
                    : `${r.orfane} articole trimise anterior la Pepita nu mai sunt generate de feed.`}
                </p>
                {/*
                  ⚠ SE SPUNE SI CE SE POATE FACE. Cel mai des e o redenumire de variantă: în
                  Edinio asta chiar distruge combinația, deci la Pepita rămâne un produs vechi
                  care se poate vinde în continuare. Noi nu îl putem șterge de acolo, fiindcă
                  feedul nu are cum să spună „scoate produsul ăsta".
                */}
                <p className="text-[11px] text-muted-foreground">
                  De obicei asta înseamnă că ai redenumit sau ai șters o variantă. Articolele
                  vechi rămân la Pepita și se pot vinde în continuare, iar noi nu le putem
                  retrage din feed: cere-le celor de la Pepita să le scoată.
                  {r.exempleOrfane.length > 0 && ` Primele: ${r.exempleOrfane.slice(0, 5).join(", ")}.`}
                </p>
              </div>
            </Callout>
          )}

          {r.incluse === 0 && (
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Niciun produs nu este inclus încă în feedul Pepita. Alege produsele din lista de
              produse, sau treci setarea de mai sus pe „Toate produsele active”.
            </p>
          )}

          {r.produse.length > 0 && (
            <ul className="space-y-2">
              {r.produse.map((p) => (
                <li key={p.id} className="rounded-xl border border-border p-3">
                  <Link href={`/dashboard/products/${p.id}/edit`} className="text-xs font-medium text-foreground underline underline-offset-2">
                    {p.nume}
                  </Link>
                  <ul className="mt-1.5 space-y-1">
                    {p.probleme.map((pb, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px]">
                        <span className={pb.nivel === "eroare" ? "text-destructive" : "text-warning"}>
                          {pb.nivel === "eroare" ? "Eroare" : "Atenție"}
                        </span>
                        <span className="text-muted-foreground">
                          {pb.combinatie ? `[${pb.combinatie}] ` : ""}{pb.mesaj}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {r.cuErori === 0 && r.produse.length === 0 && r.incluse > 0 && (
            <p className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-4 w-4" /> Toate produsele incluse pot pleca la Pepita.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function Cifra({ eticheta, valoare, accent }: { eticheta: string; valoare: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className={`text-lg font-semibold ${accent ? "text-destructive" : "text-foreground"}`}>{valoare}</p>
      <p className="text-[11px] text-muted-foreground">{eticheta}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Comenzi({ businessId, stare }: { businessId: string; stare: StarePepita }) {
  const [lista, setLista] = useState<ComandaProblema[] | null>(null);
  const [incarc, setIncarc] = useState(false);

  const incarca = async () => {
    setIncarc(true);
    try {
      const r = await getComenziProblemaPepita(businessId);
      if ("error" in r) toast.error(r.error);
      else setLista(r);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  return (
    <Panel title="Comenzi">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cifra eticheta="Comenzi primite" valoare={stare.comenziTotal} />
        <Cifra eticheta="Cu probleme" valoare={stare.comenziCarantina} accent={stare.comenziCarantina > 0} />
        <div className="rounded-xl border border-border p-3">
          <p className="truncate text-sm font-semibold text-foreground">
            {stare.ultimaComanda ? cand(stare.ultimaComanda) : "Nicio comandă"}
          </p>
          <p className="text-[11px] text-muted-foreground">Ultima comandă</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Comenzile Pepita apar în lista obișnuită de comenzi, cu eticheta Pepita. Le poți factura și
        le poți genera AWB ca la orice altă comandă.
        {" "}
        <strong className="text-foreground">Statusul lor nu pleacă înapoi la Pepita</strong>: după
        ce expediezi, treci comanda pe „trimisă” și în Pepita Admin.
      </p>

      {stare.comenziCarantina > 0 && (
        <div className="space-y-2">
          <Callout variant="warning" icon={AlertTriangle}>
            {stare.comenziCarantina === 1
              ? "O comandă Pepita are o linie pe care nu am putut-o lega de un produs din catalog. Stocul ei nu a fost scăzut."
              : `${stare.comenziCarantina} comenzi Pepita au linii pe care nu le-am putut lega de produse din catalog. Stocul lor nu a fost scăzut.`}
          </Callout>
          {!lista ? (
            <Button variant="outline" size="sm" onClick={incarca} disabled={incarc}>
              {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Vezi care sunt
            </Button>
          ) : (
            <ul className="space-y-1">
              {lista.map((c) => (
                <li key={c.externalId} className="rounded-lg border border-border px-3 py-2 text-[11px]">
                  <span className="font-medium text-foreground">Comanda Pepita {c.externalId}</span>
                  {" · "}{cand(c.primitLa)}
                  {c.motiv ? <span className="block text-muted-foreground">{c.motiv}</span> : null}
                  {c.orderId && (
                    <Link href={`/dashboard/orders/${c.orderId}`} className="text-primary underline underline-offset-2">
                      Deschide comanda
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Pepita cere confirmarea comenzii în cel mult o zi de la primirea ei, din panoul lor.
      </p>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/** Data, in forma scurta romaneasca. Fara biblioteci: un singur loc, un singur format. */
function cand(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
