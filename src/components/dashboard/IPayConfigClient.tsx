"use client";

import { useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BadgeCheck, CreditCard, FlaskConical } from "lucide-react";
import { saveIpayConfig, disconnectIpay } from "@/lib/actions/ipay.actions";
import type { IPayConfig } from "@/lib/ipay";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

const DEFAULT_CONFIG: IPayConfig = {
  enabled: false,
  sandbox: true,
  username: "",
  password: "",
  title: "Card bancar (BT iPay)",
};

export default function IPayConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: IPayConfig | null;
}) {
  const router = useRouter();
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<IPayConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.username && (!!initialConfig?.password || secretulEsteSalvat(initialConfig, "password"));

  function set<K extends keyof IPayConfig>(key: K, value: IPayConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.username.trim()) { toast.error("Utilizatorul API este obligatoriu."); return; }
    if ((!cfg.password.trim() && !secretulEsteSalvat(initialConfig, "password"))) { toast.error("Parola API este obligatorie."); return; }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveIpayConfig>>;
      try {
        result = await saveIpayConfig(businessId, { ...cfg, username: cfg.username.trim(), password: cfg.password, title: cfg.title.trim() || DEFAULT_CONFIG.title });
      } catch {
        /* ⚠ Scrie configurarea BT iPay. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea BT iPay s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configurația BT iPay a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectIpay>>;
      try {
        result = await disconnectIpay(businessId);
      } catch {
        /* ⚠ `disconnectIpay` scrie DOAR la noi: nu vorbeste cu BT iPay. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Pagina se reincarca: uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la BT iPay nu s-a atins nimic.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("BT iPay deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const stari: StareAntet[] = !isConfigured
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      initialConfig?.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
      initialConfig?.sandbox ? { ton: "asteptare", text: "Mod test" } : { ton: "info", text: "Plăți reale" },
    ];

  return (
    <PaginaIntegrare
      id="ipay"
      titlu="Plăți cu cardul"
      descriere="Clienții plătesc online cu cardul, prin BT iPay de la Banca Transilvania."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Plata cu cardul la comandă" activ={cfg.enabled} onChange={v => set("enabled", v)} ariaLabel="Activează BT iPay" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Utilizatorul API", facut: !!cfg.username.trim() },
          { text: "Parola API", facut: !!cfg.password.trim() || parolaSalvata },
          { text: "Plata cu cardul activă", facut: isConfigured && !!initialConfig?.enabled },
        ]} />
        <CumFunctioneaza id="ipay" puncte={[
          { Icon: CreditCard, text: "Clientul alege plata cu cardul și plătește pe pagina securizată BT iPay." },
          { Icon: BadgeCheck, text: "Când banca confirmă plata, comanda devine plătită și confirmată." },
          { Icon: FlaskConical, text: "Pe Sandbox plățile nu sunt reale: folosești cardurile de test date de bancă." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Datele de acces" descriere="Utilizatorul și parola API primite de la Banca Transilvania la crearea comerciantului iPay.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator API" htmlFor="ipay-user"
            ajutor={<ExplicatieCard marime="mic" intrebare="Ce se scrie aici" eticheta="Utilizator API"
              text="Perechea utilizator și parolă API vine de la bancă și e diferită de datele cu care intri în consola iPay." />}>
            <Input id="ipay-user" type="text" value={cfg.username} onChange={(e) => set("username", e.target.value)}
              placeholder="Utilizatorul API iPay" autoComplete="off" />
          </Field>
          <Field label="Parola API" htmlFor="ipay-parola">
            <Input id="ipay-parola" type="password" value={cfg.password} onChange={(e) => set("password", e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="La comandă" descriere="Cum apare metoda de plată în formularul de comandă. O poți schimba și din Setări, Metode de plată.">
        <Field label="Titlul afișat" htmlFor="ipay-titlu">
          <Input id="ipay-titlu" type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)} placeholder="Card bancar (BT iPay)" />
        </Field>
      </Sectiune>

      <Sectiune pas={3} titlu="Mediul de lucru" descriere="Începe pe Sandbox, cu datele de test de la bancă, apoi treci pe real.">
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={cfg.sandbox}
          onChange={v => set("sandbox", v)}
          optiuni={[
            { valoare: true, titlu: "Test (Sandbox)", text: "Plățile nu sunt reale. Pentru probe.", avertizare: true },
            { valoare: false, titlu: "Real (Live)", text: "Clienții plătesc cu adevărat." },
          ]}
        />
      </Sectiune>

      {isConfigured && (
        <ZonaDeconectare descriere="Șterge datele de acces BT iPay. Plățile deja încasate rămân neatinse.">
          <ButonDeconectare
            nume="BT iPay"
            cePierzi="Cheile se șterg din Edinio și cumpărătorii nu mai pot plăti cu cardul prin BT iPay. Plățile deja încasate rămân neatinse. Ca să te întorci, ceri din nou utilizatorul și parola din contul tău BT iPay."
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
