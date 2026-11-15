"use client";

import { useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BadgeCheck, CreditCard, FlaskConical, Info } from "lucide-react";
import { saveNetopiaConfig, disconnectNetopia } from "@/lib/actions/netopia.actions";
import type { NetopiaConfig } from "@/lib/netopia";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare,
  useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

const DEFAULT_CONFIG: NetopiaConfig = {
  enabled: false,
  sandbox: true,
  pos_signature: "",
  title: "Card online (Netopia)",
  api_key: "",
  badge_html: "",
};

export default function NetopiaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: NetopiaConfig | null;
}) {
  const router = useRouter();
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<NetopiaConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = (!!initialConfig?.pos_signature || secretulEsteSalvat(initialConfig, "pos_signature")) && (!!initialConfig?.api_key || secretulEsteSalvat(initialConfig, "api_key"));

  function set<K extends keyof NetopiaConfig>(key: K, value: NetopiaConfig[K]) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  function save() {
    if ((!cfg.pos_signature.trim() && !secretulEsteSalvat(initialConfig, "pos_signature"))) {
      toast.error("POS Signature este obligatoriu.");
      return;
    }
    if ((!cfg.api_key.trim() && !secretulEsteSalvat(initialConfig, "api_key"))) {
      toast.error("API Key este obligatoriu.");
      return;
    }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveNetopiaConfig>>;
      try {
        result = await saveNetopiaConfig(businessId, cfg);
      } catch {
        /* ⚠ Scrie configurarea Netopia. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Netopia s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configurația Netopia a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectNetopia>>;
      try {
        result = await disconnectNetopia(businessId);
      } catch {
        /* ⚠ `disconnectNetopia` scrie DOAR la noi: nu vorbeste cu Netopia. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Pagina se reincarca: uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la Netopia nu s-a atins nimic.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Netopia deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  const posSalvat = secretulEsteSalvat(initialConfig, "pos_signature");
  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const stari: StareAntet[] = !isConfigured
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      initialConfig?.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
      initialConfig?.sandbox ? { ton: "asteptare", text: "Mod test" } : { ton: "info", text: "Plăți reale" },
    ];

  return (
    <PaginaIntegrare
      id="netopia"
      titlu="Plăți cu cardul"
      descriere="Clienții plătesc online cu cardul, pe pagina securizată Netopia Payments."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Plata cu cardul la comandă" activ={cfg.enabled} onChange={(v) => set("enabled", v)} ariaLabel="Activează Netopia Payments" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "POS Signature", facut: !!cfg.pos_signature.trim() || posSalvat },
          { text: "API Key", facut: !!cfg.api_key.trim() || cheieSalvata },
          { text: "Plata cu cardul activă", facut: isConfigured && !!initialConfig?.enabled },
        ]} />
        <CumFunctioneaza id="netopia" puncte={[
          { Icon: CreditCard, text: "Clientul alege plata cu cardul și plătește pe pagina securizată Netopia." },
          { Icon: BadgeCheck, text: "Când Netopia confirmă plata, comanda devine plătită și confirmată." },
          { Icon: FlaskConical, text: "În modul de test plățile nu sunt reale: îl folosești doar pentru probe." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Datele de acces" descriere="Din contul tău de comerciant, pe admin.netopia-payments.com.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="POS Signature" htmlFor="netopia-pos"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="POS Signature"
              text="Puncte de vânzare, alegi punctul de vânzare, apoi Setări tehnice: câmpul Signature, de forma XXXX-XXXX-XXXX-XXXX." />}>
            <Input id="netopia-pos" type="text" value={cfg.pos_signature} onChange={e => set("pos_signature", e.target.value)}
              placeholder={posSalvat ? PLACEHOLDER_SECRET_SALVAT : "XXXX-XXXX-XXXX-XXXX"} />
          </Field>
          <Field label="API Key" htmlFor="netopia-key"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="API Key"
              text="Apasă pe numele contului (sus), apoi Profil, apoi Securitate, și generează un API Key. Nu e în Setări tehnice." />}>
            <Input id="netopia-key" type="password" value={cfg.api_key} onChange={e => set("api_key", e.target.value)}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" />
          </Field>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Cheia publică și cheia privată din Setări tehnice sunt pentru vechea integrare Netopia și nu sunt necesare aici.</span>
        </p>
      </Sectiune>

      <Sectiune pas={2} titlu="La comandă" descriere="Cum apare metoda de plată în formularul de comandă.">
        <Field label="Titlul afișat" htmlFor="netopia-titlu">
          <Input id="netopia-titlu" type="text" value={cfg.title} onChange={e => set("title", e.target.value)} placeholder="Card online (Netopia)" />
        </Field>
      </Sectiune>

      <Sectiune pas={3} titlu="Sigla Netopia în subsolul magazinului" descriere="Obligatorie când accepți plata cu cardul. După ce lipești codul, sigla apare singură în subsolul magazinului.">
        <Field label="Codul HTML/IFRAME de la Netopia" htmlFor="netopia-sigla"
          ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Codul siglei Netopia"
            text="În contul Netopia: Identitate Vizuală, alegi platforma HTML/IFRAME, apoi punctul de vânzare, și copiezi codul generat. Alte formate (Script, React, Angular) nu se afișează." />}>
          <Textarea id="netopia-sigla" value={cfg.badge_html ?? ""} onChange={e => set("badge_html", e.target.value)}
            placeholder={'<iframe src="https://netopia-payments.com/..."></iframe>'} rows={3} className="resize-y font-mono text-xs" />
        </Field>
      </Sectiune>

      <Sectiune pas={4} titlu="Mediul de lucru">
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={cfg.sandbox}
          onChange={(v) => set("sandbox", v)}
          optiuni={[
            { valoare: true, titlu: "Test (Sandbox)", text: "Plățile nu sunt reale. Pentru probe.", avertizare: true },
            { valoare: false, titlu: "Real (Live)", text: "Clienții plătesc cu adevărat." },
          ]}
        />
      </Sectiune>

      {isConfigured && (
        <ZonaDeconectare descriere="Șterge datele de acces Netopia. Plățile deja încasate rămân neatinse.">
          <ButonDeconectare
            nume="Netopia"
            cePierzi="Semnătura POS și cheia API se șterg din Edinio, iar cumpărătorii nu mai pot plăti cu cardul prin Netopia. Plățile deja încasate rămân neatinse. Ca să te întorci, le ceri din nou din contul tău Netopia."
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
