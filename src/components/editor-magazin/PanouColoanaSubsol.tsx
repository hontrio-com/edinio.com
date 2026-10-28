"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";
import { CampLink, FurnizorLegaturi } from "@/components/pages/editor/CampLink";
import { cdnImage } from "@/lib/cdn-image";
import type { DateBlocuri } from "@/lib/pages/date-editor-pagina";
import {
  comutaBloc, duplicaColoana, MAX_COLOANE_SUBSOL, poateAdaugaColoana, schemaBlocurilor, setariColoana, stergeColoana,
  TIPURI_COLOANE_SUBSOL,
} from "@/lib/storefront/design/blocuri";
import { schimbaBlocurile } from "@/lib/storefront/design/edit";
import { etichetaColoanei } from "@/lib/storefront/design/subsol";
import type { BlockInstance, SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import { Grup, Nota, RandComutator, inputCls, inputMicCls } from "./continut/ui";
import type { CiornaDesign } from "./useCiornaDesign";

/**
 * Coloanele subsolului in editor (etapa 11 din `docs/editor-magazin/PLAN.md`): panoul unei coloane si lista
 * „Adaugă coloană”. Totul prin ciorna, ca restul designului: Anulează / Refă, „Publică”.
 */

/** Ce face fiecare tip de coloana, in cuvintele comerciantului. */
const DESCRIERI: Record<string, string> = {
  identitate: "Logo-ul, sloganul sau un text al tău și rețelele sociale.",
  linkuri: "Categoriile, paginile din meniu sau linkurile alese de tine.",
  text: "Un titlu și câteva rânduri, de exemplu despre magazin.",
  contact: "Telefonul, WhatsApp-ul, emailul și orașul, din Setări.",
  newsletter: "O casetă de abonare: emailul și acordul clientului.",
  imagine: "O imagine, cu link dacă vrei: o siglă, o certificare.",
  retele: "Iconițele rețelelor sociale, într-o coloană a lor.",
};

const MAX_LINKURI = 12;

const actiune = "w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:pointer-events-none";

const sir = (v: unknown): string => (typeof v === "string" ? v : "");

/** Newsletterul se adauga doar cu un furnizor conectat, ca blocul de pe pagini (`PaletaBlocuri`). */
function newsletterPermis(date: DateBlocuri | null): boolean {
  return (date?.integrari.furnizori.length ?? 0) > 0;
}

export function PanouAdaugaColoana({ subsol, date, locText, onAlege, onInapoi }: {
  subsol: SectionInstance;
  date: DateBlocuri | null;
  /** Unde intra coloana noua, in cuvinte („după „Linkuri: Magazin””). */
  locText: string;
  onAlege: (tip: string) => void;
  onInapoi: () => void;
}) {
  const schema = schemaBlocurilor("footer", subsol.variant);
  const coloane = subsol.blocks ?? [];
  if (!schema) return null;
  const plin = coloane.length >= (schema.maxBlocuri ?? MAX_COLOANE_SUBSOL);
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
          className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="shrink-0 text-muted-foreground"><Plus className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground leading-snug">Adaugă o coloană</h2>
          <p className="text-[11px] text-muted-foreground leading-snug break-words">În subsol, {locText}</p>
        </div>
      </div>
      {plin && <Nota>Subsolul are deja {MAX_COLOANE_SUBSOL} coloane, cât încap una lângă alta. Șterge una ca să pui alta.</Nota>}
      <ul className="space-y-2">
        {TIPURI_COLOANE_SUBSOL.map((tip) => {
          const meta = schema.tipuri[tip];
          const fara = tip === "newsletter" && !newsletterPermis(date) ? "Conectează Mailchimp, Brevo sau Klaviyo din Integrări." : null;
          const pusa = !plin && !poateAdaugaColoana(coloane, schema, tip) ? "E deja în subsol." : null;
          const motiv = fara ?? pusa;
          return (
            <li key={tip}>
              <button type="button" disabled={plin || !!motiv} onClick={() => onAlege(tip)}
                className="w-full text-left rounded-xl border border-border px-3 py-2.5 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent disabled:cursor-not-allowed">
                <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                <span className="block text-[11px] text-muted-foreground leading-snug">{motiv ?? DESCRIERI[tip]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PanouColoanaSubsol({ subsol, coloana, ciorna, date, onInapoi }: {
  subsol: SectionInstance;
  coloana: BlockInstance;
  ciorna: CiornaDesign;
  date: DateBlocuri | null;
  onInapoi: () => void;
}) {
  const schema = schemaBlocurilor("footer", subsol.variant);
  const meta = schema?.tipuri[coloana.type];
  if (!schema || !meta?.coloana) return null;
  const s = coloana.settings;
  const opereaza = (op: Parameters<typeof schimbaBlocurile>[2], cheie?: string) =>
    ciorna.aplica((d: StoreDesign) => schimbaBlocurile(d, subsol.id, op), cheie);
  // Reglajul se scrie peste ce e ACUM in ciorna, nu peste copia din randare: doua campuri schimbate repede nu se calca.
  const scrie = (cheie: string, valoare: unknown) => opereaza(
    (l, sch) => setariColoana(l, sch, coloana.id, { ...(l.find((b) => b.id === coloana.id)?.settings ?? {}), [cheie]: valoare }),
    `coloana:${coloana.id}:${cheie}`,
  );
  const titlu = (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-foreground">Titlul coloanei</span>
      <input type="text" value={sir(s.titlu)} maxLength={60} className={inputCls} placeholder="Fără titlu"
        onChange={(e) => scrie("titlu", e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
          className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground leading-snug break-words">{etichetaColoanei(coloana)}</h2>
          <p className="text-[11px] text-muted-foreground">{coloana.enabled ? "Coloană în subsol" : "Ascunsă în magazin"}</p>
        </div>
        <button type="button" onClick={() => opereaza((l, sch) => comutaBloc(l, sch, coloana.id), `ochi-bloc:${subsol.id}:${coloana.id}`)}
          className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
          {coloana.enabled ? <><EyeOff className="h-3.5 w-3.5" /> Ascunde</> : <><Eye className="h-3.5 w-3.5" /> Arată</>}
        </button>
      </div>

      <FurnizorLegaturi value={date ? { businessId: date.business.id, ...date.legaturi } : null}>
        {coloana.type === "identitate" && (
          <div className="space-y-4">
            <RandComutator titlu="Logo-ul" ajutor="Mărimea lui o reglezi din panoul subsolului." pornit={s.arataLogo !== false}
              onSchimba={(v) => scrie("arataLogo", v)} />
            <RandComutator titlu="Sloganul magazinului" pornit={s.arataSloganul === true} onSchimba={(v) => scrie("arataSloganul", v)} />
            <Nota setare="general" eticheta="Setări > Informații generale">Sloganul îl scrii în fila Setări, la Informații generale.</Nota>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Text sub logo</span>
              <textarea rows={3} value={sir(s.text)} maxLength={300} className={`${inputCls} resize-y`}
                placeholder="De exemplu: Flori proaspete, livrate în aceeași zi." onChange={(e) => scrie("text", e.target.value)} />
            </label>
            <RandComutator titlu="Rețelele sociale" ajutor="Iconițele, sub text." pornit={s.arataRetelele !== false}
              onSchimba={(v) => scrie("arataRetelele", v)} />
          </div>
        )}

        {coloana.type === "linkuri" && (
          <div className="space-y-4">
            {titlu}
            <Grup titlu="Ce linkuri">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Ce linkuri">
                {([["categorii", "Categorii"], ["pagini", "Pagini din meniu"], ["alese", "Alese de mine"]] as const).map(([v, eticheta]) => {
                  const ales = (sir(s.sursa) || "alese") === v;
                  return (
                    <button key={v} type="button" role="radio" aria-checked={ales} onClick={() => scrie("sursa", v)}
                      className={`h-auto min-h-9 px-2 py-1.5 rounded-lg border text-[11px] font-medium leading-tight transition-colors ${ales ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {eticheta}
                    </button>
                  );
                })}
              </div>
              {s.sursa === "categorii" && (
                <>
                  <RandComutator titlu="„Toate produsele” primul" pornit={s.toateProdusele !== false} onSchimba={(v) => scrie("toateProdusele", v)} />
                  <label className="block space-y-1.5">
                    <span className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Câte categorii</span>
                      <span className="tabular-nums text-muted-foreground">{typeof s.cate === "number" ? s.cate : 6}</span>
                    </span>
                    <input type="range" min={1} max={12} step={1} value={typeof s.cate === "number" ? s.cate : 6} aria-label="Câte categorii"
                      onChange={(e) => scrie("cate", Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
                  </label>
                  <Nota>Primele categorii principale, în ordinea din Produse &gt; Categorii.</Nota>
                </>
              )}
              {s.sursa === "pagini" && <Nota>Paginile și linkurile din meniul magazinului, în ordinea de acolo (Pagini &gt; Meniu).</Nota>}
              {(sir(s.sursa) || "alese") === "alese" && (
                <ListaLinkuri linkuri={s.linkuri} onSchimba={(l) => scrie("linkuri", l)} />
              )}
            </Grup>
          </div>
        )}

        {coloana.type === "contact" && (
          <div className="space-y-4">
            {titlu}
            <RandComutator titlu="Telefonul" pornit={s.telefon !== false} onSchimba={(v) => scrie("telefon", v)} />
            <RandComutator titlu="WhatsApp" pornit={s.whatsapp !== false} onSchimba={(v) => scrie("whatsapp", v)} />
            <RandComutator titlu="Emailul" pornit={s.email !== false} onSchimba={(v) => scrie("email", v)} />
            <RandComutator titlu="Orașul" pornit={s.oras === true || (s.oras !== false && subsol.variant !== "centered")} onSchimba={(v) => scrie("oras", v)} />
            <Nota setare="general" eticheta="Setări > Informații generale">Datele de contact le completezi în fila Setări, la Informații generale. Ce lipsește acolo nu apare.</Nota>
          </div>
        )}

        {coloana.type === "text" && (
          <div className="space-y-4">
            {titlu}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Textul</span>
              <textarea rows={5} value={sir(s.text)} maxLength={600} className={`${inputCls} resize-y`}
                onChange={(e) => scrie("text", e.target.value)} />
            </label>
          </div>
        )}

        {coloana.type === "newsletter" && (
          <div className="space-y-4">
            {titlu}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Textul de deasupra</span>
              <textarea rows={2} value={sir(s.text)} maxLength={200} className={`${inputCls} resize-y`}
                onChange={(e) => scrie("text", e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Textul butonului</span>
              <input type="text" value={sir(s.buton)} maxLength={40} className={inputCls} placeholder="Aboneaza-ma"
                onChange={(e) => scrie("buton", e.target.value)} />
            </label>
            <Nota>Clientul își lasă emailul și bifează acordul. Abonările apar în Pagini &gt; Mesaje, cu locul „Subsol”, și ajung la furnizorul conectat (Mailchimp, Brevo sau Klaviyo).</Nota>
          </div>
        )}

        {coloana.type === "imagine" && (
          <CampuriImagine s={s} scrie={scrie} />
        )}

        {coloana.type === "retele" && (
          <div className="space-y-4">
            {titlu}
            <Nota setare="social" eticheta="Setări > Social media">Linkurile rețelelor le completezi în fila Setări, la Social media. Fără niciunul, coloana nu apare.</Nota>
          </div>
        )}
      </FurnizorLegaturi>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        {!meta.coloana.unica && (
          <button type="button" disabled={(subsol.blocks?.length ?? 0) >= MAX_COLOANE_SUBSOL}
            onClick={() => opereaza((l, sch) => duplicaColoana(l, sch, coloana.id))}
            className="h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5 disabled:opacity-40">
            <Copy className="h-3.5 w-3.5" /> Duplică
          </button>
        )}
        <button type="button" onClick={() => { opereaza((l, sch) => stergeColoana(l, sch, coloana.id)); onInapoi(); }}
          className="ml-auto h-9 px-3 rounded-lg border border-border text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors inline-flex items-center gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Șterge coloana
        </button>
      </div>
    </div>
  );
}

/** Linkurile alese de om: textul si adresa (cu sugestiile paginilor, categoriilor, produselor), sageti, cos. */
function ListaLinkuri({ linkuri, onSchimba }: { linkuri: unknown; onSchimba: (l: { eticheta: string; adresa: string }[]) => void }) {
  const lista = (Array.isArray(linkuri) ? linkuri : []).map((l) => {
    const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    return { eticheta: sir(o.eticheta), adresa: sir(o.adresa) };
  });
  const pune = (i: number, patch: Partial<{ eticheta: string; adresa: string }>) => onSchimba(lista.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const muta = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const n = [...lista];
    [n[i], n[j]] = [n[j], n[i]];
    onSchimba(n);
  };
  return (
    <div className="space-y-2">
      {lista.map((l, i) => (
        <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-1">
            <input type="text" value={l.eticheta} maxLength={80} className={`${inputMicCls} flex-1`} placeholder="Textul linkului"
              aria-label={`Textul linkului ${i + 1}`} onChange={(e) => pune(i, { eticheta: e.target.value })} />
            <button type="button" disabled={i === 0} aria-label="Mută mai sus" className={actiune} onClick={() => muta(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={i === lista.length - 1} aria-label="Mută mai jos" className={actiune} onClick={() => muta(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Șterge linkul" className={`${actiune} hover:text-destructive`} onClick={() => onSchimba(lista.filter((_, k) => k !== i))}><X className="h-3.5 w-3.5" /></button>
          </div>
          <CampLink eticheta="Adresa" valoare={l.adresa} onChange={(v) => pune(i, { adresa: v })} />
        </div>
      ))}
      {lista.length < MAX_LINKURI && (
        <button type="button" onClick={() => onSchimba([...lista, { eticheta: "", adresa: "" }])}
          className="w-full h-9 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Adaugă un link ({lista.length}/{MAX_LINKURI})
        </button>
      )}
    </div>
  );
}

function CampuriImagine({ s, scrie }: { s: Record<string, unknown>; scrie: (cheie: string, v: unknown) => void }) {
  const [deschis, setDeschis] = useState(false);
  const url = sir(s.imagine);
  const latime = typeof s.latime === "number" ? s.latime : 160;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-foreground">Imaginea</span>
        <div className="flex items-center gap-2">
          {url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={cdnImage(url, 160)} alt="" className="w-16 h-16 rounded-lg object-contain border border-border bg-muted shrink-0" />
          )}
          <button type="button" onClick={() => setDeschis(true)}
            className="flex-1 h-10 px-3 text-sm border border-border rounded-lg bg-surface text-foreground hover:bg-muted transition-colors">
            {url ? "Schimbă imaginea" : "Alege o imagine"}
          </button>
          {url && (
            <button type="button" onClick={() => scrie("imagine", undefined)} aria-label="Scoate imaginea"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <MediaPicker open={deschis} onClose={() => setDeschis(false)} accept="image" bucket="gallery"
          onSelect={(urls) => { const ales = Array.isArray(urls) ? urls[0] : urls; if (ales) scrie("imagine", ales); setDeschis(false); }} />
      </div>
      <CampLink eticheta="Link la apăsare (opțional)" valoare={sir(s.link)} onChange={(v) => scrie("link", v)} />
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">Text alternativ</span>
        <input type="text" value={sir(s.alt)} maxLength={120} className={inputCls} placeholder="Ce arată imaginea, pentru cititoarele de ecran"
          onChange={(e) => scrie("alt", e.target.value)} />
      </label>
      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Lățimea</span>
          <span className="tabular-nums text-muted-foreground">{latime}px</span>
        </span>
        <input type="range" min={40} max={320} step={4} value={latime} aria-label="Lățimea imaginii"
          onChange={(e) => scrie("latime", Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
      </label>
    </div>
  );
}
