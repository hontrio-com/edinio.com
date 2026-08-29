"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Building2, Loader2, ReceiptText, Sparkles } from "lucide-react";
import { puneOlxLogoFirma, puneOlxBannerFirma,
  getOlxFacturare, getOlxProfilFirma, getOlxPromovariAnunt, salveazaOlxProfilFirma,
  type OlxLinieFacturare, type OlxProfilFirma, type OlxProfilFirmaInput, type OlxPromovareActiva,
} from "@/lib/actions/olx-cont.actions";
import type { OlxAdvertRow } from "@/lib/actions/olx.actions";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/lib/ui";

/*
 * ⚠ O VALOARE CARE LIPSESTE SE ARATA CA LIPSA. Zeroul e o afirmatie: „operatia asta n-a costat
 * nimic". Cand suma n-a putut fi citita din raspunsul lor, in coloana sta o liniuta, si
 * comerciantul stie ca are de cautat pe olx.ro — nu ca a primit ceva gratis.
 */
function sumaScrisa(l: OlxLinieFacturare): string {
  /* ⚠ Nu o liniuta, care intr-o coloana de sume se citeste ca „zero", ci un cuvant care spune ce e. */
  if (l.suma === null) return "necunoscut";
  const n = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(l.suma);
  /* ⚠ Moneda nu se completeaza cu „RON" din burta: pe un cont in alta moneda ar fi o cifra minte. */
  return l.moneda ? `${n} ${l.moneda}` : n;
}

function ziScrisa(iso: string | null): string {
  if (!iso) return "dată necunoscută";
  return new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

export function OlxCont({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [incarca, setIncarca] = useState(true);
  const [esteFirma, setEsteFirma] = useState(false);
  const [profil, setProfil] = useState<OlxProfilFirma | null>(null);
  const [eroareProfil, setEroareProfil] = useState<string | null>(null);
  const [linii, setLinii] = useState<OlxLinieFacturare[]>([]);
  const [eroareFacturare, setEroareFacturare] = useState<string | null>(null);

  useEffect(() => {
    /*
     * ⚠ Panoul se poate inchide inainte sa raspunda OLX, iar componenta se desface cu tot cu
     * starea ei. `viu` opreste scrierile de dupa desfacere.
     */
    let viu = true;
    void (async () => {
      const [p, f] = await Promise.all([getOlxProfilFirma(businessId), getOlxFacturare(businessId, 30)]);
      if (!viu) return;
      if ("error" in p) setEroareProfil(p.error);
      else { setEsteFirma(p.esteFirma); setProfil(p.profil); }
      if ("error" in f) setEroareFacturare(f.error);
      else setLinii(f.linii);
      setIncarca(false);
    })();
    return () => { viu = false; };
  }, [businessId]);

  if (incarca) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Istoric de facturare */}
      <div>
        <Titlu icon={ReceiptText}>Istoric de facturare</Titlu>
        {eroareFacturare ? (
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{eroareFacturare}</p>
        ) : linii.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Nu sunt mișcări pe contul OLX.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {linii.map((l) => (
              <div key={l.cheie} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{l.descriere ?? l.tip ?? "Mișcare pe cont"}</span>
                  <span className="block text-[11px] text-muted-foreground">{ziScrisa(l.data)}</span>
                </span>
                <span className={cn("shrink-0 tabular-nums", l.suma === null ? "text-muted-foreground" : "font-semibold text-foreground")}>
                  {sumaScrisa(l)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profil de firma — numai pe conturile de firma */}
      {eroareProfil && (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{eroareProfil}</p>
      )}
      {esteFirma && profil && (
        <FormularProfil businessId={businessId} initial={profil} onSalvat={setProfil} />
      )}

      {/* Promovarile pe care anuntul le are DEJA */}
      <PromovariAnunt businessId={businessId} adverts={adverts} />
    </div>
  );
}

function FormularProfil({ businessId, initial, onSalvat }: {
  businessId: string; initial: OlxProfilFirma; onSalvat: (p: OlxProfilFirma) => void;
}) {
  const [saving, startSave] = useTransition();
  /* `baza` e ce e salvat la ei acum; campurile de mai jos sunt ce a scris omul peste. */
  const [baza, setBaza] = useState(initial);
  const [nume, setNume] = useState(initial.nume ?? "");
  const [descriere, setDescriere] = useState(initial.descriere ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [telefon, setTelefon] = useState(initial.telefon ?? "");
  const [telefonAlDoilea, setTelefonAlDoilea] = useState(initial.telefonAlDoilea ?? "");
  /*
    ⚠ ADRESA E DESFĂCUTĂ, fiindcă așa o cere schema lor: stradă, număr, cod poștal, oraș. Un
    singur câmp „Adresă" ar fi părut mai simplu, dar ar fi trebuit spart la trimitere — și orice
    spargere după virgulă e o presupunere despre cum scrie omul.
  */
  const [strada, setStrada] = useState(initial.strada ?? "");
  const [numar, setNumar] = useState(initial.numar ?? "");
  const [codPostal, setCodPostal] = useState(initial.codPostal ?? "");
  const [oras, setOras] = useState(initial.oras ?? "");
  const [subdomeniu, setSubdomeniu] = useState(initial.subdomeniu ?? "");
  const [logoNou, setLogoNou] = useState("");
  const [bannerNou, setBannerNou] = useState("");

  function aplica(p: OlxProfilFirma) {
    setBaza(p);
    setNume(p.nume ?? ""); setDescriere(p.descriere ?? ""); setWebsite(p.website ?? "");
    setTelefon(p.telefon ?? ""); setTelefonAlDoilea(p.telefonAlDoilea ?? "");
    setStrada(p.strada ?? ""); setNumar(p.numar ?? "");
    setCodPostal(p.codPostal ?? ""); setOras(p.oras ?? "");
    setSubdomeniu(p.subdomeniu ?? "");
    onSalvat(p);
  }

  function salveaza() {
    /*
     * ⚠ SE TRIMITE DOAR CE S-A SCHIMBAT. Un camp netrimis ramane neatins la ei; unul trimis gol
     * STERGE ce era acolo. Trimise toate de fiecare data, un camp pe care ecranul nu l-a incarcat
     * (raspuns partial de la ei) ar sterge datele adevarate ale firmei la prima salvare.
     */
    const patch: OlxProfilFirmaInput = {};
    if (nume.trim() !== (baza.nume ?? "")) patch.nume = nume;
    if (descriere.trim() !== (baza.descriere ?? "")) patch.descriere = descriere;
    if (website.trim() !== (baza.website ?? "")) patch.website = website;
    if (telefon.trim() !== (baza.telefon ?? "")) patch.telefon = telefon;
    if (telefonAlDoilea.trim() !== (baza.telefonAlDoilea ?? "")) patch.telefonAlDoilea = telefonAlDoilea;
    if (strada.trim() !== (baza.strada ?? "")) patch.strada = strada;
    if (numar.trim() !== (baza.numar ?? "")) patch.numar = numar;
    if (codPostal.trim() !== (baza.codPostal ?? "")) patch.codPostal = codPostal;
    if (oras.trim() !== (baza.oras ?? "")) patch.oras = oras;
    if (subdomeniu.trim() !== (baza.subdomeniu ?? "")) patch.subdomeniu = subdomeniu;
    if (Object.keys(patch).length === 0) { toast.error("Nu ai modificat nimic în profil."); return; }

    startSave(async () => {
      const res = await salveazaOlxProfilFirma(businessId, patch);
      if ("error" in res) { toast.error(res.error); return; }
      /* Se afiseaza ce a ramas la ei: subdomeniul si descrierea le pot veni normalizate. */
      aplica(res.profil);
      toast.success("Profilul de firmă a fost salvat pe OLX.");
    });
  }

  return (
    <div>
      <Titlu icon={Building2}>Profil de firmă pe OLX</Titlu>
      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Camp eticheta="Nume firmă">
            <Input value={nume} onChange={(e) => setNume(e.target.value)} placeholder="Numele afișat pe OLX" />
          </Camp>
          <Camp eticheta="Subdomeniu" ajutor="Adresa paginii tale de firmă pe OLX.">
            <Input value={subdomeniu} onChange={(e) => setSubdomeniu(e.target.value)} placeholder="numele-firmei" />
          </Camp>
          <Camp eticheta="Telefon">
            <Input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="07xx xxx xxx" />
          </Camp>
          <Camp eticheta="Website">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Camp>
          <Camp eticheta="Al doilea telefon">
            <Input value={telefonAlDoilea} onChange={(e) => setTelefonAlDoilea(e.target.value)} placeholder="opțional" />
          </Camp>
          <Camp eticheta="Stradă">
            <Input value={strada} onChange={(e) => setStrada(e.target.value)} />
          </Camp>
          <Camp eticheta="Număr">
            <Input value={numar} onChange={(e) => setNumar(e.target.value)} />
          </Camp>
          <Camp eticheta="Cod poștal">
            <Input value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
          </Camp>
          <Camp eticheta="Oraș">
            <Input value={oras} onChange={(e) => setOras(e.target.value)} placeholder="București" />
          </Camp>
        </div>
        <Camp eticheta="Descriere">
          <Textarea value={descriere} onChange={(e) => setDescriere(e.target.value)} rows={4}
            placeholder="Ce vinde firma și de ce să cumpere de la tine." />
        </Camp>

        {/*
          Logo si banner se vad, dar nu se schimba de aici: incarcarea de imagini pe profilul de
          firma nu merge prin API-ul de parteneri, ci doar din contul de pe olx.ro.
        */}
        <div className="flex flex-wrap items-end gap-2">
          <Camp eticheta="Logo firmă (adresă imagine)">
            <Input value={logoNou} onChange={(e) => setLogoNou(e.target.value)} placeholder="https://…" />
          </Camp>
          <Button size="sm" variant="outline" disabled={saving || !logoNou.trim()}
            onClick={() => startSave(async () => {
              const r = await puneOlxLogoFirma(businessId, logoNou.trim());
              if ("error" in r) { toast.error(r.error); return; }
              toast.success("Logo trimis la OLX.");
              setLogoNou("");
            })}>Pune logo</Button>
          <Camp eticheta="Banner firmă (adresă imagine)">
            <Input value={bannerNou} onChange={(e) => setBannerNou(e.target.value)} placeholder="https://…" />
          </Camp>
          <Button size="sm" variant="outline" disabled={saving || !bannerNou.trim()}
            onClick={() => startSave(async () => {
              const r = await puneOlxBannerFirma(businessId, bannerNou.trim());
              if ("error" in r) { toast.error(r.error); return; }
              toast.success("Banner trimis la OLX.");
              setBannerNou("");
            })}>Pune banner</Button>
        </div>
        {(baza.logoUrl || baza.bannerUrl) && (
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
            {baza.logoUrl && (
              <span className="flex items-center gap-2">
                <Image src={baza.logoUrl} alt="Logo firmă" width={40} height={40} className="h-10 w-auto rounded object-contain" unoptimized />
                <span className="text-[11px] text-muted-foreground">Logo</span>
              </span>
            )}
            {baza.bannerUrl && (
              <span className="flex items-center gap-2">
                <Image src={baza.bannerUrl} alt="Banner firmă" width={120} height={40} className="h-10 w-auto rounded object-contain" unoptimized />
                <span className="text-[11px] text-muted-foreground">Banner</span>
              </span>
            )}
            {/*
              ⚠ TEXTUL DE AICI SPUNEA CĂ NU SE POATE, și era neadevărat (01.09.2026). Rutele
              `/users-business/me/logos` și `/banners` există de mult. E cel mai insidios fel de
              neadevăr: nu se strică nimic, nimeni nu vede o eroare, iar cine citește mai târziu
              îl ia drept fapt și nici nu mai verifică.

              ⚠ Se trimite o ADRESĂ, nu un fișier: OLX vine să ia imaginea de la noi. Deci trebuie
              să fie publică — cele din biblioteca de media a magazinului sunt.
            */}
            <span className="text-[11px] text-muted-foreground">
              Lipește adresa unei imagini din biblioteca ta de media.
            </span>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" disabled={saving} onClick={salveaza}>
            {saving ? <Loader2 className="animate-spin" /> : "Salvează profilul"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PromovariAnunt({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [advertId, setAdvertId] = useState<string>("");
  if (adverts.length === 0) return null;

  return (
    <div>
      <Titlu icon={Sparkles}>Promovări active pe un anunț</Titlu>
      {/*
        ⚠ ASTA E VERIFICAREA DE DINAINTE DE PLATA. OLX nu refuza o promovare peste una care merge
        deja: o ia, o incaseaza si o pune peste. Aici omul vede ca „Evidențiază" ține încă patru
        zile, si nu o mai cumpara a doua oara.
      */}
      <p className="mb-2 text-xs text-muted-foreground">
        Verifică aici înainte să cumperi: OLX acceptă o a doua promovare peste una care încă ține și o încasează din nou.
      </p>
      <select aria-label="Anunț" value={advertId} onChange={(e) => setAdvertId(e.target.value)} className={selectCls}>
        <option value="">— alege anunțul —</option>
        {adverts.map((a) => <option key={a.offer_id} value={String(a.olx_advert_id)}>{a.name}</option>)}
      </select>

      {/*
       * ⚠ `key` pe anunt, ca lista sa se nasca din nou la fiecare schimbare. Altfel golirea starii
       * vechi ar cere o scriere de stare chiar in efect — iar intre schimbare si raspuns ecranul ar
       * arata promovarile ALTUI anunt ca si cum ar fi ale acestuia.
       */}
      {advertId && <ListaPromovari key={advertId} businessId={businessId} advertId={Number(advertId)} />}
    </div>
  );
}

type StarePromovari =
  | { fel: "incarca" }
  | { fel: "gata"; promovari: OlxPromovareActiva[] }
  | { fel: "eroare"; mesaj: string };

function ListaPromovari({ businessId, advertId }: { businessId: string; advertId: number }) {
  const [stare, setStare] = useState<StarePromovari>({ fel: "incarca" });

  useEffect(() => {
    /* Omul poate alege alt anunt sau inchide panoul inainte sa raspunda OLX. */
    let viu = true;
    void (async () => {
      const res = await getOlxPromovariAnunt(businessId, advertId);
      if (!viu) return;
      setStare("error" in res ? { fel: "eroare", mesaj: res.error } : { fel: "gata", promovari: res.promovari });
    })();
    return () => { viu = false; };
  }, [businessId, advertId]);

  if (stare.fel === "incarca") {
    return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }
  if (stare.fel === "eroare") {
    return <p className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{stare.mesaj}</p>;
  }
  /* Cele expirate nu se numara ca active: pe ele omul CHIAR poate cumpara din nou. */
  const active = stare.promovari.filter((p) => !p.expirata);
  if (active.length === 0) {
    return (
      <p className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Anunțul nu are nicio promovare activă.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      {active.map((p) => (
        <div key={p.cod} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-foreground">{p.nume ?? p.cod}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {/* Fara `valid_to` nu se inventeaza o zi: se spune ca nu se stie. */}
            {p.validPanaLa ? `până ${ziScrisa(p.validPanaLa)}` : "fără termen știut"}
          </span>
        </div>
      ))}
    </div>
  );
}

function Camp({ eticheta, ajutor, children }: { eticheta: string; ajutor?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{eticheta}</span>
      {children}
      {ajutor && <span className="mt-1 block text-[11px] text-muted-foreground">{ajutor}</span>}
    </label>
  );
}

function Titlu({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {children}
    </p>
  );
}
