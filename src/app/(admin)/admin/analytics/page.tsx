import { Suspense } from "react";
import { LineChart, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/admin-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAnalyticsClient } from "@/components/admin/AdminAnalyticsClient";
import { ButonConectareGa4 } from "@/components/admin/ButonConectareGa4";
import { citesteConexiune, tokenDeAcces } from "@/lib/admin-analytics/conexiune";
import { citesteAnalytics, citesteTimpReal } from "@/lib/admin-analytics/rapoarte";
import { ePerioada, type NumePerioada } from "@/lib/admin-analytics/perioade";
import { googleAnalyticsConfigured } from "@/lib/google-analytics/oauth";

export const metadata = { title: "Trafic Edinio" };

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TRAFICUL NOSTRU, NU AL COMERCIANTILOR
  ═══════════════════════════════════════════════════════════════════════════════

  `/admin/statistici` arata afacerea: magazine, venituri, planuri, din baza
  noastra. Pagina asta arata cine ne VIZITEAZA pe noi, din GA4-ul Edinio.

  Cele doua nu se amesteca si nici nu se dubleaza. Iar traficul magazinelor —
  masurat cu GA4-ul fiecarui client — n-are nicio treaba cu niciuna din ele.
*/

function Coaja({ children }: { children: React.ReactNode }) {
  return <div className="p-4 sm:p-8 max-w-7xl mx-auto">{children}</div>;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; ga?: string }>;
}) {
  /* ⚠ Paza pe FIECARE pagina, nu doar in aspect. Vezi nota din layout. */
  await requireAdmin();

  const sp = await searchParams;
  const perioada: NumePerioada = ePerioada(sp.p) ? sp.p : "douazecisiopt";

  return (
    <Coaja>
      {sp.ga && <Raspuns cod={sp.ga} />}
      <Suspense fallback={<Schelet />}>
        <Continut perioada={perioada} />
      </Suspense>
    </Coaja>
  );
}

/** Ce s-a intamplat la intoarcerea de la Google. */
function Raspuns({ cod }: { cod: string }) {
  const mesaje: Record<string, { text: string; bun: boolean }> = {
    gata: { text: "Conectat. Proprietatea a fost gasita si aleasa singura.", bun: true },
    alegeproprietatea: { text: "Conectat, dar contul are mai multe proprietati GA4. Alege-o pe cea a Edinio din Setari platforma.", bun: false },
    faraproprietati: { text: "Contul conectat nu are acces la nicio proprietate GA4.", bun: false },
    farajeton: { text: "Google nu a dat un jeton de reimprospatare. Incearca din nou; daca se repeta, revoca accesul Edinio din contul Google si reconecteaza.", bun: false },
    neautorizat: { text: "Nu esti administrator, sau sesiunea a expirat.", bun: false },
    anulat: { text: "Conectarea a fost anulata.", bun: false },
    eroare: { text: "Google a respins conectarea. Incearca din nou.", bun: false },
  };
  const m = mesaje[cod];
  if (!m) return null;
  return (
    <div className={`mb-6 rounded-2xl border p-4 text-sm ${
      m.bun
        ? "bg-primary/5 border-primary/20 text-foreground"
        : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200"
    }`}>
      {m.text}
    </div>
  );
}

function Schelet() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-48 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[112px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[200px] rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
    </div>
  );
}

function Neconectat({ motiv }: { motiv?: string }) {
  const seePoate = googleAnalyticsConfigured();
  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center max-w-lg mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <LineChart className="h-6 w-6 text-primary" />
      </div>
      <h1 className="text-lg font-bold text-foreground">Traficul Edinio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {motiv ?? "Conecteaza contul Google care are acces la proprietatea GA4 a Edinio. Se citeste doar; nu se scrie nimic in Analytics."}
      </p>

      {seePoate ? (
        <div className="mt-5 flex justify-center"><ButonConectareGa4 /></div>
      ) : (
        <p className="mt-5 inline-flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Aplicatia Google nu e configurata pe server.
        </p>
      )}
    </div>
  );
}

async function Continut({ perioada }: { perioada: NumePerioada }) {
  const conexiune = await citesteConexiune();
  if (!conexiune) return <Neconectat />;

  if (!conexiune.property_id) {
    return (
      <Neconectat motiv="Contul e conectat, dar nu s-a ales inca proprietatea GA4. Contul are mai multe; reconecteaza si alege-o pe cea a Edinio." />
    );
  }

  const token = await tokenDeAcces();
  /*
    ⚠ „RECONECTEAZA", nu „a picat ceva". Un `refresh_token` Google se stinge cand
    omul retrage accesul, isi schimba parola, sau cand aplicatia sta in „Testing"
    si trec sapte zile. E o stare obisnuita, cu o singura rezolvare — deci se
    spune ce e de facut, nu ce a esuat.
  */
  if (!token) {
    return <Neconectat motiv="Legatura cu Google nu mai e valabila. Se intampla cand se retrage accesul sau se schimba parola contului. Reconecteaza." />;
  }

  /*
    ⚠ TIMPUL REAL SE CERE PARALEL, si are voie sa cada singur. E cea mai putin
    importanta cifra din pagina; o eroare acolo n-are voie sa stinga raportul
    pentru care omul a intrat.
  */
  const [date, real] = await Promise.all([
    citesteAnalytics(token, conexiune.property_id, perioada),
    citesteTimpReal(token, conexiune.property_id),
  ]);

  if ("eroare" in date) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Google Analytics nu a raspuns</h2>
            <p className="mt-1 text-sm text-muted-foreground">{date.eroare}</p>
            <div className="mt-3"><ButonConectareGa4 eticheta="Reconecteaza" /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminAnalyticsClient
      date={date}
      perioada={perioada}
      proprietate={{ nume: conexiune.property_name, masurare: conexiune.masurare_id, email: conexiune.email_conectat }}
      timpReal={"eroare" in real ? null : real.activi}
    />
  );
}
