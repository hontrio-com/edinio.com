"use client";

import { FileText, Loader2, Palette, Upload, X } from "lucide-react";
import type { CampPersonalizare } from "@/lib/customization/definitie";
import { sePoateRandaCaImagine } from "@/lib/customization/comanda";
import type { StarePersonalizare } from "./usePersonalizare";

/**
 * Campurile de personalizare, desenate O SINGURA DATA pentru tot proiectul.
 *
 * ═══ ⚠ DE CE O COMPONENTA, SI NU COD IN FIECARE PAGINA ═══
 *
 * Pana acum formularul traia intr-un singur loc — `OrderModal` — si nicaieri altundeva: pagina de
 * produs arata doar o pastila „Personalizabil", si aia numai in modelul `classic`. Modelele sunt
 * doua si vor fi mai multe; scris in fiecare, formularul ar fi divergit, iar divergenta s-ar fi
 * vazut ca un model in care lipseste un camp obligatoriu.
 *
 * Proiectul are tiparul scris de patru ori (al doilea meniu al panoului, cele doua cai de comanda,
 * cheia de linie din cos), si de fiecare data a doua copie a divergit.
 *
 * ⚠ Componenta doar DESENEAZA. Starea, validarea si pretul stau in `usePersonalizare`, fiindca de
 * ele atarna si butonul, si pretul de langa titlu — adica lucruri din afara ei.
 */

/** Stilul campurilor, cel folosit azi de personalizare si de checkout. */
const CAMP =
  "w-full px-3 py-2.5 text-sm text-foreground bg-surface border border-border rounded-lg focus:outline-none focus:border-foreground/40";

interface Props {
  stare: StarePersonalizare;
  /** Culoarea magazinului. Se aplica prin `style`, ca peste tot in vitrina. */
  color: string;
  /** Numerotarea pasilor („1. Scrie dimensiunile"). */
  numeroteaza?: boolean;
  /** Titlul de deasupra. Lipsa in formularul de comanda, unde exista deja unul. */
  titlu?: string;
}

export function CampuriPersonalizare({ stare, color, numeroteaza = true, titlu }: Props) {
  const { definitie, valori, pune, constatari, incarca, motive, incarcaFisiere, scoateFisier } = stare;
  if (!definitie) return null;

  return (
    <div className="space-y-4 border border-border rounded-xl p-3.5 bg-muted/30">
      {titlu && (
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Palette size={13} />
          {titlu}
        </p>
      )}

      {definitie.fields.map((camp, i) => {
        const eroare = constatari[camp.id];
        const idEroare = `pers-${camp.id}-eroare`;
        return (
          <div key={camp.id}>
            <label
              htmlFor={`pers-${camp.id}`}
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              {numeroteaza && (
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold mr-2 align-middle"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {i + 1}
                </span>
              )}
              {camp.label || "Camp"}
              {camp.required && <span className="text-red-500" aria-hidden="true"> *</span>}
            </label>

            <Control
              camp={camp}
              valoare={valori[camp.id]}
              pune={pune}
              color={color}
              eroare={!!eroare}
              idEroare={idEroare}
              incarca={incarca} motive={motive}
              incarcaFisiere={incarcaFisiere}
              scoateFisier={scoateFisier}
            />

            {camp.helper_text && !eroare && (
              <p className="text-[11px] text-muted-foreground mt-1">{camp.helper_text}</p>
            )}
            {eroare && (
              /* ⚠ `role="alert"` si `aria-describedby`: fara ele, cine navigheaza cu tastatura sau
                 cu un cititor de ecran nu afla NICIODATA de ce nu poate comanda. */
              <p id={idEroare} role="alert" className="text-xs text-red-500 mt-1">
                {eroare}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ControlProps {
  camp: CampPersonalizare;
  valoare: unknown;
  pune: (id: string, v: unknown) => void;
  color: string;
  eroare: boolean;
  idEroare: string;
  incarca: Record<string, boolean>;
  motive: StarePersonalizare["motive"];
  incarcaFisiere: StarePersonalizare["incarcaFisiere"];
  scoateFisier: StarePersonalizare["scoateFisier"];
}

function Control(p: ControlProps) {
  const { camp, valoare, pune, color, eroare, idEroare } = p;
  const comun = {
    id: `pers-${camp.id}`,
    "aria-invalid": eroare || undefined,
    "aria-describedby": eroare ? idEroare : undefined,
    className: eroare ? `${CAMP} border-red-400` : CAMP,
  };

  switch (camp.type) {
    case "text":
      return (
        <input
          {...comun}
          value={typeof valoare === "string" ? valoare : ""}
          onChange={(e) => pune(camp.id, e.target.value)}
          placeholder={camp.placeholder ?? ""}
          maxLength={camp.max_length}
        />
      );

    case "textarea": {
      const t = typeof valoare === "string" ? valoare : "";
      return (
        <div>
          <textarea
            {...comun}
            className={`${comun.className} resize-none`}
            value={t}
            onChange={(e) => pune(camp.id, e.target.value)}
            placeholder={camp.placeholder ?? ""}
            maxLength={camp.max_length}
            rows={3}
          />
          {camp.max_length && (
            <p className="text-[11px] text-muted-foreground mt-0.5 text-right">
              {t.length}/{camp.max_length}
            </p>
          )}
        </div>
      );
    }

    case "select":
      return (
        <select
          {...comun}
          value={typeof valoare === "string" ? valoare : ""}
          onChange={(e) => pune(camp.id, e.target.value)}
        >
          <option value="">Selecteaza...</option>
          {(camp.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );

    case "color": {
      const c = typeof valoare === "string" ? valoare : (camp.default_color ?? "#000000");
      return (
        <div className="flex items-center gap-3">
          <input
            id={comun.id}
            type="color"
            value={c}
            onChange={(e) => pune(camp.id, e.target.value)}
            className="w-10 h-10 rounded-lg border border-border cursor-pointer"
          />
          <span className="text-sm text-muted-foreground font-mono">{c}</span>
        </div>
      );
    }

    case "numar":
      return (
        <div className="flex items-center gap-2">
          <input
            {...comun}
            type="number"
            /* ⚠ `inputMode="decimal"` aduce tastatura numerica pe telefon. Fara el, clientul
               scrie dimensiuni de pe tastatura de litere. */
            inputMode="decimal"
            value={typeof valoare === "number" || typeof valoare === "string" ? String(valoare) : ""}
            onChange={(e) => pune(camp.id, e.target.value)}
            placeholder={camp.placeholder ?? ""}
            min={camp.min}
            max={camp.max}
            step={camp.pas}
          />
          {camp.unitate_text && (
            <span className="text-sm text-muted-foreground shrink-0">{camp.unitate_text}</span>
          )}
        </div>
      );

    case "dimensiuni": {
      const d = valoare && typeof valoare === "object" ? (valoare as Record<string, unknown>) : {};
      const u = camp.unitate ?? "cm";
      const latura = (
        cheie: "latime" | "inaltime",
        eticheta: string,
        marg: { min: number; max: number; pas?: number } | undefined,
      ) => (
        <div className="flex-1 min-w-[130px]">
          <label
            htmlFor={`pers-${camp.id}-${cheie}`}
            className="block text-[11px] text-muted-foreground mb-1"
          >
            {eticheta}
            {marg && ` (${marg.min}–${marg.max} ${u}${marg.pas ? `, din ${marg.pas} in ${marg.pas}` : ""})`}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id={`pers-${camp.id}-${cheie}`}
              type="number"
              inputMode="decimal"
              aria-invalid={eroare || undefined}
              aria-describedby={eroare ? idEroare : undefined}
              value={d[cheie] === undefined || d[cheie] === null ? "" : String(d[cheie])}
              onChange={(e) => pune(camp.id, { ...d, [cheie]: e.target.value })}
              min={marg?.min}
              max={marg?.max}
              /* ⚠ Doar o comoditate: pasul adevarat se verifica pe SERVER, in `valori.ts`. */
              step={marg?.pas}
              className={eroare ? `${CAMP} border-red-400` : CAMP}
            />
            <span className="text-sm text-muted-foreground shrink-0">{u}</span>
          </div>
        </div>
      );
      return (
        /* ⚠ `flex-wrap`: pe desktop cele doua stau alaturi, pe telefon se aseaza una sub alta
           singure, fara media query si fara depasire orizontala. */
        <div className="flex flex-wrap gap-3">
          {latura("latime", "Latime", camp.latime)}
          {latura("inaltime", "Inaltime", camp.inaltime)}
        </div>
      );
    }

    case "butoane": {
      const ales = typeof valoare === "string" ? valoare : "";
      return (
        /* ⚠ `role="radiogroup"`: butoanele sunt o alegere unica, si asa o citeste si un cititor
           de ecran, nu ca pe o insiruire de butoane fara legatura. */
        <div role="radiogroup" aria-label={camp.label} className="flex flex-wrap gap-2">
          {(camp.optiuni ?? []).map((o) => {
            const e = o.id === ales;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={e}
                onClick={() => pune(camp.id, o.id)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all"
                style={{
                  borderColor: e ? color : "var(--color-border)",
                  backgroundColor: e ? `${color}18` : "transparent",
                  color: e ? "var(--color-foreground)" : "var(--color-muted-foreground)",
                }}
              >
                {o.eticheta}
              </button>
            );
          })}
        </div>
      );
    }

    case "comutator": {
      const pornit = valoare === true;
      return (
        <div className="flex gap-2">
          {[
            { v: false, e: "Nu" },
            { v: true, e: "Da" },
          ].map((o) => {
            const ales = pornit === o.v;
            return (
              <button
                key={o.e}
                type="button"
                aria-pressed={ales}
                onClick={() => pune(camp.id, o.v)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border-2 transition-all"
                style={{
                  borderColor: ales ? color : "var(--color-border)",
                  backgroundColor: ales ? `${color}18` : "transparent",
                  color: ales ? "var(--color-foreground)" : "var(--color-muted-foreground)",
                }}
              >
                {o.e}
              </button>
            );
          })}
        </div>
      );
    }

    case "image":
    case "fisier":
      return <Fisiere {...p} />;
  }
}

function Fisiere({ camp, valoare, color, eroare, idEroare, incarca, motive, incarcaFisiere, scoateFisier }: ControlProps) {
  const adrese = Array.isArray(valoare) ? (valoare as string[]) : [];
  /*
   * ⚠ MINIATURA DOAR PENTRU CE SE POATE CHIAR DESENA, si asta e o singura regula, nu doua.
   *
   * Randat cu `<img>`, un fisier care nu se poate decoda da o poza rupta chiar in locul in care
   * clientul tocmai a incarcat ceva — adica exact semnul „n-a mers". Fara niciun mesaj, fiindca nu
   * e nicio eroare. El sterge, incarca iar, si vede acelasi patrat.
   *
   * Doua feluri de fisiere pateau asta, si prima forma a codului il apara doar pe primul:
   *  - PDF-urile, la campul de tip `fisier`;
   *  - HEIC/HEIF, la campul de tip `image` — pozele venite de pe iPhone. Chrome, Firefox si Edge
   *    n-au decodor HEIC, iar `/api/img` nu le primeste dinadins (vezi `sePoateRandaCaImagine`).
   *
   * Deci intrebarea nu e „ce fel de CAMP e", ci „se poate desena ADRESA asta" — si se pune pe
   * fiecare fisier in parte. Asa un JPG incarcat intr-un camp de fisiere isi capata miniatura, iar
   * un HEIC dintr-un camp de imagini isi capata numele si legatura.
   */
  const documente = camp.type === "fisier";
  const maxim = camp.max_files ?? 5;
  const seIncarca = !!incarca[camp.id];
  const numeleFisierului = (url: string, i: number) => {
    try {
      const cale = new URL(url).pathname;
      return decodeURIComponent(cale.slice(cale.lastIndexOf("/") + 1)) || `Fisierul ${i + 1}`;
    } catch {
      return `Fisierul ${i + 1}`;
    }
  };

  return (
    <div className="space-y-2">
      {adrese.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {adrese.map((url, i) => (
            sePoateRandaCaImagine(url) ? (
              <div key={`${url}-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-surface group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Fisierul ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => scoateFisier(camp.id, i)}
                  aria-label={`Scoate fisierul ${i + 1}`}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ) : (
              <div key={`${url}-${i}`} className="flex items-center gap-2 text-sm w-full">
                <FileText size={15} className="shrink-0" style={{ color }} />
                <a
                  href={url} target="_blank" rel="noopener noreferrer"
                  className="truncate hover:underline text-foreground"
                >
                  {numeleFisierului(url, i)}
                </a>
                <button
                  type="button"
                  onClick={() => scoateFisier(camp.id, i)}
                  aria-label={`Scoate fisierul ${i + 1}`}
                  className="ml-auto shrink-0 w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-red-50"
                >
                  <X size={10} />
                </button>
              </div>
            )
          ))}
        </div>
      )}

      {adrese.length < maxim && (
        <label
          className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-dashed rounded-lg cursor-pointer hover:border-foreground/40 transition-colors w-fit"
          style={{ borderColor: eroare ? "#f87171" : undefined }}
        >
          {seIncarca ? <Loader2 size={15} className="animate-spin" style={{ color }} /> : <Upload size={15} style={{ color }} />}
          <span className="text-sm text-muted-foreground">
            {seIncarca ? "Se incarca..." : documente ? "Incarca fisier" : "Incarca imagine"}
          </span>
          <input
            type="file"
            /*
             * ⚠ ACEEASI LISTA CA PE SERVER (ruta `upload-customization`), si de-aia sunt si
             * HEIC/HEIF aici: serverul le primeste din 07.06.2026, dar campul nu le declara, deci
             * fereastra de alegere a fisierelor le arata GRI pe iPhone — formatul implicit al
             * pozelor de acolo. Clientul vedea ca „nu se poate incarca poza mea".
             *
             * ⚠ Nu e o poarta: filtrul din browser doar ajuta la alegere. Serverul verifica
             * OCTETII fisierului, nu antetul trimis (`detectImageMime`), deci ocolit de aici
             * nu trece nimic.
             */
            accept={documente
              ? "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf"
              : "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"}
            multiple
            className="hidden"
            aria-invalid={eroare || undefined}
            aria-describedby={eroare ? idEroare : undefined}
            onChange={async (e) => {
              await incarcaFisiere(camp, e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      <p className="text-[11px] text-muted-foreground">
        {/* ⚠ Formatele se SCRIU. Fara ele, cine trage un PDF primea mesajul de mai jos si nu
            afla niciodata ca formatul era problema, nu marimea. */}
        {documente ? "PDF, JPG, PNG, WEBP sau HEIC" : "JPG, PNG, WEBP sau HEIC"}. Cel mult {maxim}{" "}
        {documente
          ? (maxim === 1 ? "fisier" : "fisiere")
          : (maxim === 1 ? "imagine" : "imagini")},{" "}
        {camp.max_file_size_mb ?? (documente ? 40 : 10)} MB fiecare.
      </p>
      {incarca[`${camp.id}:eroare`] && (
        /* ⚠ Pana acum un fisier prea mare sau o incarcare picata erau sarite in TACERE: clientul
           alegea patru poze si vedea trei, fara niciun mesaj. */
        <p role="alert" className="text-xs text-red-500">
          {/*
            ⚠ CUVINTELE SERVERULUI, cand le are. Explicatia compusa din reglajele campului putea
            fi FALSA in amandoua jumatatile — „pana in 100 MB" pe un fisier de 55 MB refuzat la 40,
            si „accepta PDF" pe chiar un PDF. Genericul ramane doar pentru caderea de retea, unde
            n-avem de la cine sa aflam motivul.
          */}
          {motive[camp.id] || (
            <>
              {documente ? "Unele fisiere" : "Unele imagini"} n-au putut fi incarcate. Accepta{" "}
              {documente ? "PDF, JPG, PNG, WEBP si HEIC" : "JPG, PNG, WEBP si HEIC"}, pana in{" "}
              {Math.min(camp.max_file_size_mb ?? (documente ? 40 : 10), documente ? 40 : 10)} MB.
            </>
          )}
        </p>
      )}
    </div>
  );
}
