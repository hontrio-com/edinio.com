"use client";

import { useMemo, useState } from "react";
import type { Definitie, Nod, NodFisiere, NodNumar } from "@/lib/configurators/definitie";
import {
  nodurileAsezateInPreviz, previzualizareaDeDesenat, type CeSeDeseneaza,
} from "@/lib/configurators/previzualizare";
import { cateFisiere, catePotOcupa, tipurilePermise } from "@/lib/configurators/fisiere";
import { esteAscuns, esteCerut, optiuniDeAles, type Stare } from "@/lib/configurators/reguli";
import { pretDeAfisat } from "@/lib/configurators/pret";
import type { Verdict } from "@/lib/configurators/raspuns";
import type { FisierAles, Valori } from "@/lib/configurators/valori";
import type { StareConfigurator } from "./useConfigurator";
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

export function ConfiguratorSlot({ cfg }: { cfg: StareConfigurator }) {
  const { configurator, verdict, pune } = cfg;
  if (!configurator || !verdict) return null;

  const { definitie } = configurator.compilat;
  const stare = verdict.stare;
  const valori = stare.valori;

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
                        unde={cfg.unde}
                        cerut={esteCerut(definitie, nod, stare)}
                        dezactivat={stare.dezactivate.has(nod.id)}
                        optiuni={optiuniDeAles(nod, stare)}
                        limite={stare.limite.get(nod.id)}
                        definitie={definitie}
                        stare={stare}
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

      {/*
        ⚠ MOTIVELE se arata TOATE, nu doar primul.
        Aratat unul singur, cumparatorul repara, apasa, si primeste al doilea — de trei ori la
        rand, fara sa afle vreodata cate mai sunt. Opririle scrise de comerciant vin tot de aici.
      */}
      {!verdict.ok && verdict.motive.length > 0 && (
        <ul className="space-y-1" role="alert">
          {verdict.motive.map((m, i) => (
            <li key={`${m.text}-${i}`} className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {m.text}
            </li>
          ))}
        </ul>
      )}

      <Pret verdict={verdict} />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL
   ═══════════════════════════════════════════════════════════════════════════ */

function Pret({ verdict }: { verdict: Verdict }) {
  /*
   * ⚠ CAND PRETUL NU SE POATE CALCULA, NU SE ARATA UN NUMAR.
   *
   * `round2` preface orice gunoi in zero, iar „0,00 lei" pe un fototapet arata ca o oferta. Se
   * spune pe fata ca inca nu se poate socoti, si abia dupa ce omul completeaza apare un pret.
   */
  if (!verdict.ok) {
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
        {formatPrice(pretDeAfisat(verdict.descompunere))}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPURILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Camp({
  nod, valori, cerut, dezactivat, optiuni, limite, onSchimba, unde, definitie, stare,
}: {
  nod: Nod;
  valori: Valori;
  definitie: Definitie;
  stare: Stare;
  /** Pe ce pagina stam. Trebuie doar incarcarii de fisiere; `null` in previzualizare. */
  unde: { businessId: string; productId: string } | null;
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
      if (nod.control === "previzualizare") {
        return <Previzualizarea nod={nod} definitie={definitie} stare={stare} />;
      }
      return nod.continut ? <p className="text-sm text-muted-foreground">{nod.continut}</p> : null;

    case "fisiere":
      return (
        <CampFisiere
          nod={nod} idCamp={idCamp} eticheta={eticheta} ajutor={ajutor} descrisDe={descrisDe}
          alese={valori[nod.id]?.f === "fisiere" ? (valori[nod.id].v as FisierAles[]) : []}
          dezactivat={dezactivat} unde={unde} onSchimba={onSchimba}
          asezat={nodurileAsezateInPreviz(definitie).has(nod.id)}
        />
      );

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

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPUL DE FISIERE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce incarca CUMPARATORUL: poza de gravat, macheta de tiparit, actul de atasat.
 *
 * ⚠ NU SE TINE FISIERUL IN STARE, CI ID-UL LUI. Octetii pleaca imediat catre server, care ii
 * verifica dupa continut, ii masoara si intoarce un id. In configuratie intra doar id-ul, si de
 * acolo in cos si in comanda. Tinuti in browser pana la finalizare, un cos cu trei poze de cate
 * zece megaocteti ar fi trebuit purtat prin `localStorage` — care se opreste la cateva megaocteti
 * si arunca fara sa spuna nimic, golind cosul intreg.
 *
 * ⚠ CE E DEZACTIVAT NU E ASCUNS. Un camp dezactivat de o regula isi arata mai departe fisierele
 * deja incarcate: altfel omul ar fi crezut ca le-a pierdut cand bifa alta optiune.
 *
 * ⚠ DECUPAREA (`FisierAles.t`) NU SE SCRIE INCA, si e o hotarare. O decupare inseamna asezarea
 * imaginii INTR-O zona de personalizare, iar zona aia se deseneaza de nodul de previzualizare, care
 * nu exista inca. Scrise oricum, in comanda ar fi ajuns patru numere pe care atelierul nu le poate
 * urma — o specificatie mai rea decat una fara ele, fiindca pare ca spune ceva.
 */
function CampFisiere({
  nod, idCamp, eticheta, ajutor, descrisDe, alese, dezactivat, unde, onSchimba, asezat,
}: {
  nod: NodFisiere;
  idCamp: string;
  eticheta: React.ReactNode;
  ajutor: React.ReactNode;
  descrisDe?: string;
  alese: readonly FisierAles[];
  dezactivat: boolean;
  unde: { businessId: string; productId: string } | null;
  onSchimba: (v: unknown) => void;
  /**
   * O previzualizare aseaza campul asta undeva pe produs?
   *
   * ⚠ DE ASTA ATARNA DECUPAREA, si nu de felul nodului. `FisierAles.t` inseamna asezarea
   * imaginii INTR-O zona; fara zona, cele patru numere n-au fata de ce sa fie socotite, iar in
   * comanda ar fi ajuns o instructiune pe care atelierul n-o poate urma. Uneltele se arata deci
   * exact cand exista o zona care le da inteles, si nu altfel.
   */
  asezat: boolean;
}) {
  const [urca, setUrca] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const cate = cateFisiere(nod);
  const permise = tipurilePermise(nod);
  const mai = cate - alese.length;

  async function primeste(lista: FileList | null) {
    if (!lista?.length || !unde) return;
    setProblema(null);
    setUrca(true);
    /*
     * ⚠ UNUL CATE UNUL, si nu toate deodata. Ruta are prag pe IP in doua straturi, iar zece
     * cereri pornite in aceeasi clipa l-ar fi lovit chiar ele — cumparatorul ar fi vazut
     * „prea multe incarcari" pentru propria lui prima incercare.
     */
    const noi: FisierAles[] = [];
    for (const f of Array.from(lista).slice(0, Math.max(0, mai))) {
      const corp = new FormData();
      corp.set("businessId", unde.businessId);
      corp.set("productId", unde.productId);
      corp.set("nodId", nod.id);
      corp.set("fisier", f);
      try {
        const r = await fetch("/api/configurator/fisier", { method: "POST", body: corp });
        const j = (await r.json()) as { id?: string; error?: string };
        if (!r.ok || !j.id) {
          /*
           * ⚠ Se arata MOTIVUL de la server, nu unul scris aici. Serverul stie ce anume n-a
           * mers — „e prea mare", „are 800 px si trebuie 2000" — iar un „incarcarea a esuat"
           * scris local l-ar fi lasat pe om sa incerce acelasi fisier la nesfarsit.
           */
          setProblema(j.error ?? "Incarcarea a esuat. Incearca din nou.");
          break;
        }
        noi.push({ id: j.id });
      } catch {
        setProblema("Incarcarea a esuat. Verifica legatura si incearca din nou.");
        break;
      }
    }
    setUrca(false);
    /*
     * ⚠ Ce a apucat sa urce SE PASTREAZA, chiar daca al doilea fisier a picat. Aruncate toate,
     * omul ar fi pierdut si incarcarea care mersese — si ar fi trebuit s-o refaca degeaba.
     */
    if (noi.length) {
      const toate = [...alese, ...noi];
      onSchimba({ f: "fisiere", v: toate });
    }
  }

  function scoate(id: string) {
    /*
     * ⚠ Se scoate din CONFIGURATIE, si nu se sterge din depozit. Randul ramane orfan si pleaca
     * la maturare peste o saptamana. Sters pe loc, un cumparator care se razgandeste inapoi —
     * sau care are doua file deschise pe acelasi cos — si-ar fi rupt singur cealalta comanda.
     */
    const ramase = alese.filter((f) => f.id !== id);
    onSchimba(ramase.length ? { f: "fisiere", v: ramase } : undefined);
  }

  return (
    <div>
      {eticheta}

      {alese.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {alese.map((f) => (
            <li key={f.id} className="relative">
              {nod.control === "document" ? (
                <a
                  href={`/api/configurator/fisier/${f.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-muted text-[11px] text-muted-foreground"
                >
                  Document
                </a>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/configurator/fisier/${f.id}`}
                  alt="Fisierul incarcat de tine"
                  className="h-20 w-20 rounded-lg border border-border object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => scoate(f.id)}
                aria-label="Scoate fisierul"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-xs leading-none text-muted-foreground shadow-sm hover:text-destructive"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        ⚠ ASEZAREA se arata DOAR pentru prima poza, si doar cand o previzualizare o aseaza
        undeva. Prima, fiindca o zona e UN loc si acolo se deseneaza primul fisier (vezi
        `ceDeseneaza`): unelte care schimba ceva ce nu se vede nicaieri sunt mai rele decat
        lipsa lor, fiindca omul crede ca a facut ceva.
      */}
      {asezat && alese.length > 0 && !dezactivat && (
        <Asezarea
          fisier={alese[0]}
          onSchimba={(t) => onSchimba({ f: "fisiere", v: [{ ...alese[0], t }, ...alese.slice(1)] })}
        />
      )}

      {mai > 0 && !dezactivat && unde && (
        <input
          id={idCamp}
          type="file"
          accept={permise.join(",")}
          multiple={cate > 1}
          disabled={urca}
          aria-describedby={descrisDe}
          onChange={(e) => {
            void primeste(e.target.files);
            /* Se goleste, ca sa se poata alege DIN NOU acelasi fisier dupa ce a fost scos. */
            e.target.value = "";
          }}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:text-foreground hover:file:bg-muted/70 disabled:opacity-50"
        />
      )}

      {/*
        ⚠ In previzualizarea din panou nu exista produs, deci nici incarcare. Se spune pe fata:
        un camp de incarcare care tace ar fi facut comerciantul sa creada ca e stricat.
      */}
      {!unde && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Aici cumparatorul isi incarca fisierul. In previzualizare nu se poate incarca.
        </p>
      )}

      {urca && <p className="mt-1 text-xs text-muted-foreground" role="status">Se incarca...</p>}

      {problema && (
        <p className="mt-1 text-xs text-destructive" role="alert">{problema}</p>
      )}

      {/*
        ⚠ CE SE CERE SE SPUNE INAINTE, nu dupa refuz. Cumparatorul care afla abia din eroare ca
        poza trebuie sa aiba 2000 px o incearca de trei ori pana intelege.
      */}
      <p className="mt-1 text-xs text-muted-foreground">
        {mai > 0
          ? `Poti incarca ${mai === 1 ? "un fisier" : `inca ${mai} fisiere`}`
          : "Ai incarcat tot ce se poate"}
        {`, cel mult ${Math.floor(catePotOcupa(nod) / (1024 * 1024))} MB`}
        {nod.minLatimePx || nod.minInaltimePx
          ? `, cel putin ${nod.minLatimePx ?? 0}x${nod.minInaltimePx ?? 0} px`
          : ""}
        .
      </p>

      {ajutor}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREVIZUALIZAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Gravura lui, pe cana lui.
 *
 * ⚠ CE HOTARASTE STA IN `previzualizare.ts`, CU PROBE. Aici raman doar `div`-urile: ce se
 * deseneaza, unde, si cu ce culoare e o hotarare care poate gresi tacut, iar o componenta `.tsx`
 * nu se poate rula in harnasament. Aceeasi impartire ca la campul de numar.
 *
 * ⚠ NU E O PROMISIUNE DE PRODUCTIE, e o asemanare: fontul de pe ecran nu e cel al gravorului,
 * iar culoarea unui ecran necalibrat nu e culoarea vopselei. Scopul ei e sa-l opreasca pe cumparator
 * sa comande „Familia Ionesku" — si de aceea nimic de aici nu intra in pret sau in comanda.
 */
function Previzualizarea({ nod, definitie, stare }: {
  nod: Nod & { fel: "afisaj" };
  definitie: Definitie;
  stare: Stare;
}) {
  const p = previzualizareaDeDesenat(definitie, nod, stare);
  if (!p) return null;

  return (
    <figure className="space-y-1.5">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
        {/*
          ⚠ `<img>`, nu `next/image`. Imaginea de fundal e aleasa de comerciant si poate fi orice
          adresa a lui; optimizatorul cere gazde scrise in configuratie, iar o gazda noua ar fi
          cazut cu 400 pe pagina de produs a magazinului lui.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imagine} alt={nod.eticheta || "Produsul configurat"} className="block w-full" />

        {p.zone.map((z) => (
          <div
            key={z.cheie}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${z.cutie.x * 100}%`,
              top: `${z.cutie.y * 100}%`,
              width: `${z.cutie.l * 100}%`,
              height: `${z.cutie.i * 100}%`,
              transform: z.cutie.rotire ? `rotate(${z.cutie.rotire}deg)` : undefined,
              /*
               * ⚠ ZONA E CONTAINERUL DE INTEROGARE, si de aceea marimea literei se scaleaza
               * odata cu poza. Ea are latime SI inaltime scrise mai sus, deci `container-type:
               * size` nu o prabuseste. Pus pe imaginea de deasupra, ar fi facut-o: inaltimea ei
               * vine chiar din continut, iar un container de marime taie legatura aia.
               */
              containerType: "size",
            }}
          >
            <ZonaDesenata ce={z.ce} />
          </div>
        ))}
      </div>
      <figcaption className="text-[11px] text-muted-foreground">
        {/*
          ⚠ SE SPUNE CA E O ASEMANARE, si nu ca o formalitate. Cumparatorul care crede ca vede
          bunul de tipar se cearta pe culoare cand primeste coletul, si are dreptate sa se certe
          daca nimeni nu i-a spus altceva.
        */}
        Asa arata aproximativ. Fontul si culorile de pe ecran pot fi putin diferite de produsul finit.
      </figcaption>
    </figure>
  );
}

function ZonaDesenata({ ce }: { ce: CeSeDeseneaza }) {
  switch (ce.fel) {
    case "text":
      return (
        <span
          className="flex h-full w-full items-center leading-tight"
          style={{
            color: ce.culoare,
            /*
              ⚠ Marimea e in `cqh`, nu in `px`: zona se scaleaza odata cu imaginea, iar o marime
              in pixeli ar fi facut gravura sa para uriasa pe telefon si minuscula pe ecran mare.
              Containerul de interogare e chiar zona, si `previzualizareaDeDesenat` a adus deja
              marimea din fractiuni de IMAGINE in fractiuni de ZONA — vezi nota de acolo.
            */
            fontSize: `${ce.marime * 100}cqh`,
            justifyContent: ce.aliniere === "stanga" ? "flex-start"
              : ce.aliniere === "dreapta" ? "flex-end" : "center",
            textAlign: ce.aliniere === "stanga" ? "left" : ce.aliniere === "dreapta" ? "right" : "center",
            overflowWrap: "anywhere",
          }}
        >
          {ce.text}
        </span>
      );

    case "fisier":
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img
          src={`/api/configurator/fisier/${ce.fisierId}`}
          alt=""
          className="h-full w-full object-contain"
          style={ce.asezare ? {
            transform: `translate(${ce.asezare.x * 100}%, ${ce.asezare.y * 100}%) scale(${ce.asezare.s}) rotate(${ce.asezare.r}deg)`,
          } : undefined}
        />
      );

    case "imagine":
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src={ce.imagine} alt="" className="h-full w-full object-cover" />;

    case "culoare":
      return <span className="block h-full w-full" style={{ backgroundColor: ce.culoare }} />;

    default:
      return null;
  }
}

/**
 * Cum sta poza in locul ei de pe produs.
 *
 * ⚠ SE ARATA DOAR CAND EXISTA UN LOC. Vezi `asezat` din `CampFisiere`: fara o zona de
 * previzualizare care asaza chiar campul asta, cele patru numere n-au fata de ce sa fie socotite.
 *
 * ⚠ TREI GLISOARE, NU O PANZA CU TRAS DE MAUS. Doua motive, si al doilea e cel greu: un tras
 * cu degetul pe telefon se bate cu derularea paginii, iar o panza n-are cum sa fie folosita de
 * cineva cu tastatura sau cu cititor de ecran. Glisoarele sunt controale native: se muta cu
 * sagetile, se anunta singure, si dau acelasi rezultat pe orice aparat.
 *
 * ⚠ Ce iese de aici intra in comanda. Deci se margineste: o scara de 40 sau o deplasare de
 * zece ecrane ar fi scos poza din zona cu totul, iar atelierul ar fi primit o instructiune care
 * spune „nicaieri".
 */
function Asezarea({ fisier, onSchimba }: {
  fisier: FisierAles;
  onSchimba: (t: { x: number; y: number; s: number; r: number } | undefined) => void;
}) {
  const t = fisier.t ?? { x: 0, y: 0, s: 1, r: 0 };
  const pune = (parte: Partial<typeof t>) => onSchimba({ ...t, ...parte });

  const glisor = (
    eticheta: string,
    cheie: "x" | "y" | "s" | "r",
    min: number, max: number, pas: number,
  ) => (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{eticheta}</span>
        <span className="tabular-nums">{t[cheie]}</span>
      </span>
      <input
        type="range"
        min={min} max={max} step={pas}
        value={t[cheie]}
        onChange={(e) => pune({ [cheie]: Number(e.target.value) })}
        className="w-full"
      />
    </label>
  );

  return (
    <div className="mb-2 space-y-1.5 rounded-lg border border-border/70 p-2.5">
      <p className="text-[11px] font-medium text-foreground">Aseaza poza pe produs</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {glisor("Stanga / dreapta", "x", -0.5, 0.5, 0.01)}
        {glisor("Sus / jos", "y", -0.5, 0.5, 0.01)}
        {glisor("Marime", "s", 0.2, 3, 0.05)}
        {glisor("Rotire", "r", -180, 180, 1)}
      </div>
      {/*
        ⚠ Se poate si RENUNTA. Fara butonul asta, omul care a tras de glisoare si nu-i mai place
        n-avea cum sa se intoarca la asezarea din start decat nimerind exact zerourile.
      */}
      <button
        type="button"
        onClick={() => onSchimba(undefined)}
        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Pune la loc cum era
      </button>
    </div>
  );
}
