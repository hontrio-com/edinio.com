"use client";

import { useState, useTransition } from "react";
import {
  BLOC_PREGATIRE_PUBLICARE, BUTON_ADU_OFERTELE, BUTON_ADU_OFERTELE_SCURT,
} from "@/lib/emag/etichete";
import { AlertTriangle, CheckCircle, Copy, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { EmagPregatirePublicare } from "@/components/dashboard/EmagPregatirePublicare";
import { SUPPLY_LEAD_TIME_INGADUIT } from "@/lib/emag/mapping";
import {
  aduComenzileAcumEmag, connectEmag, continuaImportEmag, disconnectEmag, importaDinEmag,
  leagaOferteImportateEmag, pornesteSincronizareaTuturor, reiaAbandonateleEmag,
  salveazaSetariEmag, sincronizeazaFelieEmag,
  type StareEmag,
  importaIstoricEmag,
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
              Mai avem de configurat ceva pe partea noastră. Din contul tău nu e nimic de făcut.
              Îți dăm un semn când se poate conecta.
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
      "Ofertele rămân pe eMAG. Le oprești din vânzare separat, din panoul lor. " +
      "Din Edinio se șterg doar legăturile locale.",
    )) return;
    incepe(async () => {
      const r = await disconnectEmag(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Cont eMAG deconectat.");
    });
  }

  function comuta(camp: "auto_sync" | "auto_publish" | "sync_continut" | "emag_club", valoare: boolean) {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, { [camp]: valoare });
      if ("error" in r) toast.error(r.error);
    });
  }

  /*
   * ⚠ Se confirmă înainte: aprinderea schimbă cine conduce prețul pe tot catalogul, iar
   * prețurile pe care omul le-a pus de mână în panoul eMAG vor fi rescrise de ale
   * noastre. E o apăsare cu urmări, nu o preferință de afișare.
   */
  function porneșteToateAutoSync() {
    /* ⚠ `status?.` fiindca ingustarea de mai sus nu trece in inchidere. */
    const cate = status?.oferte.preluate ?? 0;
    if (!window.confirm(
      `Pornești trimiterea automată pentru ${cate} ${cate === 1 ? "ofertă" : "oferte"}?\n\n`
      + "De acum prețul și stocul din Edinio le vor rescrie pe cele puse de tine în panoul eMAG.",
    )) return;
    incepe(async () => {
      const r = await pornesteSincronizareaTuturor(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(
        r.cate === 0
          ? "Nu era nimic de pornit."
          : `Gata: ${r.cate} ${r.cate === 1 ? "ofertă își trimite" : "oferte își trimit"} de acum prețul și stocul.`,
      );
    });
  }

  /* Sursa adevărului la o derivă (§69). Separată de `comuta` fiindcă nu e un
     da/nu: e „cine hotărăște", iar cele două valori sunt amândouă legitime. */
  function alegeSursa(camp: "deriva_pret" | "deriva_stoc", valoare: "edinio" | "emag") {
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
            <div className="text-sm text-amber-900">
            <p>{status.lipsaPentruPublicare}</p>
            {/* ⚠ INDRUMARUL SE POTRIVESTE CU CE LIPSESTE, nu e unul singur pentru tot.
                Mesajul trimitea odata „in setarile integrarii" la doua campuri care nu
                existau nicaieri — un drum infundat, cu publicarea blocata si fara cale
                de iesire. Scris tot asa acum, ar fi trimis in setari dupa butonul de
                import, care nu e acolo. */}
            {status.catalogCitit ? (
              <p className="mt-1 text-xs">
                Le găsești mai jos, la <strong>„{BLOC_PREGATIRE_PUBLICARE}”</strong>.
              </p>
            ) : (
              /* ⚠ NUMELE DE PE BUTON, CUVANT CU CUVANT. Scris „Importa din eMAG”,
                 indrumarul trimitea la un buton care nu exista — a intrebat chiar
                 comerciantul: „nu exista buton cu «Importa din eMag», eu il vad doar
                 pe asta cu «Adu ofertele»”. Exact drumul infundat reparat pe 23.08,
                 facut din nou. */
              <p className="mt-1 text-xs">
                Butonul e mai jos, la{" "}
                <a href="#emag-import" className="font-semibold underline underline-offset-2">
                  „{BUTON_ADU_OFERTELE}”
                </a>
                . Doar citim și legăm, magazinul tău nu se schimbă.
              </p>
            )}
          </div>
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
          <Cifra eticheta="Se vând pe eMAG" valoare={status.oferte.active} />
          <Cifra eticheta="În validare" valoare={status.oferte.inValidare} />
          <Cifra eticheta="De revizuit" valoare={status.oferte.respinse + status.oferte.eroare} />
        </div>

        {/*
          ═══ ⚠ DERIVA STĂ DEASUPRA CELORLALTE, ȘI E COLORATĂ ═══

          E singura problemă care nu se vede din nicio altă cifră: ofertele derivate
          intră la „Se vând pe eMAG" — publicate, aprobate, fără nicio eroare — și se
          vând la alt preț decât crede comerciantul.

          O linie ștearsă printre celelalte ar fi fost citită ca o informație
          tehnică. E o pierdere de bani, în fiecare zi cât ține.
        */}
        {status.oferte.derivate > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">
              {status.oferte.derivate}{" "}
              {status.oferte.derivate === 1
                ? "ofertă are pe eMAG altceva decât trimitem noi"
                : "oferte au pe eMAG altceva decât trimitem noi"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Prețul sau stocul de acolo nu mai e cel din Edinio. Se repară singure la
              următoarele treceri; le vezi una câte una în lista de oferte, la
              „Doar cu probleme”.
            </p>
          </div>
        )}

        {/*
          ═══ ⚠ NU E O NOTĂ DE SUBSOL, E STAREA A 99% DIN CATALOG (24.08.2026) ═══

          Propoziția asta se citea din `status = 'imported'`, o stare de trecere pe care
          reconcilierea o mută în câteva minute. Măsurat: ZERO rânduri acolo, deci nu s-a
          afișat niciodată — tocmai când era adevărată pentru 3.714 din 3.754 de oferte.

          Iar comutatorul de mai jos e pornit și scrie „Când schimbi ceva în magazin,
          pleacă și către eMAG". Cele două se contraziceau, și cea falsă era vizibilă.

          ⚠ Scrisă gri, ca înainte, ar fi trecut neobservată și acum. Pe Trendyol s-a
          văzut ce costă: 29 de listări preluate, o etichetă mică „Preluat" pe rând, și
          comerciantul a aflat dintr-o comandă vândută cu 4 lei sub prețul din magazin.
          Deci: culoare de avertisment, cifra în față, și butonul chiar lângă text.
        */}
        {status.oferte.preluate > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{status.oferte.preluate}</strong>{" "}
                {status.oferte.preluate === 1
                  ? "ofertă nu-și trimite prețul și stocul către eMAG"
                  : "oferte nu-și trimit prețul și stocul către eMAG"}
                . {status.oferte.preluate === 1 ? "E preluată" : "Sunt preluate"} din contul tău, iar
                Edinio nu suprascrie ce ai pus în panoul lor.{" "}
                {status.oferte.total > 0 && status.oferte.preluate * 2 > status.oferte.total && (
                  <>
                    <strong>
                      Asta înseamnă că pentru cea mai mare parte a catalogului prețul de pe eMAG nu
                      e cel din magazin.
                    </strong>{" "}
                  </>
                )}
                Dacă vrei ca Edinio să conducă prețul și stocul, pornește-le de aici, sau una câte
                una din lista de oferte.
              </span>
            </p>
            <button
              type="button"
              onClick={porneșteToateAutoSync}
              disabled={seLucreaza}
              className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-transparent dark:hover:bg-amber-900/30"
            >
              Trimite prețul și stocul și pentru {status.oferte.preluate === 1 ? "ea" : "ele"}
            </button>
          </div>
        )}

        {/*
          ⚠ ABANDONURILE SE VĂD, ȘI SE POT RELUA.
          Înainte se ștergeau: nimeni nu le mai putea număra, iar panoul arăta
          „0 în așteptare" pentru un catalog întreg care nu plecase.
        */}
        {status.abandonate > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>{status.abandonate}</strong>{" "}
              {status.abandonate === 1 ? "modificare s-a oprit" : "modificări s-au oprit"} după cinci
              încercări. Vezi motivul la fiecare produs în lista de mai jos, repară-l, apoi reia.
            </span>
            <button
              type="button"
              disabled={seLucreaza}
              onClick={() =>
                incepe(async () => {
                  const r = await reiaAbandonateleEmag(businessId);
                  if ("error" in r) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(
                    r.reluate === 1 ? "O modificare a fost reluată." : `${r.reluate} modificări au fost reluate.`,
                  );
                })
              }
              className="shrink-0 rounded-lg border border-amber-300 px-2.5 py-1.5 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:hover:bg-amber-900/40"
            >
              Reia-le
            </button>
          </p>
        )}

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
          {/*
            ⚠ ALTĂ ÎNTREBARE DECÂT „trimite automat".
            Aceea e „trimite ceva"; asta e „rescrie și fișa produsului". Mulți
            comercianți își îngrijesc fișa în panoul eMAG — poze mai bune, text scris
            pentru cumpărătorul de acolo — și vor ca Edinio să conducă numai prețul și
            stocul. Fără comutatorul ăsta, prima editare a produsului le-ar fi șters
            munca, iar singura scăpare ar fi fost oprirea sincronizării cu totul.
          */}
          {/*
            ═══ ⚠ IMPLICITUL LOR E „DA", AL NOSTRU E „NU" ═══

            `emag_club` are `default: 1` în schema eMAG. Netrimis, FIECARE produs publicat
            din Edinio ar intra în Genius, cu comisioanele și obligațiile de livrare de
            acolo — fără ca cineva să fi ales asta.

            Măsurat pe un cont adevărat: toate ofertele comerciantului de dinainte au
            `emag_club: 0`. Deci produsele noastre ar fi intrat în Genius pe lângă restul
            catalogului lui, iar el ar fi aflat din decont.

            Se trimite mereu, ca implicitul lor să nu mai hotărască în locul lui.
          */}
          <Comutator
            eticheta="Pune ofertele noi în Genius"
            descriere="Programul eMAG cu livrare rapidă. Are comisioane și obligații de livrare proprii; verifică-le în contractul tău înainte să pornești."
            pornit={status.inGenius}
            dezactivat={seLucreaza}
            laSchimbare={(v) => comuta("emag_club", v)}
          />

          <Comutator
            eticheta="Trimite și fișa produsului"
            descriere="Nume, descriere, poze, caracteristici. Oprit, Edinio trimite doar prețul și stocul, iar fișa rămâne cum ai făcut-o pe eMAG."
            pornit={status.syncContinut}
            dezactivat={seLucreaza}
            laSchimbare={(v) => comuta("sync_continut", v)}
          />
        </div>

        {/*
          ═══ ⚠ DOUĂ ÎNTREBĂRI, NU UNA ═══

          Aproape orice comerciant vrea ca Edinio să țină STOCUL — ăsta e tot rostul
          integrării: un singur inventar, ca să nu vândă de două ori aceeași bucată.

          Dar mulți își țin PREȚUL în panoul eMAG, din campanii și din Smart Deals. Cu
          un singur comutator pentru amândouă, omul ar fi fost pus să aleagă între
          a-și pierde campaniile la fiecare trecere și a-și vinde marfa de două ori.

          ⚠ Comutatoarele astea privesc numai repararea AUTOMATĂ. Când schimbi prețul
          în Edinio, el pleacă spre eMAG oricum — aia e o hotărâre a ta, nu o derivă. Se
          spune pe ecran, ca nimeni să nu creadă că a oprit sincronizarea cu totul.
        */}
        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Când eMAG are altceva decât Edinio</h3>
          <p className="-mt-1 text-xs text-muted-foreground">
            Verificăm periodic ce e pe eMAG față de ce trimitem. Aici spui cine are
            ultimul cuvânt. <strong>Nu se aplică</strong> la modificările făcute de tine în
            magazin: acelea pleacă spre eMAG oricum.
          </p>
          <AlegereSursa
            eticheta="Prețul"
            descriere="Alege «eMAG» dacă îți faci campaniile în panoul lor și nu vrei să ți le suprascriem."
            valoare={status.derivaPret}
            dezactivat={seLucreaza}
            laSchimbare={(v) => alegeSursa("deriva_pret", v)}
          />
          <AlegereSursa
            eticheta="Stocul"
            descriere="Aproape mereu «Edinio»: un singur inventar e chiar rostul integrării."
            valoare={status.derivaStoc}
            dezactivat={seLucreaza}
            laSchimbare={(v) => alegeSursa("deriva_stoc", v)}
          />
        </div>

        {/* ⚠ INAINTEA celorlalte setari: fara astea doua nu se poate publica NIMIC, iar
            restul (rezerva de stoc, taxa verde) sunt reglaje fine peste ceva ce inca
            nu functioneaza. */}
        <EmagPregatirePublicare
          businessId={businessId}
          vatId={status.vatId}
          handlingTime={status.handlingTime}
        />

        <PanouStoculSiTaxa businessId={businessId} status={status} />
      </div>

      <PanouSincronizare businessId={businessId} />

      <PanouNotificari
        url={status.webhookUrl}
        ultimulWebhook={status.ultimulWebhook}
        ultimaSincronizare={status.ultimaSincronizare}
      />

      <PanouIstoric businessId={businessId} />

      {/* ⚠ Ancora e ceruta de indrumarul de sus: fara ea, „butonul e mai jos" ar fi
          fost tot un drum de cautat cu ochii intr-o pagina lunga. */}
      <div id="emag-import" className="scroll-mt-24">
        <PanouImport businessId={businessId} />
      </div>

      <PanouIp ip={status.ipDeAlbit} restrans />
    </div>
  );
}

/**
 * Rezerva de stoc si taxa verde.
 *
 * ⚠ DOUA NUMERE CU DOUA CAPCANE DIFERITE, si amandoua se spun pe ecran.
 *
 * Rezerva: un numar prea mare opreste de la vanzare tot catalogul, TACUT — stocul
 * trimis devine zero, ofertele raman publicate dar nevandabile, si nimic nu da eroare.
 * De aceea scrie ce face, si e marginita la salvare.
 *
 * Taxa verde: INCLUDE TVA, spre deosebire de toate celelalte preturi din integrare.
 * Scrisa fara, ar pleca cu o cincime mai mica — si nimeni n-ar observa, fiindca e o
 * suma mica pe o linie separata.
 */
function PanouStoculSiTaxa({ businessId, status }: { businessId: string; status: StareEmag }) {
  const [rezerva, setRezerva] = useState(String(status.stocRezervat ?? ""));
  const [taxa, setTaxa] = useState(String(status.greenTax ?? ""));
  const [reaprovizionare, setReaprovizionare] = useState(String(status.supplyLeadTime ?? ""));
  const [seSalveaza, incepe] = useTransition();

  function salveaza() {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, {
        stoc_rezervat: rezerva.trim() === "" ? null : Number(rezerva),
        green_tax: taxa.trim() === "" ? null : Number(taxa),
        supply_lead_time: reaprovizionare.trim() === "" ? null : Number(reaprovizionare),
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Salvat.");
    });
  }

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Oprește pentru magazinul tău</span>
          <input
            className={CAMP}
            inputMode="numeric"
            value={rezerva}
            placeholder="0"
            onChange={(e) => setRezerva(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Bucăți scăzute din stocul trimis la eMAG. Cu 2 aici și 10 în depozit, eMAG vede 8.
          </span>
        </label>

        {/*
          ⚠ LISTĂ, NU CÂMP LIBER, ȘI ĂSTA E TOT ROSTUL.

          eMAG îngăduie doar 2, 3, 5, 7, 14, 30, 60, 90 sau 120 de zile — e un enum în
          schema lor. Un câmp liber ar fi lăsat pe cineva să scrie 10, iar eMAG ar fi
          refuzat oferta cu un mesaj despre numele câmpului, nu despre valorile
          îngăduite. Comerciantul ar fi căutat greșeala în altă parte.

          ⚠ „Nu spun" e prima opțiune, și e implicitul. eMAG are propriul lui 14; nu
          i-l suprascriem pe cel pus de om în panoul lor decât dacă chiar alege aici.
        */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Reaprovizionare</span>
          <select
            className={CAMP}
            value={reaprovizionare}
            onChange={(e) => setReaprovizionare(e.target.value)}
          >
            <option value="">Nu spun (eMAG pune 14 zile)</option>
            {SUPPLY_LEAD_TIME_INGADUIT.map((z) => (
              <option key={z} value={String(z)}>{z} zile</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            În câte zile aduci marfa înapoi când se termină. eMAG acceptă doar valorile
            astea.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Taxă verde (lei)</span>
          <input
            className={CAMP}
            inputMode="decimal"
            value={taxa}
            placeholder="0"
            onChange={(e) => setTaxa(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {/* ⚠ Se spune pe ecran, fiindcă e singura sumă din integrare care merge cu TVA. */}
            Doar dacă o cer categoriile tale. <strong>Se scrie cu TVA inclus</strong>, spre
            deosebire de prețuri. Numai pe eMAG România.
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={salveaza}
        disabled={seSalveaza}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
      >
        {seSalveaza && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvează
      </button>
    </div>
  );
}

/**
 * „Sincronizeaza acum", pe felii.
 *
 * ═══ ⚠ DE CE NU UN SINGUR BUTON ═══
 *
 * Fiindca feliile costa foarte diferit, iar omul apasa din motive foarte diferite.
 *
 * „Am schimbat preturile la 400 de produse si vreau sa plece acum" e o cerere de
 * cateva secunde pe ruta usoara. „Retrimite documentatia tuturor produselor" e ruta
 * grea, sute de cereri la 3 pe secunda, si tine ocupat ritmul magazinului minute
 * intregi — inclusiv pentru miscarile de stoc de dupa vanzari.
 *
 * Un singur buton le-ar fi facut pe amandoua de fiecare data. Comerciantul care voia
 * doar preturile ar fi platit costul intreg, n-ar fi stiut de ce dureaza, si a doua
 * oara n-ar mai fi apasat.
 */
function PanouSincronizare({ businessId }: { businessId: string }) {
  const [seLucreaza, incepe] = useTransition();

  function felie(f: "preturi" | "stocuri" | "produse", nume: string) {
    incepe(async () => {
      const r = await sincronizeazaFelieEmag(businessId, f);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.puse === 0
          ? "Nicio ofertă de sincronizat."
          : `${r.puse} ${r.puse === 1 ? "produs pus" : "produse puse"} la rând: ${nume}.`,
      );
    });
  }

  function comenzi() {
    incepe(async () => {
      const r = await aduComenzileAcumEmag(businessId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.noi === 0 && r.actualizate === 0
          ? "Nicio comandă nouă."
          : `${r.noi} comenzi noi, ${r.actualizate} actualizate.`,
      );
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Sincronizează acum</h3>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Totul merge singur, din minut în minut. Butoanele de mai jos sunt pentru când nu
        vrei să aștepți. {/* ⚠ Se spune ca nu e nevoie de ele: un buton care pare
        obligatoriu il face pe om sa-l apese la fiecare schimbare. */}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={comenzi} disabled={seLucreaza}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">
          {seLucreaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Adu comenzile
        </button>
        <button type="button" onClick={() => felie("stocuri", "stocuri")} disabled={seLucreaza}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">
          Trimite stocurile
        </button>
        <button type="button" onClick={() => felie("preturi", "prețuri")} disabled={seLucreaza}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">
          Trimite prețurile
        </button>
        <button type="button" onClick={() => felie("produse", "produse")} disabled={seLucreaza}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          title="Retrimite documentația completă. E trimiterea cea mai grea și poate dura câteva minute.">
          Retrimite produsele
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {/* ⚠ Se spune care e scumpa, ca omul sa aleaga in cunostinta de cauza. */}
        „Retrimite produsele” trimite documentația întreagă și poate dura minute la un
        catalog mare. Ofertele preluate din eMAG nu sunt atinse de niciunul.
      </p>
    </div>
  );
}

/**
 * Adresa la care eMAG poate trimite notificari.
 *
 * ═══ ⚠ SE ARATA TOCMAI FIINDCA NU SE POATE PUNE DIN COD ═══
 *
 * Cautat in tot OpenAPI-ul lor: nu exista nicio ruta care sa primeasca un URL de
 * callback. Notificarile EXISTA — documentatia le enumera: comenzi noi, anulari,
 * retururi si schimbari de stare, statusul AWB, documentatie aprobata — dar adresa
 * se pune din partea lor, la cerere.
 *
 * Fara cartea asta, comerciantul n-ar fi avut de unde sti nici ca notificarile sunt
 * cu putinta, nici ce adresa sa ceara. Iar integrarea ar fi mers la fel de bine, doar
 * cu comenzile intrate la un minut in loc de indata — adica o lipsa pe care nimeni
 * n-ar fi observat-o si nimeni n-ar fi reparat-o.
 */
/**
 * Aduce comenzile vechi din eMAG (§87).
 *
 * ═══ ⚠ SE SPUNE LIMPEDE CE NU FACE ═══
 *
 * Nu scade stoc și nu emite facturi. Un comerciant care tocmai a trecut la Edinio se
 * așteaptă la contrariul — „importă-mi comenzile" sună a „fă tot ce faci de obicei" —
 * iar un stoc ajuns pe minus în câteva secunde, sau facturi duplicate plecate la ANAF
 * cu serii noi, se descoperă mult prea târziu.
 *
 * Textul de aici e singurul loc în care poate afla ÎNAINTE.
 */
function PanouIstoric({ businessId }: { businessId: string }) {
  const [zile, setZile] = useState("30");
  const [rezultat, setRezultat] = useState<{ noi: number; actualizate: number; complet: boolean } | null>(null);
  const [seLucreaza, incepe] = useTransition();

  function adu() {
    if (!window.confirm(
      `Aduc comenzile eMAG din ultimele ${zile} de zile.\n\n`
      + "NU se scade stoc și NU se emit facturi pentru ele, fiindcă au fost deja onorate și\n"
      + "facturate atunci. Intră doar ca istoric, ca să le ai la un loc.",
    )) return;

    incepe(async () => {
      const r = await importaIstoricEmag(businessId, Number(zile));
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setRezultat(r);
      /* ⚠ Se spune și când N-A adus tot. Un „gata, 340 de comenzi" pe un import oprit
         la jumătate l-ar fi lăsat pe om să creadă că are tot istoricul. */
      toast[r.complet ? "success" : "warning"](
        r.complet
          ? `${r.noi} comenzi noi, ${r.actualizate} actualizate.`
          : `${r.noi} comenzi noi, dar nu s-a adus tot. Apasă din nou.`,
      );
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Adu comenzile vechi</h3>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Le vezi în Edinio la un loc cu restul. <strong>Nu se scade stoc și nu se emit
        facturi</strong>, fiindcă au fost onorate și facturate atunci. Repetate, ar da stoc
        pe minus și facturi duplicate.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className={CAMP}
          style={{ width: "auto" }}
          value={zile}
          onChange={(e) => setZile(e.target.value)}
          disabled={seLucreaza}
        >
          <option value="30">Ultimele 30 de zile</option>
          <option value="90">Ultimele 90 de zile</option>
          <option value="180">Ultimele 6 luni</option>
          <option value="365">Ultimul an</option>
        </select>
        <button
          type="button"
          onClick={adu}
          disabled={seLucreaza}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seLucreaza && <Loader2 className="h-4 w-4 animate-spin" />}
          Adu-le
        </button>
      </div>

      {rezultat && (
        <p className="mt-2 text-xs text-muted-foreground">
          {rezultat.noi} noi · {rezultat.actualizate} actualizate
          {!rezultat.complet && " · nu s-a adus tot, mai apasă o dată"}
        </p>
      )}
    </div>
  );
}

function PanouNotificari({
  url, ultimulWebhook, ultimaSincronizare,
}: {
  url: string;
  ultimulWebhook: string | null;
  ultimaSincronizare: string | null;
}) {
  const [copiat, setCopiat] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Comenzi instant (optional)</h3>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Comenzile intra oricum singure, la fiecare minut. Daca vrei sa vina{" "}
        <strong>in aceeasi clipa</strong>, cere-i eMAG-ului sa trimita notificari la
        adresa de mai jos. Nu se poate pune din Edinio, numai ei o pot configura.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopiat(true);
            toast.success("Adresa a fost copiata.");
            setTimeout(() => setCopiat(false), 2000);
          }}
          className="shrink-0 rounded-lg border border-border p-1.5 hover:bg-muted"
          title="Copiaza adresa"
        >
          {copiat ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/*
        ⚠ CELE DOUA MARCAJE RASPUND LA DOUA INTREBARI DIFERITE.
        „Ultima sincronizare" spune daca integrarea traieste. „Ultimul semnal" spune
        daca notificarile chiar au fost pornite de eMAG — intrebare care altfel n-are
        niciun raspuns, fiindca lipsa lor nu strica nimic vizibil: comenzile intra
        oricum, doar mai incet.
      */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Ultima sincronizare:{" "}
          <strong className="text-foreground">
            {ultimaSincronizare
              ? new Date(ultimaSincronizare).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })
              : "încă niciodată"}
          </strong>
        </span>
        <span>
          Ultimul semnal de la eMAG:{" "}
          <strong className="text-foreground">
            {ultimulWebhook
              ? new Date(ultimulWebhook).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })
              : "niciunul, notificările nu sunt pornite"}
          </strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Aducerea ofertelor din contul eMAG.
 *
 * ═══ ⚠ CE SCRIE PE BUTON E O PROMISIUNE, SI SE TINE ═══
 *
 * Scrie „leaga produsele care exista deja" fiindca ASTA face: potrivirea cauta
 * intai dupa `emag_id`, apoi `part_number_key`, apoi codul de bare, apoi SKU, si
 * creeaza produs numai cand nu gaseste nimic. Un buton care ar fi scris doar
 * „Importa" ar fi lasat omul sa creada ca-si dubleaza catalogul, si n-ar fi apasat.
 *
 * ⚠ SE ARATA SI CE N-A MERS, NU DOAR CE A MERS. O oferta pe care n-am putut-o lega
 * nu e o nereusita a comerciantului, dar e singurul lucru pe care numai el il poate
 * limpezi — si daca nu i se spune, nu afla niciodata ca exista. La Trendyol, motivul
 * respingerii n-a fost aratat si produsele au stat „in aprobare" la nesfarsit.
 */
function PanouImport({ businessId }: { businessId: string }) {
  const [seLucreaza, incepe] = useTransition();
  const [raport, setRaport] = useState<RaportAratat | null>(null);
  const [faza, setFaza] = useState<Faza>("gata");
  const [create, setCreate] = useState<{ facute: number; total: number } | null>(null);
  /*
   * ═══ ⚠ NEBIFAT LA DESCHIDERE, SI ASTA E CHIAR HOTARAREA (24.08.2026) ═══
   *
   * Butonul facea doua lucruri deodata: citea ofertele SI transforma in produse noi
   * ce n-avea pereche. Comerciantul a intrebat, inainte sa apese: „nu vreau sa
   * importe produsele din eMAG in magazin”. Intrebarea lui era buna — unele magazine
   * vand pe eMAG lucruri pe care nu le tin in magazinul propriu.
   *
   * Citirea si legarea nu ating magazinul. Crearea il schimba, si nu se desface cu un
   * buton. Deci alegerea implicita e cea care nu strica nimic.
   */
  const [creeaza, setCreeaza] = useState(false);

  function importa() {
    incepe(async () => {
      setRaport(null);
      setCreate(null);
      setFaza("citim");

      const r = await importaDinEmag(businessId, creeaza);
      if ("error" in r) {
        setFaza("gata");
        toast.error(r.error);
        return;
      }

      const problemeInPlus: string[] = [];

      /*
       * ═══ ⚠ CREAREA PRODUSELOR SE DUCE PANA LA CAPAT CHIAR AICI ═══
       *
       * `processImport` lucreaza pe bucati, si dinadins: un catalog mare n-ar incapea
       * intr-o singura chemare. Lasat asa, importul s-ar fi incheiat cu un raport
       * frumos, iar produsele ar fi aparut in magazin peste doua minute, cand le-ar
       * fi prins cronul de rezerva. Comerciantul ar fi vazut „gata" si un catalog
       * gol, si ar fi apasat inca o data.
       *
       * ⚠ Bucla e MARGINITA. Fara plafon, un job care nu se incheie niciodata — o
       * eroare de scriere care se repeta — ar fi tinut fila invartind la nesfarsit.
       * Cand se atinge plafonul se SPUNE, si restul chiar il duce cronul.
       */
      if (r.importId) {
        setFaza("cream");
        for (let pas = 0; pas < PASI_MAXIM; pas++) {
          const p = await continuaImportEmag(businessId, r.importId);
          if ("error" in p) {
            problemeInPlus.push(`Crearea produselor s-a oprit: ${p.error}`);
            break;
          }
          setCreate({ facute: p.facute, total: p.total });
          if (p.gata) break;
          if (pas === PASI_MAXIM - 1) {
            problemeInPlus.push(
              "Ai un catalog mare, iar restul produselor se creează în fundal. " +
              "Poți închide pagina; revino în câteva minute.",
            );
          }
        }
      }

      /*
       * ⚠ Legarea se cheama SI cand crearea s-a oprit la plafon. Ce s-a creat pana
       * atunci merita legat acum; restul il prinde apasarea urmatoare, fiindca pasul
       * e re-derivabil si nu tine minte nimic.
       */
      setFaza("legam");
      const l = await leagaOferteImportateEmag(businessId);
      const legatePeUrma = "error" in l ? 0 : l.legate;
      if ("error" in l) problemeInPlus.push(l.error);

      setRaport({
        legate: r.raport.legate + legatePeUrma,
        deCreat: r.raport.deCreat,
        cunoscute: r.raport.cunoscute,
        nehotarate: r.raport.nehotarate,
        ocupate: r.raport.ocupate,
        disparute: r.raport.disparute,
        probleme: [...r.raport.probleme, ...problemeInPlus],
      });
      setFaza("gata");
      toast.success(r.mesaj);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{BUTON_ADU_OFERTELE}</h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Citim lista produselor tale de pe eMAG și o potrivim cu produsele din
            magazin, după codul de produs, codul de bare sau SKU. Magazinul tău nu se
            modifică: nu se creează și nu se șterge niciun produs.
          </p>
          <p className="mt-2 max-w-prose text-xs text-muted-foreground">
            Fă asta înainte să publici ceva. Altfel nu avem de unde să știm care produse
            sunt deja în contul tău, iar eMAG le refuză pe cele trimise a doua oară.
          </p>
          {/* ⚠ Bifa e SUB text si nebifata: e singurul lucru din panou care schimba
              magazinul, iar magazinul e al lui. */}
          <label className="mt-3 flex max-w-prose items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={creeaza}
              onChange={(e) => setCreeaza(e.target.checked)}
              disabled={seLucreaza}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border"
            />
            <span>
              Creează în magazin și produsele de pe eMAG care nu au pereche la mine
              <span className="block text-[11px] opacity-80">
                Lasă nebifat dacă vrei doar să legăm ce ai deja. Produsele create rămân
                în magazin până le ștergi tu, unul câte unul.
              </span>
            </span>
          </label>
        </div>
        <button
          type="button"
          onClick={importa}
          disabled={seLucreaza}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {seLucreaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {ETICHETA_FAZA[faza]}
        </button>
      </div>

      {faza === "cream" && create && create.total > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          Se creează produsele noi: {create.facute} din {create.total}.
        </p>
      )}

      {raport && (
        <div className="mt-5 border-t border-border pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra eticheta="Legate de produse" valoare={raport.legate} />
            <Cifra eticheta="Produse noi" valoare={raport.deCreat} />
            <Cifra eticheta="Deja cunoscute" valoare={raport.cunoscute} />
            <Cifra eticheta="De lămurit" valoare={raport.nehotarate + raport.ocupate} />
          </div>

          {raport.nehotarate > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              <strong>{raport.nehotarate}</strong>{" "}
              {raport.nehotarate === 1 ? "ofertă se potrivea" : "oferte se potriveau"} cu mai
              multe produse din magazin, așa că nu le-am legat de niciunul. Două produse cu
              același cod de bare sau același SKU sunt cauza obișnuită.
            </p>
          )}
          {raport.ocupate > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>{raport.ocupate}</strong>{" "}
              {raport.ocupate === 1 ? "ofertă s-a potrivit" : "oferte s-au potrivit"} cu un
              produs care e deja legat de altă ofertă eMAG. Un produs poate avea o singură
              ofertă.
            </p>
          )}
          {raport.disparute > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>{raport.disparute}</strong>{" "}
              {raport.disparute === 1 ? "ofertă pe care o știam nu mai vine" : "oferte pe care le știam nu mai vin"}{" "}
              de la eMAG. Nu le-am șters, fiindcă e posibil să fi fost doar refăcute acolo.
            </p>
          )}

          {raport.probleme.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {raport.probleme.slice(0, 8).map((x, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>{x}</span>
                </li>
              ))}
              {raport.probleme.length > 8 && (
                <li className="pl-5.5 text-xs text-muted-foreground">
                  și încă {raport.probleme.length - 8}.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Cate bucati de creare se duc din fila.
 *
 * ⚠ E o MARGINE, nu o limita de catalog. Fiecare bucata ia sute de produse, deci 60
 * acopera cu mult orice magazin real. Rostul ei e sa opreasca o bucla care nu se mai
 * incheie — o scriere care cade la fel de fiecare data — din a tine fila invartind
 * la nesfarsit. Ce ramane il duce cronul de rezerva, si asa i se si spune omului.
 */
const PASI_MAXIM = 60;

type Faza = "gata" | "citim" | "cream" | "legam";

const ETICHETA_FAZA: Record<Faza, string> = {
  gata: BUTON_ADU_OFERTELE_SCURT,
  citim: "Se citește lista de pe eMAG…",
  cream: "Se creează produsele…",
  legam: "Se leagă produsele…",
};

interface RaportAratat {
  legate: number;
  deCreat: number;
  cunoscute: number;
  nehotarate: number;
  ocupate: number;
  disparute: number;
  probleme: string[];
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
          Dacă nu găsești secțiunea, scrie-i managerului tău de cont eMAG. La unele conturi, lista se
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

/**
 * Cine hotărăște la o derivă: Edinio sau eMAG.
 *
 * ⚠ DOUĂ BUTOANE, NU UN COMUTATOR. Un comutator are o stare „pornit" și una
 * „oprit", iar aici amândouă valorile sunt alegeri legitime — „eMAG" nu înseamnă
 * „oprit", înseamnă „ei au dreptate". Arătat ca un comutator stins, comerciantul ar
 * fi crezut că a dezactivat ceva.
 */
function AlegereSursa({
  eticheta, descriere, valoare, dezactivat, laSchimbare,
}: {
  eticheta: string;
  descriere: string;
  valoare: "edinio" | "emag";
  dezactivat: boolean;
  laSchimbare: (v: "edinio" | "emag") => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{eticheta}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{descriere}</p>
      </div>
      <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="group" aria-label={eticheta}>
        {(["edinio", "emag"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => laSchimbare(v)}
            disabled={dezactivat}
            aria-pressed={valoare === v}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
              valoare === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {v === "edinio" ? "Edinio" : "eMAG"}
          </button>
        ))}
      </div>
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
