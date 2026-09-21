"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { salveazaPiataPepita } from "@/lib/actions/pepita.actions";
import {
  ORDINEA_PIETELOR, PIETE,
  type PiataPepita, type SetariPiete, type StrategiePret,
} from "@/lib/pepita/types";
import { aceeasiMoneda, opreste, zecimale } from "@/lib/pepita/piete";
import { preturilePentruFeed } from "@/lib/pepita/pret";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TARILE CATRE CARE TRIMITE MAGAZINUL
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ FIECARE PIATA ISI ARATA PRETUL IESIT, pe un produs de o suta. Cifra aia e
  singurul lucru care il opreste pe om sa scrie cursul pe dos: „1 RON = 79 HUF"
  si „1 HUF = 79 RON" arata la fel intr-un camp gol, dar unul dintre ele face
  dintr-un produs de 500 de lei unul de sase forinti. Cu pretul scris alaturi,
  greseala se vede inainte sa plece feedul.

  ⚠ SI SPUNE APASAT CAND O PIATA NU TRIMITE. O piata bifata fara curs arata, la
  prima vedere, exact ca una care merge. In septembrie, trei magazine au servit
  un catalog gol cu bifa verde pe ecran, si n-a aflat nimeni pana n-a scris
  Pepita.
*/

/** TVA neutru: exemplul arata efectul CURSULUI, nu al regimului fiscal. */
const FARA_TVA = { vat_enabled: false, vat_rate: 0, prices_include_vat: true };

export function PietelePepita({
  businessId, piete, monedaMagazinului, piataDeBaza, strategie,
}: {
  businessId: string;
  piete: SetariPiete;
  monedaMagazinului: string;
  piataDeBaza: PiataPepita;
  strategie: StrategiePret;
}) {
  const [stare, setStare] = useState<SetariPiete>(piete);
  const [lucrez, setLucrez] = useState<PiataPepita | null>(null);
  const [, startSalvare] = useTransition();

  function salveaza(piata: PiataPepita, setari: { activa: boolean; curs: number | null }) {
    setStare((p) => ({ ...p, [piata]: setari }));
    setLucrez(piata);
    startSalvare(async () => {
      let r: Awaited<ReturnType<typeof salveazaPiataPepita>>;
      try {
        r = await salveazaPiataPepita(businessId, piata, setari);
      } catch {
        /*
          ⚠ Ecranul a aratat deja schimbarea, si NU o dam inapoi: ce s-a scris
          in baza nu stim. O lista care sare inapoi l-ar face pe om sa creada ca
          n-a salvat cand poate a salvat - si invers.
        */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă s-a salvat. "
          + "Reîncarcă pagina și uită-te la țara asta înainte să trimiți adresele la Pepita.",
          { duration: 12000 },
        );
        setLucrez(null);
        return;
      }
      setLucrez(null);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`${PIETE[piata].eticheta}: salvat.`);
    });
  }

  return (
    <div className="space-y-2">
      {ORDINEA_PIETELOR.map((piata) => {
        const p = PIETE[piata];
        const s = stare[piata];
        const activa = s?.activa === true;
        const cereCurs = !aceeasiMoneda(piata, monedaMagazinului);
        const stop = activa ? opreste(piata, s, monedaMagazinului) : null;

        return (
          <div
            key={piata}
            className={`rounded-xl border p-3 transition-colors ${
              activa && !stop ? "border-primary/40 bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={activa}
                  onChange={(e) => salveaza(piata, { activa: e.target.checked, curs: s?.curs ?? null })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium text-foreground">{p.eticheta}</span>
              </label>
              <span className="text-xs text-muted-foreground">{p.adresa} · {p.moneda}</span>
              {piata === piataDeBaza && (
                /*
                  ⚠ Se spune care piata are adresa FARA segment de tara: e cea pe
                  care comerciantul a trimis-o deja la Pepita, si ramane valabila.
                  Fara eticheta asta, ar fi crezut ca trebuie sa o retrimita.
                */
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  adresa trimisă deja
                </span>
              )}
              {lucrez === piata && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {activa && !stop && lucrez !== piata && <Check className="ml-auto h-4 w-4 text-success" />}
            </div>

            {activa && cereCurs && (
              <CampCurs
                piata={piata}
                moneda={monedaMagazinului}
                curs={s?.curs ?? null}
                strategie={strategie}
                onSalvat={(curs) => salveaza(piata, { activa: true, curs })}
              />
            )}

            {activa && !cereCurs && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Aceeași monedă ca magazinul tău ({p.moneda}): prețurile pleacă așa cum sunt, fără curs.
              </p>
            )}

            {stop && <p className="mt-2 text-[11px] text-destructive">{stop.text}</p>}
          </div>
        );
      })}
    </div>
  );
}

function CampCurs({
  piata, moneda, curs, strategie, onSalvat,
}: {
  piata: PiataPepita;
  moneda: string;
  curs: number | null;
  strategie: StrategiePret;
  onSalvat: (curs: number | null) => void;
}) {
  const [text, setText] = useState(curs == null ? "" : String(curs));
  const p = PIETE[piata];

  /* ⚠ Si cu virgula: la noi se scrie „4,25", nu „4.25". */
  const n = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(n) && n > 0;

  /*
    ⚠ EXEMPLUL SE SOCOTESTE CU ACEEASI FUNCTIE CA FEEDUL, nu cu o inmultire
    scrisa aici. Doua socoteli inseamna doua raspunsuri, si prima zi in care se
    despart e ziua in care omul vede un pret si Pepita primeste altul.
  */
  const exemplu = valid ? preturilePentruFeed(100, null, strategie, FARA_TVA, n).pret : null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">1 {moneda} =</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const nou = text.trim() === "" ? null : (valid ? n : null);
            if (nou !== curs) onSalvat(nou);
          }}
          inputMode="decimal"
          placeholder="curs"
          aria-label={`Curs către ${p.eticheta}`}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-xs text-muted-foreground">{p.moneda}</span>

        {exemplu != null && (
          /*
            ⚠ SE SPUNE CA ADAOSUL E INAUNTRU. Cu o strategie de „+5%", un produs
            de 100 lei la cursul 79,4 iese 8.337, nu 7.940 - si atunci omul se
            uita la cifra, o socoteste in cap si crede ca a gresit CURSUL.
            Tocmai cifra pusa sa prinda o greseala ar fi nascut alta.
          */
          <span className="text-[11px] text-muted-foreground">
            un produs de 100 {moneda} pleacă cu{" "}
            <span className="font-semibold text-foreground">
              {exemplu.toLocaleString("ro-RO", { maximumFractionDigits: zecimale(piata) })} {p.moneda}
            </span>
            {strategie.fel !== "identic" && strategie.valoare !== 0 && (
              <span>
                {" "}(cu adaosul tău de{" "}
                {strategie.fel === "procent" ? `${strategie.valoare}%` : `${strategie.valoare} ${moneda}`} inclus)
              </span>
            )}
          </span>
        )}
      </div>

      {text.trim() !== "" && !valid && (
        <p className="text-[11px] text-destructive">Cursul trebuie să fie un număr mai mare ca zero.</p>
      )}
    </div>
  );
}
