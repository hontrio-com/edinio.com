"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadGpsrConfig, saveGpsrConfig } from "@/lib/actions/gpsr.actions";
import type { GpsrConfig, GpsrPersoana } from "@/lib/gpsr";

/*
 * ═══ SIGURANȚA PRODUSULUI (GPSR) ═══
 *
 * ⚠ NU E O SETARE DE OLX, deși de aici se ajunge azi la ea: același lucru îl cer și eMAG, și
 * About You. De aceea datele stau într-o coloană proprie și textul spune limpede că valorile se
 * folosesc pe toate canalele — altfel comerciantul le-ar completa a doua oară la a doua integrare.
 *
 * ⚠ ȘI NU BLOCHEAZĂ NIMIC. Nu putem ști din cod în ce categorii o cere fiecare furnizor, iar un
 * refuz al nostru într-o categorie unde ei n-o cer ar opri o vânzare degeaba. Se arată ce lipsește;
 * hotărârea rămâne a omului.
 */

const GOL: GpsrPersoana = { name: "", address: "", email: "", phone: "" };

function Persoana({
  titlu, ajutor, valoare, seteaza,
}: {
  titlu: string;
  ajutor: string;
  valoare: GpsrPersoana;
  seteaza: (v: GpsrPersoana) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">{titlu}</p>
        <p className="text-[11px] text-muted-foreground">{ajutor}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={valoare.name ?? ""} placeholder="Denumire"
          onChange={(e) => seteaza({ ...valoare, name: e.target.value })} />
        <Input
          value={valoare.address ?? ""} placeholder="Adresă completă"
          onChange={(e) => seteaza({ ...valoare, address: e.target.value })} />
        <Input
          value={valoare.email ?? ""} placeholder="E-mail" type="email"
          onChange={(e) => seteaza({ ...valoare, email: e.target.value })} />
        <Input
          value={valoare.phone ?? ""} placeholder="Telefon"
          onChange={(e) => seteaza({ ...valoare, phone: e.target.value })} />
      </div>
    </div>
  );
}

export function GpsrSettings({ businessId }: { businessId: string }) {
  const [producator, setProducator] = useState<GpsrPersoana>(GOL);
  const [responsabil, setResponsabil] = useState<GpsrPersoana>(GOL);
  const [avertisment, setAvertisment] = useState("");
  const [lipsuri, setLipsuri] = useState<string[]>([]);
  const [seIncarca, setSeIncarca] = useState(true);
  const [salveaza, startSave] = useTransition();

  useEffect(() => {
    let viu = true;
    (async () => {
      const r = await loadGpsrConfig(businessId);
      if (!viu) return;
      setSeIncarca(false);
      if ("error" in r) { toast.error(r.error); return; }
      setProducator({ ...GOL, ...(r.manufacturer ?? {}) });
      setResponsabil({ ...GOL, ...(r.contact_person ?? {}) });
      setAvertisment(r.warning_and_safety ?? "");
    })();
    return () => { viu = false; };
  }, [businessId]);

  const config: GpsrConfig = {
    manufacturer: producator,
    contact_person: responsabil,
    warning_and_safety: avertisment,
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Siguranța produsului (GPSR)</h3>
          <p className="text-xs text-muted-foreground">
            Regulamentul european cere ca fiecare produs vândut în UE să arate cine e producătorul și
            cine răspunde pentru el în Uniune. Valorile de aici se folosesc pe{" "}
            <strong>toate marketplace-urile</strong> — OLX, eMAG, About You. Un produs anume le poate
            înlocui din pagina lui.
          </p>
        </div>
      </div>

      {seIncarca ? (
        <p className="text-xs text-muted-foreground">Se încarcă…</p>
      ) : (
        <>
          <Persoana
            titlu="Producător"
            ajutor="Cine a fabricat produsul. Dacă tu ești producătorul, completează datele firmei tale."
            valoare={producator} seteaza={setProducator} />
          <Persoana
            titlu="Persoană responsabilă în UE"
            ajutor="Cine răspunde pentru produs în Uniune, când producătorul e din afara ei. Poate fi tot firma ta."
            valoare={responsabil} seteaza={setResponsabil} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground" htmlFor="gpsr-avertisment">
              Avertismente și instrucțiuni de siguranță
            </label>
            <textarea
              id="gpsr-avertisment"
              value={avertisment}
              onChange={(e) => setAvertisment(e.target.value)}
              rows={3}
              placeholder="Ce scrie pe ambalaj: „A nu se lăsa la îndemâna copiilor sub 3 ani”, de exemplu."
              className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
          </div>

          {lipsuri.length > 0 && (
            /*
             * ⚠ SE ARATĂ, NU SE BLOCHEAZĂ. Nu știm în ce categorii o cere fiecare furnizor; un refuz
             * al nostru unde ei n-o cer ar opri o vânzare degeaba. Dar omul trebuie să afle ACUM,
             * nu din refuzul lor peste două zile.
             */
            <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-foreground">
                Am salvat, dar mai lipsesc: {lipsuri.join(", ")}. În categoriile unde legea le cere,
                marketplace-ul va refuza publicarea până le completezi.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="lg"
              disabled={salveaza}
              onClick={() => startSave(async () => {
                const res = await saveGpsrConfig(businessId, config);
                if ("error" in res) { toast.error(res.error); return; }
                setLipsuri(res.lipsuri);
                toast.success(res.lipsuri.length === 0
                  ? "Datele de siguranță au fost salvate."
                  : "Salvat. Verifică ce mai lipsește.");
              })}>
              {salveaza ? <><Loader2 className="animate-spin" /> Se salvează…</> : "Salvează datele de siguranță"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
