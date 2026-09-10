"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter, GooglePreview } from "@/components/dashboard/SeoFields";
import { descriereAutomataCategorie, salveazaSeoCategorie } from "@/lib/actions/category.actions";
import { SEO_DESCRIERE_CATEGORIE_MAX } from "@/lib/seo";
import {
  avertismenteEditor, butoaneEditor, CONTOR, lungimePublicata, previzualizare,
} from "@/lib/categories/descriere-google";
// ⚠ DOAR TIPUL: modulul citeste baza cu cheia de serviciu si n-are ce cauta in browser.
import type { DescriereAutomataCategorie } from "@/lib/storefront/catalog/descriere-automata";

/**
 * Editorul descrierii pentru Google a unei categorii (Produse > Categorii), intr-un Sheet.
 *
 * Un singur editor pentru tot ecranul, deschis din eticheta „Google" de pe rand. Corpul se
 * reface la FIECARE deschidere (`deschidere` intra in cheie): textul automat se citeste din nou,
 * iar un raspuns intarziat de la categoria de dinainte nu mai are unde sa ajunga.
 */
export function EditorDescriereCategorie({
  deschis,
  onDeschis,
  categorie,
  deschidere,
  salvata,
  citite,
  onSalvata,
}: {
  deschis: boolean;
  onDeschis: (deschis: boolean) => void;
  categorie: { id: string; name: string } | null;
  /** Creste la fiecare deschidere. */
  deschidere: number;
  /** Textul propriu salvat, cum se publica; `null` = textul automat. */
  salvata: string | null;
  /** `false` = descrierile n-au putut fi citite: nu se stie ce e salvat. */
  citite: boolean;
  onSalvata: (id: string, descriere: string | null) => void;
}) {
  return (
    <Sheet open={deschis} onOpenChange={(o) => onDeschis(o)}>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {categorie && (
          <CorpEditor
            key={`${categorie.id}:${deschidere}`}
            categorie={categorie}
            salvata={salvata}
            citite={citite}
            onSalvata={onSalvata}
            onInchide={() => onDeschis(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CorpEditor({
  categorie,
  salvata,
  citite,
  onSalvata,
  onInchide,
}: {
  categorie: { id: string; name: string };
  salvata: string | null;
  citite: boolean;
  onSalvata: (id: string, descriere: string | null) => void;
  onInchide: () => void;
}) {
  const idCamp = useId();
  const [camp, setCamp] = useState(salvata ?? "");
  const [automat, setAutomat] = useState<DescriereAutomataCategorie | null>(null);
  const [incarcat, setIncarcat] = useState(false);
  const [ocupat, startTransition] = useTransition();

  /*
   * Textul automat, EXACT cel din magazin, calculat pe server prin aceleasi functii ca pagina.
   * ⚠ Nu se compune in browser: placeholderul promite „asta primeste Google daca nu scrii
   * nimic", iar o a doua socoteala s-ar fi despartit de prima la prima schimbare.
   */
  useEffect(() => {
    let anulat = false;
    descriereAutomataCategorie(categorie.id)
      .then((r) => {
        if (anulat) return;
        setAutomat(r);
        setIncarcat(true);
      })
      .catch(() => {
        if (!anulat) setIncarcat(true);
      });
    return () => {
      anulat = true;
    };
  }, [categorie.id]);

  const avertismente = avertismenteEditor({ automat, incarcat, citite });
  const butoane = butoaneEditor({ camp, salvata, citite, automat, ocupat });
  const prev = previzualizare(camp, automat);

  function salveaza(text: string | null) {
    startTransition(async () => {
      try {
        const r = await salveazaSeoCategorie(categorie.id, text);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        // Serverul intoarce textul in forma in care se publica: in camp ramane exact ce vede Google.
        setCamp(r.descriere ?? "");
        onSalvata(categorie.id, r.descriere);
        toast.success(r.descriere ? "Descrierea a fost salvată." : "Categoria folosește acum textul automat.");
      } catch {
        toast.error("Descrierea nu s-a putut salva.");
      }
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle>Descrierea pentru Google</SheetTitle>
        <SheetDescription className="truncate">{categorie.name}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 p-4">
        {avertismente.map((a) => (
          <Callout key={a.tip} variant="warning" className="p-3 text-xs leading-relaxed">
            {a.text}
          </Callout>
        ))}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor={idCamp} className="text-sm font-semibold text-foreground">Descriere</label>
            <CharCounter len={lungimePublicata(camp)} idealMin={CONTOR.idealMin} max={CONTOR.max} />
          </div>
          <Textarea
            id={idCamp}
            value={camp}
            onChange={(e) => setCamp(e.target.value)}
            maxLength={SEO_DESCRIERE_CATEGORIE_MAX}
            placeholder={automat?.text ?? ""}
            rows={5}
            disabled={ocupat}
            className="min-h-28 resize-none"
          />
          {!incarcat && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Se calculează textul automat...
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            Recomandat {CONTOR.idealMin}-{CONTOR.max} de caractere. Poți scrie până la {SEO_DESCRIERE_CATEGORIE_MAX}, dar Google afișează de obicei doar începutul.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Cât timp câmpul e gol, Google primește textul automat, cel scris cu gri. Se face din numele categoriei, prețul de pornire și subcategorii sau primele produse, și se actualizează singur. E scurt dinadins când nu are nimic adevărat de adăugat.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!butoane.porneste}
            onClick={() => setCamp(automat?.text ?? "")}
          >
            Pornește de la textul automat
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!butoane.foloseste}
            onClick={() => salveaza(null)}
          >
            Folosește textul automat
          </Button>
        </div>

        {prev && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Previzualizare în Google</p>
            <GooglePreview title={prev.titlu} description={prev.descriere} url={prev.adresa} />
          </div>
        )}
      </div>

      <SheetFooter className="flex-row justify-end border-t border-border">
        <Button type="button" variant="outline" onClick={onInchide}>Închide</Button>
        <Button type="button" onClick={() => salveaza(camp)} disabled={!butoane.salveaza}>
          {ocupat && <Loader2 className="animate-spin" />}
          Salvează
        </Button>
      </SheetFooter>
    </>
  );
}
