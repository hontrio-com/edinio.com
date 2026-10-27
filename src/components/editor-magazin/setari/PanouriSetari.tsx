"use client";

import { ArrowLeft, Hash, Loader2, Plus, Save, Search, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LIMITE_DATE, NUME_RETEA, RETELE_SOCIALE } from "@/lib/dashboard/datele-magazinului";
import type { CampSuplimentar } from "@/lib/dashboard/formular-comanda";
import { SETARI_EDITOR, type CheieSetare } from "@/lib/editor-magazin/setari";
import { Grup, RandComutator, inputCls } from "../continut/ui";
import type { SetariMagazin } from "./useSetariMagazin";

/**
 * Panourile filei „Setări” din editor (etapa 8): aceleasi campuri ca in Setari, asezate pentru panoul
 * ingust al editorului (o coloana, grupurile lui). Starea si salvarea stau in `useSetariMagazin`.
 *
 * Textele sunt ale PANOULUI, deci cu diacritice.
 */

const etichetaCls = "block text-xs font-medium text-muted-foreground mb-1";
const ajutorCls = "mt-1 text-[11px] text-muted-foreground leading-relaxed";

function CapPanou({ cheie, onInapoi }: { cheie: CheieSetare; onInapoi: () => void }) {
  const setare = SETARI_EDITOR.find((s) => s.cheie === cheie);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onInapoi} aria-label="Înapoi la setări"
        className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-foreground truncate">{setare?.titlu}</h2>
        <p className="text-[11px] text-muted-foreground">Se salvează direct în magazin, nu prin Publică.</p>
      </div>
    </div>
  );
}

/** Salvarea, lipita jos in panou: formularele sunt lungi, iar butonul trebuie sa se vada mereu. */
function Salvare({ modificat, salvez, onSalveaza }: { modificat: boolean; salvez: boolean; onSalveaza: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-surface border-t border-border flex items-center gap-3">
      <p className={`flex-1 min-w-0 text-[11px] leading-snug ${modificat ? "text-amber-600" : "text-muted-foreground"}`}>
        {modificat ? "Ai modificări nesalvate." : "Totul e salvat."}
      </p>
      <Button size="sm" onClick={onSalveaza} disabled={!modificat || salvez}>
        {salvez ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {salvez ? "Se salvează..." : "Salvează"}
      </Button>
    </div>
  );
}

function Contor({ lungime, limita }: { lungime: number; limita: number }) {
  return (
    <span className={`text-[11px] tabular-nums ${lungime > limita ? "text-destructive" : "text-muted-foreground"}`}>
      {lungime}/{limita}
    </span>
  );
}

type Generale = SetariMagazin["generale"];

/** Numele, sloganul, descrierea, contactul, adresa magazinului si butoanele flotante. */
export function PanouInformatiiGenerale({ g, onInapoi }: { g: Generale; onInapoi: () => void }) {
  const { d, schimba } = g;
  return (
    <div className="space-y-5">
      <CapPanou cheie="general" onInapoi={onInapoi} />

      <Grup titlu="Magazinul">
        <div>
          <label htmlFor="st-nume" className={etichetaCls}>Numele magazinului</label>
          <input id="st-nume" type="text" value={d.store_name} maxLength={LIMITE_DATE.numeMagazin}
            onChange={(e) => schimba("store_name", e.target.value)}
            className={inputCls} placeholder={d.business_name || "ex: Florăria Mirei"} />
          <p className={ajutorCls}>Apare în antet, în titlul paginilor și în emailurile către clienți. Gol, se folosește denumirea firmei.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="st-slogan" className="text-xs font-medium text-muted-foreground">Slogan</label>
            <Contor lungime={d.tagline.length} limita={LIMITE_DATE.slogan} />
          </div>
          <input id="st-slogan" type="text" value={d.tagline} maxLength={LIMITE_DATE.slogan}
            onChange={(e) => schimba("tagline", e.target.value)}
            className={inputCls} placeholder="ex: Livrare rapidă în toată țara" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="st-descriere" className="text-xs font-medium text-muted-foreground">Descriere</label>
            <Contor lungime={d.description.length} limita={LIMITE_DATE.descriere} />
          </div>
          <textarea id="st-descriere" value={d.description} rows={4} maxLength={LIMITE_DATE.descriere}
            onChange={(e) => schimba("description", e.target.value)}
            className={`${inputCls} resize-none`} placeholder="Descrie pe scurt ce vinzi și ce te face special..." />
          <p className={ajutorCls}>Apare în secțiunea „Despre noi” și în descrierea magazinului de la Google.</p>
        </div>
      </Grup>

      <Grup titlu="Contact">
        <div>
          <label htmlFor="st-telefon" className={etichetaCls}>Telefon</label>
          <input id="st-telefon" type="tel" value={d.phone} onChange={(e) => schimba("phone", e.target.value)}
            className={inputCls} placeholder="ex: 0722 123 456" />
        </div>
        <div>
          <label htmlFor="st-email" className={etichetaCls}>Email de contact</label>
          <input id="st-email" type="email" value={d.email} onChange={(e) => schimba("email", e.target.value)}
            className={inputCls} placeholder="ex: comenzi@firma.ro" />
          <p className={ajutorCls}>Telefonul și emailul apar în subsolul magazinului și pe documente.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={g.acelasiNumar} onChange={(e) => g.setAcelasiNumar(e.target.checked)}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0" />
          <span className="text-xs text-foreground">Am WhatsApp pe același număr</span>
        </label>
        {!g.acelasiNumar && (
          <div>
            <label htmlFor="st-whatsapp" className={etichetaCls}>Alt număr de WhatsApp (opțional)</label>
            <input id="st-whatsapp" type="tel" value={g.altNumar} onChange={(e) => g.setAltNumar(e.target.value)}
              className={inputCls} placeholder="ex: 0733 123 456" />
            <p className={ajutorCls}>Lasă gol dacă nu folosești WhatsApp.</p>
          </div>
        )}
      </Grup>

      <Grup titlu="Adresa magazinului (opțional)">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">
          Unde te găsesc clienții, dacă e altundeva decât sediul firmei. Apare în secțiunea de contact; goală, în subsol rămâne adresa firmei.
        </p>
        <div>
          <label htmlFor="st-adresa" className={etichetaCls}>Adresă</label>
          <input id="st-adresa" type="text" value={d.store_address} onChange={(e) => schimba("store_address", e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="st-oras" className={etichetaCls}>Oraș</label>
            <input id="st-oras" type="text" value={d.store_city} onChange={(e) => schimba("store_city", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="st-judet" className={etichetaCls}>Județ</label>
            <input id="st-judet" type="text" value={d.store_county} onChange={(e) => schimba("store_county", e.target.value)} className={inputCls} />
          </div>
        </div>
      </Grup>

      <Grup titlu="Butoane flotante">
        <RandComutator titlu="Buton WhatsApp" ajutor="Apare doar dacă ai un număr de WhatsApp." pornit={d.butoane.whatsapp}
          onSchimba={(v) => schimba("butoane", { ...d.butoane, whatsapp: v })} />
        <RandComutator titlu="Buton de apel" ajutor="Apare doar dacă ai completat telefonul." pornit={d.butoane.apel}
          onSchimba={(v) => schimba("butoane", { ...d.butoane, apel: v })} />
      </Grup>

      <Salvare modificat={g.modificate.includes("general")} salvez={g.salvez} onSalveaza={g.salveaza} />
    </div>
  );
}

export function PanouSocialMedia({ g, onInapoi }: { g: Generale; onInapoi: () => void }) {
  const { d, schimba } = g;
  return (
    <div className="space-y-5">
      <CapPanou cheie="social" onInapoi={onInapoi} />
      <Grup titlu="Rețele sociale">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">
          Apar ca iconițe în magazin și în blocul „Rețele” al paginilor. Lasă gol rețelele pe care nu le folosești.
        </p>
        {RETELE_SOCIALE.map((retea) => {
          const gresit = g.verificate.has(retea) && g.reteleGresite.includes(retea);
          return (
            <div key={retea}>
              <label htmlFor={`st-${retea}`} className={etichetaCls}>{NUME_RETEA[retea]}</label>
              <input id={`st-${retea}`} type="url" inputMode="url" value={d.social[retea] ?? ""}
                onChange={(e) => schimba("social", { ...d.social, [retea]: e.target.value })}
                onBlur={() => g.verificata(retea)} aria-invalid={gresit}
                className={inputCls} placeholder={`https://${retea}.com/magazinul-tau`} />
              {gresit && (
                <p className="mt-1 text-[11px] text-destructive">Nu e o adresă web. Scrie-o complet, de exemplu https://{retea}.com/magazinul-tau.</p>
              )}
            </div>
          );
        })}
      </Grup>
      <Salvare modificat={g.modificate.includes("social")} salvez={g.salvez} onSalveaza={g.salveaza} />
    </div>
  );
}

export function PanouDateleFirmei({ g, onInapoi }: { g: Generale; onInapoi: () => void }) {
  const { d, schimba } = g;
  return (
    <div className="space-y-5">
      <CapPanou cheie="firma" onInapoi={onInapoi} />
      <Grup titlu="Firma">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">Datele legale. Apar în subsolul magazinului și pe facturi.</p>
        <div>
          <label htmlFor="st-firma" className={etichetaCls}>Denumirea firmei <span className="text-destructive">*</span></label>
          <input id="st-firma" type="text" value={d.business_name} maxLength={LIMITE_DATE.denumireFirma}
            onChange={(e) => schimba("business_name", e.target.value)} className={inputCls} placeholder="ex: SC Firma Mea SRL" />
          <p className={ajutorCls}>Pentru date legale și facturare. Numele văzut de clienți îl alegi la Informații generale.</p>
        </div>
        <div>
          <label htmlFor="st-cui" className={etichetaCls}>CUI / CIF</label>
          <input id="st-cui" type="text" value={d.cui} onChange={(e) => schimba("cui", e.target.value)}
            className={inputCls} placeholder="ex: RO12345678" />
          <Button type="button" variant="outline" size="sm" onClick={() => void g.completeazaDinAnaf()}
            disabled={g.cautaAnaf || !d.cui.trim()} className="mt-2">
            {g.cautaAnaf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {g.cautaAnaf ? "Se caută..." : "Completează din ANAF"}
          </Button>
          <p className={ajutorCls}>Aduce denumirea, adresa și numărul de la Registrul Comerțului.</p>
        </div>
        <div>
          <label htmlFor="st-regcom" className={etichetaCls}>Nr. Registrul Comerțului</label>
          <input id="st-regcom" type="text" value={d.reg_com} onChange={(e) => schimba("reg_com", e.target.value)}
            className={inputCls} placeholder="ex: J40/1234/2017" />
        </div>
        <div>
          <label htmlFor="st-sediu" className={etichetaCls}>Adresa sediului</label>
          <input id="st-sediu" type="text" value={d.address} onChange={(e) => schimba("address", e.target.value)}
            className={inputCls} placeholder="ex: Str. Exemplu nr. 10" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="st-oras-firma" className={etichetaCls}>Oraș</label>
            <input id="st-oras-firma" type="text" value={d.city} onChange={(e) => schimba("city", e.target.value)}
              className={inputCls} placeholder="ex: București" />
          </div>
          <div>
            <label htmlFor="st-judet-firma" className={etichetaCls}>Județ</label>
            <input id="st-judet-firma" type="text" value={d.county} onChange={(e) => schimba("county", e.target.value)}
              className={inputCls} placeholder="ex: Ilfov" />
          </div>
        </div>
      </Grup>

      <Grup titlu="Numerotarea comenzilor">
        {([
          { valoare: "sequential", Icon: Hash, titlu: "Secvențial", text: "Numere în ordine crescătoare.", exemple: ["#0001", "#0002"] },
          { valoare: "random", Icon: Shuffle, titlu: "Aleatoriu", text: "Un cod unic, la întâmplare.", exemple: ["X8SAD-213F", "A2KMP-991C"] },
        ] as const).map(({ valoare, Icon, titlu, text, exemple }) => (
          <label key={valoare} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            g.formatComanda === valoare ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
          }`}>
            <input type="radio" name="st-format-comanda" value={valoare} checked={g.formatComanda === valoare}
              onChange={() => g.setFormatComanda(valoare)} className="mt-0.5 accent-primary shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Icon className="h-3.5 w-3.5" />{titlu}</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">{text}</span>
              <span className="mt-1.5 flex flex-wrap gap-1">
                {exemple.map((n) => <span key={n} className="px-1.5 py-0.5 bg-muted text-foreground text-[11px] font-mono rounded">{n}</span>)}
              </span>
            </span>
          </label>
        ))}
      </Grup>

      <Salvare modificat={g.modificate.includes("firma")} salvez={g.salvez} onSalveaza={g.salveaza} />
    </div>
  );
}

type Formular = SetariMagazin["formular"];

export function PanouFormularComanda({ f, onInapoi }: { f: Formular; onInapoi: () => void }) {
  const { config, setConfig } = f;
  const campuri = config.custom_fields ?? [];
  const extraoptiuni = config.extras ?? [];
  // Codul de reducere e ASCUNS din start: lipsa listei inseamna „ascuns”.
  const reducereAscunsa = (config.hidden_fields ?? ["discount"]).includes("discount");
  /*
   * ⚠ Emailul e ARATAT din start: asa il citeste magazinul (`checkout-core.ts`, `OrderModal.tsx`) cand
   * reglajul lipseste (proba „acelasi implicit” din `setari-in-editor.test.ts`).
   */
  const email = config.email_field ?? { enabled: true, required: false };
  const codPostal = config.postal_field ?? { enabled: false, required: false };
  const firma = config.company_fields ?? { enabled: false };

  return (
    <div className="space-y-5">
      <CapPanou cheie="formular" onInapoi={onInapoi} />

      <Grup titlu="Câmpuri standard">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">
          Numele, telefonul, județul, orașul și adresa sunt mereu în formular. Aici alegi câmpurile opționale.
        </p>
        <RandComutator titlu="Cod discount" pornit={!reducereAscunsa}
          ajutor="Clientul poate aplica un cod creat la Discounturi. Oprit din start."
          onSchimba={() => setConfig((c) => {
            const acum = c.hidden_fields ?? [];
            return { ...c, hidden_fields: reducereAscunsa ? acum.filter((x) => x !== "discount") : [...acum, "discount"] };
          })} />
        <RandComutator titlu="Email" pornit={email.enabled}
          ajutor="Clientul își poate scrie adresa de email, pentru confirmarea comenzii."
          onSchimba={(v) => setConfig((c) => ({ ...c, email_field: { ...email, enabled: v } }))}>
          <div className="flex items-center justify-between gap-3 pl-3 border-l-2 border-border">
            <span className="text-[11px] text-foreground">Obligatoriu</span>
            <Switch checked={email.required} aria-label="Email obligatoriu"
              onCheckedChange={(v) => setConfig((c) => ({ ...c, email_field: { ...email, required: v } }))} className="shrink-0" />
          </div>
        </RandComutator>
        <RandComutator titlu="Cod poștal" pornit={codPostal.enabled}
          ajutor="Clientul își scrie codul poștal (6 cifre). Ajunge pe AWB, la toți curierii."
          onSchimba={(v) => setConfig((c) => ({ ...c, postal_field: { ...codPostal, enabled: v } }))}>
          <div className="flex items-center justify-between gap-3 pl-3 border-l-2 border-border">
            <span className="text-[11px] text-foreground">Obligatoriu</span>
            <Switch checked={codPostal.required} aria-label="Cod poștal obligatoriu"
              onCheckedChange={(v) => setConfig((c) => ({ ...c, postal_field: { ...codPostal, required: v } }))} className="shrink-0" />
          </div>
        </RandComutator>
        <RandComutator titlu="Comenzi pe firmă" pornit={firma.enabled}
          ajutor="Clientul alege persoană fizică sau juridică; la firmă, datele vin din ANAF după CUI și ajung pe factură."
          onSchimba={(v) => setConfig((c) => ({ ...c, company_fields: { enabled: v } }))} />
      </Grup>

      <Grup titlu="Câmpuri suplimentare">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">Întrebări în plus la comandă: text, listă de opțiuni sau bifă.</p>
        {campuri.length === 0 && <p className="text-xs text-muted-foreground">Nu ai niciun câmp suplimentar.</p>}
        {campuri.map((camp, i) => (
          <div key={camp.id} className="rounded-lg border border-border p-3 space-y-2.5">
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0">
                <label htmlFor={`st-eticheta-${camp.id}`} className={etichetaCls}>Eticheta</label>
                <input id={`st-eticheta-${camp.id}`} type="text" value={camp.label} className={inputCls}
                  placeholder="ex: Mesaj pentru felicitare" onChange={(e) => f.schimbaCamp(i, { label: e.target.value })} />
              </div>
              <button type="button" aria-label="Șterge câmpul"
                onClick={() => setConfig((c) => ({ ...c, custom_fields: (c.custom_fields ?? []).filter((_, j) => j !== i) }))}
                className="mt-5 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label htmlFor={`st-tip-${camp.id}`} className={etichetaCls}>Tip</label>
              <select id={`st-tip-${camp.id}`} value={camp.type} className={inputCls}
                onChange={(e) => f.schimbaCamp(i, { type: e.target.value as CampSuplimentar["type"] })}>
                <option value="text">Text scurt</option>
                <option value="textarea">Text lung</option>
                <option value="select">Listă de opțiuni</option>
                <option value="checkbox">Bifă (Da/Nu)</option>
              </select>
            </div>
            {camp.type === "select" && (
              <div>
                <label htmlFor={`st-optiuni-${camp.id}`} className={etichetaCls}>Opțiuni, despărțite prin virgulă</label>
                <input id={`st-optiuni-${camp.id}`} type="text" value={camp.options ?? ""} className={inputCls}
                  placeholder="Opțiunea 1, Opțiunea 2" onChange={(e) => f.schimbaCamp(i, { options: e.target.value })} />
              </div>
            )}
            {(camp.type === "text" || camp.type === "textarea") && (
              <div>
                <label htmlFor={`st-indiciu-${camp.id}`} className={etichetaCls}>Text de ajutor în câmp (opțional)</label>
                <input id={`st-indiciu-${camp.id}`} type="text" value={camp.placeholder ?? ""} className={inputCls}
                  onChange={(e) => f.schimbaCamp(i, { placeholder: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={camp.required} className="h-4 w-4 accent-primary"
                onChange={(e) => f.schimbaCamp(i, { required: e.target.checked })} />
              Obligatoriu
            </label>
            {/* Ce scrie clientul aici apare la Observatii pe AWB, la curierii care au campul. */}
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={camp.pe_awb === true} className="h-4 w-4 mt-0.5 accent-primary"
                onChange={(e) => f.schimbaCamp(i, { pe_awb: e.target.checked })} />
              <span>Pune pe AWB<span className="block text-[11px] text-muted-foreground">Ce scrie clientul apare la Observații, pentru curier.</span></span>
            </label>
          </div>
        ))}
        <button type="button"
          onClick={() => setConfig((c) => ({ ...c, custom_fields: [...(c.custom_fields ?? []), { id: `cf_${Date.now()}`, label: "", type: "text", required: false, placeholder: "" }] }))}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Plus className="h-3.5 w-3.5" /> Adaugă câmp
        </button>
      </Grup>

      <Grup titlu="Opțiuni extra plătite">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">Clientul le poate bifa, iar prețul lor se adaugă la totalul comenzii.</p>
        {extraoptiuni.length === 0 && <p className="text-xs text-muted-foreground">Nu ai nicio opțiune extra.</p>}
        {extraoptiuni.map((extra, i) => (
          <div key={extra.id} className="rounded-lg border-2 border-dashed border-border p-3 space-y-2.5">
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0">
                <label htmlFor={`st-extra-${extra.id}`} className={etichetaCls}>Denumire</label>
                <input id={`st-extra-${extra.id}`} type="text" value={extra.label} className={inputCls}
                  placeholder="ex: Prioritizează comanda mea" onChange={(e) => f.schimbaExtra(i, { label: e.target.value })} />
              </div>
              <button type="button" aria-label="Șterge opțiunea"
                onClick={() => setConfig((c) => ({ ...c, extras: (c.extras ?? []).filter((_, j) => j !== i) }))}
                className="mt-5 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <div>
                <label htmlFor={`st-pret-${extra.id}`} className={etichetaCls}>Preț (lei)</label>
                <input id={`st-pret-${extra.id}`} type="number" min={0} step="0.01" value={extra.price} className={inputCls}
                  onChange={(e) => f.schimbaExtra(i, { price: Number(e.target.value) })} />
              </div>
              <div>
                <label htmlFor={`st-descriere-${extra.id}`} className={etichetaCls}>Descriere (opțional)</label>
                <input id={`st-descriere-${extra.id}`} type="text" value={extra.description ?? ""} className={inputCls}
                  placeholder="ex: livrat în 24h" onChange={(e) => f.schimbaExtra(i, { description: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <button type="button"
          onClick={() => setConfig((c) => ({ ...c, extras: [...(c.extras ?? []), { id: `ext_${Date.now()}`, label: "", price: 0, description: "" }] }))}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Plus className="h-3.5 w-3.5" /> Adaugă opțiune extra
        </button>
      </Grup>

      <Salvare modificat={f.modificat} salvez={f.salvez} onSalveaza={f.salveaza} />
    </div>
  );
}

type Catalog = SetariMagazin["catalog"];

const RANDURI_CATALOG = [
  {
    cheie: "hide_products_without_images",
    titlu: "Ascunde produsele fără imagini",
    ajutor: "Nu mai apar în listele magazinului; rămân accesibile prin link direct. Util după un import, până adaugi pozele.",
  },
  {
    cheie: "hide_out_of_stock_products",
    titlu: "Ascunde produsele fără stoc",
    ajutor: "Produsele cu stocul epuizat nu mai apar în liste; rămân accesibile prin link direct.",
  },
  {
    cheie: "show_empty_categories",
    titlu: "Arată și categoriile goale",
    ajutor: "Categoriile fără produse apar oricum în meniuri și în banda de categorii. Cele ascunse din Produse > Categorii nu apar în niciun caz.",
  },
] as const;

export function PanouCatalog({ c, onInapoi }: { c: Catalog; onInapoi: () => void }) {
  return (
    <div className="space-y-5">
      <CapPanou cheie="catalog" onInapoi={onInapoi} />
      <Grup titlu="Ce apare în magazin">
        <p className="-mt-1 text-[11px] text-muted-foreground leading-relaxed">Pe toate paginile cu produse: pagina principală, catalogul, categoriile și căutarea.</p>
        {RANDURI_CATALOG.map(({ cheie, titlu, ajutor }) => (
          <RandComutator key={cheie} titlu={titlu} ajutor={ajutor} pornit={c.valori[cheie]}
            onSchimba={(v) => c.setValori((p) => ({ ...p, [cheie]: v }))} />
        ))}
      </Grup>
      <Salvare modificat={c.modificat} salvez={c.salvez} onSalveaza={c.salveaza} />
    </div>
  );
}
