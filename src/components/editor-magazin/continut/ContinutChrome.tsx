"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Upload, X } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";
import {
  INALTIME_INSIGNA_IMPLICITA, INALTIME_INSIGNA_MAX, INALTIME_INSIGNA_MIN,
  MAX_INSIGNE_FOOTER, TITLU_INSIGNE_IMPLICIT, type InsignaFooterStocata,
} from "@/lib/storefront/footer-badges";
import type { ContinutMagazin } from "../useContinutMagazin";
import { BaraSalvare, Grup, Nota, RandComutator, inputCls, inputMicCls } from "./ui";

/**
 * Continutul sectiunilor comune tuturor paginilor: bara de anunt, antetul si
 * subsolul. Mutat din panourile „Pagina produs” si „Pagina principala” ale
 * editorului vechi, unde stateau amestecate cu reglajele paginilor.
 */

const VITEZE = ["Foarte lent", "Lent", "Normal", "Rapid", "Foarte rapid"];

export function ContinutAnunt({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  const bara = pc.announcement_bar!;
  const pune = (patch: Partial<typeof bara>) => seteaza("anunt", (p) => ({ ...p, announcement_bar: { ...p.announcement_bar!, ...patch } }));
  return (
    <div className="space-y-5">
      <Nota>Bara se arată sau se ascunde din ochiul de lângă ea, în lista de secțiuni. Aici îi scrii textul.</Nota>
      <Grup titlu="Textul barei">
        <input type="text" value={bara.text} className={inputCls} aria-label="Textul barei de anunț"
          placeholder="PLATA LA LIVRARE   ✦   LIVRARE RAPIDĂ 24-48H" onChange={(e) => pune({ text: e.target.value })} />
        <label className="flex items-center gap-2">
          <input type="color" value={bara.bg_color} onChange={(e) => pune({ bg_color: e.target.value })}
            className="w-8 h-8 rounded border border-border cursor-pointer" aria-label="Culoarea de fundal a barei" />
          <span className="text-xs text-muted-foreground">Culoarea de fundal</span>
        </label>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Viteza de derulare</span>
            <span className="font-medium text-foreground">{VITEZE[(bara.speed ?? 3) - 1]}</span>
          </span>
          <input type="range" min={1} max={5} step={1} value={bara.speed ?? 3} aria-label="Viteza de derulare"
            onChange={(e) => pune({ speed: Number(e.target.value) })} className="w-full h-1.5 accent-primary cursor-pointer" />
        </label>
      </Grup>
      <RandComutator titlu="Arată bara și pe pagina principală"
        ajutor="Oprit, bara apare doar pe celelalte pagini ale magazinului."
        pornit={pc.show_announcement_on_store !== false}
        onSchimba={(v) => seteaza("anunt", (p) => ({ ...p, show_announcement_on_store: v }))} />
      <BaraSalvare continut={continut} nod="anunt" />
    </div>
  );
}

export function ContinutHeader({ continut, laStil }: { continut: ContinutMagazin; laStil: () => void }) {
  const { pc, seteaza, logo } = continut;
  const marime = pc.logo_size ?? 36;
  return (
    <div className="space-y-5">
      {logo.previzualizare ? (
        <Grup titlu="Mărimea logo-ului">
          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Înălțimea în antet</span>
              <span className="font-semibold tabular-nums text-foreground">{marime}px</span>
            </span>
            <input type="range" min={24} max={56} step={1} value={marime} aria-label="Mărimea logo-ului în antet"
              onChange={(e) => seteaza("header", (p) => ({ ...p, logo_size: Number(e.target.value) }))}
              className="w-full accent-primary cursor-pointer" />
          </label>
          <div className="flex items-center rounded-lg border border-border bg-surface px-3 h-16 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.previzualizare} alt="" style={{ height: marime, maxWidth: marime * 4.2 }} className="w-auto object-contain" />
          </div>
        </Grup>
      ) : (
        <div className="space-y-2">
          <Nota>Magazinul nu are încă logo. Îl încarci din fila Stil.</Nota>
          <button type="button" onClick={laStil} className="text-xs font-medium text-primary hover:underline">Deschide Stil</button>
        </div>
      )}
      <BaraSalvare continut={continut} nod="header" />
    </div>
  );
}

export function ContinutFooter({ continut, planGratuit }: { continut: ContinutMagazin; planGratuit: boolean }) {
  const { pc, seteaza, logo } = continut;
  const insigne = pc.footer_badges ?? [];
  const marime = pc.footer_logo_size ?? 36;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerDeschis, setPickerDeschis] = useState(false);
  const [urca, setUrca] = useState(false);

  const puneInsigne = (fn: (l: InsignaFooterStocata[]) => InsignaFooterStocata[]) =>
    seteaza("footer", (p) => ({ ...p, footer_badges: fn(p.footer_badges ?? []) }));
  const adauga = (image: string) => puneInsigne((l) => l.length >= MAX_INSIGNE_FOOTER ? l : [...l, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, image, href: "", alt: "", height: INALTIME_INSIGNA_IMPLICITA,
  }]);
  const schimba = (i: number, patch: Partial<InsignaFooterStocata>) => puneInsigne((l) => l.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const muta = (i: number, dir: -1 | 1) => puneInsigne((l) => {
    const j = i + dir;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  /*
   * Imaginea insignei se urca IMEDIAT, nu la salvare: lista traieste direct in
   * `page_content`, deci n-are unde sa tina un fisier pana la apasarea butonului.
   * Randul apare abia dupa ce urcarea a reusit, ca sa nu ramana o insigna cu o
   * adresa `blob:` care dispare la reincarcare.
   */
  async function dinFisier(f: File) {
    if (!f.type.startsWith("image/")) { toast.error("Fișierul trebuie să fie o imagine."); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Imaginea trebuie să fie sub 5 MB."); return; }
    setUrca(true);
    const { uploadImage } = await import("@/lib/upload");
    const r = await uploadImage(f, "logos");
    setUrca(false);
    if ("error" in r) { toast.error("Imaginea nu s-a putut încărca."); return; }
    adauga(r.url);
  }

  return (
    <div className="space-y-5">
      {logo.previzualizare && (
        <Grup titlu="Logo-ul din subsol">
          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Înălțimea</span>
              <span className="font-semibold tabular-nums text-foreground">{marime}px</span>
            </span>
            <input type="range" min={24} max={56} step={1} value={marime} aria-label="Mărimea logo-ului din subsol"
              onChange={(e) => seteaza("footer", (p) => ({ ...p, footer_logo_size: Number(e.target.value) }))}
              className="w-full accent-primary cursor-pointer" />
          </label>
          <div className="flex items-center rounded-lg border border-border bg-[#0A0A0A] px-3 h-16 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.previzualizare} alt="" style={{ height: marime, maxWidth: marime * 4.2 }} className="w-auto object-contain" />
          </div>
        </Grup>
      )}

      <RandComutator titlu="Creditul Edinio în subsol"
        ajutor={planGratuit ? "Poate fi ascuns doar pe un plan plătit." : "Oprit, textul de credit dispare din subsolul magazinului."}
        pornit={!pc.hide_edinio_badge} dezactivat={planGratuit}
        onSchimba={(v) => { if (!planGratuit) seteaza("footer", (p) => ({ ...p, hide_edinio_badge: !v })); }} />

      <Grup titlu="Autorizații și certificări">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Sigle proprii care apar în subsol, pe toate paginile, lângă insignele ANPC. De exemplu insigna ANSVSA pentru magazinele veterinare sau un certificat ISO.
        </p>
        {insigne.map((b, i) => (
          <div key={b.id ?? i} className="border border-border rounded-lg p-2.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt="" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input type="text" value={b.href ?? ""} onChange={(e) => schimba(i, { href: e.target.value })}
                  placeholder="Link la apăsare (opțional): https://..." className={inputMicCls} aria-label={`Linkul insignei ${i + 1}`} />
                <input type="text" value={b.alt ?? ""} onChange={(e) => schimba(i, { alt: e.target.value })}
                  placeholder="Text alternativ (pentru cititoarele de ecran)" className={inputMicCls} aria-label={`Textul alternativ al insignei ${i + 1}`} />
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button type="button" aria-label="Mută sus" disabled={i === 0} onClick={() => muta(i, -1)}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Mută jos" disabled={i === insigne.length - 1} onClick={() => muta(i, 1)}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Șterge insigna" onClick={() => puneInsigne((l) => l.filter((_, j) => j !== i))}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Se fixeaza INALTIMEA; latimea vine din proportia imaginii. */}
            <label className="flex items-center gap-2.5">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Înălțime</span>
              <input type="range" min={INALTIME_INSIGNA_MIN} max={INALTIME_INSIGNA_MAX} step={2}
                value={b.height ?? INALTIME_INSIGNA_IMPLICITA} aria-label={`Înălțimea insignei ${i + 1}`}
                onChange={(e) => schimba(i, { height: Number(e.target.value) })} className="flex-1 accent-primary" />
              <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">{b.height ?? INALTIME_INSIGNA_IMPLICITA}px</span>
            </label>
          </div>
        ))}
        {insigne.length < MAX_INSIGNE_FOOTER && (
          <>
            <button type="button" disabled={urca} onClick={() => inputRef.current?.click()}
              className="w-full h-14 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50">
              {urca ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="text-xs">Adaugă o insignă ({insigne.length}/{MAX_INSIGNE_FOOTER})</span>
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-label="Încarcă o insignă"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void dinFisier(f); e.target.value = ""; }} />
            <button type="button" onClick={() => setPickerDeschis(true)} className="text-[11px] font-medium text-primary hover:text-primary/80">
              Alege din Biblioteca Media
            </button>
            <MediaPicker open={pickerDeschis} onClose={() => setPickerDeschis(false)} accept="image" bucket="logos"
              onSelect={(urls) => { if (urls[0]) adauga(urls[0]); }} />
          </>
        )}
        {insigne.length > 0 && (
          <RandComutator titlu="Titlu deasupra insignelor" ajutor="Oprit, în subsol rămân doar imaginile."
            pornit={pc.footer_badges_title_enabled !== false}
            onSchimba={(v) => seteaza("footer", (p) => ({ ...p, footer_badges_title_enabled: v }))}>
            <input type="text" value={pc.footer_badges_title ?? ""} maxLength={40} className={inputMicCls}
              aria-label="Titlul de deasupra insignelor" placeholder={`${TITLU_INSIGNE_IMPLICIT} (lasă gol ca să nu apară niciun titlu)`}
              onChange={(e) => seteaza("footer", (p) => ({ ...p, footer_badges_title: e.target.value }))} />
          </RandComutator>
        )}
      </Grup>
      <BaraSalvare continut={continut} nod="footer" />
    </div>
  );
}
