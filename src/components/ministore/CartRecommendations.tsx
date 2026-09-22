"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Check, Package, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { getCartCrossSell } from "@/lib/actions/offer.actions";
import { useAfisariOferte } from "@/lib/offers/use-afisari-oferte";
import { OFFER_MAX_PRODUCTS, type OfferProduct } from "@/lib/offers/offer.types";

/**
 * Câte produse încap în rândul din sertarul de coș.
 *
 * ⚠⚠ ERA ȘASE, SCRIS ÎN COD, și tăia în tăcere tocmai numărul cerut de
 * comerciant. Dar plafonul NU s-a ridicat pur și simplu, fiindcă asta ar fi
 * schimbat ce văd cumpărătorii unui magazin care rulează ACUM.
 *
 * Măsurat pe producție la 23.09.2026: `caian-textile` are patru recomandări
 * pornite pe suprafața „coș”, pe categorii disjuncte, fiecare cu `maxProducts:
 * 4`. Un coș cu produse din două grupe (cearșafuri + prosoape, adică fix ce
 * cumpără un hotel) aprinde două oferte și dă opt produse — tăiate azi la șase.
 * Ridicat la douăzeci și patru, sertarul acelui magazin ar fi arătat dintr-odată
 * opt, fără ca nimeni să fi cerut asta.
 *
 * ⚠ DE-AIA E UN MAXIM, NU O ÎNLOCUIRE: rămâne șase cât timp nicio ofertă nu cere
 * mai mult, și crește numai pentru comerciantul care chiar a scris un număr mai
 * mare. Azi, pe toată platforma, cel mai mare e patru — deci nimic nu se mișcă.
 */
const MINIM_IN_SERTAR = 6;

function catIncapInSertar(oferte: readonly { products: readonly unknown[] }[]): number {
  /* ⚠ Se ia din CÂTE A TRIMIS serverul, nu din `maxProducts`: browserul nu vede
     configurația, iar serverul a tăiat deja la numărul cerut de comerciant. */
  const celMaiMare = oferte.reduce((n, o) => Math.max(n, o.products.length), 0);
  return Math.min(OFFER_MAX_PRODUCTS * 2, Math.max(MINIM_IN_SERTAR, celMaiMare));
}

/**
 * Cross-sell row inside the cart drawer ("S-ar putea sa-ti placa"). Pure recommendation
 * (no discount): tapping "+" adds the product to the cart via the existing CartProvider.
 * Renders nothing when there are no applicable recommendations, so the drawer is
 * unchanged for stores without offers.
 *
 * ⚠ AICI SE NUMĂRĂ ȘI AFIȘAREA, prin aceeași baliză ca pe pagina de produs. Nu
 * la citire (`getCartCrossSell`): acolo oferta poate să nu deseneze nimic —
 * produsele ei sunt deja în coș, sau epuizate — și s-ar fi numărat o afișare pe
 * care n-a văzut-o nimeni.
 */
export function CartRecommendations({ businessId, color, basePath, cartProductIds, onAdd }: {
  businessId: string;
  color: string;
  basePath: string;
  cartProductIds: string[];
  onAdd: (p: OfferProduct) => void;
}) {
  const [recs, setRecs] = useState<OfferProduct[]>([]);
  const [idOferte, setIdOferte] = useState<string[]>([]);
  const [titlu, setTitlu] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const cartKey = cartProductIds.join(",");

  useEffect(() => {
    // Mounted only when the cart is non-empty (gated by the drawer), so no empty guard.
    let cancelled = false;
    getCartCrossSell(businessId, cartProductIds).then((offers) => {
      if (cancelled) return;
      // Flatten all cross-sell products, dedupe, drop cart items + out-of-stock.
      // ⚠ Se ține și DIN CE OFERTĂ vine fiecare produs: altfel, după aplatizare,
      // nu se mai putea ști care oferte au ajuns cu adevărat pe ecran.
      const seen = new Set(cartProductIds);
      const flat: { p: OfferProduct; oferta: string }[] = [];
      for (const o of offers) for (const p of o.products) {
        if (!seen.has(p.id) && !p.outOfStock) { seen.add(p.id); flat.push({ p, oferta: o.id }); }
      }
      /*
        ⚠ Tăierea se face ÎNAINTE de a socoti ofertele văzute: o ofertă ale cărei
        produse au căzut toate după plafon nu s-a văzut deloc.

        ⚠ Plafonul e acum un MAXIM între șase și cât a cerut comerciantul —
        vezi `catIncapInSertar`, unde scrie și de ce n-a fost ridicat pur și simplu.
      */
      const aratate = flat.slice(0, catIncapInSertar(offers));
      setRecs(aratate.map((x) => x.p));
      setIdOferte([...new Set(aratate.map((x) => x.oferta))]);
      // Titlul scris de comerciant, cand toate recomandarile vin dintr-o
      // singura oferta. Cu mai multe oferte amestecate niciun titlu nu le-ar
      // descrie pe toate, deci ramane cel general.
      setTitlu(offers.length === 1 ? offers[0].title : null);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, cartKey]);

  // ⚠ ÎNAINTE de ieșirea pe `null`, ca numărul de hook-uri să nu depindă de date.
  const gazda = useAfisariOferte(businessId, idOferte, true);

  if (recs.length === 0) return null;

  function handleAdd(p: OfferProduct) {
    onAdd(p);
    setAdded((prev) => new Set(prev).add(p.id));
    setTimeout(() => setAdded((prev) => { const n = new Set(prev); n.delete(p.id); return n; }), 1500);
  }

  return (
    <div ref={gazda} className="px-5 py-4 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{titlu || "S-ar putea sa-ti placa"}</p>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {recs.map((p) => (
          <div key={p.id} className="w-32 shrink-0">
            <a href={p.slug ? `${basePath}/product/${p.slug}` : basePath || "/"}
              className="block relative w-32 h-32 rounded-xl overflow-hidden border border-border bg-muted/40">
              {p.imageUrl
                ? <Image src={p.imageUrl} alt={p.name} fill sizes="128px" className="object-contain p-2" />
                : <div className="w-full h-full flex items-center justify-center"><Package className="h-7 w-7 text-muted-foreground/40" /></div>}
            </a>
            <p className="text-xs font-medium text-foreground mt-1.5 line-clamp-2 leading-snug">{p.name}</p>
            <div className="flex items-center justify-between gap-1 mt-1">
              {/* Pretul taiat lipsea: aceeasi recomandare arata reducerea pe
                  card si o ascundea in cos, adica exact acolo unde clientul
                  compara inainte sa mai adauge ceva. */}
              <span className="min-w-0 flex items-baseline gap-1">
                <span className="text-xs font-bold text-foreground">{formatPrice(p.price)}</span>
                {p.compareAtPrice != null && p.compareAtPrice > p.price && (
                  <span className="text-[10px] text-muted-foreground line-through">{formatPrice(p.compareAtPrice)}</span>
                )}
              </span>
              {p.needsChoice ? (
                /* Are variante sau cere personalizare — trimite cumparatorul pe pagina lui. */
                <a href={p.slug ? `${basePath}/product/${p.slug}` : basePath || "/"} aria-label={`Alege optiunile pentru ${p.name}`}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 transition-transform active:scale-90"
                  style={{ backgroundColor: color }}>
                  <ChevronRight size={13} />
                </a>
              ) : (
                <button type="button" onClick={() => handleAdd(p)} aria-label={`Adauga ${p.name}`}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 transition-transform active:scale-90"
                  style={{ backgroundColor: color }}>
                  {added.has(p.id) ? <Check size={13} /> : <Plus size={13} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
