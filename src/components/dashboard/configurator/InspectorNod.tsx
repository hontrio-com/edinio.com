"use client";

import { useState } from "react";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Nod, Optiune } from "@/lib/configurators/definitie";
import {
  adaugaOptiune, comutaImplicitAlegeri, mutaOptiune, problemeleNodului,
  puneImplicitAlegere, schimbaOptiune, stergeOptiune,
} from "@/lib/configurators/editare";
import { esteCuloare } from "@/lib/configurators/validare";
import { Bifa, Camp, INTRARE, IntrareNumar, Probleme } from "./bucati";
import { pixeliCeruti, MAX_FISIERE_PE_NOD, MAX_OCTETI } from "@/lib/configurators/fisiere";

/**
 * Setarile optiunii alese.
 *
 * ⚠ SE ARATA DOAR CE ARE SENS PENTRU FELUL NODULUI. Un panou care le arata pe toate si le
 * dezactiveaza pe cele nepotrivite il pune pe comerciant sa citeasca de fiecare data o lista din
 * care jumatate nu-l priveste.
 *
 * ⚠ UNITATILE SE CONVERTESC LA GRANITA. Inauntru totul e in milimetri (vezi `unitati.ts`), dar
 * comerciantul scrie in unitatea pe care si-a ales-o. Conversia se face AICI, la citire si la
 * scriere, si niciodata in mijlocul unui calcul.
 */

export function InspectorNod({ nod, onSchimba }: { nod: Nod; onSchimba: (n: Nod) => void }) {
  const pune = (campuri: Partial<Nod>) => onSchimba({ ...nod, ...campuri } as Nod);

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Setarile optiunii</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{felOmenesc(nod)}</p>
      </div>

      <Camp eticheta="Nume">
        <input
          value={nod.eticheta}
          onChange={(e) => pune({ eticheta: e.target.value })}
          className={INTRARE}
        />
      </Camp>

      <Camp eticheta="Text de ajutor" ajutor="Se vede mic, sub camp.">
        <input
          value={nod.ajutor ?? ""}
          onChange={(e) => pune({ ajutor: e.target.value || undefined })}
          className={INTRARE}
        />
      </Camp>

      {nod.fel !== "afisaj" && nod.fel !== "calcul" && (
        <>
          <Bifa
            eticheta="Se completeaza obligatoriu"
            ajutor="Un camp ascuns de o regula nu blocheaza comanda, oricat ar fi de obligatoriu."
            pornit={nod.obligatoriu === true}
            onSchimba={(v) => pune({ obligatoriu: v || undefined })}
          />
          <Bifa
            eticheta="Se arata in rezumatul scurt"
            ajutor="In cos si la finalizare incap doar cateva randuri."
            pornit={nod.inRezumat === true}
            onSchimba={(v) => pune({ inRezumat: v || undefined })}
          />
        </>
      )}

      {nod.fel === "numar" && <SetariNumar nod={nod} onSchimba={onSchimba} />}
      {nod.fel === "text" && <SetariText nod={nod} onSchimba={onSchimba} />}
      {nod.fel === "fisiere" && <SetariFisiere nod={nod} onSchimba={onSchimba} />}
      {nod.fel === "comutator" && (
        <>
          <Camp eticheta="Cat adauga la pret cand e pornit" ajutor="In lei. Lasa gol daca nu schimba pretul.">
            <IntrareNumar
              valoare={nod.pret}
              onSchimba={(n) => onSchimba({ ...nod, pret: n })}
            />
          </Camp>
          <Bifa
            eticheta="Pornit din start"
            ajutor="Asa deschide cumparatorul pagina, si asa intra si in pretul afisat."
            pornit={nod.implicit === true}
            onSchimba={(v) => onSchimba({ ...nod, implicit: v || undefined })}
          />
        </>
      )}
      {(nod.fel === "alegere" || nod.fel === "alegeri") && (
        <SetariAlegeri nod={nod} onSchimba={onSchimba} />
      )}

      <Probleme probleme={problemeleNodului(nod)} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PE FELURI
   ═══════════════════════════════════════════════════════════════════════════ */

function SetariNumar({ nod, onSchimba }: { nod: Nod & { fel: "numar" }; onSchimba: (n: Nod) => void }) {
  return (
    <>
      <Camp eticheta="Unitate">
        <select
          value={nod.unitate ?? ""}
          onChange={(e) => onSchimba({ ...nod, unitate: (e.target.value || undefined) as never })}
          className={INTRARE}
        >
          <option value="">Fara unitate</option>
          <option value="mm">Milimetri</option>
          <option value="cm">Centimetri</option>
          <option value="m">Metri</option>
          <option value="buc">Bucati</option>
        </select>
      </Camp>

      <div className="grid grid-cols-3 gap-2">
        <Camp eticheta="Minim">
          <IntrareNumar
            valoare={nod.min}
            onSchimba={(n) => onSchimba({ ...nod, min: n })}
            unitate={nod.unitate}
            clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Maxim">
          <IntrareNumar
            valoare={nod.max}
            onSchimba={(n) => onSchimba({ ...nod, max: n })}
            unitate={nod.unitate}
            clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Pas">
          <IntrareNumar
            valoare={nod.pas}
            onSchimba={(n) => onSchimba({ ...nod, pas: n })}
            unitate={nod.unitate}
            clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
      </div>

      {/*
        ⚠ `zecimale` LIPSESTE DINADINS. Campul exista in model, dar nimic din vitrina nu-l
        citeste: `ConfiguratorSlot` deseneaza numarul fara el. Oferit aici, comerciantul l-ar fi
        pus, ar fi publicat, si n-ar fi vazut nicio schimbare — apoi ar fi cautat greseala la el.
      */}
      <Camp eticheta="Valoare de pornire">
        <IntrareNumar
          valoare={nod.implicit}
          onSchimba={(n) => onSchimba({ ...nod, implicit: n })}
          unitate={nod.unitate}
        />
      </Camp>
    </>
  );
}

/**
 * Ce se cere de la fisierul incarcat de cumparator.
 *
 * ⚠ NU EXISTA CAMP DE DPI, si lipsa lui e o hotarare. „DPI"-ul unui fisier e un numar pe care
 * fisierul il declara DESPRE SINE, si aproape toti mint: o poza de 4000 px facuta cu telefonul se
 * scrie 72 si e excelenta la tipar, iar una de 200×200 marita in Paint se poate scrie 300 si nu e
 * buna de nimic. Un refuz pe numarul ala ar fi respins tocmai fisierele bune.
 *
 * Ce voia sa spuna comerciantul prin „300 DPI" se scrie tot aici, dar in pixeli: ajutorul de mai
 * jos ii cere cei doi termeni pe care ii stie — de la cati centimetri se tipareste si la ce
 * densitate — si scrie el numarul in camp. Ce ramane in model e o cerinta care se poate si
 * masura, si onora.
 */
function SetariFisiere({ nod, onSchimba }: { nod: Nod & { fel: "fisiere" }; onSchimba: (n: Nod) => void }) {
  const [cm, setCm] = useState<number | undefined>(undefined);
  const [dpi, setDpi] = useState<number | undefined>(300);
  const sugerat = pixeliCeruti(cm ?? 0, dpi ?? 0);
  const eImagine = nod.control !== "document";

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Camp eticheta="Cate fisiere" ajutor={`Cel mult ${MAX_FISIERE_PE_NOD}.`}>
          <IntrareNumar
            valoare={nod.maxFisiere}
            onSchimba={(n) => onSchimba({ ...nod, maxFisiere: n })}
          />
        </Camp>
        <Camp eticheta="Cat poate avea unul (MB)" ajutor={`Cel mult ${Math.floor(MAX_OCTETI / (1024 * 1024))}.`}>
          <IntrareNumar
            valoare={nod.maxMb}
            onSchimba={(n) => onSchimba({ ...nod, maxMb: n })}
          />
        </Camp>
      </div>

      {eImagine && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Camp eticheta="Latime minima (px)">
              <IntrareNumar
                valoare={nod.minLatimePx}
                onSchimba={(n) => onSchimba({ ...nod, minLatimePx: n })}
              />
            </Camp>
            <Camp eticheta="Inaltime minima (px)">
              <IntrareNumar
                valoare={nod.minInaltimePx}
                onSchimba={(n) => onSchimba({ ...nod, minInaltimePx: n })}
              />
            </Camp>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-border/70 p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Cati pixeli imi trebuie?
            </legend>
            <p className="text-[11px] text-muted-foreground">
              Spune de la cati centimetri tiparesti si la ce densitate, si iti scriu numarul in camp.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Camp eticheta="Latimea tiparita (cm)">
                <IntrareNumar valoare={cm} onSchimba={setCm} />
              </Camp>
              <Camp eticheta="Densitatea (DPI)">
                <IntrareNumar valoare={dpi} onSchimba={setDpi} />
              </Camp>
            </div>
            <button
              type="button"
              disabled={sugerat === null}
              onClick={() => sugerat !== null && onSchimba({ ...nod, minLatimePx: sugerat })}
              className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
            >
              {sugerat === null
                ? "Completeaza amandoua"
                : `Pune ${sugerat} px ca latime minima`}
            </button>
          </fieldset>
        </>
      )}
    </>
  );
}

function SetariText({ nod, onSchimba }: { nod: Nod & { fel: "text" }; onSchimba: (n: Nod) => void }) {
  const pret = nod.pret ?? {};
  const punePret = (campuri: Partial<NonNullable<typeof nod.pret>>) => {
    const urmator = { ...pret, ...campuri };
    const gol = Object.values(urmator).every((v) => v === undefined);
    onSchimba({ ...nod, pret: gol ? undefined : urmator });
  };
  return (
    <>
      {/*
        ⚠ Textul sters se arata DOAR la textul scurt, fiindca doar acolo ajunge: caseta lunga
        din `ConfiguratorSlot` primeste `rows`, nu `placeholder`. Oferit si la ea, comerciantul
        l-ar fi scris si nu l-ar fi vazut niciodata pe magazin.
      */}
      {nod.control === "scurt" && (
        <Camp eticheta="Text sters din camp" ajutor="Se vede pana scrie cumparatorul. Nu e o valoare.">
          <input
            value={nod.substituent ?? ""}
            onChange={(e) => onSchimba({ ...nod, substituent: e.target.value || undefined })}
            className={INTRARE}
          />
        </Camp>
      )}

      <Camp eticheta="Text de pornire" ajutor="Chiar intra in comanda, si se plateste ca orice text scris.">
        <input
          value={nod.implicit ?? ""}
          onChange={(e) => onSchimba({ ...nod, implicit: e.target.value || undefined })}
          className={INTRARE}
        />
      </Camp>

      {nod.control === "lung" && (
        <Camp eticheta="Cate randuri are caseta">
          <IntrareNumar
            valoare={nod.maxRanduri}
            onSchimba={(n) => onSchimba({ ...nod, maxRanduri: n })}
          />
        </Camp>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Camp eticheta="Minim caractere">
          <IntrareNumar
            valoare={nod.minCaractere}
            onSchimba={(n) => onSchimba({ ...nod, minCaractere: n })}
            clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Maxim caractere">
          <IntrareNumar
            valoare={nod.maxCaractere}
            onSchimba={(n) => onSchimba({ ...nod, maxCaractere: n })}
            clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
      </div>

      <fieldset className="space-y-2 rounded-lg border border-border/70 p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Pretul textului</legend>
        <div className="grid grid-cols-3 gap-2">
          <Camp eticheta="Fix">
            <IntrareNumar
              valoare={pret.fix}
              onSchimba={(n) => punePret({ fix: n })}
              clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
          <Camp eticheta="Pe caracter">
            <IntrareNumar
              valoare={pret.peCaracter}
              onSchimba={(n) => punePret({ peCaracter: n })}
              clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
          <Camp eticheta="Incluse">
            <IntrareNumar
              valoare={pret.caractereIncluse}
              onSchimba={(n) => punePret({ caractereIncluse: n })}
              clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
        </div>
      </fieldset>
    </>
  );
}

/**
 * Optiunile unei alegeri, cu tot ce poarta fiecare.
 *
 * ⚠ SE ARATA DOAR CAMPURILE PE CARE VITRINA CHIAR LE DESENEAZA. `descriere` si `cautare` exista
 * in model si sunt pastrate de compilare, dar `ConfiguratorSlot` nu le citeste: puse aici,
 * comerciantul le-ar fi scris, ar fi publicat, si n-ar fi vazut nicio schimbare pe magazin.
 * Culoarea SE arata, fiindca pastilele chiar o folosesc.
 */
function SetariAlegeri({ nod, onSchimba }: { nod: Nod & { fel: "alegere" | "alegeri" }; onSchimba: (n: Nod) => void }) {
  const optiuni = nod.optiuni ?? [];
  const ePastila = nod.fel === "alegere" && nod.control === "culori";
  const schimbaOptiunea = (id: string, campuri: Partial<Optiune>) =>
    onSchimba(schimbaOptiune(nod, id, campuri));

  const ePornire = (o: Optiune) =>
    nod.fel === "alegere" ? nod.implicit === o.id : (nod.implicit ?? []).includes(o.id);
  const comutaPornirea = (o: Optiune) => onSchimba(
    nod.fel === "alegere"
      ? puneImplicitAlegere(nod, ePornire(o) ? undefined : o.id)
      : comutaImplicitAlegeri(nod, o.id),
  );

  return (
    <>
      {nod.fel === "alegeri" && (
        <div className="grid grid-cols-2 gap-2">
          <Camp eticheta="Cel putin cate" ajutor="Sub atat, comanda nu trece.">
            <IntrareNumar
              valoare={nod.minAlese}
              onSchimba={(n) => onSchimba({ ...nod, minAlese: n })}
              clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
          <Camp eticheta="Cel mult cate">
            <IntrareNumar
              valoare={nod.maxAlese}
              onSchimba={(n) => onSchimba({ ...nod, maxAlese: n })}
              clase="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Optiuni de ales</legend>
        <ul className="space-y-2">
          {optiuni.map((o, i) => (
            <li key={o.id} className="space-y-1.5 rounded-lg border border-border/70 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={o.eticheta}
                  onChange={(e) => schimbaOptiunea(o.id, { eticheta: e.target.value })}
                  aria-label={`Numele optiunii ${i + 1}`}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
                <IntrareNumar
                  valoare={o.pret}
                  onSchimba={(n) => schimbaOptiunea(o.id, { pret: n })}
                  clase="h-9 w-20 shrink-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                  eticheta={`Cat adauga la pret optiunea ${o.eticheta}`}
                  placeholder="lei"
                />
                <span className="inline-flex shrink-0">
                  <button
                    type="button" disabled={i === 0}
                    onClick={() => onSchimba(mutaOptiune(nod, o.id, -1))}
                    aria-label={`Muta optiunea ${o.eticheta} mai sus`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button" disabled={i === optiuni.length - 1}
                    onClick={() => onSchimba(mutaOptiune(nod, o.id, 1))}
                    aria-label={`Muta optiunea ${o.eticheta} mai jos`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSchimba(stergeOptiune(nod, o.id))}
                    aria-label={`Sterge optiunea ${o.eticheta}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {ePastila && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {/*
                      ⚠ Se arata si o pastila alaturi, nu doar sirul. Browserul inghite in tacere o
                      culoare pe care n-o intelege, iar comerciantul ar fi vazut lista lui de
                      esantioane iesind alba pe magazin fara sa afle de ce.
                    */}
                    <span
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-full border border-border"
                      style={esteCuloare(o.culoare) ? { backgroundColor: o.culoare } : undefined}
                    />
                    <input
                      value={o.culoare ?? ""} placeholder="#8a5a2b"
                      onChange={(e) => schimbaOptiunea(o.id, { culoare: e.target.value || undefined })}
                      aria-label={`Culoarea optiunii ${o.eticheta}`}
                      className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    />
                  </label>
                )}

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Grame
                  <IntrareNumar
                    valoare={o.grame}
                    onSchimba={(n) => schimbaOptiunea(o.id, { grame: n })}
                    clase="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    eticheta={`Cat adauga la greutate optiunea ${o.eticheta}`}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {/*
                  ⚠ Optiunea de pornire nu se poate pune pe una stinsa: `validare.ts` o sare in
                  tacere, deci pagina s-ar fi deschis cu campul gol in timp ce panoul arata ca
                  bifa e pusa. De aceea bifa e chiar oprita cand optiunea e scoasa din vanzare.
                */}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" checked={ePornire(o)} disabled={o.activa === false}
                    onChange={() => comutaPornirea(o)}
                    className="h-3.5 w-3.5 rounded border-border disabled:opacity-40"
                  />
                  Aleasa din start
                </label>

                {/*
                  ⚠ Optiunea stinsa se PASTREAZA, nu se sterge: comenzile vechi trimit la id-ul ei,
                  si o regula n-o poate reaprinde. Vezi `optiuniDeAles`.
                */}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" checked={o.activa === false}
                    onChange={(e) => schimbaOptiunea(o.id, { activa: e.target.checked ? false : undefined })}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Scoasa din vanzare
                </label>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button" onClick={() => onSchimba(adaugaOptiune(nod))}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Adauga optiune
        </button>
      </fieldset>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUCATI MICI
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * ⚠ `Camp`, `Bifa` si citirea numerelor scrise de om NU mai stau aici: sunt in `./bucati` si in
 * `editare.ts`, fiindca le folosesc si filele de reguli si de pret. Trei copii ale aceleiasi
 * etichete de camp ar fi insemnat ca a treia arata altfel dupa prima retusare.
 */

function felOmenesc(nod: Nod): string {
  switch (nod.fel) {
    case "text": return nod.control === "lung" ? "Text lung" : "Text scurt";
    case "numar": return nod.control === "glisor" ? "Glisor" : "Numar";
    case "alegere": return "O singura alegere";
    case "alegeri": return "Alegeri multiple";
    case "comutator": return "Da / Nu";
    case "fisiere": return nod.control === "document" ? "Incarcare fisier" : "Incarcare imagine";
    case "calcul": return "Calcul";
    case "afisaj": return "Afisaj";
    default: return "Optiune";
  }
}
