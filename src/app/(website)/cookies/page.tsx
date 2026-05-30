import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica cookies | Edinio",
  description:
    "Informatii despre cookie-urile si tehnologiile similare utilizate pe platforma Edinio.",
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
            Cookie-urile sunt fisiere text de mici dimensiuni care sunt stocate
            pe dispozitivul dumneavoastra (computer, telefon, tableta) atunci
            cand vizitati un site web. Cookie-urile permit site-ului sa va
            recunoasca dispozitivul si sa retina informatii despre vizita
            dumneavoastra (preferinte de limba, sesiune de autentificare etc.).
          </p>
          <p className="mt-3">
            Pe langa cookie-uri, utilizam si alte tehnologii similare de
            stocare locala, cum ar fi localStorage, care functioneaza in mod
            asemanator si sunt supuse acelorasi reguli.
          </p>
          <p className="mt-3">
            Prezenta politica este elaborata in conformitate cu Art. 4 alin.
            (5) si (6) din Legea nr. 506/2004 privind prelucrarea datelor cu
            caracter personal si protectia vietii private in sectorul
            comunicatiilor electronice, modificata prin OUG 13/2012 si Legea
            235/2015, precum si cu Directiva ePrivacy 2002/58/CE.
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
            Aceste cookie-uri sunt esentiale pentru functionarea Platformei si
            nu pot fi dezactivate. Ele sunt setate ca raspuns la actiunile
            dumneavoastra care constituie o cerere de servicii, cum ar fi
            autentificarea sau completarea unui formular. Sunt exceptate de la
            cerinta consimtamantului conform Art. 4 alin. (6) din Legea
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
                  <td className="py-2 pr-4">Mentinerea sesiunii de autentificare (JWT)</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Supabase</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                  <td className="py-2 pr-4">Verificare PKCE pentru autentificare securizata</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Supabase</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">mfa_pending</td>
                  <td className="py-2 pr-4">Indicarea procesului de verificare in doi factori in curs</td>
                  <td className="py-2 pr-4">10 minute</td>
                  <td className="py-2">Edinio</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            2.2. Cookie-uri functionale
          </h3>
          <p>
            Aceste cookie-uri permit functionarea unor caracteristici care
            imbunatatesc experienta de utilizare, dar nu sunt strict necesare.
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
                  <td className="py-2 pr-4">Marcarea finalizarii procesului de configurare</td>
                  <td className="py-2 pr-4">30 zile</td>
                  <td className="py-2">Edinio</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">onboarding_draft_v2 (localStorage)</td>
                  <td className="py-2 pr-4">Salvarea automata a formularului de configurare</td>
                  <td className="py-2 pr-4">Sesiune</td>
                  <td className="py-2">Edinio</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">cart_&#123;slug&#125; (localStorage)</td>
                  <td className="py-2 pr-4">Pastrarea produselor adaugate in cosul de cumparaturi</td>
                  <td className="py-2 pr-4">Persistent</td>
                  <td className="py-2">Edinio</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            2.3. Cookie-uri de analiza si performanta
          </h3>
          <p>
            Aceste cookie-uri ne ajuta sa intelegem cum este utilizata
            Platforma, permitandu-ne sa imbunatatim functionalitatile si
            experienta utilizatorilor.
          </p>
          <p className="mt-3">
            <strong>Important:</strong> Cookie-urile de analiza de la Google
            Analytics si Google Tag Manager sunt utilizate exclusiv pe
            magazinele create de Utilizatori, doar daca proprietarul
            magazinului le-a configurat. Platforma Edinio (edinio.com) nu
            utilizeaza cookie-uri de analiza ale unor terti.
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
                  <td className="py-2 pr-4">Identificare vizitatori unici si analiza trafic</td>
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
            2.4. Cookie-uri de marketing si publicitate
          </h3>
          <p>
            Aceste cookie-uri sunt utilizate pentru a afisa reclame relevante
            si pentru a masura eficienta campaniilor publicitare. La fel ca
            cele de analiza, sunt active exclusiv pe magazinele Utilizatorilor
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
                  <td className="py-2 pr-4">Masurarea eficientei reclamelor TikTok</td>
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
            3. Consimtamantul pentru cookie-uri
          </h2>
          <p>
            In conformitate cu legislatia in vigoare:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Cookie-urile strict necesare</strong> (sectiunea 2.1) nu
              necesita consimtamantul dumneavoastra, deoarece sunt esentiale
              pentru functionarea serviciului pe care l-ati solicitat (Art. 4
              alin. 6 din Legea 506/2004).
            </li>
            <li>
              <strong>Toate celelalte cookie-uri</strong> (functionale, analiza,
              marketing) necesita consimtamantul dumneavoastra prealabil
              inainte de a fi setate pe dispozitiv.
            </li>
          </ul>
          <p className="mt-3">
            Consimtamantul este solicitat prin intermediul unui banner de
            cookie-uri la prima vizita. Aveti posibilitatea de a accepta sau
            refuza fiecare categorie de cookie-uri. Optiunile
            &quot;Accepta toate&quot; si &quot;Refuza toate&quot; sunt
            prezentate cu aceeasi vizibilitate si accesibilitate.
          </p>
          <p className="mt-3">
            Retragerea consimtamantului este la fel de simpla ca acordarea lui,
            in conformitate cu cerintele legale. Puteti modifica preferintele
            in orice moment.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Cum gestionati cookie-urile?
          </h2>
          <p>
            Pe langa optiunile oferite de bannerul nostru de cookie-uri, puteti
            gestiona cookie-urile direct din setarile browserului
            dumneavoastra:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Google Chrome:</strong> Setari &rarr; Confidentialitate
              si securitate &rarr; Cookie-uri si alte date de site
            </li>
            <li>
              <strong>Mozilla Firefox:</strong> Setari &rarr;
              Confidentialitate si securitate &rarr; Cookie-uri si date de
              site
            </li>
            <li>
              <strong>Safari:</strong> Preferinte &rarr; Confidentialitate
              &rarr; Gestionare date site web
            </li>
            <li>
              <strong>Microsoft Edge:</strong> Setari &rarr; Cookie-uri si
              permisiuni site
            </li>
          </ul>
          <p className="mt-3">
            <strong>Atentie:</strong> Stergerea sau blocarea cookie-urilor
            strict necesare poate afecta functionarea Platformei. De exemplu,
            fara cookie-urile de autentificare, nu va veti putea autentifica
            in cont.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            4.1. Stergerea datelor din localStorage
          </h3>
          <p>
            Datele stocate in localStorage (cos de cumparaturi, ciorne
            formulare) pot fi sterse din setarile browserului, sectiunea
            &quot;Date site&quot; sau &quot;Stocare&quot;, disponibila in
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
            Responsabilitatea pentru informarea vizitatorilor si obtinerea
            consimtamantului pentru aceste cookie-uri revine proprietarului
            magazinului, in calitate de operator de date, conform Art. 4 alin.
            (5) din Legea 506/2004 si Art. 13-14 din GDPR.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Modificari ale politicii
          </h2>
          <p>
            Aceasta Politica cookies poate fi actualizata periodic pentru a
            reflecta modificari in practicile noastre sau in legislatia
            aplicabila. Data ultimei actualizari este afisata la inceputul
            paginii.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact
          </h2>
          <p>
            Pentru intrebari legate de utilizarea cookie-urilor, ne puteti
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
            Consultati si{" "}
            <Link href="/confidentialitate" className="text-primary hover:underline">
              Politica de confidentialitate
            </Link>{" "}
            si{" "}
            <Link href="/gdpr" className="text-primary hover:underline">
              Drepturile GDPR
            </Link>{" "}
            pentru informatii complete.
          </p>
        </section>
      </div>
    </article>
  );
}
