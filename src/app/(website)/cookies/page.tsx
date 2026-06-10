import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica cookies | Edinio",
  description:
    "Informații despre cookie-urile și tehnologiile similare utilizate pe platforma Edinio.",
  alternates: { canonical: "https://www.edinio.com/cookies" },
};

export default function CookiesPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Politica cookies
      </h1>
      <p className="text-sm text-muted-foreground mb-12">
        Ultima actualizare: 30 mai 2026
      </p>

      <div className="prose prose-gray max-w-none space-y-10 text-foreground/90 leading-relaxed">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            1. Ce sunt cookie-urile?
          </h2>
          <p>
            Cookie-urile sunt fișiere text de mici dimensiuni care sunt stocate
            pe dispozitivul dumneavoastră (computer, telefon, tabletă) atunci
            când vizitați un site web. Cookie-urile permit site-ului să vă
            recunoască dispozitivul și să rețină informații despre vizita
            dumneavoastră (preferințe de limbă, sesiune de autentificare etc.).
          </p>
          <p className="mt-3">
            Pe lângă cookie-uri, utilizăm și alte tehnologii similare de
            stocare locală, cum ar fi localStorage, care funcționează în mod
            asemănător și sunt supuse acelorași reguli.
          </p>
          <p className="mt-3">
            Prezenta politică este elaborată în conformitate cu Art. 4 alin.
            (5) și (6) din Legea nr. 506/2004 privind prelucrarea datelor cu
            caracter personal și protecția vieții private în sectorul
            comunicațiilor electronice, modificată prin OUG 13/2012 și Legea
            235/2015, precum și cu Directiva ePrivacy 2002/58/CE.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Tipuri de cookie-uri utilizate
          </h2>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            2.1. Cookie-uri strict necesare
          </h3>
          <p>
            Aceste cookie-uri sunt esențiale pentru funcționarea Platformei și
            nu pot fi dezactivate. Ele sunt setate ca răspuns la acțiunile
            dumneavoastră care constituie o cerere de servicii, cum ar fi
            autentificarea sau completarea unui formular. Sunt exceptate de la
            cerința consimțământului conform Art. 4 alin. (6) din Legea
            506/2004.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Scop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Durata</th>
                  <th className="text-left py-2 font-semibold">Furnizor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">sb-*-auth-token</td>
                  <td className="py-2 pr-4">Menținerea sesiunii de autentificare (JWT)</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Supabase</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                  <td className="py-2 pr-4">Verificare PKCE pentru autentificare securizată</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Supabase</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">mfa_pending</td>
                  <td className="py-2 pr-4">Indicarea procesului de verificare în doi factori în curs</td>
                  <td className="py-2 pr-4">10 minute</td>
                  <td className="py-2">Edinio</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            2.2. Cookie-uri funcționale
          </h3>
          <p>
            Aceste cookie-uri permit funcționarea unor caracteristici care
            îmbunătățesc experiența de utilizare, dar nu sunt strict necesare.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie / stocare</th>
                  <th className="text-left py-2 pr-4 font-semibold">Scop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Durata</th>
                  <th className="text-left py-2 font-semibold">Furnizor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">onboarding_done</td>
                  <td className="py-2 pr-4">Marcarea finalizării procesului de configurare</td>
                  <td className="py-2 pr-4">30 zile</td>
                  <td className="py-2">Edinio</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">onboarding_draft_v2 (localStorage)</td>
                  <td className="py-2 pr-4">Salvarea automată a formularului de configurare</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Edinio</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">cart_&#123;slug&#125; (localStorage)</td>
                  <td className="py-2 pr-4">Păstrarea produselor adăugate în coșul de cumpărături</td>
                  <td className="py-2 pr-4">Persistent</td>
                  <td className="py-2">Edinio</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            2.3. Cookie-uri de analiză și performanță
          </h3>
          <p>
            Aceste cookie-uri ne ajută să înțelegem cum este utilizată
            Platforma, permițându-ne să îmbunătățim funcționalitățile și
            experiența utilizatorilor.
          </p>
          <p className="mt-3">
            <strong>Important:</strong> Cookie-urile de analiză de la Google
            Analytics și Google Tag Manager sunt utilizate exclusiv pe
            magazinele create de Utilizatori, doar dacă proprietarul
            magazinului le-a configurat. Platforma Edinio (edinio.com) nu
            utilizează cookie-uri de analiză ale unor terți.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Scop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Durata</th>
                  <th className="text-left py-2 font-semibold">Furnizor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">_ga, _ga_*</td>
                  <td className="py-2 pr-4">Identificare vizitatori unici și analiză trafic</td>
                  <td className="py-2 pr-4">2 ani</td>
                  <td className="py-2">Google Analytics</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">_gid</td>
                  <td className="py-2 pr-4">Identificare vizitatori pe parcursul unei zile</td>
                  <td className="py-2 pr-4">24 ore</td>
                  <td className="py-2">Google Analytics</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            2.4. Cookie-uri de marketing și publicitate
          </h3>
          <p>
            Aceste cookie-uri sunt utilizate pentru a afișa reclame relevante
            și pentru a măsura eficiența campaniilor publicitare. La fel ca
            cele de analiză, sunt active exclusiv pe magazinele Utilizatorilor
            care le-au configurat.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Scop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Durata</th>
                  <th className="text-left py-2 font-semibold">Furnizor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">_fbp</td>
                  <td className="py-2 pr-4">Identificare vizitatori pentru remarketing Facebook</td>
                  <td className="py-2 pr-4">3 luni</td>
                  <td className="py-2">Meta (Facebook)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">_fbc</td>
                  <td className="py-2 pr-4">Atribuirea conversiilor din reclame Facebook</td>
                  <td className="py-2 pr-4">3 luni</td>
                  <td className="py-2">Meta (Facebook)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">_ttp</td>
                  <td className="py-2 pr-4">Măsurarea eficienței reclamelor TikTok</td>
                  <td className="py-2 pr-4">13 luni</td>
                  <td className="py-2">TikTok</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            3. Consimțământul pentru cookie-uri
          </h2>
          <p>
            În conformitate cu legislația în vigoare:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Cookie-urile strict necesare</strong> (secțiunea 2.1) nu
              necesită consimțământul dumneavoastră, deoarece sunt esențiale
              pentru funcționarea serviciului pe care l-ați solicitat (Art. 4
              alin. 6 din Legea 506/2004).
            </li>
            <li>
              <strong>Toate celelalte cookie-uri</strong> (funcționale, analiză,
              marketing) necesită consimțământul dumneavoastră prealabil
              înainte de a fi setate pe dispozitiv.
            </li>
          </ul>
          <p className="mt-3">
            Consimțământul este solicitat prin intermediul unui banner de
            cookie-uri la prima vizită. Aveți posibilitatea de a accepta sau
            refuza fiecare categorie de cookie-uri. Opțiunile
            &quot;Acceptă toate&quot; și &quot;Refuză toate&quot; sunt
            prezentate cu aceeași vizibilitate și accesibilitate.
          </p>
          <p className="mt-3">
            Retragerea consimțământului este la fel de simplă ca acordarea lui,
            în conformitate cu cerințele legale. Puteți modifica preferințele
            în orice moment.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Cum gestionați cookie-urile?
          </h2>
          <p>
            Pe lângă opțiunile oferite de bannerul nostru de cookie-uri, puteți
            gestiona cookie-urile direct din setările browserului
            dumneavoastră:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Google Chrome:</strong> Setări &rarr; Confidențialitate
              și securitate &rarr; Cookie-uri și alte date de site
            </li>
            <li>
              <strong>Mozilla Firefox:</strong> Setări &rarr;
              Confidențialitate și securitate &rarr; Cookie-uri și date de
              site
            </li>
            <li>
              <strong>Safari:</strong> Preferințe &rarr; Confidențialitate
              &rarr; Gestionare date site web
            </li>
            <li>
              <strong>Microsoft Edge:</strong> Setări &rarr; Cookie-uri și
              permisiuni site
            </li>
          </ul>
          <p className="mt-3">
            <strong>Atenție:</strong> Ștergerea sau blocarea cookie-urilor
            strict necesare poate afecta funcționarea Platformei. De exemplu,
            fără cookie-urile de autentificare, nu vă veți putea autentifica
            în cont.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            4.1. Ștergerea datelor din localStorage
          </h3>
          <p>
            Datele stocate în localStorage (coș de cumpărături, ciorne
            formulare) pot fi șterse din setările browserului, secțiunea
            &quot;Date site&quot; sau &quot;Stocare&quot;, disponibilă în
            instrumentele pentru dezvoltatori (F12).
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Cookie-uri pe magazinele Utilizatorilor
          </h2>
          <p>
            Magazinele online create prin Platforma Edinio pot utiliza
            cookie-uri suplimentare configurate de proprietarii acestora,
            inclusiv:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Google Analytics / Google Tag Manager</li>
            <li>Facebook Pixel (Meta)</li>
            <li>TikTok Pixel</li>
          </ul>
          <p className="mt-3">
            Responsabilitatea pentru informarea vizitatorilor și obținerea
            consimțământului pentru aceste cookie-uri revine proprietarului
            magazinului, în calitate de operator de date, conform Art. 4 alin.
            (5) din Legea 506/2004 și Art. 13-14 din GDPR.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Modificări ale politicii
          </h2>
          <p>
            Această Politică cookies poate fi actualizată periodic pentru a
            reflecta modificări în practicile noastre sau în legislația
            aplicabilă. Data ultimei actualizări este afișată la începutul
            paginii.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact
          </h2>
          <p>
            Pentru întrebări legate de utilizarea cookie-urilor, ne puteți
            contacta la:
          </p>
          <ul className="mt-3 space-y-1">
            <li>Email:{" "}
              <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
                contact@edinio.com
              </a>
            </li>
            <li>Telefon:{" "}
              <a href="tel:+40750456809" className="text-primary hover:underline">
                0750 456 809
              </a>
            </li>
          </ul>
          <p className="mt-3 text-sm">
            Consultați și{" "}
            <Link href="/confidentialitate" className="text-primary hover:underline">
              Politica de confidențialitate
            </Link>{" "}
            și{" "}
            <Link href="/gdpr" className="text-primary hover:underline">
              Drepturile GDPR
            </Link>{" "}
            pentru informații complete.
          </p>
        </section>
      </div>
    </article>
  );
}
