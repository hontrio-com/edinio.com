"use client";

import { useMemo, useState } from "react";
import type { ConfiguratorDeVitrina } from "@/lib/configurators/vitrina";
import type { Nod, NodNumar } from "@/lib/configurators/definitie";
import { esteAscuns, esteCerut, optiuniDeAles, aplicaRegulile } from "@/lib/configurators/reguli";
import { calculeazaPretul, pretDeAfisat } from "@/lib/configurators/pret";
import { normalizeazaValori, type Valori } from "@/lib/configurators/valori";
import {
  afisat, conversia, descrieIntervalul, dinText, eStricat, textulDeAratat,
} from "@/lib/configurators/camp-numar";
import { formatPrice } from "@/lib/utils/format";

/**
 * Configuratorul, pe pagina de produs.
 *
 * ═══ ⚠ O SINGURA COMPONENTA, PENTRU TOATE MODELELE DE PAGINA ═══
 *
 * `ProductPageClassic` si `ProductPageDetailed` au semnaturi scrise separat, dar identice ca
 * forma. Un configurator scris in fiecare ar fi divergit la prima schimbare, iar comerciantii de
 * pe modelul „detaliat" ar fi ramas cu forma veche fara ca nimeni sa observe — `tsc` n-are cum
 * sa prinda asa ceva. Deci componenta e una, si amandoua o randeaza.
 *
 * Proba din `slotul-e-in-toate-modelele.test.ts` cade daca un model nou o uita.
 *
 * ═══ ⚠ CE FACE, SI CE NU FACE INCA ═══
 *
 * Aici cumparatorul alege si vede pretul socotit din alegerile lui, cu ACELASI motor pe care il
 * ruleaza si serverul la plasarea comenzii. Adaugarea in cos vine odata cu identitatea de linie
 * si cu repretuirea pe server — pana atunci, butonul de cos NU promite nimic.
 *
 * ═══ ⚠ PRETUL DE PE ECRAN NU E O PROMISIUNE ═══
 *
 * E acelasi calcul, din acelasi fisier, deci va da acelasi numar. Dar autoritatea ramane a
 * serverului: browserul socoteste ca sa se vada, nu ca sa se incaseze.
 */

export function ConfiguratorSlot({
  configurator,
  pretProdus,
}: {
  configurator: ConfiguratorDeVitrina;
  /** Pretul produsului sau al variantei alese, in lei. */
  pretProdus: number;
}) {
  const { definitie, reguli, pretuire } = configurator.compilat;
  const [brute, setBrute] = useState<Record<string, unknown>>({});

  const valori: Valori = useMemo(() => normalizeazaValori(brute), [brute]);
  const stare = useMemo(() => aplicaRegulile(definitie, reguli, valori), [definitie, reguli, valori]);
  const pret = useMemo(
    () => calculeazaPretul({ definitie, pretuire, stare, pretProdus }),
    [definitie, pretuire, stare, pretProdus],
  );

  function pune(id: string, valoare: unknown) {
    setBrute((x) => (valoare === undefined ? fara(x, id) : { ...x, [id]: valoare }));
  }

  return (
    <section className="space-y-5" aria-label="Configureaza produsul">
      {definitie.pasi.map((pas) => {
        if (esteAscuns(definitie, stare, pas.id)) return null;
        const areCeva = pas.grupuri.some((g) =>
          !esteAscuns(definitie, stare, g.id)
          && g.noduri.some((n) => !esteAscuns(definitie, stare, n.id)));
        // ⚠ Un pas ramas fara nimic vizibil se sare, nu se deseneaza gol.
        if (!areCeva) return null;

        return (
          <div key={pas.id} className="space-y-4">
            {definitie.pasi.length > 1 && pas.eticheta && (
              <h3 className="text-sm font-semibold text-foreground">{pas.eticheta}</h3>
            )}
            {pas.grupuri.map((grup) => {
              if (esteAscuns(definitie, stare, grup.id)) return null;
              return (
                <div key={grup.id} className="space-y-3">
                  {grup.eticheta && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {grup.eticheta}
                    </p>
                  )}
                  {grup.noduri.map((nod) => {
                    if (esteAscuns(definitie, stare, nod.id)) return null;
                    return (
                      <Camp
                        key={nod.id}
                        nod={nod}
                        valori={valori}
                        cerut={esteCerut(definitie, nod, stare)}
                        dezactivat={stare.dezactivate.has(nod.id)}
                        optiuni={optiuniDeAles(nod, stare)}
                        limite={stare.limite.get(nod.id)}
                        onSchimba={(v) => pune(nod.id, v)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ⚠ Mesajele regulilor se arata cu rolul potrivit, ca cititoarele de ecran sa le anunte. */}
      {stare.mesaje.map((m, i) => (
        <p
          key={`${m.text}-${i}`}
          role={m.nivel === "eroare" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${
            m.nivel === "eroare" ? "bg-destructive/10 text-destructive"
              : m.nivel === "atentie" ? "bg-amber-50 text-amber-800"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {m.text}
        </p>
      ))}

      {stare.opriri.map((text, i) => (
        <p key={`${text}-${i}`} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {text}
        </p>
      ))}

      <Pret rezultat={pret} />
    </section>
  );
}

function fara(o: Record<string, unknown>, id: string): Record<string, unknown> {
  const copie = { ...o };
  delete copie[id];
  return copie;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL
   ═══════════════════════════════════════════════════════════════════════════ */

function Pret({ rezultat }: { rezultat: ReturnType<typeof calculeazaPretul> }) {
  /*
   * ⚠ CAND PRETUL NU SE POATE CALCULA, NU SE ARATA UN NUMAR.
   *
   * `round2` preface orice gunoi in zero, iar „0,00 lei" pe un fototapet arata ca o oferta. Se
   * spune pe fata ca inca nu se poate socoti, si abia dupa ce omul completeaza apare un pret.
   */
  if (!rezultat.ok) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground" role="status">
        Completeaza optiunile ca sa vezi pretul.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">Pretul configuratiei</p>
      <p className="text-xl font-bold text-foreground tabular-nums">
        {/*
          ⚠ Moneda NU se da de aici. Motorul lucreaza in numere fara unitate, iar `formatPrice`
          e SINGURUL loc din proiect care stie in ce se exprima — asa ramane un singur loc de
          schimbat daca magazinele vor vinde vreodata in alta moneda.
        */}
        {formatPrice(pretDeAfisat(rezultat.d))}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPURILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Camp({
  nod, valori, cerut, dezactivat, optiuni, limite, onSchimba,
}: {
  nod: Nod;
  valori: Valori;
  cerut: boolean;
  dezactivat: boolean;
  optiuni: string[];
  limite?: { min?: number; max?: number; pas?: number };
  onSchimba: (v: unknown) => void;
}) {
  const idCamp = `cfg-${nod.id}`;
  const eticheta = (
    <span className="mb-1.5 block text-sm font-medium text-foreground">
      {nod.eticheta}
      {cerut && <span className="ml-1 text-destructive" aria-hidden>*</span>}
      {cerut && <span className="sr-only"> (obligatoriu)</span>}
    </span>
  );

  const ajutor = nod.ajutor ? (
    <span id={`${idCamp}-ajutor`} className="mt-1 block text-xs text-muted-foreground">{nod.ajutor}</span>
  ) : null;
  const descrisDe = nod.ajutor ? `${idCamp}-ajutor` : undefined;

  switch (nod.fel) {
    case "text":
      return (
        <label htmlFor={idCamp} className="block">
          {eticheta}
          {nod.control === "lung" ? (
            <textarea
              id={idCamp} disabled={dezactivat} required={cerut}
              aria-describedby={descrisDe}
              maxLength={nod.maxCaractere}
              value={(valori[nod.id]?.f === "text" ? valori[nod.id].v : "") as string}
              onChange={(e) => onSchimba(e.target.value ? { f: "text", v: e.target.value } : undefined)}
              rows={nod.maxRanduri ?? 3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
          ) : (
            <input
              id={idCamp} type="text" disabled={dezactivat} required={cerut}
              aria-describedby={descrisDe}
              maxLength={nod.maxCaractere}
              placeholder={nod.substituent}
              value={(valori[nod.id]?.f === "text" ? valori[nod.id].v : "") as string}
              onChange={(e) => onSchimba(e.target.value ? { f: "text", v: e.target.value } : undefined)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
          )}
          {ajutor}
        </label>
      );

    case "numar":
      return (
        <CampNumar
          nod={nod} idCamp={idCamp} eticheta={eticheta} ajutor={ajutor} descrisDe={descrisDe}
          curent={valori[nod.id]?.f === "numar" ? (valori[nod.id].v as number) : undefined}
          cerut={cerut} dezactivat={dezactivat} limite={limite} onSchimba={onSchimba}
        />
      );

    case "alegere": {
      const alese = valori[nod.id]?.f === "alegere" ? (valori[nod.id].v as string) : "";
      const disponibile = (nod.optiuni ?? []).filter((o) => optiuni.includes(o.id));
      return (
        <fieldset disabled={dezactivat}>
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            {nod.eticheta}
            {cerut && <span className="ml-1 text-destructive" aria-hidden>*</span>}
            {cerut && <span className="sr-only"> (obligatoriu)</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {disponibile.map((o) => (
              <button
                key={o.id} type="button"
                onClick={() => onSchimba(alese === o.id ? undefined : { f: "alegere", v: o.id })}
                aria-pressed={alese === o.id}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  alese === o.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"
                }`}
              >
                {/*
                  ⚠ Culoarea NU e singurul semn. Un cerc colorat langa text, plus chenarul si
                  `aria-pressed` — cine nu deosebeste culorile trebuie sa poata alege la fel.
                */}
                {o.culoare && (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: o.culoare }}
                    aria-hidden
                  />
                )}
                {o.eticheta}
                {o.pret ? <span className="text-xs text-muted-foreground">+{o.pret}</span> : null}
              </button>
            ))}
          </div>
          {ajutor}
        </fieldset>
      );
    }

    case "alegeri": {
      const alese = valori[nod.id]?.f === "alegeri" ? (valori[nod.id].v as string[]) : [];
      const disponibile = (nod.optiuni ?? []).filter((o) => optiuni.includes(o.id));
      return (
        <fieldset disabled={dezactivat}>
          <legend className="mb-1.5 text-sm font-medium text-foreground">{nod.eticheta}</legend>
          <div className="space-y-1.5">
            {disponibile.map((o) => (
              <label key={o.id} className="flex min-h-11 items-center gap-2.5 text-sm">
                <input
                  type="checkbox" checked={alese.includes(o.id)}
                  onChange={(e) => {
                    const noi = e.target.checked ? [...alese, o.id] : alese.filter((x) => x !== o.id);
                    onSchimba(noi.length ? { f: "alegeri", v: noi } : undefined);
                  }}
                  className="h-4 w-4 rounded border-border"
                />
                <span>{o.eticheta}</span>
                {o.pret ? <span className="text-xs text-muted-foreground">+{o.pret}</span> : null}
              </label>
            ))}
          </div>
          {ajutor}
        </fieldset>
      );
    }

    case "comutator": {
      const pornit = valori[nod.id]?.f === "comutator";
      return (
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input
            type="checkbox" checked={pornit} disabled={dezactivat}
            aria-describedby={descrisDe}
            onChange={(e) => onSchimba(e.target.checked ? { f: "comutator", v: true } : undefined)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="font-medium text-foreground">{nod.eticheta}</span>
          {nod.pret ? <span className="text-xs text-muted-foreground">+{nod.pret}</span> : null}
          {ajutor}
        </label>
      );
    }

    case "afisaj":
      if (nod.control === "separator") return <hr className="border-border" />;
      if (nod.control === "titlu") return <h4 className="text-sm font-semibold text-foreground">{nod.eticheta}</h4>;
      return nod.continut ? <p className="text-sm text-muted-foreground">{nod.continut}</p> : null;

    /*
     * ⚠ Incarcarea de fisiere vine cu depozitul privat, in faza ei. Pana atunci NU se deseneaza
     * un camp care pare ca merge: un camp de incarcare care nu incarca nimic e mai rau decat
     * lipsa lui, fiindca cumparatorul crede ca a trimis poza.
     */
    case "fisiere":
    case "calcul":
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPUL DE NUMAR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un numar, cu unitatea lui.
 *
 * ⚠ Tot dus-intorsul dintre tastatura si motor sta in `@/lib/configurators/camp-numar`, cu
 * probele lui: aici raman doar randarea si starea. Componenta e `.tsx`, iar harnasamentul de
 * probe ruleaza TypeScript fara JSX — logica lasata inauntru ar fi ramas neverificata.
 *
 * ⚠ SI DE CE `type="text"`: cu `type="number"`, browserul intoarce sir GOL pentru starile
 * intermediare ale tastarii („1," pe drumul spre „1,5"), deci nici macar n-am sti ce a scris
 * omul. `inputMode="decimal"` pastreaza tastatura numerica pe telefon, deci nu se pierde nimic
 * din ce conta.
 */
function CampNumar({
  nod, idCamp, eticheta, ajutor, descrisDe, curent, cerut, dezactivat, limite, onSchimba,
}: {
  nod: NodNumar;
  idCamp: string;
  eticheta: React.ReactNode;
  ajutor: React.ReactNode;
  descrisDe: string | undefined;
  /** In unitatea de BAZA, asa cum o tine motorul. */
  curent: number | undefined;
  cerut: boolean;
  dezactivat: boolean;
  limite?: { min?: number; max?: number; pas?: number };
  onSchimba: (v: unknown) => void;
}) {
  const c = useMemo(() => conversia(nod.unitate), [nod.unitate]);
  const [text, setText] = useState(() => afisat(curent, c));

  const valoare = textulDeAratat(text, curent, c);
  const stricat = eStricat(valoare, c);

  const interval = descrieIntervalul(limite?.min ?? nod.min, limite?.max ?? nod.max, c, nod.unitate);
  const idInterval = interval ? `${idCamp}-interval` : undefined;
  const idStricat = stricat ? `${idCamp}-stricat` : undefined;
  const descrieri = [descrisDe, idInterval, idStricat].filter(Boolean).join(" ") || undefined;

  return (
    <label htmlFor={idCamp} className="block">
      {eticheta}
      <span className="flex items-center gap-2">
        <input
          id={idCamp}
          /*
           * ⚠ `text`, nu `number`: altfel starile intermediare ale tastarii ajung aici ca sir
           * gol si nu se mai poate scrie o zecimala. `inputMode` pastreaza tastatura numerica pe
           * telefon, deci nu se pierde nimic din ce conta.
           */
          type="text" inputMode="decimal" autoComplete="off"
          disabled={dezactivat} required={cerut}
          aria-describedby={descrieri}
          aria-invalid={stricat || undefined}
          value={valoare}
          onChange={(e) => {
            setText(e.target.value);
            const baza = dinText(e.target.value, c);
            onSchimba(baza === undefined ? undefined : { f: "numar", v: baza });
          }}
          className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
        {nod.unitate && <span className="shrink-0 text-sm text-muted-foreground">{nod.unitate}</span>}
      </span>
      {/*
        ⚠ Intervalul se SCRIE, fiindca `type="text"` nu mai are `min`/`max` native. Altfel
        cumparatorul afla ca a depasit abia din mesajul de eroare, dupa ce a completat tot.
      */}
      {interval && (
        <span id={idInterval} className="mt-1 block text-xs text-muted-foreground">{interval}</span>
      )}
      {stricat && (
        <span id={idStricat} role="alert" className="mt-1 block text-xs text-destructive">
          Scrie un numar, de pilda 120 sau 12,5.
        </span>
      )}
      {ajutor}
    </label>
  );
}
