"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updatePageContent } from "@/lib/actions/store.actions";
import {
  formularDeSalvat, problemaFormularului,
  type CampSuplimentar, type ConfigFormular, type OptiuneExtra,
} from "@/lib/dashboard/formular-comanda";

/**
 * Fila „Formular de comanda" din Setari.
 *
 * Pana la 24.10.2026 statea in „Editeaza magazinul", printre bannere si culori,
 * desi nu e design: campurile ajung pe AWB si pe factura, iar extraoptiunile se
 * aduna la totalul comenzii. Datele au ramas unde erau, in
 * `page_content.checkout_config`; s-a mutat doar ecranul.
 *
 * ⚠ Se trimite DOAR `checkout_config`. `updatePageContent` imbina pe chei de
 * prim nivel, deci orice alta cheie trimisa de aici, dintr-o copie facuta la
 * deschiderea paginii, ar scrie peste ce a schimbat intre timp alt ecran.
 *
 * Textele sunt ale PANOULUI, deci cu diacritice.
 */

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
const cardCls = "bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden";
const ajutorCls = "mt-0.5 text-xs text-muted-foreground";

function RandComutator({ titlu, ajutor, pornit, onSchimba, children }: {
  titlu: string; ajutor: string; pornit: boolean; onSchimba: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{titlu}</p>
          <p className={ajutorCls}>{ajutor}</p>
        </div>
        <Switch checked={pornit} onCheckedChange={onSchimba} aria-label={titlu} className="shrink-0 mt-0.5" />
      </div>
      {children}
    </div>
  );
}

export function FormularComandaSetari({ businessId, initial }: { businessId: string; initial: ConfigFormular }) {
  const [config, setConfig] = useState<ConfigFormular>(() => ({
    ...initial,
    custom_fields: initial.custom_fields ?? [],
    extras: initial.extras ?? [],
  }));
  const [salveaza, startSalvare] = useTransition();

  const campuri = config.custom_fields ?? [];
  const extraoptiuni = config.extras ?? [];
  // Codul de reducere e ASCUNS din start: lipsa listei inseamna „ascuns".
  const reducereAscunsa = (config.hidden_fields ?? ["discount"]).includes("discount");
  const email = config.email_field ?? { enabled: false, required: false };
  const codPostal = config.postal_field ?? { enabled: false, required: false };
  const firma = config.company_fields ?? { enabled: false };

  const schimbaCamp = (i: number, patch: Partial<CampSuplimentar>) =>
    setConfig((c) => ({ ...c, custom_fields: (c.custom_fields ?? []).map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const schimbaExtra = (i: number, patch: Partial<OptiuneExtra>) =>
    setConfig((c) => ({ ...c, extras: (c.extras ?? []).map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  function salveazaFormularul() {
    const problema = problemaFormularului(config);
    if (problema) { toast.error(problema); return; }
    const curat = formularDeSalvat(config);
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updatePageContent>>;
      try {
        rezultat = await updatePageContent(businessId, { checkout_config: curat });
      } catch {
        /* ⚠ Nu stim daca scrierea a apucat sa ajunga in baza. Mesajul spune doar atat. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă formularul s-a salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) toast.error(rezultat.error);
      else {
        setConfig(curat);
        toast.success("Formularul de comandă a fost salvat.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Câmpuri standard</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Numele, telefonul, județul, orașul și adresa sunt mereu în formular. Aici alegi câmpurile opționale.
          </p>
        </div>
        <div className="px-5 py-5 space-y-3">
          <RandComutator titlu="Cod discount" pornit={!reducereAscunsa}
            ajutor="Clientul poate aplica un cod creat la Discounturi. Oprit din start."
            onSchimba={() => setConfig((c) => {
              const acum = c.hidden_fields ?? [];
              return { ...c, hidden_fields: reducereAscunsa ? acum.filter((f) => f !== "discount") : [...acum, "discount"] };
            })} />

          <RandComutator titlu="Email" pornit={email.enabled}
            ajutor="Clientul își poate scrie adresa de email, pentru confirmarea comenzii."
            onSchimba={(v) => setConfig((c) => ({ ...c, email_field: { ...email, enabled: v } }))}>
            {email.enabled && (
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
                <div>
                  <p className="text-sm text-foreground">Obligatoriu</p>
                  <p className={ajutorCls}>Oprit, câmpul apare ca opțional.</p>
                </div>
                <Switch checked={email.required} aria-label="Email obligatoriu"
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, email_field: { ...email, required: v } }))}
                  className="shrink-0 mt-0.5" />
              </div>
            )}
          </RandComutator>

          <RandComutator titlu="Cod poștal" pornit={codPostal.enabled}
            ajutor="Clientul își scrie codul poștal (6 cifre). Ajunge în câmpul de cod poștal al AWB-ului, la toți curierii."
            onSchimba={(v) => setConfig((c) => ({ ...c, postal_field: { ...codPostal, enabled: v } }))}>
            {codPostal.enabled && (
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
                <div>
                  <p className="text-sm text-foreground">Obligatoriu</p>
                  <p className={ajutorCls}>Oprit, câmpul apare ca opțional.</p>
                </div>
                <Switch checked={codPostal.required} aria-label="Cod poștal obligatoriu"
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, postal_field: { ...codPostal, required: v } }))}
                  className="shrink-0 mt-0.5" />
              </div>
            )}
          </RandComutator>

          <RandComutator titlu="Comenzi pe firmă" pornit={firma.enabled}
            ajutor="Clientul alege persoană fizică sau juridică. La firmă scrie CUI-ul, iar datele vin din ANAF și ajung pe factură. Adresa de livrare rămâne separată de sediu."
            onSchimba={(v) => setConfig((c) => ({ ...c, company_fields: { enabled: v } }))} />
        </div>
      </div>

      <div className={cardCls}>
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Câmpuri suplimentare</p>
          <p className="text-xs text-muted-foreground mt-0.5">Întrebări în plus, pe care clientul le completează la comandă: text, listă de opțiuni sau bifă.</p>
        </div>
        <div className="px-5 py-5 space-y-3">
          {campuri.length === 0 && <p className="text-sm text-muted-foreground">Nu ai niciun câmp suplimentar.</p>}
          {campuri.map((camp, i) => (
            <div key={camp.id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label htmlFor={`fc-eticheta-${camp.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Eticheta</label>
                  <input id={`fc-eticheta-${camp.id}`} type="text" value={camp.label} className={inputCls}
                    placeholder="ex: Mesaj pentru felicitare"
                    onChange={(e) => schimbaCamp(i, { label: e.target.value })} />
                </div>
                <button type="button" aria-label="Șterge câmpul"
                  onClick={() => setConfig((c) => ({ ...c, custom_fields: (c.custom_fields ?? []).filter((_, j) => j !== i) }))}
                  className="mt-6 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`fc-tip-${camp.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Tip</label>
                  <select id={`fc-tip-${camp.id}`} value={camp.type} className={inputCls}
                    onChange={(e) => schimbaCamp(i, { type: e.target.value as CampSuplimentar["type"] })}>
                    <option value="text">Text scurt</option>
                    <option value="textarea">Text lung</option>
                    <option value="select">Listă de opțiuni</option>
                    <option value="checkbox">Bifă (Da/Nu)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={camp.required} className="h-4 w-4 accent-primary"
                      onChange={(e) => schimbaCamp(i, { required: e.target.checked })} />
                    Obligatoriu
                  </label>
                </div>
              </div>
              {camp.type === "select" && (
                <div>
                  <label htmlFor={`fc-optiuni-${camp.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Opțiuni, despărțite prin virgulă</label>
                  <input id={`fc-optiuni-${camp.id}`} type="text" value={camp.options ?? ""} className={inputCls}
                    placeholder="Opțiunea 1, Opțiunea 2"
                    onChange={(e) => schimbaCamp(i, { options: e.target.value })} />
                </div>
              )}
              {(camp.type === "text" || camp.type === "textarea") && (
                <div>
                  <label htmlFor={`fc-indiciu-${camp.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Text de ajutor în câmp (opțional)</label>
                  <input id={`fc-indiciu-${camp.id}`} type="text" value={camp.placeholder ?? ""} className={inputCls}
                    onChange={(e) => schimbaCamp(i, { placeholder: e.target.value })} />
                </div>
              )}
              {/* Ce scrie clientul aici apare la Observatii pe AWB, la curierii care au campul. */}
              <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={camp.pe_awb === true} className="h-4 w-4 mt-0.5 accent-primary"
                  onChange={(e) => schimbaCamp(i, { pe_awb: e.target.checked })} />
                <span>
                  Pune pe AWB
                  <span className="block text-xs text-muted-foreground">Ce scrie clientul apare la Observații, pentru curier.</span>
                </span>
              </label>
            </div>
          ))}
          <button type="button"
            onClick={() => setConfig((c) => ({ ...c, custom_fields: [...(c.custom_fields ?? []), { id: `cf_${Date.now()}`, label: "", type: "text", required: false, placeholder: "" }] }))}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus className="h-4 w-4" /> Adaugă câmp
          </button>
        </div>
      </div>

      <div className={cardCls}>
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Opțiuni extra plătite</p>
          <p className="text-xs text-muted-foreground mt-0.5">Clientul le poate bifa în formular, iar prețul lor se adaugă la totalul comenzii.</p>
        </div>
        <div className="px-5 py-5 space-y-3">
          {extraoptiuni.length === 0 && <p className="text-sm text-muted-foreground">Nu ai nicio opțiune extra.</p>}
          {extraoptiuni.map((extra, i) => (
            <div key={extra.id} className="rounded-xl border-2 border-dashed border-border p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label htmlFor={`fc-extra-${extra.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Denumire</label>
                  <input id={`fc-extra-${extra.id}`} type="text" value={extra.label} className={inputCls}
                    placeholder="ex: Prioritizează comanda mea"
                    onChange={(e) => schimbaExtra(i, { label: e.target.value })} />
                </div>
                <button type="button" aria-label="Șterge opțiunea"
                  onClick={() => setConfig((c) => ({ ...c, extras: (c.extras ?? []).filter((_, j) => j !== i) }))}
                  className="mt-6 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`fc-pret-${extra.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Preț (lei)</label>
                  <input id={`fc-pret-${extra.id}`} type="number" min={0} step="0.01" value={extra.price} className={inputCls}
                    onChange={(e) => schimbaExtra(i, { price: Number(e.target.value) })} />
                </div>
                <div>
                  <label htmlFor={`fc-descriere-${extra.id}`} className="block text-xs font-medium text-muted-foreground mb-1">Descriere scurtă (opțional)</label>
                  <input id={`fc-descriere-${extra.id}`} type="text" value={extra.description ?? ""} className={inputCls}
                    placeholder="ex: livrat în 24h"
                    onChange={(e) => schimbaExtra(i, { description: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <button type="button"
            onClick={() => setConfig((c) => ({ ...c, extras: [...(c.extras ?? []), { id: `ext_${Date.now()}`, label: "", price: 0, description: "" }] }))}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus className="h-4 w-4" /> Adaugă opțiune extra
          </button>
        </div>
      </div>

      <Button onClick={salveazaFormularul} disabled={salveaza}>
        {salveaza ? <Loader2 className="animate-spin" /> : <Save />}
        {salveaza ? "Se salvează..." : "Salvează formularul de comandă"}
      </Button>
    </div>
  );
}
