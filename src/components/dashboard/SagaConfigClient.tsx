"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookCheck, CheckCircle, Clock, ExternalLink, FileUp, KeyRound, Loader2, RefreshCw, RotateCcw, ShieldCheck,
} from "lucide-react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { saveSagaConfig, disconnectSaga, testSagaConfig } from "@/lib/actions/saga.actions";
import { NUME_CLIENT_GENERIC, configCuImplicite, type ClientiPersoaneFizice, type SagaConfig } from "@/lib/saga/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune,
  ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

/**
 * Configurarea SAGA Web. Scheletul e cel comun al paginilor de integrari (`PaginaIntegrare`).
 *
 * ⚠ Cheia de acces soseste MASCATA (goala, cu `_completate`): orice hotarare pe ea trece prin
 * `secretulEsteSalvat`, nu prin valoarea din formular (lectia `credentiale-write-only-mascare`).
 *
 * ⚠ „Testează conexiunea" NU salveaza si NU probeaza o cheie NOUA: SAGA poate schimba cheia la
 * fiecare apel, iar o cheie schimbata la o proba fara salvare s-ar pierde. Cheia noua se verifica
 * la „Salvează", care o si pastreaza (vezi `saveSagaConfig`). Butonul probeaza cheia salvata.
 */
export function SagaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: SagaConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);

  const implicit = configCuImplicite(initialConfig);
  const { cfg: form, setCfg: setForm, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<SagaConfig>({
    ...implicit,
    api_key: "",
    nume_client_generic: implicit.nume_client_generic || NUME_CLIENT_GENERIC,
  });

  function set<K extends keyof SagaConfig>(field: K, value: SagaConfig[K]) {
    /* Orice schimbare a contului face proba de dinainte invechita. */
    if (field === "api_key" || field === "cod_fiscal") setTested(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const cheieNoua = !!form.api_key.trim();
  const areCheia = cheieNoua || cheieSalvata;
  const isActive = !!(initialConfig?.enabled && cheieSalvata && initialConfig?.cod_fiscal);

  async function handleTest() {
    if (!form.cod_fiscal.trim()) {
      toast.error("Completează codul fiscal al firmei, exact ca în SAGA.");
      return;
    }
    if (cheieNoua) {
      toast.info("Cheia nouă se verifică la salvare: apasă „Salvează”. Salvarea face proba și păstrează cheia.", { duration: 8000 });
      return;
    }
    setTesting(true);
    let r: Awaited<ReturnType<typeof testSagaConfig>>;
    try {
      r = await testSagaConfig(businessId, { api_key: "", cod_fiscal: form.cod_fiscal });
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
      return;
    } finally {
      setTesting(false);
    }
    if ("error" in r) {
      toast.error(r.error, { duration: 10000 });
      return;
    }
    setTested(true);
    toast.success("SAGA a acceptat cheia de acces și codul fiscal.");
  }

  async function handleSave() {
    if (!form.cod_fiscal.trim()) {
      toast.error("Codul fiscal al firmei este obligatoriu.");
      return;
    }
    if (!areCheia) {
      toast.error("Cheia de acces SAGA este obligatorie.");
      return;
    }
    setSaving(true);
    let r: Awaited<ReturnType<typeof saveSagaConfig>>;
    try {
      r = await saveSagaConfig(businessId, { ...form, enabled: true });
    } catch {
      toast.error("Nu am primit răspuns de la server. Verifică dacă setările s-au salvat, apoi încearcă din nou.");
      return;
    } finally {
      setSaving(false);
    }
    if ("error" in r) {
      toast.error(r.error, { duration: 10000 });
      return;
    }
    if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
    else toast.success(isActive ? "Setările SAGA au fost salvate." : "SAGA e conectat. Documentele pot pleca în contabilitate din comenzi.");
    /* Cheia tastata nu ramane in formular: dupa salvare apare ca „salvat". */
    marcheazaSalvat({ ...form, enabled: true, api_key: "" });
    if (cheieNoua) setTested(true);
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    let r: Awaited<ReturnType<typeof disconnectSaga>>;
    try {
      r = await disconnectSaga(businessId);
    } catch {
      toast.error("Nu am primit răspuns de la server. Verifică dacă SAGA s-a deconectat, apoi încearcă din nou.");
      return;
    } finally {
      setDisconnecting(false);
    }
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("SAGA a fost deconectat.");
    marcheazaSalvat({ ...form, enabled: false, api_key: "", cod_fiscal: "", trimitere_automata: false });
    setTested(false);
    router.refresh();
  }

  const stari: StareAntet[] = isActive
    ? [
      { ton: "bun", text: "Activă" },
      { ton: "info", text: initialConfig?.trimitere_automata ? "Trimitere automată" : "Trimitere manuală" },
    ]
    : [{ ton: "neutru", text: "Neconfigurată" }];

  return (
    <PaginaIntegrare
      id="saga"
      titlu="Contabilitate"
      descriere="Trimiți în SAGA facturile și stornările deja emise, ca să nu le mai introducă nimeni de mână."
      stari={stari}
      aside={<>
        {isActive && (
          <CardCifre titlu="Firma legată" randuri={[
            { eticheta: "Cod fiscal", valoare: <span className="font-mono">{initialConfig?.cod_fiscal}</span> },
            { eticheta: "Documentele", valoare: initialConfig?.import_automat ? "Import automat" : "Le verifică contabilul" },
            { eticheta: "Stornările", valoare: initialConfig?.trimite_stornari === false ? "Nu pleacă" : "Pleacă" },
            { eticheta: "Trimiterea automată", valoare: initialConfig?.trimitere_automata ? "Pornită" : "Oprită" },
          ]} />
        )}
        <ListaConfigurare pasi={[
          { text: "Codul fiscal al firmei", facut: !!form.cod_fiscal.trim() },
          { text: "Cheia de acces", facut: areCheia },
          { text: "Exportul activ", facut: isActive },
        ]} />
        <CumFunctioneaza id="saga" puncte={[
          { Icon: KeyRound, text: "În SAGA Web, cu un utilizator Admin: Utilizatori, Integrare API, „Generează cheie de acces”." },
          { Icon: FileUp, text: "Trimiți din pagina comenzii, în lot din lista de comenzi, sau automat, la fiecare 30 de minute." },
          { Icon: BookCheck, text: "Factura intră la Ieșiri, cu liniile, cotele de TVA și totalul documentului emis." },
          { Icon: RotateCcw, text: "Stornarea pleacă și ea, cu semn schimbat. Un document trimis nu mai pleacă a doua oară." },
          { Icon: ShieldCheck, text: "SAGA schimbă uneori cheia de acces; Edinio o păstrează singur pe cea nouă." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul SAGA" descriere="Codul fiscal al firmei din SAGA și cheia de acces generată acolo.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cod fiscal firmă" htmlFor="saga-cod-fiscal" required
            ajutor={<ExplicatieCard marime="mic" intrebare="Cum îl scriu" eticheta="Codul fiscal"
              text="Exact cum apare firma în SAGA (cu sau fără RO). SAGA identifică firma după el, iar factura intră la Ieșiri numai când e chiar codul firmei." />}>
            <Input id="saga-cod-fiscal" type="text" autoComplete="off" value={form.cod_fiscal}
              onChange={(e) => set("cod_fiscal", e.target.value)} placeholder="ex: RO12345678" className="font-mono" />
          </Field>
          <Field label="Cheie de acces" htmlFor="saga-cheie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia de acces"
              text="În SAGA Web, cu un utilizator de tip Admin: Utilizatori, Integrare API, „Generează cheie de acces”. SAGA o schimbă uneori la răspunsuri; Edinio păstrează singur cheia nouă, deci n-o folosi în alt program în paralel." />}>
            <Input id="saga-cheie" type="password" value={form.api_key} onChange={(e) => set("api_key", e.target.value.trim())}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} className="font-mono" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !cheieSalvata || cheieNoua || !form.cod_fiscal.trim()}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          {cheieNoua && (
            <span className="text-xs text-muted-foreground">Cheia nouă se verifică la salvare și se păstrează odată cu ea.</span>
          )}
          <a href="https://web.sagasoft.ro/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide SAGA Web <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Cum intră documentele" descriere="Cine finalizează importul în SAGA.">
        <AlegereCarduri<boolean>
          eticheta="Cum intră documentele în SAGA"
          valoare={form.import_automat}
          onChange={(v) => set("import_automat", v)}
          optiuni={[
            {
              valoare: false,
              titlu: "Le verifică contabilul",
              text: "Fișierele ajung în SAGA Web la Diverse, Import date, iar contabilul le verifică și finalizează importul.",
            },
            {
              valoare: true,
              titlu: "Import automat",
              text: "SAGA importă documentul pe loc și răspunde cu raportul, pe care îl vezi în pagina comenzii.",
            },
          ]}
        />
      </Sectiune>

      <Sectiune pas={3} titlu="Ce documente pleacă" descriere="Facturile pleacă mereu; documentele de test nu pleacă niciodată.">
        <RandComutator
          titlu="Trimite și stornările"
          text="Stornarea pleacă în SAGA cu liniile facturii și semn schimbat. Oprită, stornările le introduce contabilul."
          activ={form.trimite_stornari}
          onChange={(v) => set("trimite_stornari", v)}
        />
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Clienții persoane fizice</p>
          <AlegereCarduri<ClientiPersoaneFizice>
            eticheta="Clienții persoane fizice"
            valoare={form.clienti_pf}
            onChange={(v) => set("clienti_pf", v)}
            optiuni={[
              { valoare: "fiecare", titlu: "Fiecare cu numele lui", text: "Ca pe factură: numele și adresa cumpărătorului." },
              { valoare: "generic", titlu: "Un singur client", text: "Toate pe un client generic, ca SAGA să nu creeze câte un partener pentru fiecare cumpărător." },
            ]}
          />
          {form.clienti_pf === "generic" && (
            <Field label="Numele clientului generic" htmlFor="saga-client-generic" hint="Exact ca în SAGA, dacă există deja.">
              <Input id="saga-client-generic" type="text" autoComplete="off" value={form.nume_client_generic ?? ""}
                onChange={(e) => set("nume_client_generic", e.target.value)} placeholder={NUME_CLIENT_GENERIC} />
            </Field>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={4} titlu="Trimiterea automată" descriere="Documentele noi pleacă singure, fără să mai apeși nimic.">
        <RandComutator
          titlu="Trimite automat documentele noi"
          text="La fiecare 30 de minute pleacă documentele emise din Edinio după pornire, din ultimele 10 zile. Pe cele mai vechi le trimiți tu, din comenzi (pagina comenzii îți spune care nu mai pleacă singure), ca să nu intre de două ori."
          activ={form.trimitere_automata}
          onChange={(v) => set("trimitere_automata", v)}
        />
        {form.trimitere_automata && (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            Un document respins de SAGA nu se mai trimite singur: îl vezi, cu raportul SAGA, în pagina comenzii.
          </p>
        )}
      </Sectiune>

      <Sectiune pas={5} titlu="Fiscal și gestiune" descriere="Doar dacă firma are TVA la încasare sau ține stocul în SAGA.">
        <RandComutator
          titlu="Firma aplică TVA la încasare"
          text="Facturile intră în SAGA marcate cu TVA la încasare."
          activ={form.tva_la_incasare}
          onChange={(v) => set("tva_la_incasare", v)}
        />
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Cod gestiune" htmlFor="saga-gestiune" hint="Gol = fără gestiune (evidență global-valorică).">
            <Input id="saga-gestiune" type="text" autoComplete="off" value={form.gestiune ?? ""}
              onChange={(e) => set("gestiune", e.target.value.trim())} className="font-mono" />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Produsele se leagă de articolele din SAGA după codul SKU din Edinio. Un produs fără SKU apare pe factură doar cu numele.
        </p>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheia din Edinio. Documentele deja trimise rămân în SAGA.">
          <ButonDeconectare
            nume="SAGA"
            cePierzi="Cheia de acces se șterge din Edinio și documentele nu mai pleacă în SAGA, nici automat, nici din comenzi. Documentele deja trimise rămân în SAGA. Ca să te întorci, generezi o cheie nouă în SAGA Web și o salvezi aici."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      {/* Salvarea ACTIVEAZA (`enabled: true`), deci pana la prima salvare bara sta mereu acolo. */}
      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={saving}
        onSalveaza={handleSave}
        onRenunta={isActive ? () => { renunta(); setTested(false); } : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
