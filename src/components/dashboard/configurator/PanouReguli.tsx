"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import type { Continut } from "@/lib/configurators/citeste";
import { areOptiuni, nodDupaId, type Definitie, type Optiune } from "@/lib/configurators/definitie";
import type { Regula } from "@/lib/configurators/reguli";
import {
  adaugaRegula, asezata, cuDeclansatorulPe, cuTintaPe, declansatoriiPosibili, descrieRegula,
  idNou, optiuniRamase, presetareaDin, presetareNoua, regulaDinPresetare,
  schimbaRegula, stergeRegula, tinteleDe, type FelPresetare, type Presetare,
} from "@/lib/configurators/editare";
import { INTRARE_MICA, IntrareNumar } from "./bucati";

/**
 * Fila „Reguli": „cand se intampla asta, fa asta".
 *
 * ═══ PRESETARI INTAI, DUPA TIPARUL DE LA LIVRARE ═══
 *
 * `ShippingRulesEditor` a asezat deja tiparul casei pentru reguli: cateva scenarii gata facute
 * care acopera ce cer magazinele adevarate, si abia dupa ele constructorul liber. Motivul e ca
 * un comerciant care deschide un builder cu saisprezece feluri de conditie si saisprezece de
 * actiune nu construieste nimic — inchide fila.
 *
 * Cele cinci de aici sunt exact cererile care vin: ascunde un camp cand altul are o valoare, fa
 * un camp obligatoriu, limiteaza un numar, scoate niste optiuni, opreste comanda cu un mesaj.
 * Fiecare e o Conditie si o Actiune ADEVARATE din `reguli.ts` — nu un fel nou de regula.
 *
 * ═══ ⚠ ORDINEA LOR N-ARE NICIUN INTELES, DECI NU EXISTA „MUTA MAI SUS" ═══
 *
 * Motorul le roteste pana la punct fix si departajeaza conflictele dupa „cea mai stransa
 * castiga". Niste sageti de reasezare ar fi promis o prioritate care nu exista.
 *
 * ═══ ⚠ CE NU SE RECUNOASTE SE ARATA, NU SE ASCUNDE ═══
 *
 * O regula scrisa de un sablon, sau de o versiune mai noua a panoului, poate avea o forma pe
 * care presetarile n-o cuprind. Ascunsa, comerciantul ar fi cautat de ce configuratorul face
 * ceva ce nu scrie nicaieri; desenata cu selectoarele presetarii, prima atingere i-ar fi
 * schimbat tacit intelesul. Deci se scrie in romana, si se poate doar stinge sau sterge.
 */

const PRESETARI: { fel: FelPresetare; eticheta: string; ajutor: string }[] = [
  { fel: "ascunde", eticheta: "Ascunde un camp", ajutor: "cand alt camp are o anumita valoare" },
  { fel: "obligatoriu", eticheta: "Cere completarea", ajutor: "fa un camp obligatoriu, conditionat" },
  { fel: "limiteaza", eticheta: "Limiteaza un numar", ajutor: "ingusteaza minimul si maximul" },
  { fel: "scoate_optiuni", eticheta: "Scoate optiuni", ajutor: "unele alegeri nu se mai pot face" },
  { fel: "opreste", eticheta: "Opreste comanda", ajutor: "cu motivul scris pe ecran" },
];

function numelePresetarii(fel: FelPresetare): string {
  return PRESETARI.find((x) => x.fel === fel)?.eticheta ?? "Regula";
}

export function PanouReguli({ continut, onSchimba }: {
  continut: Continut; onSchimba: (c: Continut) => void;
}) {
  const d = continut.definitie;
  const declansatori = declansatoriiPosibili(d);

  /**
   * ⚠ ORICE SCHIMBARE TRECE PRIN `asezata`, SI DE ACEEA EXISTA UN SINGUR DRUM.
   *
   * Altfel o schimbare de camp ar fi lasat in ciorna id-ul unei optiuni de pe alt camp: regula
   * ar fi ramas scrisa corect si nu s-ar fi aprins niciodata, iar la „scoate optiunile"
   * publicarea ar fi picat cu un mesaj despre o optiune pe care comerciantul n-a atins-o.
   */
  function pune(r: Regula, p: Presetare) {
    const bun = asezata(p, d) ?? p;
    onSchimba(schimbaRegula(continut, r.id, regulaDinPresetare(r.id, bun, r.activa)));
  }

  function adauga(fel: FelPresetare) {
    const p = presetareNoua(d, fel);
    if (!p) return;
    onSchimba(adaugaRegula(continut, regulaDinPresetare(idNou(), p)));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Reguli</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Configuratorul se schimba singur dupa ce alege cumparatorul. Regulile se aplica toate
          deodata, iar cand doua se bat cap in cap castiga cea mai stransa: ascunde bate arata,
          obligatoriu bate optional.
        </p>
      </div>

      {declansatori.length === 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Nicio regula nu are de la ce sa porneasca. Adauga intai in Structura un camp cu
            optiuni sau un Da / Nu: de la ele se aprind regulile.
          </span>
        </p>
      )}

      {continut.reguli.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Nicio regula. Alege mai jos un scenariu gata facut.
        </p>
      ) : (
        <ul className="space-y-3">
          {continut.reguli.map((r) => {
            const p = presetareaDin(r);
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {p ? numelePresetarii(p.fel) : "Regula avansata"}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox" checked={r.activa !== false}
                        onChange={(e) => onSchimba(schimbaRegula(continut, r.id, {
                          activa: e.target.checked ? undefined : false,
                        }))}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      Pornita
                    </label>
                    <button
                      type="button" onClick={() => onSchimba(stergeRegula(continut, r.id))}
                      aria-label={`Sterge regula ${p ? numelePresetarii(p.fel) : "avansata"}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </div>

                {p ? (
                  <EditorPresetare d={d} p={p} onSchimba={(urmator) => pune(r, urmator)} />
                ) : (
                  <p className="text-xs text-muted-foreground">{descrieRegula(d, r)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Scenariile gata facute ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {PRESETARI.map((x) => {
          const sePoate = presetareNoua(d, x.fel) !== null;
          return (
            <button
              key={x.fel} type="button" onClick={() => adauga(x.fel)} disabled={!sePoate}
              title={sePoate ? x.ajutor : "Configuratorul n-are inca ce campuri sa lege pentru asta"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> {x.eticheta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN RAND DE PRESETARE
   ═══════════════════════════════════════════════════════════════════════════ */

function EditorPresetare({ d, p, onSchimba }: {
  d: Definitie; p: Presetare; onSchimba: (p: Presetare) => void;
}) {
  const declansatori = declansatoriiPosibili(d);
  const cand = p.cand;
  const nodCand = nodDupaId(d, cand.nod);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Cand</span>
      <select
        value={cand.nod} className={INTRARE_MICA} aria-label="Campul care aprinde regula"
        onChange={(e) => onSchimba(cuDeclansatorulPe(p, d, e.target.value))}
      >
        {declansatori.map((n) => <option key={n.id} value={n.id}>{n.eticheta}</option>)}
      </select>

      {cand.fel === "pornit" ? (
        <span className="text-muted-foreground">e pornit</span>
      ) : (
        <>
          <span className="text-muted-foreground">este</span>
          <select
            value={cand.optiune} className={INTRARE_MICA} aria-label="Valoarea care aprinde regula"
            onChange={(e) => onSchimba({
              ...p, cand: { fel: "optiune", nod: cand.nod, optiune: e.target.value },
            })}
          >
            {optiunileDeAratat(nodCand, cand.optiune).map((o) => (
              <option key={o.id} value={o.id}>
                {o.eticheta}{o.activa === false ? " (scoasa din vanzare)" : ""}
              </option>
            ))}
          </select>
        </>
      )}

      {p.fel === "ascunde" && (
        <>
          <span className="text-muted-foreground">ascunde</span>
          <SelectTinta d={d} p={p} onSchimba={onSchimba} />
        </>
      )}

      {p.fel === "obligatoriu" && (
        <>
          <span className="text-muted-foreground">cere completarea lui</span>
          <SelectTinta d={d} p={p} onSchimba={onSchimba} />
        </>
      )}

      {p.fel === "limiteaza" && (
        <>
          <SelectTinta d={d} p={p} onSchimba={onSchimba} />
          <Limite d={d} p={p} onSchimba={onSchimba} />
        </>
      )}

      {p.fel === "scoate_optiuni" && (
        <>
          <span className="text-muted-foreground">scoate din</span>
          <SelectTinta d={d} p={p} onSchimba={onSchimba} />
          <OptiuniDeScos d={d} p={p} onSchimba={onSchimba} />
        </>
      )}

      {p.fel === "opreste" && (
        <>
          <span className="text-muted-foreground">opreste comanda cu mesajul</span>
          <TextComis
            valoare={p.text}
            eticheta="Motivul aratat cumparatorului"
            onComite={(t) => onSchimba({ ...p, text: t })}
          />
        </>
      )}
    </div>
  );
}

/**
 * Optiunile din care se alege declansatorul.
 *
 * ⚠ Cele stinse NU se ofera, dar cea aleasa deja se arata chiar stinsa fiind, cu semnul ei. Data
 * afara din lista, selectorul ar fi aratat prima optiune din lista in loc de cea scrisa in
 * regula, si prima atingere a oricarui alt camp ar fi mutat regula pe ea.
 */
function optiunileDeAratat(nod: ReturnType<typeof nodDupaId>, aleasa: string): Optiune[] {
  if (!nod || !areOptiuni(nod)) return [];
  const toate = nod.optiuni ?? [];
  const active = toate.filter((o) => o.activa !== false);
  const curenta = toate.find((o) => o.id === aleasa);
  return curenta && curenta.activa === false ? [curenta, ...active] : active;
}

function SelectTinta({ d, p, onSchimba }: {
  d: Definitie;
  p: Exclude<Presetare, { fel: "opreste" }>;
  onSchimba: (p: Presetare) => void;
}) {
  const tinte = tinteleDe(d, p.fel, p.cand.nod);
  return (
    <select
      value={p.tinta} className={INTRARE_MICA} aria-label="Campul asupra caruia lucreaza regula"
      onChange={(e) => onSchimba(cuTintaPe(p, d, e.target.value))}
    >
      {tinte.map((t) => <option key={t.id} value={t.id}>{t.eticheta}</option>)}
    </select>
  );
}

/**
 * Cele doua capete ale unei limitari.
 *
 * ⚠ SE CONVERTESC IN UNITATEA CAMPULUI, si asta o face `IntrareNumar`. Inauntru totul e in
 * unitatea de baza (`unitati.ts`), iar limita regulii se compara chiar cu valoarea campului.
 * Fara conversie, „cel mult 80” scris pe un camp in centimetri ar fi devenit 80 de
 * milimetri — o limita de zece ori mai stransa decat cea ceruta, si nimeni n-ar fi vazut de ce.
 *
 * ⚠ Conversia de aici era scrisa de mana si stia DOAR de LUNGIMI, deci pe un camp in
 * kilograme „cel mult 5” intra in motor ca 5 GRAME si regula taia tot. Nu se mai scrie
 * aici: `conversia` din `camp-numar` stie si masa, si e probata.
 */
function Limite({ d, p, onSchimba }: {
  d: Definitie;
  p: Extract<Presetare, { fel: "limiteaza" }>;
  onSchimba: (p: Presetare) => void;
}) {
  const nod = nodDupaId(d, p.tinta);
  const unitate = nod?.fel === "numar" ? nod.unitate : undefined;
  const peDos = p.min !== undefined && p.max !== undefined && p.min > p.max;

  return (
    <>
      <span className="text-muted-foreground">e cel putin</span>
      <IntrareNumar
        valoare={p.min}
        onSchimba={(n) => onSchimba({ ...p, min: n })}
        unitate={unitate}
        clase={`${INTRARE_MICA} w-24`}
        eticheta="Valoarea minima ceruta"
      />
      <span className="text-muted-foreground">si cel mult</span>
      <IntrareNumar
        valoare={p.max}
        onSchimba={(n) => onSchimba({ ...p, max: n })}
        unitate={unitate}
        clase={`${INTRARE_MICA} w-24`}
        eticheta="Valoarea maxima permisa"
      />
      {unitate && <span className="text-muted-foreground">{unitate}</span>}
      {peDos && (
        <span className="w-full text-[11px] text-destructive">
          Minimul e mai mare decat maximul: campul nu se mai poate completa deloc.
        </span>
      )}
    </>
  );
}

/**
 * Ce optiuni se scot.
 *
 * ⚠ DOUA CAPETE OPRITE, SI FIECARE DIN ALT MOTIV.
 *
 * Ultima bifa PUSA nu se poate scoate: fara nicio optiune, `citeste.ts` arunca actiunea si odata
 * cu ea regula intreaga, deci randul ar fi disparut singur de pe ecran la prima reincarcare, iar
 * comerciantul ar fi dat vina pe autosalvare.
 *
 * Ultima optiune RAMASA nu se poate bifa: scoase toate, campul se deseneaza gol pe magazin, iar
 * daca e si obligatoriu comanda nu mai trece niciodata. Publicarea NU prinde asta —
 * `validare.ts` numara optiunile active din definitie, nu ce lasa regulile in urma.
 */
function OptiuniDeScos({ d, p, onSchimba }: {
  d: Definitie;
  p: Extract<Presetare, { fel: "scoate_optiuni" }>;
  onSchimba: (p: Presetare) => void;
}) {
  const nod = nodDupaId(d, p.tinta);
  const optiuni = nod && areOptiuni(nod) ? nod.optiuni ?? [] : [];
  const alese = new Set(p.optiuni);

  return (
    <div className="mt-1 flex w-full flex-wrap gap-x-4 gap-y-1.5">
      {optiuni.map((o) => {
        const bifata = alese.has(o.id);
        const ultimaScoasa = bifata && alese.size === 1;
        const ultimaRamasa = !bifata && !!nod && optiuniRamase(nod, [...p.optiuni, o.id]).length === 0;
        const oprita = ultimaScoasa || ultimaRamasa;
        return (
          <label
            key={o.id}
            title={ultimaScoasa
              ? "Cel putin o optiune trebuie sa ramana scoasa, altfel regula nu mai are ce face"
              : ultimaRamasa
                ? "Scoase toate, campul ramane gol pe magazin si comanda nu mai trece"
                : undefined}
            className={`flex items-center gap-1.5 text-xs ${oprita ? "opacity-60" : "text-foreground"}`}
          >
            <input
              type="checkbox" checked={bifata} disabled={oprita}
              onChange={() => onSchimba({
                ...p,
                optiuni: bifata ? p.optiuni.filter((x) => x !== o.id) : [...p.optiuni, o.id],
              })}
              className="h-3.5 w-3.5 rounded border-border"
            />
            {o.eticheta}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Un camp de text care se scrie in ciorna la IESIREA din camp, nu la fiecare tasta.
 *
 * ⚠ Motivul e ca un mesaj GOL nu se poate salva: `citeste.ts` arunca actiunea fara text, si
 * odata cu ea regula intreaga, iar `asezata` pune inapoi textul standard. Comis la fiecare tasta,
 * omul care sterge tot ca sa rescrie ar fi vazut randul umplandu-se singur sub degete.
 *
 * ⚠ NECONTROLAT, cu `key`, nu cu stare si `useEffect`. O stare locala tinuta in pas cu ciorna
 * printr-un efect inseamna un setState in efect, adica o a doua randare la fiecare tasta — si
 * regula de proiect care o interzice exista tocmai fiindca asa se ajunge la campuri care sar.
 * Cheia schimbata remonteaza campul cand ciorna chiar aduce alt text.
 */
function TextComis({ valoare, eticheta, onComite }: {
  valoare: string; eticheta: string; onComite: (t: string) => void;
}) {
  return (
    <input
      key={valoare} type="text" defaultValue={valoare} aria-label={eticheta}
      onBlur={(e) => onComite(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`${INTRARE_MICA} min-w-0 flex-1`}
    />
  );
}
