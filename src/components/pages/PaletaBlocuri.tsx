"use client";

import {
  Boxes, Code, Columns3, CreditCard, Heading, Home, Image as ImageIcon, Images, Mail, MailPlus, MapPin,
  MessageCircleQuestion, Minus, MousePointerClick, MoveVertical, Package, Plug, Share2, ShieldCheck,
  Sparkles, Square, Truck, Type, Video,
} from "lucide-react";
import { SECTIUNI_ACASA } from "@/lib/pages/pagina-acasa";
import { BLOCK_META, BLOCK_PALETTE_ORDER, BLOCURI_INTEGRARI, EXCLUSE_DIN_COLOANE, type BlockType, type SectiuneAcasa } from "@/lib/pages/blocks.types";

/**
 * Paleta de blocuri a paginilor proprii: blocurile obisnuite, sectiunile paginii principale si
 * blocurile din integrari.
 *
 * Venita din editorul de pagini de pana acum (`PageBuilder`, retras in etapa 5 din
 * `docs/editor-magazin/PLAN.md`); in editorul unic sta in panoul „Adaugă bloc” (`PanouAdaugaBloc`).
 */

/** Pictograma fiecarui tip de bloc (`BLOCK_META[tip].icon`): paleta si arborele editorului unic. */
const ICONITE: Record<string, React.ElementType> = {
  Sparkles, Heading, Type, Image: ImageIcon, Images, MousePointerClick, Columns3,
  MoveVertical, Minus, Video, MapPin, MessageCircleQuestion, ShieldCheck, Package,
  Share2, Mail, Code, Boxes, MailPlus, CreditCard, Truck, Home,
};

export function IconitaBloc({ tip, className }: { tip: BlockType; className?: string }) {
  const Icon = ICONITE[BLOCK_META[tip]?.icon] ?? Square;
  return <Icon className={className} />;
}

export function PaletaBlocuri({ inColoana, estePaginaAcasa, integrareActiva, onBloc, onAcasa, lata = false }: {
  /** Se adauga intr-o coloana: fara blocurile care nu intra acolo si fara sectiunile paginii principale. */
  inColoana: boolean;
  estePaginaAcasa: boolean;
  /** Ce integrari sunt pornite: newsletter, plati, curieri. */
  integrareActiva: Record<string, boolean>;
  onBloc: (tip: BlockType) => void;
  /** Sectiunile paginii principale; lipsa = grupul nu apare (in „Conținut liber” din magazin, etapa 9). */
  onAcasa?: (sectiune: SectiuneAcasa) => void;
  /** In galeria peste previzualizare (etapa 10): sase pe rand pe ecran lat, nu trei carduri cat o treime de ecran. */
  lata?: boolean;
}) {
  const grila = lata ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" : "grid grid-cols-2 sm:grid-cols-3 gap-2";
  return (
    <>
      <div className={grila}>
        {(inColoana ? BLOCK_PALETTE_ORDER.filter((t) => !EXCLUSE_DIN_COLOANE.includes(t)) : BLOCK_PALETTE_ORDER).map((type) => (
          <button key={type} type="button" onClick={() => onBloc(type)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors">
            <IconitaBloc tip={type} className="h-5 w-5 text-foreground" />
            <span className="text-xs font-medium text-foreground text-center">{BLOCK_META[type].label}</span>
          </button>
        ))}
      </div>
      {/*
        Sectiunile paginii principale (01.10.2026). Numai sus, nu in
        coloane. Apar mereu, cu o nota cand pagina nu e cea principala.
      */}
      {!inColoana && onAcasa && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Home className="h-3.5 w-3.5" /> Din pagina principală</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {estePaginaAcasa
              ? "Secțiunile magazinului, cu conținutul din Editează magazinul."
              : "Apar doar când pagina e setată ca pagina principală (Pagini > Acasa)."}
          </p>
          <div className={grila}>
            {SECTIUNI_ACASA.map((s) => (
              <button key={s.cheie} type="button" onClick={() => onAcasa(s.cheie)} title={s.descriere}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary/5">
                <Home className="h-5 w-5 text-foreground" />
                <span className="text-center text-xs font-medium text-foreground">{s.eticheta}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/*
        Blocurile din integrari (25.09.2026): apar mereu, ca omul sa stie ca
        exista, dar se pot adauga doar cand integrarea e activa. Stinse,
        spun ce trebuie conectat.
      */}
      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Plug className="h-3.5 w-3.5" /> Din integrările tale</p>
        <div className={grila}>
          {BLOCURI_INTEGRARI.map((type) => {
            const activ = integrareActiva[type];
            const lipsa = type === "newsletter" ? "Conectează Mailchimp, Brevo sau Klaviyo" : type === "payments" ? "Nicio plată activă" : "Niciun curier pornit";
            return (
              <button key={type} type="button" disabled={!activ} onClick={() => onBloc(type)} title={activ ? undefined : lipsa}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-transparent">
                <IconitaBloc tip={type} className="h-5 w-5 text-foreground" />
                <span className="text-center text-xs font-medium text-foreground">{BLOCK_META[type].label}</span>
                {!activ && <span className="text-center text-[10px] leading-tight text-muted-foreground">{lipsa}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
