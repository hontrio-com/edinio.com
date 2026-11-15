"use client";

import { useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BadgeCheck, CreditCard, FlaskConical } from "lucide-react";
import { saveRevolutConfig, disconnectRevolut } from "@/lib/actions/revolut.actions";
import type { RevolutConfigInput } from "@/lib/revolut";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

const DEFAULT_CONFIG: RevolutConfigInput = {
  enabled: false,
  sandbox: true,
  secret_key: "",
  title: "Revolut",
};

export default function RevolutConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: RevolutConfigInput | null;
}) {
  const router = useRouter();
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<RevolutConfigInput>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = (!!initialConfig?.secret_key || secretulEsteSalvat(initialConfig, "secret_key"));

  function set<K extends keyof RevolutConfigInput>(key: K, value: RevolutConfigInput[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if ((!cfg.secret_key.trim() && !secretulEsteSalvat(initialConfig, "secret_key"))) { toast.error("Cheia secretă API este obligatorie."); return; }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveRevolutConfig>>;
      try {
        result = await saveRevolutConfig(businessId, {
          ...cfg,
          secret_key: cfg.secret_key.trim(),
          title: cfg.title.trim() || DEFAULT_CONFIG.title,
        });
      } catch {
        /* ⚠ Scrie configurarea Revolut. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Revolut s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      if (result.warning) toast.warning(result.warning);
      else toast.success("Configurația Revolut a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectRevolut>>;
      try {
        result = await disconnectRevolut(businessId);
      } catch {
        /* ⚠ Actiunea CHEAMA afara, `deleteWebhook` la Revolut, dar cu `.catch(() => {})`:
           esecul lui e inghitit dinadins, ca sa nu opreasca deconectarea, deci nu el
           poate fi cauza unei aruncari. Ce ramane nestiut e doar daca stergerea de la
           noi a apucat sa se scrie. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a sters configurarea "
          + "Revolut. Reimprospateaza pagina si uita-te daca mai apare conectat inainte "
          + "sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Revolut deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "secret_key");
  const stari: StareAntet[] = !isConfigured
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      initialConfig?.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
      initialConfig?.sandbox ? { ton: "asteptare", text: "Mod test" } : { ton: "info", text: "Plăți reale" },
    ];

  return (
    <PaginaIntegrare
      id="revolut"
      titlu="Plăți cu cardul"
      descriere="Clienții plătesc pe pagina securizată Revolut, cu cardul, Apple Pay sau Google Pay."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Revolut la comandă" activ={cfg.enabled} onChange={v => set("enabled", v)} ariaLabel="Activează Revolut" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia secretă API", facut: !!cfg.secret_key.trim() || cheieSalvata },
          { text: "Revolut activ", facut: isConfigured && !!initialConfig?.enabled },
        ]} />
        <CumFunctioneaza id="revolut" puncte={[
          { Icon: CreditCard, text: "Clientul plătește pe pagina Revolut, cu cardul, Apple Pay, Google Pay sau Revolut Pay." },
          { Icon: BadgeCheck, text: "Când Revolut confirmă plata, comanda devine plătită și confirmată." },
          { Icon: FlaskConical, text: "Pe Sandbox plățile nu sunt reale. Treci pe Live când totul merge." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Cheia secretă" descriere="Ai nevoie de un cont Revolut Business cu un cont Merchant activ.">
        <Field label="Cheie secretă API (Merchant)" htmlFor="revolut-cheie"
          ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia secretă API"
            text="În Revolut Business: Merchant, apoi APIs, și generezi cheia secretă (Secret key). O folosim doar pe server, niciodată pe site-ul public." />}>
          <Input id="revolut-cheie" type="password" value={cfg.secret_key} onChange={(e) => set("secret_key", e.target.value)}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "sk_..."} autoComplete="new-password" />
        </Field>
      </Sectiune>

      <Sectiune pas={2} titlu="La comandă" descriere="Cum apare metoda de plată în formularul de comandă. O poți schimba și din Setări, Metode de plată.">
        <Field label="Titlul afișat" htmlFor="revolut-titlu">
          <Input id="revolut-titlu" type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)} placeholder="Revolut" />
        </Field>
      </Sectiune>

      <Sectiune pas={3} titlu="Mediul de lucru" descriere="Folosește întâi o cheie din Sandbox, apoi treci pe Live.">
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
        <ZonaDeconectare descriere="Șterge cheia și webhook-ul de la Revolut. Plățile deja încasate rămân neatinse.">
          <ButonDeconectare
            nume="Revolut"
            cePierzi="Cheia se șterge din Edinio, iar webhook-ul înregistrat la Revolut se șterge și el, deci cumpărătorii nu mai pot plăti prin Revolut. Plățile deja încasate rămân neatinse. Ca să te întorci, ceri din nou cheia secretă din contul tău Revolut."
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
