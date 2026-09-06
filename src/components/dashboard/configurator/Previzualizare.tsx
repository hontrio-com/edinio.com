"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { compileaza } from "@/lib/configurators/compileaza";
import { valideaza, type Constatare } from "@/lib/configurators/validare";
import { pretDeAfisat } from "@/lib/configurators/pret";
import { caUnRand, rezumatConfiguratiei } from "@/lib/configurators/rezumat";
import { formatPrice } from "@/lib/utils/format";
import type { Continut } from "@/lib/configurators/citeste";
import { ConfiguratorSlot } from "@/components/storefront/sections/product/_shared/ConfiguratorSlot";
import { useConfigurator } from "@/components/storefront/sections/product/_shared/useConfigurator";

/**
 * Ce va vedea cumparatorul, aici, inainte de publicare.
 *
 * ═══ ⚠ DE CE E CHIAR COMPONENTA VITRINEI, NU UNA SCRISA PENTRU PANOU ═══
 *
 * O previzualizare desenata separat ar fi aratat ce CREDE panoul ca face configuratorul, nu ce
 * face. La prima schimbare in slot, comerciantul ar fi verificat pe un ecran si ar fi vandut pe
 * altul — iar diferenta s-ar fi vazut abia intr-o reclamatie de client, care e ultimul loc in
 * care vrei sa afli.
 *
 * Se compileaza CIORNA cu acelasi `compileaza` care pregateste versiunea publicata, si se da
 * aceluiasi carlig si aceluiasi slot. Deci ce se vede aici e, litera cu litera, ce se va servi.
 *
 * ═══ ⚠ SI DE CE STA LANGA CONSTATARI ═══
 *
 * Pana acum validarea se vedea numai dupa ce comerciantul apasa „Publica" si primea un refuz.
 * Aici se ruleaza la fiecare schimbare, deci greseala se vede in clipa in care se face — si tot
 * aici se vede ce va face ea pe ecranul cumparatorului.
 */

/** Pretul produsului pe care sta configuratorul, in previzualizare. */
const PRET_DEMO = 100;

export function Previzualizare({ continut, piese }: {
  continut: Continut;
  /**
   * Piesele magazinului, cu preturile lor.
   *
   * ⚠ FARA ELE, PREVIZUALIZAREA ARATA ALT PRET DECAT VANZAREA. `compileaza` pune `pretBucata`
   * pe o optiune doar cand harta i-l da; publicarea i-l da (il citeste de pe server, din
   * `configurator_componente`), iar aici nu i-l dadea nimeni. Deci o usa care consuma patru
   * balamale de 9 lei se arata cu 36 de lei mai IEFTINA decat se vinde — si comerciantul
   * verifica pe ecranul acela inainte sa publice.
   *
   * Fisierul asta exista tocmai ca previzualizarea sa fie CHIAR vitrina, si divergenta era
   * ultima ramasa.
   */
  piese: { id: string; nume: string; pretBucata: number }[];
}) {
  const [pretProdus, setPretProdus] = useState(PRET_DEMO);

  /*
   * ⚠ `produsId` ramane gol dinadins: din panou nu se scade niciun stoc, si nici n-am de unde
   * sti aici din ce produs iese piesa. Ce conteaza pentru previzualizare e PRETUL, iar el se
   * socoteste la fel ca la vanzare.
   */
  const harta = useMemo(
    () => new Map(piese.map((x) => [x.id, { produsId: null, pretBucata: x.pretBucata, nume: x.nume }])),
    [piese],
  );

  const compilat = useMemo(
    () => compileaza(continut.definitie, continut.reguli, continut.pretuire, harta),
    [continut, harta],
  );

  const constatari = useMemo(
    () => valideaza({
      definitie: continut.definitie,
      reguli: continut.reguli,
      pretuire: continut.pretuire,
      pretProdus,
    }),
    [continut, pretProdus],
  );

  /*
   * ⚠ Configuratorul prefacut are id-uri goale dinadins. Nimic din slot nu le citeste, iar niste
   * id-uri inventate care seamana a reale s-ar fi putut strecura intr-o cerere adevarata daca
   * cineva ar copia bucata asta.
   */
  const cfg = useConfigurator(
    { configuratorId: "", versiuneId: "", numarVersiune: 0, compilat },
    pretProdus,
  );

  const rezumat = useMemo(
    () => (cfg.valori ? rezumatConfiguratiei(compilat, cfg.valori) : []),
    [compilat, cfg.valori],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 lg:flex-row lg:items-start">
      {/* ── Ce vede cumparatorul ───────────────────────────────────────── */}
      <section className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4" aria-label="Previzualizare">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Ce vede cumparatorul</h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Pretul produsului
            <input
              type="text" inputMode="decimal" value={pretProdus}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (Number.isFinite(n) && n >= 0) setPretProdus(n);
              }}
              aria-label="Pretul produsului folosit in previzualizare"
              className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        {continut.definitie.pasi.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            Nu e nimic de aratat inca. Adauga un pas si o optiune in fila Structura.
          </p>
        ) : (
          <ConfiguratorSlot cfg={cfg} />
        )}
      </section>

      {/* ── Ce va scrie pe comanda, si ce nu e in regula ────────────────── */}
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Cum arata pe comanda</h2>
          {/*
            ⚠ Se arata si asta, fiindca e a doua fata a aceluiasi lucru. Comerciantul poate
            construi un configurator care se completeaza frumos si care produce o comanda din care
            atelierul nu intelege nimic — un camp numit „Optiunea 1" cu valoarea „a".
          */}
          {cfg.verdict?.ok ? (
            <>
              <p className="mt-2 text-sm text-foreground">{caUnRand(rezumat) || "Nicio alegere."}</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-foreground">
                {formatPrice(pretDeAfisat(cfg.verdict.descompunere))}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Completeaza optiunile din stanga ca sa vezi ce ajunge pe comanda.
            </p>
          )}
        </div>

        <ListaVie constatari={constatari.constatari} sePoatePublica={constatari.sePoatePublica} />
      </aside>
    </div>
  );
}

/**
 * Constatarile, la fiecare schimbare.
 *
 * ⚠ Pana acum se vedeau numai dupa ce comerciantul apasa „Publica" si primea un refuz. Cine
 * construieste zece minute si abia apoi afla ca nu se poate publica reface pe dibuite; cine vede
 * problema in clipa in care o face, o repara pe loc.
 */
function ListaVie({ constatari, sePoatePublica }: { constatari: Constatare[]; sePoatePublica: boolean }) {
  const critice = constatari.filter((c) => c.treapta === "critic");
  const atentii = constatari.filter((c) => c.treapta !== "critic");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Verificare</h2>

      {constatari.length === 0 ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-emerald-700">
          {/* ⚠ Culoarea nu e singurul semn: e si o pictograma, si textul spune ce inseamna. */}
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Se poate publica.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {critice.map((c, i) => (
            <li key={`c-${c.cod}-${i}`} className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{c.mesaj}</span>
            </li>
          ))}
          {atentii.map((c, i) => (
            <li key={`a-${c.cod}-${i}`} className="flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{c.mesaj}</span>
            </li>
          ))}
        </ul>
      )}

      {!sePoatePublica && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="status">
          Cat timp sunt probleme critice, publicarea va fi refuzata.
        </p>
      )}
    </div>
  );
}
