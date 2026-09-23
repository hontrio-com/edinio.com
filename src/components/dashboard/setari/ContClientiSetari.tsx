"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Globe, Info, Lock, ShoppingBag, UserRoundCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { salveazaContClientConfig, type StareaConturilor } from "@/lib/actions/cont-client.actions";
import {
  AFISARI_BUTON, BUGET_MINIM_OBLIGATORIU, ETICHETA_IMPLICITA, ICONITE_CONT, LIMITE,
  type AfisareButon, type ContClientConfig,
} from "@/lib/cont/config";
import { ICONITA_CONT } from "@/components/storefront/cont/iconite-cont";

/**
 * Fila „Conturi clienți" din Setări.
 *
 * ⚠ Sta intr-un fisier al ei, nu in `SettingsClient.tsx`, care are peste 3000 de
 * randuri. Textele sunt ale PANOULUI, deci cu diacritice (spre deosebire de
 * ecranele vitrinei, H6).
 *
 * ⚠ Toate schimbarile se strang intr-o ciorna si pleaca O DATA, la „Salvează":
 * salvarea pe fiecare camp trimitea obiecte partiale si pierdea ce nu se trimitea.
 * ⚠ Refuzurile adevarate (domeniu, contul obligatoriu, plafonul) sunt pe server;
 * ecranul doar le arata inainte.
 */

const ETICHETE_AFISARE: Record<AfisareButon, { titlu: string; desc: string }> = {
  iconita: { titlu: "Doar iconiță", desc: "Discret, lângă coș." },
  text: { titlu: "Doar text", desc: "Pe telefon apare iconița, textul nu încape." },
  iconita_text: { titlu: "Iconiță și text", desc: "Cel mai ușor de găsit." },
};

function Card({ titlu, descriere, icon: Icon, children, stins = false }: {
  titlu: string; descriere?: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; stins?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${stins ? "opacity-60" : ""}`} aria-disabled={stins || undefined}>
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
            <Icon className="h-[18px] w-[18px] text-foreground" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{titlu}</h3>
          {descriere && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{descriere}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function PrevizualizareButon({ c, magazin }: { c: ContClientConfig; magazin: string }) {
  const Icon = ICONITA_CONT[c.buton_iconita];
  const text = c.buton_text || ETICHETA_IMPLICITA;
  return (
    <div className="rounded-lg border border-border bg-background">
      <p className="border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previzualizare antet</p>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="truncate text-sm font-bold text-foreground">{magazin}</span>
        <div className="flex items-center gap-2">
          {c.buton_antet ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground">
              {c.buton_afisare !== "text" && <Icon className="h-4 w-4" />}
              {c.buton_afisare !== "iconita" && <span>{text}</span>}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Butonul e ascuns</span>
          )}
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-border">
            <ShoppingBag className="h-4 w-4 text-foreground" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function ContClientiSetari({ businessId, initial }: { businessId: string; initial: StareaConturilor }) {
  const [stare, setStare] = useState(initial);
  const [ciorna, setCiorna] = useState<ContClientConfig>(initial.config);
  const [asteapta, setAsteapta] = useState(false);
  const [eroare, setEroare] = useState("");
  const [salvat, setSalvat] = useState(false);

  const modificat = useMemo(() => JSON.stringify(ciorna) !== JSON.stringify(stare.config), [ciorna, stare.config]);
  const schimba = (s: Partial<ContClientConfig>) => {
    setSalvat(false);
    setCiorna((c) => {
      const nou = { ...c, ...s };
      /* Obligatoriu nu poate ramane fara conturi pornite (si serverul il stinge). */
      if (!nou.enabled) nou.obligatoriu = false;
      return nou;
    });
  };

  async function salveaza() {
    setAsteapta(true);
    setEroare("");
    setSalvat(false);
    try {
      const r = await salveazaContClientConfig(businessId, ciorna);
      if ("error" in r) {
        setEroare(r.error);
        return;
      }
      setStare((s) => ({ ...s, config: r.config }));
      setCiorna(r.config);
      setSalvat(true);
    } catch {
      /* ⚠ Nu stim daca s-a scris: raspunsul s-a pierdut pe drum. */
      setEroare("Nu am primit răspuns și nu știm dacă s-a salvat. Reîncarcă pagina ca să vezi ce e scris.");
    } finally {
      setAsteapta(false);
    }
  }

  const aprinse = ciorna.enabled;
  const poateObligatoriu = aprinse && (stare.intrariRecente > 0 || stare.config.obligatoriu);
  const magazin = stare.domeniu ?? "Magazinul tău";

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Conturi pentru clienți</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Cumpărătorii își pot face cont pe magazinul tău, cu e-mail și parolă; contul nou se confirmă cu un cod primit pe e-mail. În cont își
          văd comenzile cu toate detaliile, facturile, retururile și datele. Tu alegi dacă, pentru a comanda, contul
          e opțional sau obligatoriu.
        </p>
      </div>

      {/*
        ⚠ Cerut de proprietar: se spune limpede, INAINTE de apasare, ca optiunea
        cere domeniu propriu. Pe `edinio.com/<magazin>` toate vitrinele impart o
        origine, iar acolo un cont nu se poate apara.
      */}
      {!stare.poate ? (
        <Callout variant="warning" icon={Globe} title="Ai nevoie de un domeniu propriu">
          <p>{stare.motiv}</p>
          <p className="mt-1.5">
            Conturile de client funcționează doar pe domeniul magazinului tău (de exemplu magazinul-tau.ro), nu pe adresa
            edinio.com.{" "}
            <Link href="/dashboard/settings?sectiune=domeniu" className="font-medium underline underline-offset-2">
              Conectează un domeniu
            </Link>
          </p>
        </Callout>
      ) : (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Conturile funcționează doar pe domeniul tău, {stare.domeniu}. Pe adresa edinio.com a magazinului nu apar.
        </p>
      )}

      <Card titlu="Permite conturi de client" icon={UserRoundCheck}
        descriere={stare.cateConturi > 0
          ? `${stare.cateConturi} ${stare.cateConturi === 1 ? "client are" : "clienți au"} deja cont. Dacă oprești opțiunea, datele rămân, dar clienții nu mai pot intra.`
          : "Niciun client nu are cont încă. Dacă oprești opțiunea, datele rămân, dar clienții nu mai pot intra."}>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-foreground">{aprinse ? "Pornit" : "Oprit"}</span>
          <Switch
            checked={aprinse}
            disabled={!stare.poate && !aprinse}
            onCheckedChange={(v) => schimba({ enabled: v })}
            aria-label="Permite conturi de client"
          />
        </label>
      </Card>

      <Card titlu="Contul, la comandă" icon={Lock} stins={!aprinse}
        descriere="Alegi dacă un client trebuie să intre în cont ca să poată trimite o comandă.">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Contul la comandă">
          {([
            { v: false, titlu: "Opțional", desc: "Oricine poate comanda și fără cont. Recomandat." },
            { v: true, titlu: "Obligatoriu", desc: "Clientul intră în cont (e-mail și parolă) înainte să trimită comanda." },
          ] as const).map((o) => {
            const ales = ciorna.obligatoriu === o.v;
            const blocat = !aprinse || (o.v && !poateObligatoriu);
            return (
              <label key={String(o.v)} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-all ${
                ales ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"} ${blocat ? "pointer-events-none" : ""}`}>
                <input type="radio" name="cont-obligatoriu" className="mt-0.5 shrink-0 accent-primary" checked={ales}
                  disabled={blocat} onChange={() => schimba({ obligatoriu: o.v })} />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{o.titlu}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{o.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
        {aprinse && !poateObligatoriu && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Ca să poți face contul obligatoriu, creează-ți o dată un cont de client pe {stare.domeniu ?? "domeniul tău"}/cont
            (contul nou se confirmă cu un cod pe e-mail). Așa știm sigur că e-mailurile ajung, înainte ca vânzările să depindă de ele.
          </p>
        )}
        {ciorna.obligatoriu && (
          <Callout variant="warning" icon={AlertTriangle} title="Ce înseamnă contul obligatoriu" className="mt-3">
            <ul className="list-disc space-y-1 pl-4">
              <li>Fiecare comandă cere un cont cu e-mail și parolă; contul nou se confirmă cu un cod pe e-mail. Clienții fără e-mail nu mai pot comanda.</li>
              <li>Coșul, datele completate și cuponul rămân pe loc cât timp clientul intră în cont.</li>
              <li>Dacă domeniul tău nu răspunde sau se termină plafonul zilnic de coduri, comenzile merg mai departe fără cont, ca să nu pierzi vânzări.</li>
              <li>Comenzile de pe marketplace-uri nu sunt atinse.</li>
            </ul>
          </Callout>
        )}
      </Card>

      <Card titlu="Codul pe e-mail, la intrare" icon={Lock} stins={!aprinse}
        descriere="Clienții intră cu e-mail și parolă. Contul nou se confirmă întotdeauna cu un cod pe e-mail; aici alegi când se mai cere codul la intrare.">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Codul pe e-mail la intrare">
          {([
            { v: "dispozitiv_nou", titlu: "Doar pe un dispozitiv nou", desc: "Codul se cere pe un browser pe care clientul nu l-a mai confirmat în ultimele 60 de zile. Recomandat." },
            { v: "mereu", titlu: "La fiecare intrare", desc: "Parola și, de fiecare dată, un cod pe e-mail. Mai sigur, dar mai lent și consumă mai multe coduri." },
          ] as const).map((o) => {
            const ales = ciorna.verificare_intrare === o.v;
            return (
              <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-all ${
                ales ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"} ${!aprinse ? "pointer-events-none" : ""}`}>
                <input type="radio" name="cont-verificare-intrare" className="mt-0.5 shrink-0 accent-primary" checked={ales}
                  disabled={!aprinse} onChange={() => schimba({ verificare_intrare: o.v })} />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{o.titlu}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{o.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Parola se păstrează doar ca amprentă criptografică. După 5 încercări greșite în 15 minute, intrarea se oprește temporar; clientul își poate reseta oricând parola cu un cod pe e-mail.
        </p>
      </Card>

      <Card titlu="Butonul „Contul meu” din antet" icon={UserRoundCheck} stins={!aprinse}
        descriere="Apare în antetul magazinului, lângă coș, doar cât timp conturile sunt pornite.">
        <div className="space-y-5">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-foreground">Arată butonul în antet</span>
            <Switch checked={ciorna.buton_antet} disabled={!aprinse} onCheckedChange={(v) => schimba({ buton_antet: v })}
              aria-label="Arată butonul în antet" />
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Cum arată</p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cum arată butonul">
              {AFISARI_BUTON.map((a) => {
                const ales = ciorna.buton_afisare === a;
                return (
                  <label key={a} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-all ${
                    ales ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                    <input type="radio" name="buton-afisare" className="mt-0.5 shrink-0 accent-primary" checked={ales}
                      disabled={!aprinse || !ciorna.buton_antet} onChange={() => schimba({ buton_afisare: a })} />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{ETICHETE_AFISARE[a].titlu}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{ETICHETE_AFISARE[a].desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Iconița</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ICONITE_CONT.map((k) => {
                const Icon = ICONITA_CONT[k];
                const ales = ciorna.buton_iconita === k;
                return (
                  <button key={k} type="button" aria-pressed={ales} aria-label={`Iconița ${k}`}
                    disabled={!aprinse || !ciorna.buton_antet || ciorna.buton_afisare === "text"}
                    onClick={() => schimba({ buton_iconita: k })}
                    className={`grid h-11 place-items-center rounded-lg border-2 transition-all disabled:opacity-50 ${
                      ales ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                    <Icon className="h-5 w-5 text-foreground" />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Textul butonului</span>
            <input
              type="text"
              value={ciorna.buton_text}
              maxLength={LIMITE.buton_text}
              placeholder={ETICHETA_IMPLICITA}
              disabled={!aprinse || !ciorna.buton_antet || ciorna.buton_afisare === "iconita"}
              onChange={(e) => schimba({ buton_text: e.target.value })}
              className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {ciorna.buton_text.length}/{LIMITE.buton_text}. Gol înseamnă „{ETICHETA_IMPLICITA}”. Cititoarele de ecran îl anunță și când se vede doar iconița.
            </span>
          </label>

          <PrevizualizareButon c={ciorna} magazin={magazin} />
        </div>
      </Card>

      <Card titlu="Pagina de intrare în cont" icon={Info} stins={!aprinse}
        descriere="Textele din stânga formularului de intrare. Lasă gol pentru textele implicite.">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Titlu</span>
            <input type="text" value={ciorna.intrare_titlu} maxLength={LIMITE.intrare_titlu} disabled={!aprinse}
              placeholder="Comenzile tale, într-un singur loc"
              onChange={(e) => schimba({ intrare_titlu: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Text</span>
            <textarea value={ciorna.intrare_text} maxLength={LIMITE.intrare_text} rows={3} disabled={!aprinse}
              placeholder="Intri cu emailul și parola ta. Comenzile făcute cu aceeași adresă apar singure."
              onChange={(e) => schimba({ intrare_text: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50" />
            <span className="mt-1 block text-[11px] text-muted-foreground">{ciorna.intrare_text.length}/{LIMITE.intrare_text}</span>
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-foreground">Arată lista de avantaje (comenzi, facturi, urmărire, date)</span>
            <Switch checked={ciorna.intrare_avantaje} disabled={!aprinse} onCheckedChange={(v) => schimba({ intrare_avantaje: v })}
              aria-label="Arată lista de avantaje" />
          </label>
        </div>
      </Card>

      <Card titlu="Câte coduri pe zi" icon={Lock} stins={!aprinse}
        descriere="Codurile pe e-mail confirmă conturile noi, resetările de parolă și intrările de pe dispozitive noi. Plafonul zilnic este ce stă între un străin și cota ta de trimitere.">
        <label className="block">
          <span className="text-xs text-muted-foreground">Coduri pe e-mail / zi</span>
          <input type="number" min={0} max={LIMITE.buget} value={ciorna.buget_email_zilnic} disabled={!aprinse}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              schimba({ buget_email_zilnic: Number.isFinite(v) ? v : 0 });
            }}
            className="mt-1 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50" />
        </label>
        {ciorna.obligatoriu && ciorna.buget_email_zilnic < BUGET_MINIM_OBLIGATORIU && (
          <p className="mt-2 text-xs text-destructive">Cu contul obligatoriu, plafonul trebuie să fie de cel puțin {BUGET_MINIM_OBLIGATORIU}.</p>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur">
        {eroare && <p role="alert" className="mr-auto text-sm text-destructive">{eroare}</p>}
        {!eroare && salvat && !modificat && <p className="mr-auto text-sm text-muted-foreground">Salvat.</p>}
        {!eroare && modificat && <p className="mr-auto text-sm text-muted-foreground">Ai modificări nesalvate.</p>}
        <button type="button" disabled={!modificat || asteapta}
          onClick={() => { setCiorna(stare.config); setEroare(""); }}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50">
          Renunță
        </button>
        <button type="button" disabled={!modificat || asteapta} onClick={salveaza}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {asteapta ? "Se salvează..." : "Salvează"}
        </button>
      </div>
    </div>
  );
}
