"use client";

import { useState } from "react";
import { salveazaContClientConfig, type StareaConturilor } from "@/lib/actions/cont-client.actions";

/**
 * Fila „Conturi clienti" din Setari.
 *
 * ⚠ Sta intr-un fisier al ei, nu in `SettingsClient.tsx`: acela are deja 3042 de
 * randuri si nota lui spune raspicat ca nu se poate livra fila cu fila fara sa
 * fie rupt in bucati. O sectiune noua scrisa acolo l-ar fi facut si mai greu de
 * atins pentru urmatorul.
 *
 * ⚠ Textele de aici sunt ale PANOULUI, deci cu diacritice, spre deosebire de
 * ecranele vitrinei (H6).
 */
export function ContClientiSetari({ businessId, initial }: { businessId: string; initial: StareaConturilor }) {
  const [stare, setStare] = useState(initial);
  const [asteapta, setAsteapta] = useState(false);
  const [eroare, setEroare] = useState("");
  const [salvat, setSalvat] = useState(false);

  async function salveaza(schimbare: Partial<typeof stare.config>) {
    setAsteapta(true);
    setEroare("");
    setSalvat(false);
    const r = await salveazaContClientConfig(businessId, { ...stare.config, ...schimbare });
    setAsteapta(false);
    if ("error" in r) {
      setEroare(r.error);
      return;
    }
    setStare({ ...stare, config: r.config });
    setSalvat(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Conturi pentru clienți</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Cumpărătorii își pot face cont pe magazinul tău și își văd acolo comenzile, facturile și
          retururile. Contul este opțional: cine vrea comandă mai departe ca musafir, exact ca azi.
        </p>
      </div>

      {!stare.poate && (
        /*
          ⚠ Motivul se scrie langa comutator, nu intr-un mesaj de eroare aparut
          dupa apasare. Comerciantul trebuie sa afle INAINTE de ce nu se poate, si
          unde se rezolva.
        */
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900 leading-relaxed">{stare.motiv}</p>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-lg ring-1 ring-foreground/10 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Permite conturi de client</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {stare.cateConturi > 0
              ? `${stare.cateConturi} ${stare.cateConturi === 1 ? "client are" : "clienți au"} deja cont.`
              : "Niciun client nu are cont încă."}
            {" "}
            {/*
              ⚠ Se spune CE SE INTAMPLA LA STINGERE inainte de apasare (H3).
              Comerciantul care stinge functia crede de obicei ca sterge conturile.
            */}
            Dacă stingi comutatorul, datele rămân, dar clienții nu mai pot intra în cont.
          </p>
        </div>
        <button
          type="button"
          disabled={asteapta || (!stare.poate && !stare.config.enabled)}
          onClick={() => salveaza({ enabled: !stare.config.enabled })}
          aria-pressed={stare.config.enabled}
          className="shrink-0 rounded-full w-11 h-6 transition relative disabled:opacity-50"
          style={{ backgroundColor: stare.config.enabled ? "var(--color-primary, #07c527)" : "#d4d4d8" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: stare.config.enabled ? "1.375rem" : "0.125rem" }}
          />
        </button>
      </div>

      <div className="rounded-lg ring-1 ring-foreground/10 p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Câte coduri pe zi</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Intrarea în cont se face cu un cod trimis pe e-mail. Plafonul zilnic este ce stă între un
            străin și cota ta de trimitere.
          </p>
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground">Coduri pe e-mail / zi</span>
          <input
            type="number"
            min={0}
            max={5000}
            defaultValue={stare.config.buget_email_zilnic}
            onBlur={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v) && v !== stare.config.buget_email_zilnic) salveaza({ buget_email_zilnic: v });
            }}
            className="mt-1 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {eroare && <p className="text-sm text-red-600">{eroare}</p>}
      {salvat && !eroare && <p className="text-sm text-muted-foreground">Salvat.</p>}
    </div>
  );
}
