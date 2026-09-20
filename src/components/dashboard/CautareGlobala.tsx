"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Search, ShoppingCart, User, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { cautaInPanou, type RezultateCautare } from "@/lib/actions/cautare-globala.actions";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CAUTAREA DIN BARA DE SUS
  ═══════════════════════════════════════════════════════════════════════════

  Campul promitea „produse, comenzi" si, la Enter, ducea omul la lista de
  produse filtrata. Comenzile si clientii nu se cautau deloc.

  Acum: se scrie, si rezultatele apar SUB camp, grupate pe produse, comenzi si
  clienti. Nu mai exista drum catre alta pagina doar ca sa vezi ce ai gasit;
  Enter deschide rezultatul ales.

  ⚠ CEREREA PLEACA DUPA O PAUZA DE SCRIS (250 ms) si numai de la doua litere.
  Fara pauza, fiecare tasta ar fi fost o cerere catre baza, adica zece cereri
  pentru „portofel"; iar de la o litera, orice magazin isi intoarce tot
  catalogul si asteptarea e degeaba.

  ⚠ RASPUNSUL INTARZIAT NU SE ASAZA PESTE UNUL MAI NOU: fiecare cerere isi are
  numarul ei. Scris repede, raspunsul pentru „po" putea ajunge dupa cel pentru
  „portofel" si ar fi inlocuit rezultatele bune cu unele vechi.
*/

type Rand =
  | { fel: "produs"; id: string; titlu: string; detaliu: string; href: string }
  | { fel: "comanda"; id: string; titlu: string; detaliu: string; href: string; status: string }
  | { fel: "client"; id: string; titlu: string; detaliu: string; href: string };

const GOL: RezultateCautare = { produse: [], comenzi: [], clienti: [] };

export function CautareGlobala({ businessId }: { businessId: string | null }) {
  const router = useRouter();
  const [termen, setTermen] = useState("");
  /*
    ⚠ REZULTATELE ISI POARTA TERMENUL cu ele.

    Asa, „se cauta" si „ce vezi e invechit" se DEDUC („termenul primit nu mai e
    cel scris"), in loc sa fie inca doua stari puse cu mana dintr-un efect -
    ceea ce ar fi insemnat randari in cascada si o regula de lint incalcata.
  */
  const [rezultate, setRezultate] = useState<{ termen: string; date: RezultateCautare }>({ termen: "", date: GOL });
  const [deschis, setDeschis] = useState(false);
  const [indexActiv, setIndexActiv] = useState(0);

  const cutie = useRef<HTMLDivElement>(null);
  const ultimaCerere = useRef(0);

  const termenCurat = termen.trim();

  useEffect(() => {
    if (!businessId || termenCurat.length < 2) return;

    const alMeu = ++ultimaCerere.current;
    const ceas = setTimeout(async () => {
      const raspuns = await cautaInPanou(businessId, termenCurat).catch(() => GOL);
      if (alMeu !== ultimaCerere.current) return;  // a plecat deja o cerere mai noua
      setRezultate({ termen: termenCurat, date: raspuns });
      setIndexActiv(0);
    }, 250);

    return () => clearTimeout(ceas);
  }, [termenCurat, businessId]);

  /* Inchiderea la clic in afara: panoul acopera continutul, deci trebuie sa
     plece la prima atingere in alta parte. */
  useEffect(() => {
    function inAfara(e: MouseEvent) {
      if (cutie.current && !cutie.current.contains(e.target as Node)) setDeschis(false);
    }
    document.addEventListener("mousedown", inAfara);
    return () => document.removeEventListener("mousedown", inAfara);
  }, []);

  /* Ce s-a primit chiar pentru ce scrie acum; altfel, lista de dinainte. */
  const proaspete = rezultate.termen === termenCurat ? rezultate.date : GOL;
  const seCauta = termenCurat.length >= 2 && rezultate.termen !== termenCurat;

  const randuri = useMemo<Rand[]>(() => {
    const r: Rand[] = [];
    for (const p of proaspete.produse) {
      r.push({
        fel: "produs",
        id: p.id,
        titlu: p.nume,
        detaliu: [p.sku ? `SKU ${p.sku}` : null, formatPrice(p.pret)].filter(Boolean).join(" · "),
        href: `/dashboard/products/${p.id}/edit`,
      });
    }
    for (const o of proaspete.comenzi) {
      r.push({
        fel: "comanda",
        id: o.id,
        titlu: `${o.numar} - ${o.client}`,
        detaliu: formatPrice(o.total),
        href: `/dashboard/orders/${o.id}`,
        status: o.status,
      });
    }
    for (const c of proaspete.clienti) {
      r.push({
        fel: "client",
        id: c.id,
        titlu: c.nume || c.email || c.telefon || "Client",
        detaliu: [c.email, c.telefon].filter(Boolean).join(" · "),
        /* Fisa clientului se deschide din lista, cu cautarea deja scrisa. */
        href: `/dashboard/customers?q=${encodeURIComponent(c.email || c.nume || c.telefon || "")}`,
      });
    }
    return r;
  }, [proaspete]);

  function mergiLa(rand: Rand | undefined) {
    if (!rand) return;
    setDeschis(false);
    setTermen("");
    router.push(rand.href);
  }

  function laTasta(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setDeschis(false); return; }
    if (!deschis || randuri.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIndexActiv((i) => (i + 1) % randuri.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndexActiv((i) => (i - 1 + randuri.length) % randuri.length); }
    if (e.key === "Enter") { e.preventDefault(); mergiLa(randuri[indexActiv]); }
  }

  const arataPanoul = deschis && termenCurat.length >= 2;
  const grupuri: { titlu: string; fel: Rand["fel"] }[] = [
    { titlu: "Produse", fel: "produs" },
    { titlu: "Comenzi", fel: "comanda" },
    { titlu: "Clienti", fel: "client" },
  ];

  return (
    <div ref={cutie} className="relative flex max-w-sm flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={termen}
        onChange={(e) => { setTermen(e.target.value); setDeschis(true); }}
        onFocus={() => setDeschis(true)}
        onKeyDown={laTasta}
        placeholder="Cauta produse, comenzi, clienti..."
        aria-label="Cauta in panou"
        className="w-full rounded-lg border border-border bg-muted/40 py-2 pr-8 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none"
      />
      {termen && (
        <button
          type="button"
          onClick={() => { setTermen(""); setDeschis(false); }}
          aria-label="Goleste cautarea"
          className="absolute top-1/2 right-2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {arataPanoul && (
        <div className="absolute top-full left-0 z-50 mt-2 max-h-[70vh] w-full min-w-[20rem] overflow-y-auto rounded-xl bg-popover shadow-xl ring-1 ring-foreground/10">
          {seCauta && randuri.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Se cauta...
            </p>
          )}

          {!seCauta && randuri.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nimic pentru „{termenCurat}”. Cauta dupa nume de produs, SKU, numar de comanda,
              nume de client, email sau telefon.
            </p>
          )}

          {grupuri.map((g) => {
            const aleGrupului = randuri.filter((r) => r.fel === g.fel);
            if (aleGrupului.length === 0) return null;
            return (
              <div key={g.fel} className="border-b border-border last:border-0">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {g.titlu}
                </p>
                {aleGrupului.map((r) => {
                  const index = randuri.indexOf(r);
                  const activ = index === indexActiv;
                  return (
                    <button
                      key={`${r.fel}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setIndexActiv(index)}
                      onClick={() => mergiLa(r)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        activ ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        {r.fel === "produs" && <Package className="h-3.5 w-3.5" />}
                        {r.fel === "comanda" && <ShoppingCart className="h-3.5 w-3.5" />}
                        {r.fel === "client" && <User className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{r.titlu}</span>
                        {r.detaliu && (
                          <span className="block truncate text-xs text-muted-foreground">{r.detaliu}</span>
                        )}
                      </span>
                      {r.fel === "comanda" && (
                        <EtichetaStare ton={orderStatus(r.status).ton} marime="mic">
                          {orderStatus(r.status).label}
                        </EtichetaStare>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
