"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle, Copy, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  connectEmag, disconnectEmag, salveazaSetariEmag, type StareEmag,
} from "@/lib/actions/emag.actions";

/**
 * Cardul de conectare la eMAG Marketplace.
 *
 * ⚠ ARE UN PRERECHIZIT PE CARE CELELALTE INTEGRARI NU-L AU: adresa IP.
 *
 * eMAG accepta apeluri numai de la adrese IP declarate in prealabil de vanzator.
 * Fara pasul asta, comerciantul completeaza corect utilizatorul si parola, apasa
 * „Conecteaza", si primeste un refuz care NU pomeneste nimic despre IP-uri. Ar
 * cauta o zi intreaga o greseala in acreditari.
 *
 * De aceea IP-ul se arata INAINTE de formular, cu buton de copiere, si cu drumul
 * exact prin panoul lor.
 *
 * ⚠ Parola nu se intoarce niciodata din server. Se primeste doar o forma mascata
 * si un boolean; campul gol la salvare inseamna „nu o schimba".
 */

const TARI: { valoare: "ro" | "bg" | "hu"; eticheta: string }[] = [
  { valoare: "ro", eticheta: "eMAG România" },
  { valoare: "bg", eticheta: "eMAG Bulgaria" },
  { valoare: "hu", eticheta: "eMAG Ungaria" },
];

const CAMP =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function EmagClient({ businessId, status }: { businessId: string; status: StareEmag | null }) {
  const [username, setUsername] = useState(status?.username ?? "");
  const [password, setPassword] = useState("");
  const [tara, setTara] = useState<"ro" | "bg" | "hu">(status?.tara ?? "ro");
  const [vendorName, setVendorName] = useState("");
  const [seLucreaza, incepe] = useTransition();

  if (!status) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Nu am putut citi starea integrării. Reîncarcă pagina.
        </p>
      </div>
    );
  }

  if (!status.globallyEnabled) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Integrarea eMAG este momentan indisponibilă. Revenim cu un anunț.
        </p>
      </div>
    );
  }

  /*
   * ⚠ Fara releul cu IP fix, integrarea nu poate porni pentru NIMENI. E o problema
   * de platforma, nu a comerciantului, deci i se spune asa: fara pasi de urmat si
   * fara sa para ca a gresit el ceva.
   */
  if (!status.iesireConfigurata) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Integrarea nu este încă pregătită</p>
            <p className="mt-1 text-sm text-amber-800">
              Mai avem de configurat ceva pe partea noastră. Nu e nimic de făcut din contul tău —
              revenim cu un anunț când se poate conecta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function conecteaza() {
    incepe(async () => {
      const r = await connectEmag(businessId, { username, password, tara, vendorName });
      if ("error" in r) { toast.error(r.error); return; }
      setPassword("");
      toast.success("Cont eMAG conectat.");
    });
  }

  function deconecteaza() {
    if (!window.confirm(
      "Sigur deconectezi contul eMAG?\n\n" +
      "Ofertele rămân pe eMAG — le oprești din vânzare separat, din panoul lor. " +
      "Din Edinio se șterg doar legăturile locale.",
    )) return;
    incepe(async () => {
      const r = await disconnectEmag(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Cont eMAG deconectat.");
    });
  }

  function comuta(camp: "auto_sync" | "auto_publish", valoare: boolean) {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, { [camp]: valoare });
      if ("error" in r) toast.error(r.error);
    });
  }

  /* ── Neconectat ─────────────────────────────────────────────────────────── */
  if (!status.connected) {
    return (
      <div className="space-y-4">
        <PanouIp ip={status.ipDeAlbit} />

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">Conectează contul eMAG</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ai nevoie de un utilizator cu drept de API, din contul tău de vânzător eMAG.
            Nu e același cu userul cu care intri în panou.
          </p>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Utilizator API</label>
              <input
                className={`${CAMP} font-mono`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                placeholder="ex. api_magazinultau"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Parolă API</label>
              <input
                className={`${CAMP} font-mono`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                placeholder={status.parolaMascata ? "•••••••• (salvată)" : ""}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Țara contului</label>
              <select className={CAMP} value={tara} onChange={(e) => setTara(e.target.value as "ro" | "bg" | "hu")}>
                {TARI.map((t) => <option key={t.valoare} value={t.valoare}>{t.eticheta}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Fiecare țară e un cont separat la eMAG, cu acreditări proprii.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Numele firmei <span className="font-normal text-muted-foreground">(opțional)</span>
              </label>
              <input
                className={CAMP}
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={conecteaza}
            disabled={seLucreaza}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {seLucreaza && <Loader2 className="h-4 w-4 animate-spin" />}
            Conectează și testează
          </button>
        </div>
      </div>
    );
  }

  /* ── Conectat ───────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {status.needsReconnect && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">eMAG a refuzat acreditările</p>
              <p className="mt-1">
                S-a schimbat parola, i s-a scos dreptul de API, sau adresa noastră IP nu mai e în
                lista albă din contul tău. Verifică-le și reconectează.
              </p>
            </div>
          </div>
        </div>
      )}

      {status.lipsaPentruPublicare && !status.needsReconnect && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">{status.lipsaPentruPublicare}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-base font-semibold">Cont conectat</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                {status.taraEticheta}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {status.username} · parolă {status.parolaMascata} · {status.moneda}
            </p>
          </div>
          <button
            type="button"
            onClick={deconecteaza}
            disabled={seLucreaza}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            Deconectează
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Cifra eticheta="Oferte" valoare={status.oferte.total} />
          <Cifra eticheta="Active" valoare={status.oferte.active} />
          <Cifra eticheta="În validare" valoare={status.oferte.inValidare} />
          <Cifra eticheta="De revizuit" valoare={status.oferte.respinse + status.oferte.eroare} />
        </div>

        {status.inCoada > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {status.inCoada} {status.inCoada === 1 ? "modificare așteaptă" : "modificări așteaptă"} să plece către eMAG.
          </p>
        )}

        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <Comutator
            eticheta="Trimite automat prețul și stocul"
            descriere="Când schimbi ceva în magazin, pleacă și către eMAG."
            pornit={status.autoSync}
            dezactivat={seLucreaza}
            laSchimbare={(v) => comuta("auto_sync", v)}
          />
          <Comutator
            eticheta="Publică automat produsele noi"
            descriere="Un produs nou pleacă singur pe eMAG, dacă are categoria mapată."
            pornit={status.autoPublish}
            dezactivat={seLucreaza}
            laSchimbare={(v) => comuta("auto_publish", v)}
          />
        </div>
      </div>

      <PanouIp ip={status.ipDeAlbit} restrans />
    </div>
  );
}

/**
 * Prerechizitul care nu exista la nicio alta integrare.
 *
 * ⚠ Se arata SI dupa conectare, restrans: daca eMAG incepe brusc sa refuze, primul
 * lucru de verificat e ca IP-ul e inca in lista lor alba. Ascuns dupa conectare,
 * comerciantul n-ar mai avea de unde sa-l ia.
 */
function PanouIp({ ip, restrans = false }: { ip: string | null; restrans?: boolean }) {
  if (!ip) return null;

  return (
    <div className={`rounded-xl border border-border bg-muted/40 ${restrans ? "p-4" : "p-6"}`}>
      <h3 className="text-sm font-semibold">
        {restrans ? "Adresa IP a Edinio" : "Înainte de conectare: adaugă adresa noastră IP"}
      </h3>

      {!restrans && (
        <p className="mt-1 text-sm text-muted-foreground">
          eMAG acceptă cereri doar de la adrese IP anunțate dinainte. Fără pasul ăsta, conectarea
          e refuzată chiar dacă utilizatorul și parola sunt corecte.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <code className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm">{ip}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(ip);
            toast.success("Adresă copiată.");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiază
        </button>
      </div>

      {!restrans && (
        <p className="mt-3 text-xs text-muted-foreground">
          În panoul eMAG: <span className="font-medium">Contul meu → Setări API → adrese IP permise</span>.
          Dacă nu găsești secțiunea, scrie-i managerului tău de cont eMAG — la unele conturi lista se
          completează de ei.
        </p>
      )}
    </div>
  );
}

function Cifra({ eticheta, valoare }: { eticheta: string; valoare: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="text-lg font-semibold tabular-nums">{valoare}</div>
      <div className="text-xs text-muted-foreground">{eticheta}</div>
    </div>
  );
}

function Comutator({
  eticheta, descriere, pornit, dezactivat, laSchimbare,
}: {
  eticheta: string;
  descriere: string;
  pornit: boolean;
  dezactivat: boolean;
  laSchimbare: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={pornit}
        disabled={dezactivat}
        onChange={(e) => laSchimbare(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-primary"
      />
      <span>
        <span className="block text-sm font-medium">{eticheta}</span>
        <span className="block text-xs text-muted-foreground">{descriere}</span>
      </span>
    </label>
  );
}
