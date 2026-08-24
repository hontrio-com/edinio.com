"use client";

import { useState, useTransition } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { propuneInCampanieEmag } from "@/lib/actions/emag.actions";
/* ⚠ Din `propuneri.ts`, care n-are niciun import de rulare. Luate din `campanii.ts`,
   ar fi tras dupa ele `client.ts` cu `undici` si `node:async_hooks` — iar constructia
   cade cu „does not support external modules". Aceeasi despartire ca la `colete.ts`. */
import { REDUCERE_MAXIMA, REDUCERE_MINIMA } from "@/lib/emag/propuneri";

/**
 * Propune ofertele într-o campanie eMAG (§56, §57).
 *
 * ═══ ⚠ NU EXISTĂ MENIU DE CAMPANII, ȘI SE SPUNE ═══
 *
 * Căutat în tot OpenAPI-ul lor: nicio rută nu listează campaniile. Numărul se ia din
 * panoul eMAG și se copiază aici. Fără explicație, comerciantul ar căuta o listă care
 * nu poate exista și ar crede că integrarea e neterminată.
 *
 * ═══ ⚠ CE SE ÎNTÂMPLĂ DUPĂ CAMPANIE ═══
 *
 * Prețul de după se trimite anume, și e cel de acum din Edinio. Netrimis, eMAG pune
 * el prețul pe care îl avea oferta când și-au tras ei datele — care poate fi de acum
 * o lună. Produsul s-ar fi întors la prețul ăla vechi, fără nicio eroare și fără ca
 * nimeni să se uite a doua zi după terminarea campaniei.
 *
 * Se scrie pe ecran, ca să fie o promisiune, nu un amănunt de implementare.
 */

const CAMP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function EmagCampanii({ businessId }: { businessId: string }) {
  const [campanie, setCampanie] = useState("");
  const [reducere, setReducere] = useState("20");
  const [stocMaxim, setStocMaxim] = useState("");
  const [maxPeComanda, setMaxPeComanda] = useState("");
  const [sarite, setSarite] = useState<{ emagId: number; motiv: string }[]>([]);
  const [seLucreaza, incepe] = useTransition();

  function propune() {
    if (!window.confirm(
      `Propun ofertele în campania ${campanie} cu ${reducere}% reducere.\n\n`
      + "Prețul de după campanie rămâne cel de acum din Edinio.",
    )) return;

    incepe(async () => {
      const r = await propuneInCampanieEmag(businessId, {
        campaignId: Number(campanie),
        reducere: Number(reducere),
        stocMaxim: stocMaxim.trim() === "" ? null : Number(stocMaxim),
        maxPeComanda: maxPeComanda.trim() === "" ? null : Number(maxPeComanda),
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setSarite(r.sarite);
      toast.success(
        r.sarite.length > 0
          ? `${r.propuse} oferte propuse. ${r.sarite.length} au rămas pe dinafară.`
          : `${r.propuse} oferte propuse.`,
      );
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Megaphone className="h-4 w-4" /> Campanii eMAG
      </h3>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Numărul campaniei îl iei din panoul eMAG. Ei nu ni-l pot trimite prin API, așa că
        nu putem face o listă. Propunerea nu schimbă prețul din magazinul tău.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Numărul campaniei</span>
          <input
            className={CAMP}
            inputMode="numeric"
            placeholder="ex. 4237"
            value={campanie}
            onChange={(e) => setCampanie(e.target.value.replace(/\D/g, ""))}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Reducere (%)</span>
          <input
            className={CAMP}
            inputMode="numeric"
            value={reducere}
            onChange={(e) => setReducere(e.target.value.replace(/\D/g, ""))}
          />
          {/* ⚠ Limitele sunt ALE LOR, scrise în schemă. Spuse aici, omul nu mai
              primește un refuz care vorbește despre un câmp. */}
          <span className="mt-1 block text-xs text-muted-foreground">
            eMAG acceptă între {REDUCERE_MINIMA}% și {REDUCERE_MAXIMA}%.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Stoc pus deoparte (opțional)</span>
          <input
            className={CAMP}
            inputMode="numeric"
            placeholder="tot stocul"
            value={stocMaxim}
            onChange={(e) => setStocMaxim(e.target.value.replace(/\D/g, ""))}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Niciodată mai mult decât ai în depozit.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Maxim per client (opțional)</span>
          <input
            className={CAMP}
            inputMode="numeric"
            placeholder="fără limită"
            value={maxPeComanda}
            onChange={(e) => setMaxPeComanda(e.target.value.replace(/\D/g, ""))}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Unele campanii de-ale lor îl cer.
          </span>
        </label>
      </div>

      {/*
        ⚠ Promisiunea despre ce se întâmplă DUPĂ campanie, scrisă. E singurul loc în
        care comerciantul poate afla că prețul nu rămâne cel redus — și e chiar
        întrebarea pe care și-o pune înainte să apese.
      */}
      <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
        După campanie, ofertele se întorc la <strong>prețul de acum din Edinio</strong>.
        Îl trimitem anume. Altfel eMAG ar pune prețul pe care îl avea oferta când și-au
        tras ei datele, care poate fi de acum o lună.
      </p>

      <button
        type="button"
        onClick={propune}
        disabled={seLucreaza || !campanie}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {seLucreaza && <Loader2 className="h-4 w-4 animate-spin" />}
        Propune ofertele
      </button>

      {/* ⚠ Ce a rămas pe dinafară se ARATĂ. Sărite tăcut, comerciantul ar fi crezut că
          tot catalogul e în campanie și ar fi aflat din vânzările care nu vin. */}
      {sarite.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">{sarite.length} oferte au rămas pe dinafară</p>
          <ul className="mt-1 space-y-0.5">
            {sarite.slice(0, 8).map((s) => (
              <li key={s.emagId} className="text-xs text-muted-foreground">
                <span className="font-mono">#{s.emagId}</span>: {s.motiv}
              </li>
            ))}
            {sarite.length > 8 && (
              <li className="text-xs text-muted-foreground">și încă {sarite.length - 8}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
