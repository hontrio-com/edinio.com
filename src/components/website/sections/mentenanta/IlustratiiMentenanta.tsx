import { Check, ShieldCheck } from "lucide-react";
import type { CardMentenanta } from "@/lib/website/mentenanta";

/**
 * Ilustrațiile celor patru carduri de pe „Mentenanță gratuită".
 *
 * ═══ ARTEFACTE, NU ORNAMENTE ═══
 *
 * „Actualizări", „securitate", „optimizări" sunt cuvinte abstracte, iar
 * ilustrația lor obișnuită e o iconiță într-un pătrat colorat — exact tiparul
 * pe care clientul l-a tăiat de fiecare dată. Aici fiecare card arată un
 * ARTEFACT: lista de versiuni instalate, drumul unei sesizări, panoul de stare
 * al infrastructurii, măsurătoarea de viteză. Aceeași alegere ca la
 * `TrustedProduct` de pe pagina de start, unde încrederea a fost desenată ca o
 * pagină de produs adevărată, nu ca un simbol.
 *
 * ═══ TOATE PATRU ÎN ACELAȘI CADRU ═══
 *
 * `Panou` e obligatoriu pentru toate: același chenar, aceeași densitate, un cap
 * și trei rânduri. Uniformitatea e jumătate din motivul pentru care o serie
 * arată a serie — patru desene cu forme diferite se citesc ca patru lucruri
 * adunate. Structural, nu ținut minte: dacă cineva desenează al cincilea, e
 * obligat să treacă tot prin `Panou`.
 *
 * ⚠ Tot ce e aici e `aria-hidden` la nivelul învelișului din `SectiuneCeInclude`:
 * fiecare ilustrație repetă exact ce scrie în descrierea de alături, iar citită
 * a doua oară ar fi doar zgomot pentru cine folosește un cititor de ecran.
 */

/* Verdele pentru TEXT: #1AB554 are pe alb 2,6:1, sub prag. Aceeași constantă și
   același motiv ca în `IntegrationsBenzi`, `Comparison` și `PricingSection`. */
const VERDE = "#12874A";

/** Cadrul comun. Vezi nota de mai sus — nu se ocolește. */
function Panou({ cap, children }: { cap: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-[14px] border border-hairline bg-white">
      <div className="border-b border-hairline bg-tint px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          {cap}
        </span>
      </div>
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

/** Un rând de panou: ce e în stânga, ce e în dreapta. */
function Rand({ stanga, dreapta }: { stanga: React.ReactNode; dreapta: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0 truncate text-[13px] text-ink">{stanga}</span>
      <span className="shrink-0 text-[12px] font-medium text-ink-3">{dreapta}</span>
    </div>
  );
}

function Actualizari() {
  return (
    <Panou cap="Versiuni instalate">
      <Rand
        stanga={<><span className="font-semibold">v3.12.0</span> — plăți și facturare</>}
        dreapta={
          <span className="inline-flex items-center gap-1" style={{ color: VERDE }}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            azi
          </span>
        }
      />
      <Rand stanga={<><span className="font-semibold">v3.11.4</span> — curieri</>} dreapta="acum 6 zile" />
      <Rand stanga={<><span className="font-semibold">v3.11.0</span> — pagina de magazin</>} dreapta="acum 2 săpt." />
    </Panou>
  );
}

function Remediere() {
  /* Drumul unei sesizări, cu punctele legate printr-o linie: pasul făcut e
     plin, cel în lucru e inelat, cel care urmează e gol. Trei stări, un singur
     desen — o iconiță diferită la fiecare pas ar fi rupt ritmul. */
  const pasi = [
    { text: "Sesizare primită", stare: "gata" as const, cand: "10:14" },
    { text: "În lucru", stare: "acum" as const, cand: "10:21" },
    { text: "Rezolvat", stare: "urmeaza" as const, cand: "" },
  ];
  return (
    <Panou cap="Drumul unei sesizări">
      {pasi.map((p) => (
        <div key={p.text} className="flex items-center gap-3 px-4 py-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={
              p.stare === "gata"
                ? { backgroundColor: VERDE }
                : p.stare === "acum"
                  ? { backgroundColor: "#fff", boxShadow: `inset 0 0 0 2px ${VERDE}` }
                  : { backgroundColor: "var(--color-hairline)" }
            }
          />
          <span
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: p.stare === "urmeaza" ? "var(--color-ink-3)" : "var(--color-ink)" }}
          >
            {p.text}
          </span>
          <span className="shrink-0 text-[12px] font-medium text-ink-3">{p.cand}</span>
        </div>
      ))}
    </Panou>
  );
}

function Securitate() {
  const randuri = [
    { ce: "Certificat SSL", stare: "activ" },
    { ce: "Copii de siguranță", stare: "zilnic" },
    { ce: "Disponibilitate", stare: "99,9%" },
  ];
  return (
    <Panou cap="Starea infrastructurii">
      {randuri.map((r) => (
        <Rand
          key={r.ce}
          stanga={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
              {r.ce}
            </span>
          }
          dreapta={<span style={{ color: VERDE }}>{r.stare}</span>}
        />
      ))}
    </Panou>
  );
}

function Optimizari() {
  /*
    Coloanele NU sunt aleatorii și nici în creștere perfectă: o linie care urcă
    impecabil se citește ca desen de prezentare, nu ca măsurătoare. Valorile
    urcă în ansamblu, cu o săptămână în care au coborât — așa arată datele
    adevărate. Numerele sunt scrise de mână, nu `Math.random()`: pe server ar
    ieși altele decât în browser și s-ar rupe hidratarea.
  */
  const coloane = [38, 46, 41, 55, 62, 58, 71, 79];
  return (
    <Panou cap="Viteza de încărcare">
      <div className="px-4 py-4">
        <div className="flex items-end gap-1.5" style={{ height: 76 }}>
          {coloane.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-[3px]"
              style={{
                height: `${h}%`,
                /* Doar ultima e verde: ea e rezultatul, restul e drumul. Toate
                   verzi ar fi fost culoare pe post de fundal, nu de semnal. */
                backgroundColor: i === coloane.length - 1 ? VERDE : "var(--color-tint-2)",
              }}
            />
          ))}
        </div>
      </div>
      <Rand
        stanga="Scor de performanță"
        dreapta={<span style={{ color: VERDE }}>96 / 100</span>}
      />
    </Panou>
  );
}

const DESENE: Record<CardMentenanta["id"], () => React.JSX.Element> = {
  actualizari: Actualizari,
  remediere: Remediere,
  securitate: Securitate,
  optimizari: Optimizari,
};

export function IlustratieMentenanta({ id }: { id: CardMentenanta["id"] }) {
  const Desen = DESENE[id];
  return <Desen />;
}
