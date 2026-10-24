"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Hash, Loader2, Save, Search, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updateGeneralSettings } from "@/lib/actions/store.actions";
import {
  LIMITE_DATE, NUME_RETEA, RETELE_SOCIALE, normalizeazaLinkSocial,
  type DateleGenerale, type ReteaSociala,
} from "@/lib/dashboard/datele-magazinului";

/**
 * Setari > General, partea magazinului: ce vad clientii si datele firmei.
 *
 * ⚠ Sta intr-un fisier al ei, ca `PermalinkuriSetari`: `SettingsClient.tsx` are
 * peste trei mii de randuri. Textele sunt ale PANOULUI, deci cu diacritice.
 *
 * Numele, sloganul, descrierea, adresa magazinului, WhatsApp-ul, butoanele
 * flotante si retelele sociale se editau pana la 24.10.2026 din „Editeaza
 * magazinul"; telefonul si emailul aveau camp si acolo, si aici. Un singur buton
 * le salveaza acum pe toate, cu datele firmei, ca sa nu poata ramane jumatate
 * nesalvata intr-o casuta si jumatate in alta.
 */

/**
 * Valorile din baza, ca text. `whatsapp` e ce e in baza acum: ecranul hotaraste
 * din el daca e acelasi numar cu telefonul, iar la salvare trimite numarul ales.
 */
export type DateleMagazinuluiInitiale = DateleGenerale;

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
const cardCls = "bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";
const ajutorCls = "mt-1 text-xs text-muted-foreground";

function Card({ titlu, descriere, children }: { titlu: string; descriere?: string; children: React.ReactNode }) {
  return (
    <div className={cardCls}>
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">{titlu}</p>
        {descriere && <p className="text-xs text-muted-foreground mt-0.5">{descriere}</p>}
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Contor({ lungime, limita }: { lungime: number; limita: number }) {
  return (
    <span className={`text-xs tabular-nums ${lungime > limita ? "text-destructive" : "text-muted-foreground"}`}>
      {lungime}/{limita}
    </span>
  );
}

export function DateleMagazinului({
  businessId, initial, orderNumberFormat,
}: {
  businessId: string | null;
  initial: DateleMagazinuluiInitiale;
  orderNumberFormat: string;
}) {
  const [d, setD] = useState(initial);
  /*
   * ⚠ Bifa spune ADEVARUL despre ce e in baza, nu un implicit.
   *
   * In editorul vechi pornea bifata si cand WhatsApp-ul lipsea cu totul, iar la
   * salvare scria telefonul in el. Cine isi scosese WhatsApp-ul il primea inapoi la
   * prima salvare, cu tot cu butonul flotant, care e pornit din start.
   */
  const [acelasiNumar, setAcelasiNumar] = useState(
    () => !!initial.phone.trim() && initial.whatsapp.trim() === initial.phone.trim(),
  );
  const [altNumar, setAltNumar] = useState(() =>
    initial.whatsapp.trim() && initial.whatsapp.trim() !== initial.phone.trim() ? initial.whatsapp : "",
  );
  const [formatComanda, setFormatComanda] = useState<"sequential" | "random">(
    orderNumberFormat === "random" ? "random" : "sequential",
  );
  const [cautaAnaf, setCautaAnaf] = useState(false);
  /* Linkul se judeca abia dupa ce omul iese din camp sau apasa Salveaza, nu la prima litera. */
  const [verificate, setVerificate] = useState<ReadonlySet<ReteaSociala>>(new Set());
  const [salveaza, startSalvare] = useTransition();

  const schimba = <K extends keyof DateleMagazinuluiInitiale>(cheie: K, valoare: DateleMagazinuluiInitiale[K]) =>
    setD((p) => ({ ...p, [cheie]: valoare }));

  const whatsappFinal = acelasiNumar ? d.phone.trim() : altNumar.trim();

  const reteleGresite = RETELE_SOCIALE.filter((retea) => "eroare" in normalizeazaLinkSocial(d.social[retea]));

  async function completeazaDinAnaf() {
    if (!d.cui.trim()) { toast.error("Scrie întâi CUI-ul."); return; }
    setCautaAnaf(true);
    try {
      const res = await fetch("/api/anaf/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cui: d.cui }),
      });
      const data = await res.json() as { business_name?: string; county?: string; city?: string; address?: string; reg_com?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "CUI-ul nu a fost găsit la ANAF.");
      } else {
        setD((p) => ({
          ...p,
          business_name: data.business_name ?? p.business_name,
          county: data.county ?? p.county,
          city: data.city ?? p.city,
          address: data.address ?? p.address,
          reg_com: data.reg_com ?? p.reg_com,
        }));
        toast.success("Datele firmei au fost completate din ANAF. Verifică-le și salvează.");
      }
    } catch {
      toast.error("Nu am putut întreba ANAF-ul. Încearcă din nou peste câteva minute.");
    } finally {
      setCautaAnaf(false);
    }
  }

  function salveazaTot() {
    if (!businessId) { toast.error("Nu există un magazin asociat."); return; }
    if (!d.business_name.trim()) { toast.error("Denumirea firmei este obligatorie."); return; }
    if (reteleGresite.length > 0) {
      setVerificate(new Set(RETELE_SOCIALE));
      const prima = reteleGresite[0];
      toast.error(`Linkul de ${NUME_RETEA[prima]} nu e o adresă web. Scrie-l complet, de exemplu https://${prima}.com/magazinul-tau.`);
      return;
    }
    const date: DateleGenerale = { ...d, whatsapp: whatsappFinal };
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updateGeneralSettings>>;
      try {
        rezultat = await updateGeneralSettings(businessId, date, formatComanda);
      } catch {
        /* ⚠ Nu stim daca scrierea a apucat sa ajunga in baza. Mesajul spune doar atat. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă setările s-au salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) toast.error(rezultat.error);
      else toast.success("Setările au fost salvate.");
    });
  }

  return (
    <div className="space-y-4">
      <Card titlu="Magazinul" descriere="Cum îl văd clienții.">
        <div>
          <label htmlFor="dm-nume" className={labelCls}>Numele magazinului</label>
          <input id="dm-nume" type="text" value={d.store_name} maxLength={LIMITE_DATE.numeMagazin}
            onChange={(e) => schimba("store_name", e.target.value)}
            className={inputCls} placeholder={d.business_name || "ex: Florăria Mirei"} />
          <p className={ajutorCls}>Apare în antet, în titlul paginilor și în emailurile către clienți. Dacă îl lași gol, se folosește denumirea firmei.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="dm-slogan" className="text-sm font-medium text-foreground">Slogan</label>
            <Contor lungime={d.tagline.length} limita={LIMITE_DATE.slogan} />
          </div>
          <input id="dm-slogan" type="text" value={d.tagline} maxLength={LIMITE_DATE.slogan}
            onChange={(e) => schimba("tagline", e.target.value)}
            className={inputCls} placeholder="ex: Livrare rapidă în toată țara" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="dm-descriere" className="text-sm font-medium text-foreground">Descriere</label>
            <Contor lungime={d.description.length} limita={LIMITE_DATE.descriere} />
          </div>
          <textarea id="dm-descriere" value={d.description} rows={4} maxLength={LIMITE_DATE.descriere}
            onChange={(e) => schimba("description", e.target.value)}
            className={inputCls + " resize-none"} placeholder="Descrie pe scurt ce vinzi și ce te face special..." />
        </div>
      </Card>

      <Card titlu="Contact" descriere="Cum te pot găsi clienții. Telefonul și emailul apar în subsolul magazinului și pe documente.">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="dm-telefon" className={labelCls}>Telefon</label>
            <input id="dm-telefon" type="tel" value={d.phone}
              onChange={(e) => schimba("phone", e.target.value)}
              className={inputCls} placeholder="ex: 0722 123 456" />
          </div>
          <div>
            <label htmlFor="dm-email" className={labelCls}>Email de contact</label>
            <input id="dm-email" type="email" value={d.email}
              onChange={(e) => schimba("email", e.target.value)}
              className={inputCls} placeholder="ex: comenzi@firma.ro" />
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={acelasiNumar}
              onChange={(e) => setAcelasiNumar(e.target.checked)}
              className="h-4 w-4 accent-primary cursor-pointer flex-shrink-0" />
            <span className="text-sm text-foreground">Am WhatsApp pe același număr</span>
          </label>
          {!acelasiNumar && (
            <div>
              <label htmlFor="dm-whatsapp" className={labelCls}>Alt număr de WhatsApp (opțional)</label>
              <input id="dm-whatsapp" type="tel" value={altNumar}
                onChange={(e) => setAltNumar(e.target.value)}
                className={inputCls} placeholder="ex: 0733 123 456" />
              <p className={ajutorCls}>Lasă gol dacă nu folosești WhatsApp.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Adresa magazinului (opțional)</p>
            <p className={ajutorCls}>Unde te găsesc clienții, dacă e altundeva decât sediul firmei. Apare în secțiunea de contact a magazinului. Dacă o lași goală, în subsol și în politici rămâne adresa firmei.</p>
          </div>
          <div>
            <label htmlFor="dm-adresa-magazin" className={labelCls}>Adresă</label>
            <input id="dm-adresa-magazin" type="text" value={d.store_address}
              onChange={(e) => schimba("store_address", e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dm-oras-magazin" className={labelCls}>Oraș</label>
              <input id="dm-oras-magazin" type="text" value={d.store_city}
                onChange={(e) => schimba("store_city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="dm-judet-magazin" className={labelCls}>Județ</label>
              <input id="dm-judet-magazin" type="text" value={d.store_county}
                onChange={(e) => schimba("store_county", e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Butoane flotante</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Buton WhatsApp</p>
              <p className={ajutorCls}>Apare doar dacă ai un număr de WhatsApp.</p>
            </div>
            <Switch checked={d.butoane.whatsapp} aria-label="Buton WhatsApp"
              onCheckedChange={(v) => schimba("butoane", { ...d.butoane, whatsapp: v })} className="shrink-0 mt-0.5" />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Buton de apel</p>
              <p className={ajutorCls}>Apare doar dacă ai completat telefonul.</p>
            </div>
            <Switch checked={d.butoane.apel} aria-label="Buton de apel"
              onCheckedChange={(v) => schimba("butoane", { ...d.butoane, apel: v })} className="shrink-0 mt-0.5" />
          </div>
        </div>
      </Card>

      <Card titlu="Rețele sociale" descriere="Apar ca iconițe în magazin. Lasă gol rețelele pe care nu le folosești.">
        {RETELE_SOCIALE.map((retea) => {
          const gresit = verificate.has(retea) && reteleGresite.includes(retea);
          return (
            <div key={retea}>
              <label htmlFor={`dm-${retea}`} className={labelCls}>{NUME_RETEA[retea]}</label>
              <input id={`dm-${retea}`} type="url" inputMode="url" value={d.social[retea] ?? ""}
                onChange={(e) => schimba("social", { ...d.social, [retea]: e.target.value })}
                onBlur={() => setVerificate((v) => new Set(v).add(retea))}
                aria-invalid={gresit}
                className={inputCls} placeholder={`https://${retea}.com/magazinul-tau`} />
              {gresit && (
                <p className="mt-1 text-xs text-destructive">
                  Nu e o adresă web. Scrie-o complet, de exemplu https://{retea}.com/magazinul-tau.
                </p>
              )}
            </div>
          );
        })}
      </Card>

      <Card titlu="Datele firmei" descriere="Datele legale. Apar în subsolul magazinului și pe facturi.">
        <div>
          <label htmlFor="dm-firma" className={labelCls}>
            Denumirea firmei <span className="text-destructive">*</span>
          </label>
          <input id="dm-firma" type="text" value={d.business_name} maxLength={LIMITE_DATE.denumireFirma}
            onChange={(e) => schimba("business_name", e.target.value)}
            className={inputCls} placeholder="ex: SC Firma Mea SRL" />
          <p className={ajutorCls}>Pentru date legale și facturare. Numele pe care îl văd clienții îl alegi mai sus, la Magazinul.</p>
        </div>
        <div>
          <label htmlFor="dm-cui" className={labelCls}>CUI / CIF</label>
          <div className="flex gap-2">
            <input id="dm-cui" type="text" value={d.cui}
              onChange={(e) => schimba("cui", e.target.value)}
              className={inputCls} placeholder="ex: RO12345678" />
            <Button type="button" variant="outline" onClick={completeazaDinAnaf}
              disabled={cautaAnaf || !d.cui.trim()} className="shrink-0 whitespace-nowrap">
              {cautaAnaf ? <Loader2 className="animate-spin" /> : <Search />}
              {cautaAnaf ? "Se caută..." : "Completează automat"}
            </Button>
          </div>
          <p className={ajutorCls}>Butonul aduce denumirea, adresa și numărul de la Registrul Comerțului din ANAF.</p>
        </div>
        <div>
          <label htmlFor="dm-regcom" className={labelCls}>Nr. Registrul Comerțului</label>
          <input id="dm-regcom" type="text" value={d.reg_com}
            onChange={(e) => schimba("reg_com", e.target.value)}
            className={inputCls} placeholder="ex: J40/1234/2017" />
          <p className={ajutorCls}>Se afișează în subsolul magazinului. Procesatorii de plăți (de exemplu Netopia) îl cer.</p>
        </div>
        <div>
          <label htmlFor="dm-sediu" className={labelCls}>Adresa sediului</label>
          <input id="dm-sediu" type="text" value={d.address}
            onChange={(e) => schimba("address", e.target.value)}
            className={inputCls} placeholder="ex: Str. Exemplu nr. 10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="dm-oras" className={labelCls}>Oraș</label>
            <input id="dm-oras" type="text" value={d.city}
              onChange={(e) => schimba("city", e.target.value)}
              className={inputCls} placeholder="ex: București" />
          </div>
          <div>
            <label htmlFor="dm-judet" className={labelCls}>Județ</label>
            <input id="dm-judet" type="text" value={d.county}
              onChange={(e) => schimba("county", e.target.value)}
              className={inputCls} placeholder="ex: Ilfov" />
          </div>
        </div>
      </Card>

      <Card titlu="Formatul numărului de comandă" descriere="Cum se numerotează comenzile noi.">
        {([
          { valoare: "sequential", Icon: Hash, titlu: "Secvențial", text: "Comenzile primesc numere în ordine crescătoare.", exemple: ["#0001", "#0002", "#0003"] },
          { valoare: "random", Icon: Shuffle, titlu: "Aleatoriu", text: "Fiecare comandă primește un cod unic, generat la întâmplare.", exemple: ["X8SAD-213F", "A2KMP-991C", "Z7TRQ-445B"] },
        ] as const).map(({ valoare, Icon, titlu, text, exemple }) => (
          <label key={valoare} className={`flex items-start gap-3.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
            formatComanda === valoare ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
          }`}>
            <input type="radio" name="dm-format-comanda" value={valoare}
              checked={formatComanda === valoare}
              onChange={() => setFormatComanda(valoare)}
              className="mt-0.5 accent-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className="h-4 w-4 text-foreground flex-shrink-0" />
                <p className="text-sm font-semibold text-foreground">{titlu}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{text}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {exemple.map((n) => (
                  <span key={n} className="px-2 py-0.5 bg-muted text-foreground text-xs font-mono rounded">{n}</span>
                ))}
              </div>
            </div>
          </label>
        ))}
      </Card>

      <Button onClick={salveazaTot} disabled={salveaza || !businessId}>
        {salveaza ? <Loader2 className="animate-spin" /> : <Save />}
        {salveaza ? "Se salvează..." : "Salvează setările generale"}
      </Button>
    </div>
  );
}
