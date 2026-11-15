"use client";

import { useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarClock, FlaskConical } from "lucide-react";
import { saveKlarnaConfig, disconnectKlarna } from "@/lib/actions/klarna.actions";
import type { KlarnaConfig } from "@/lib/klarna";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

const DEFAULT_CONFIG: KlarnaConfig = {
  enabled: false,
  sandbox: true,
  username: "",
  password: "",
  title: "Klarna",
};

export default function KlarnaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: KlarnaConfig | null;
}) {
  const router = useRouter();
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<KlarnaConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.username && (!!initialConfig?.password || secretulEsteSalvat(initialConfig, "password"));

  function set<K extends keyof KlarnaConfig>(key: K, value: KlarnaConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.username.trim()) { toast.error("Utilizatorul API este obligatoriu."); return; }
    if ((!cfg.password.trim() && !secretulEsteSalvat(initialConfig, "password"))) { toast.error("Parola API este obligatorie."); return; }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveKlarnaConfig>>;
      try {
        result = await saveKlarnaConfig(businessId, {
          ...cfg,
          username: cfg.username.trim(),
          password: cfg.password.trim(),
          title: cfg.title.trim() || DEFAULT_CONFIG.title,
        });
      } catch {
        /* ⚠ Scrie configurarea Klarna. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Klarna s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configurația Klarna a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectKlarna>>;
      try {
        result = await disconnectKlarna(businessId);
      } catch {
        /* ⚠ `disconnectKlarna` scrie DOAR la noi: nu vorbeste cu Klarna. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Pagina se reincarca: uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la Klarna nu s-a atins nimic.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Klarna deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const stari: StareAntet[] = !isConfigured
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      initialConfig?.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
      initialConfig?.sandbox ? { ton: "asteptare", text: "Playground" } : { ton: "info", text: "Plăți reale" },
    ];

  return (
    <PaginaIntegrare
      id="klarna"
      titlu="Cumpără acum, plătește mai târziu"
      descriere="Clienții plătesc prin Klarna: mai târziu sau în rate, iar tu primești banii de la Klarna."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Klarna la comandă" activ={cfg.enabled} onChange={v => set("enabled", v)} ariaLabel="Activează Klarna" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Utilizatorul API", facut: !!cfg.username.trim() },
          { text: "Parola API", facut: !!cfg.password.trim() || parolaSalvata },
          { text: "Klarna activă", facut: isConfigured && !!initialConfig?.enabled },
        ]} />
        <CumFunctioneaza id="klarna" puncte={[
          { Icon: CalendarClock, text: "Clientul alege Klarna la comandă și plătește mai târziu sau în rate, la Klarna." },
          { Icon: BadgeCheck, text: "Când Klarna confirmă plata, comanda devine plătită și confirmată." },
          { Icon: FlaskConical, text: "Pe Playground plățile nu sunt reale: simulezi clientul cu persoanele de test Klarna." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Datele de acces" descriere="Din Klarna Merchant Portal: Settings, API credentials, Generate new API credentials.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator API" htmlFor="klarna-user"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Utilizator API"
              text="În Klarna Merchant Portal: Settings, apoi API credentials, apoi Generate new API credentials. Primești o pereche utilizator și parolă." />}>
            <Input id="klarna-user" type="text" value={cfg.username} onChange={(e) => set("username", e.target.value)}
              placeholder="Utilizatorul API Klarna" autoComplete="off" />
          </Field>
          <Field label="Parola API" htmlFor="klarna-parola">
            <Input id="klarna-parola" type="password" value={cfg.password} onChange={(e) => set("password", e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="La comandă" descriere="Cum apare metoda de plată în formularul de comandă. O poți schimba și din Setări, Metode de plată.">
        <Field label="Titlul afișat" htmlFor="klarna-titlu">
          <Input id="klarna-titlu" type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)} placeholder="Klarna" />
        </Field>
      </Sectiune>

      <Sectiune pas={3} titlu="Mediul de lucru" descriere="Începe pe Playground, cu datele de test Klarna, apoi treci pe real.">
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={cfg.sandbox}
          onChange={v => set("sandbox", v)}
          optiuni={[
            { valoare: true, titlu: "Test (Playground)", text: "Plățile nu sunt reale. Pentru probe.", avertizare: true },
            { valoare: false, titlu: "Real (Live)", text: "Clienții plătesc cu adevărat." },
          ]}
        />
      </Sectiune>

      {isConfigured && (
        <ZonaDeconectare descriere="Șterge datele de acces Klarna. Plățile deja încasate rămân neatinse.">
          <ButonDeconectare
            nume="Klarna"
            cePierzi="Cheile se șterg din Edinio și cumpărătorii nu mai pot plăti prin Klarna. Plățile deja încasate rămân neatinse. Ca să te întorci, ceri din nou utilizatorul și parola din contul tău Klarna."
            pending={disconnecting}
            marime="default"
            onConfirma={disconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
