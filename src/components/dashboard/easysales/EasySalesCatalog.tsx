"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ClipboardList, Loader2, Pause, Play, RefreshCw, Send } from "lucide-react";
import {
  confirmaPreturileEasySales, excludeArticolulEasySales, opresteCatalogulEasySales, pornesteCatalogulEasySales,
  raportulCataloguluiEasySales, reiaCatalogulEasySales, retrimiteArticolulEasySales, retrimiteCatalogulEasySales,
  salveazaSetarileCataloguluiEasySales, stareaCataloguluiEasySales,
} from "@/lib/actions/easysales.actions";
import type { RaportMagazin, StareCatalog } from "@/lib/easysales/catalog-actiuni";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

/**
 * Catalogul in easySales (planul, §7.4): raportul de pregatire, setarile, pornirea si problemele.
 *
 * ⚠ Trimiterea catalogului e oprita in cod pana dupa proba pe contul de test (E0): butoanele raman
 * stinse cu motivul scris. Raportul de pregatire merge de acum si arata golurile de SKU si de
 * descriere, ca omul sa le poata repara din timp.
 */

const NUME_MOTIV: Record<string, string> = {
  inactiv: "Produse dezactivate",
  pachet: "Pachete (nu pleacă)",
  personalizat: "Produse cu personalizare (nu pleacă)",
  "fara-nume": "Fără nume",
  "fara-descriere": "Fără descriere",
  "stoc-neurmarit": "Fără evidența stocului",
  "fara-combinatii": "Variante fără nicio combinație activă",
  "pret-zero": "Preț 0",
  "sku-duplicat": "SKU folosit de mai multe produse",
  "sku-parinte": "Variante cu SKU-ul produsului",
  "fara-sku": "Fără SKU",
  "stoc-comun": "Variante fără stoc propriu",
  "identitate-dubla": "Variante cu același identificator",
  "fara-imagine": "Fără imagine",
  "ean-invalid": "EAN invalid (pleacă fără EAN)",
  "ean-dublat": "Același EAN pe mai multe variante",
  "sku-generat": "Pleacă cu SKU generat de Edinio",
  "descriere-din-nume": "Descrierea luată din nume",
  "stoc-fix": "Pleacă cu stocul fix",
  "categorie-de-rezerva": "Pleacă în „Fără categorie”",
  "axe-nedespartite": "Variante ale căror opțiuni nu se pot citi",
};

const NUME_STARE: Record<string, string> = {
  de_trimis: "De trimis", trimis: "Trimise, se verifică", confirmat: "În easySales", blocat: "Blocate",
  respins: "Refuzate de easySales", disparut: "Dispărute din easySales", exclus: "Excluse de tine", arhivat: "Arhivate",
};

const MOTIV_PAUZA: Record<string, string> = {
  "website-redenumit": "Website-ul nu mai apare în easySales (redenumit sau șters).",
  "verificare-suspecta": "Lista de produse din easySales nu se potrivește cu ce am trimis.",
  moneda: "Magazinul nu mai vinde în lei.",
  "cota-tva": "Cota de TVA din setări nu e una legală azi.",
};

function data(iso: string | null | undefined): string {
  if (!iso) return "niciodată";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "niciodată" : d.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

export function EasySalesCatalog({ businessId }: { businessId: string }) {
  const [stare, setStare] = useState<StareCatalog | null>(null);
  const [raport, setRaport] = useState<RaportMagazin | null>(null);
  const [lucru, setLucru] = useState<string | null>(null);
  const [deschis, setDeschis] = useState<string | null>(null);
  const [setari, setSetari] = useState<StareCatalog["setari"] | null>(null);

  async function incarca() {
    const r = await stareaCataloguluiEasySales(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    setStare(r);
    setSetari((s) => s ?? r.setari);
  }

  useEffect(() => {
    let viu = true;
    stareaCataloguluiEasySales(businessId).then((r) => {
      if (!viu) return;
      if ("error" in r) { toast.error(r.error); return; }
      setStare(r);
      setSetari((s) => s ?? r.setari);
    }).catch(() => { if (viu) toast.error("Starea catalogului nu s-a putut citi."); });
    return () => { viu = false; };
  }, [businessId]);

  async function faCu(eticheta: string, fn: () => Promise<{ ok: true; mesaj?: string } | { error: string }>) {
    setLucru(eticheta);
    try {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else { toast.success(r.mesaj ?? "Gata."); await incarca(); }
    } catch {
      toast.error("A apărut o eroare. Încearcă din nou.");
    } finally {
      setLucru(null);
    }
  }

  async function calculeazaRaportul() {
    setLucru("raport");
    try {
      const r = await raportulCataloguluiEasySales(businessId);
      if ("error" in r) toast.error(r.error);
      else setRaport(r);
    } catch {
      toast.error("Raportul nu s-a putut calcula.");
    } finally {
      setLucru(null);
    }
  }

  if (!stare || !setari) {
    return (
      <Panel title="Catalogul în easySales">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Se încarcă…</p>
      </Panel>
    );
  }

  const gata = raport ? raport.articole.gataSimple + raport.articole.gataVariante : 0;
  const totalArticole = raport ? raport.articole.simple + raport.articole.variante : 0;

  return (
    <div className="space-y-4">
      <Panel title="Catalogul în easySales">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Produsele active pleacă în easySales ca produse ale website-ului Edinio: fiecare variantă ca produs separat, legat de produsul principal. Prețul pleacă cu TVA. <b>Stocul pleacă 0</b> până pornește sincronizarea stocului.</p>
          <p>Nu lega (manual sau cu Autolink) ofertele active de pe marketplace-uri de produsele Edinio din easySales până la pornirea stocului: ar trece pe 0.</p>
        </div>
        {!stare.pornitInCod && (
          <Callout variant="neutral" icon={ClipboardList} title="Trimiterea catalogului pornește după proba pe contul de test easySales">
            Până atunci poți verifica de acum cât de pregătit e catalogul: SKU-urile, descrierile, variantele.
          </Callout>
        )}
        {stare.pauza && (
          <Callout variant="warning" icon={Pause} title="Catalogul e în pauză">
            {MOTIV_PAUZA[stare.pauza] ?? stare.pauza} Verifică, apoi apasă „Reia catalogul”.
          </Callout>
        )}
        {stare.preturiAsteapta && (
          <Callout variant="warning" icon={AlertTriangle} title={`Prețul s-a schimbat la ${stare.preturiAsteapta.produse} de produse deodată`}>
            <p>Înainte să le trimitem în easySales (de unde pot ajunge pe marketplace-uri), confirmă că schimbarea e voită.</p>
            <Button size="sm" className="mt-2" onClick={() => faCu("preturi", () => confirmaPreturileEasySales(businessId))} disabled={lucru !== null}>
              {lucru === "preturi" ? <Loader2 className="animate-spin" /> : <CheckCircle />} Confirmă prețurile
            </Button>
          </Callout>
        )}
        <div className="flex flex-wrap gap-2">
          {!stare.activ ? (
            <Button onClick={() => faCu("porneste", () => pornesteCatalogulEasySales(businessId))} disabled={lucru !== null || !stare.pornitInCod}>
              {lucru === "porneste" ? <Loader2 className="animate-spin" /> : <Send />} Trimite catalogul
            </Button>
          ) : (
            <>
              {stare.pauza && (
                <Button onClick={() => faCu("reia", () => reiaCatalogulEasySales(businessId))} disabled={lucru !== null}>
                  {lucru === "reia" ? <Loader2 className="animate-spin" /> : <Play />} Reia catalogul
                </Button>
              )}
              <Button variant="outline" onClick={() => faCu("retrimite", () => retrimiteCatalogulEasySales(businessId))} disabled={lucru !== null}>
                {lucru === "retrimite" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retrimite tot
              </Button>
              <Button variant="outline" onClick={() => faCu("opreste", () => opresteCatalogulEasySales(businessId))} disabled={lucru !== null}>
                {lucru === "opreste" ? <Loader2 className="animate-spin" /> : <Pause />} Oprește catalogul
              </Button>
            </>
          )}
        </div>
        {stare.activ && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              {Object.entries(stare.articole).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} className="rounded-md bg-muted px-2 py-1">{NUME_STARE[k] ?? k}: <b>{v}</b></span>
              ))}
            </div>
            <p className="text-muted-foreground">
              În lucru: {stare.inCoada.continut} produse de trimis, {stare.inCoada.pret} prețuri, {stare.inCoada.stergeri} ștergeri. Ultima verificare completă: {data(stare.verificatLa)}.
              {stare.incarcare?.inLucru ? ` Încărcarea inițială a pornit ${data(stare.incarcare.pornitLa)}.` : ""}
            </p>
          </div>
        )}
      </Panel>

      <Panel title="Cât de pregătit e catalogul">
        <p className="text-sm text-muted-foreground">Verifică fiecare produs după regulile easySales: ce pleacă, ce nu pleacă și de ce. Nu trimite nimic.</p>
        <Button variant="outline" onClick={calculeazaRaportul} disabled={lucru !== null}>
          {lucru === "raport" ? <Loader2 className="animate-spin" /> : <ClipboardList />} Verifică pregătirea catalogului
        </Button>
        {raport && (
          <div className="space-y-3 text-sm">
            {raport.problemaMagazin && <Callout variant="danger" icon={AlertTriangle}>{raport.problemaMagazin}</Callout>}
            {raport.taiat && (
              <Callout variant="warning" icon={AlertTriangle}>
                Catalogul e mare: raportul acoperă primele {raport.produse} din {raport.totalProduse} de produse.
              </Callout>
            )}
            <p>
              Din {raport.produse} produse ({raport.produseCuVariante} cu variante), pleacă <b>{gata}</b> din {totalArticole} articole:
              {" "}{raport.articole.gataSimple} produse simple și {raport.articole.gataVariante} variante.
            </p>
            <ul className="divide-y rounded-md border">
              {raport.motive.map((m) => (
                <li key={m.cod} className="p-2">
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setDeschis(deschis === m.cod ? null : m.cod)}>
                    <span className="flex items-center gap-2">
                      {m.nivel === "blocheaza" ? <AlertTriangle className="size-4 text-destructive" /> : <AlertTriangle className="size-4 text-amber-500" />}
                      {NUME_MOTIV[m.cod] ?? m.cod}
                    </span>
                    <span className="text-muted-foreground">{m.produse} produse, {m.articole} articole</span>
                  </button>
                  {deschis === m.cod && (
                    <ul className="mt-2 space-y-1 pl-6">
                      {m.exemple.map((e) => (
                        <li key={`${e.productUuid}-${e.titlu ?? ""}`}>
                          <Link href={`/dashboard/products/${e.productUuid}/edit`} className="font-medium underline-offset-2 hover:underline">{e.nume}</Link>
                          {e.titlu ? ` (${e.titlu})` : ""}: <span className="text-muted-foreground">{e.mesaj}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Calculat la {data(raport.calculatLa)}.</p>
          </div>
        )}
      </Panel>

      <Panel title="Setările catalogului">
        <div className="space-y-3 text-sm">
          {([
            ["skuGenerat", "Produsele fără SKU pleacă cu un SKU generat de Edinio", "SKU-ul generat rămâne numai în legătura cu easySales; nu se scrie în produs."],
            ["descriereDinNume", "Produsele fără descriere pleacă cu numele drept descriere", "easySales cere descrierea. Fără bifă, produsele fără descriere nu pleacă."],
            ["arhivareLaStergere", "Produsul șters din Edinio se arhivează în easySales", "Arhivarea dezactivează și dezleagă ofertele lui pe toate canalele; se poate restaura din easySales o lună."],
          ] as const).map(([k, t, h]) => (
            <label key={k} className="flex items-start justify-between gap-4">
              <span><span className="font-medium">{t}</span><br /><span className="text-muted-foreground">{h}</span></span>
              <Switch checked={setari[k]} onCheckedChange={(v) => setSetari({ ...setari, [k]: v })} />
            </label>
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Stoc fix pentru produsele fără evidența stocului" hint="Gol: produsele fără evidență nu pleacă.">
              <Input type="number" min={0} max={100000} value={setari.stocFix ?? ""} onChange={(e) => setSetari({ ...setari, stocFix: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="O variantă scoasă sau dezactivată" hint="Rămâne în easySales cu stocul 0, sau se arhivează.">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={setari.combinatieScoasa} onChange={(e) => setSetari({ ...setari, combinatieScoasa: e.target.value === "arhivare" ? "arhivare" : "stoc_zero" })}>
                <option value="stoc_zero">Rămâne cu stocul 0</option>
                <option value="arhivare">Se arhivează</option>
              </select>
            </Field>
            <Field label="Termen de expediere (zile)" hint="Gol: nu se trimite.">
              <Input type="number" min={0} max={365} value={setari.termenZile ?? ""} onChange={(e) => setSetari({ ...setari, termenZile: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
          </div>
          <Button onClick={() => faCu("setari", () => salveazaSetarileCataloguluiEasySales(businessId, setari))} disabled={lucru !== null}>
            {lucru === "setari" ? <Loader2 className="animate-spin" /> : null} Salvează setările catalogului
          </Button>
        </div>
      </Panel>

      {stare.probleme.length > 0 && (
        <Panel title="Produse de verificat">
          <ul className="divide-y text-sm">
            {stare.probleme.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  {p.productId
                    ? <Link href={`/dashboard/products/${p.productId}/edit`} className="font-medium underline-offset-2 hover:underline">{p.sku ?? "fără SKU"}</Link>
                    : <span className="font-medium">{p.sku ?? "fără SKU"} (produs șters)</span>}
                  {" "}<span className="text-muted-foreground">{NUME_STARE[p.stare] ?? p.stare}: {p.motiv}</span>
                </span>
                <span className="flex gap-2">
                  {p.stare !== "blocat" && (
                    <Button size="sm" variant="outline" onClick={() => faCu(`r${p.id}`, () => retrimiteArticolulEasySales(businessId, p.id))} disabled={lucru !== null}>Retrimite</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => faCu(`e${p.id}`, () => excludeArticolulEasySales(businessId, p.id))} disabled={lucru !== null}>Exclude</Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
