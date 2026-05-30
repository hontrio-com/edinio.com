import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de confidențialitate | Edinio",
  description:
    "Informații despre cum colectăm, utilizăm și protejăm datele dumneavoastră personale pe platforma Edinio.",
};

export default function ConfidentialitatePage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Politica de confidențialitate
      </h1>
      <p className="text-sm text-muted-foreground mb-12">
        Ultima actualizare: 30 mai 2026
      </p>

      <div className="prose prose-gray max-w-none space-y-10 text-foreground/90 leading-relaxed">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            1. Identitatea operatorului de date
          </h2>
          <p>
            Operatorul de date cu caracter personal este:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li><strong>Denumire:</strong> SC VOID SFT GAMES SRL</li>
            <li><strong>CUI:</strong> 43474393</li>
            <li><strong>Sediu social:</strong> Str. Progresului, Nr. 2, Mătăsari, Jud. Gorj, România</li>
            <li><strong>Email:</strong>{" "}
              <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
                contact@edinio.com
              </a>
            </li>
            <li><strong>Telefon:</strong>{" "}
              <a href="tel:+40750456809" className="text-primary hover:underline">
                0750 456 809
              </a>
            </li>
          </ul>
          <p className="mt-3">
            Prezenta politică este elaborată în conformitate cu Regulamentul
            (UE) 2016/679 (GDPR) și Legea nr. 190/2018 privind măsuri de
            punere în aplicare a GDPR.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Rolul Edinio: operator și persoană împuternicită
          </h2>
          <p>
            Edinio acționează în două calități distincte în privința datelor
            cu caracter personal:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            2.1. Operator de date
          </h3>
          <p>
            Edinio este operator de date (data controller) pentru datele
            personale ale Utilizatorilor platformei (persoanele care își
            creează cont și administrează un magazin). În această calitate,
            Edinio stabilește scopurile și mijloacele de prelucrare conform
            Art. 4 pct. 7 din GDPR.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            2.2. Persoană împuternicită (procesor de date)
          </h3>
          <p>
            Pentru datele clienților finali colectate prin magazinele create pe
            Platformă (nume, telefon, adresă, comenzi), Edinio acționează ca
            persoană împuternicită (data processor) în sensul Art. 28 din
            GDPR. Utilizatorul (proprietarul magazinului) este operatorul de
            date pentru clienții săi și este responsabil să asigure
            conformitatea cu GDPR în relația cu aceștia.
          </p>
          <p className="mt-3">
            Edinio prelucrează datele clienților finali exclusiv în scopul
            furnizării Serviciului și pe baza instrucțiunilor Utilizatorului.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            3. Categorii de date personale colectate
          </h2>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            3.1. Date ale Utilizatorilor (proprietari de magazine)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Categorie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Date colectate</th>
                  <th className="text-left py-2 font-semibold">Moment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Cont</td>
                  <td className="py-2 pr-4">Nume complet, email, parolă (criptată)</td>
                  <td className="py-2">Înregistrare</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Profil</td>
                  <td className="py-2 pr-4">Fotografie profil (opțional)</td>
                  <td className="py-2">Setări cont</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Afacere</td>
                  <td className="py-2 pr-4">Nume afacere, CUI (opțional), telefon, email, adresă, oraș, județ, descriere</td>
                  <td className="py-2">Configurare magazin</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Personalizare</td>
                  <td className="py-2 pr-4">Logo, imagine de copertă, culoare principală</td>
                  <td className="py-2">Configurare magazin</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Integrări</td>
                  <td className="py-2 pr-4">Chei API și credențiale pentru servicii terțe (plăți, curierat, facturare)</td>
                  <td className="py-2">Setări magazin</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            3.2. Date ale clienților finali (vizitatori și cumpărători ai magazinelor)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Categorie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Date colectate</th>
                  <th className="text-left py-2 font-semibold">Moment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Comandă</td>
                  <td className="py-2 pr-4">Nume, telefon, email (opțional), județ, oraș, adresă de livrare</td>
                  <td className="py-2">Plasare comandă</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Tranzacție</td>
                  <td className="py-2 pr-4">Produse comandate, cantități, prețuri, metodă de plată, costuri livrare</td>
                  <td className="py-2">Plasare comandă</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Analiză</td>
                  <td className="py-2 pr-4">Tip dispozitiv, țară, referrer, sursă trafic, dată vizitei</td>
                  <td className="py-2">Vizitare magazin</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            3.3. Date tehnice
          </h3>
          <p>
            În mod automat, la accesarea Platformei, colectăm: adresa IP,
            tipul și versiunea browserului, sistemul de operare, rezoluția
            ecranului, paginile accesate și durata vizitei. Aceste date sunt
            colectate în baza interesului nostru legitim de a asigura
            securitatea și performanța Platformei (Art. 6 alin. 1 lit. f din
            GDPR).
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Scopul și temeiul legal al prelucrării
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Scop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Temei legal (Art. 6 GDPR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Crearea și administrarea contului</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Furnizarea serviciului (hosting magazin, procesare comenzi)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Autentificare și securitate cont (inclusiv MFA)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Facturare și obligații fiscale</td>
                  <td className="py-2 pr-4">Obligație legală - Art. 6(1)(c)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Notificări privind serviciul (email, SMS)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Statistici și analiză trafic</td>
                  <td className="py-2 pr-4">Interes legitim - Art. 6(1)(f)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Suport tehnic</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Prevenirea fraudei și securitate</td>
                  <td className="py-2 pr-4">Interes legitim - Art. 6(1)(f)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Comunicări de marketing (doar cu acord)</td>
                  <td className="py-2 pr-4">Consimțământ - Art. 6(1)(a)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Destinatarii datelor
          </h2>
          <p>
            Datele personale pot fi transmise următoarelor categorii de
            destinatari, exclusiv în scopul furnizării Serviciului:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.1. Furnizori de infrastructură
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Supabase Inc.</strong> &ndash; hosting bază de date, autentificare, stocare fișiere.
              Serverele sunt localizate în UE (Stockholm, Suedia, regiune eu-north-1).
              Supabase respectă GDPR și dispune de Acord de prelucrare a datelor (DPA).
            </li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.2. Procesatori de plăți (configurați de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> &ndash; procesare plăți online. Stripe este certificat PCI-DSS Level 1. Datele cardului nu sunt stocate pe serverele Edinio.</li>
            <li><strong>NetOpia Payments</strong> &ndash; procesare plăți online (procesator românesc).</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.3. Servicii de curierat (configurate de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Cargus, SameDay, DPD, Fan Courier, Colete.ro, Woot &ndash; pentru generarea AWB-urilor și livrarea comenzilor. Se transmit: nume destinatar, telefon, adresă de livrare, detalii colet.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.4. Servicii de facturare (configurate de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>SmartBill, Oblio, Factura.online &ndash; pentru emiterea facturilor. Se transmit: date client, produse, prețuri.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.5. Servicii de comunicare
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Resend</strong> &ndash; trimitere email-uri tranzacționale (confirmări comandă, notificări cont, resetare parolă).</li>
            <li><strong>SMSO</strong> &ndash; trimitere SMS-uri (notificări comandă, campanii SMS &ndash; configurate de Utilizator).</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.6. Servicii de analiză și marketing (configurate de Utilizator pe magazinul său)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Google Analytics / Google Tag Manager</strong> &ndash; analiză trafic și conversii.</li>
            <li><strong>Meta (Facebook Pixel)</strong> &ndash; tracking conversii și remarketing.</li>
            <li><strong>TikTok Pixel</strong> &ndash; tracking conversii.</li>
          </ul>
          <p className="mt-3">
            Serviciile de analiză și marketing de la pct. 5.6 sunt activate
            exclusiv de Utilizator pe magazinul său. Edinio nu activează aceste
            servicii pe Platforma principală (edinio.com).
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.7. Alte situații
          </h3>
          <p>
            Datele pot fi dezvăluite autorităților competente în cazul în care
            există o obligație legală în acest sens, conform legislației
            române sau europene.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Transferuri internaționale de date
          </h2>
          <p>
            Baza de date principală este stocată în Uniunea Europeană
            (Stockholm, Suedia), prin Supabase Inc.
          </p>
          <p className="mt-3">
            Unele servicii terțe (Stripe, Resend, Google, Meta, TikTok) pot
            prelucra date în afara Spațiului Economic European. În aceste
            cazuri, transferul se realizează pe baza următoarelor garanții
            adecvate, conform Art. 46 din GDPR:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Clauze contractuale standard (SCC) aprobate de Comisia Europeană</li>
            <li>Decizii de adecvare ale Comisiei Europene (acolo unde există)</li>
            <li>Certificări de protecție a datelor (ex. EU-US Data Privacy Framework)</li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Durata stocării datelor
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Tip date</th>
                  <th className="text-left py-2 font-semibold">Durată păstrare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Date cont (nume, email)</td>
                  <td className="py-2">Pe durata contului + 30 zile după ștergere</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date afacere și magazin</td>
                  <td className="py-2">Pe durata contului + 30 zile după ștergere</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date comenzi și tranzacții</td>
                  <td className="py-2">10 ani (obligație fiscală, conform Codului Fiscal român)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Facturi și documente fiscale</td>
                  <td className="py-2">10 ani (obligație legală)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date analitice (trafic)</td>
                  <td className="py-2">24 luni, apoi anonimizate</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date suport tehnic (tichet-uri)</td>
                  <td className="py-2">3 ani de la închiderea tichetului</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Cookie-uri de autentificare</td>
                  <td className="py-2">Durata sesiunii sau conform setărilor browserului</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Log-uri de securitate</td>
                  <td className="py-2">12 luni</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            La expirarea perioadelor de retenție, datele sunt șterse sau
            anonimizate ireversibil. Datele a căror păstrare este impusă de
            lege nu pot fi șterse la cererea persoanei vizate până la
            expirarea termenului legal.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Drepturile dumneavoastră
          </h2>
          <p>
            În conformitate cu Art. 15-22 din GDPR, beneficiați de
            următoarele drepturi:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>Dreptul de acces</strong> (Art. 15) &ndash; să obțineți confirmarea prelucrării datelor și o copie a acestora</li>
            <li><strong>Dreptul la rectificare</strong> (Art. 16) &ndash; să solicitați corectarea datelor inexacte</li>
            <li><strong>Dreptul la ștergere</strong> (Art. 17) &ndash; să solicitați ștergerea datelor (&quot;dreptul de a fi uitat&quot;)</li>
            <li><strong>Dreptul la restricționare</strong> (Art. 18) &ndash; să solicitați limitarea prelucrării în anumite situații</li>
            <li><strong>Dreptul la portabilitate</strong> (Art. 20) &ndash; să primiți datele într-un format structurat, utilizat frecvent și care poate fi citit automat</li>
            <li><strong>Dreptul la opoziție</strong> (Art. 21) &ndash; să vă opuneți prelucrării bazate pe interes legitim</li>
            <li><strong>Dreptul de a nu fi supus deciziilor automate</strong> (Art. 22) &ndash; inclusiv profilarea cu efecte juridice</li>
            <li><strong>Dreptul de retragere a consimțământului</strong> (Art. 7) &ndash; în orice moment, fără a afecta legalitatea prelucrării anterioare</li>
          </ul>
          <p className="mt-3">
            Pentru exercitarea acestor drepturi, consultați pagina{" "}
            <Link href="/gdpr" className="text-primary hover:underline">
              Drepturile GDPR
            </Link>{" "}
            sau contactați-ne la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>
            .
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            9. Securitatea datelor
          </h2>
          <p>
            Implementăm măsuri tehnice și organizatorice adecvate pentru
            protecția datelor personale, în conformitate cu Art. 32 din GDPR,
            inclusiv:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Criptarea datelor în tranzit (TLS/SSL) și în repaus</li>
            <li>Controlul accesului bazat pe roluri (Row Level Security la nivel de bază de date)</li>
            <li>Autentificare cu doi factori (MFA) disponibilă pentru conturile utilizatorilor</li>
            <li>Parolele sunt stocate folosind algoritmi de hashing siguri (bcrypt)</li>
            <li>Backup-uri automate ale bazei de date</li>
            <li>Monitorizarea și logarea accesului la date</li>
            <li>Evaluări periodice ale vulnerabilităților</li>
          </ul>
          <p className="mt-3">
            Datele cardurilor de plată nu sunt stocate pe serverele Edinio.
            Procesarea plăților cu cardul se realizează exclusiv prin
            procesatori certificați PCI-DSS (Stripe, NetOpia).
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Protecția datelor copiilor
          </h2>
          <p>
            Platforma Edinio nu este destinată persoanelor cu vârsta sub 18
            ani. Nu colectăm cu bună știință date personale de la minori. În
            conformitate cu Art. 8 din GDPR și Art. 5 din Legea 190/2018,
            vârsta minimă pentru consimțământul digital în România este de 16
            ani.
          </p>
          <p className="mt-3">
            Dacă descoperim că am colectat date de la un minor fără
            consimțământul parental adecvat, vom șterge acele date fără
            întârziere.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Notificarea incidentelor de securitate
          </h2>
          <p>
            În conformitate cu Art. 33-34 din GDPR, în cazul unei încălcări a
            securității datelor cu caracter personal:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Vom notifica ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal) în termen de 72 de ore de la data la care am luat cunoștință de incident, cu excepția cazului în care este improbabil ca încălcarea să genereze un risc pentru drepturile persoanelor vizate</li>
            <li>Vom notifica persoanele vizate afectate fără întârziere nejustificată dacă încălcarea este susceptibilă să genereze un risc ridicat pentru drepturile și libertățile acestora</li>
          </ul>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Modificări ale politicii
          </h2>
          <p>
            Ne rezervăm dreptul de a actualiza prezenta Politică de
            confidențialitate. Modificările semnificative vor fi comunicate
            prin email și/sau prin notificare în Platformă, cu cel puțin 30
            de zile înainte de intrarea în vigoare.
          </p>
          <p className="mt-3">
            Data ultimei actualizări este afișată la începutul acestei pagini.
            Vă recomandăm să consultați periodic această pagină.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Plângeri
          </h2>
          <p>
            Dacă considerați că prelucrarea datelor dumneavoastră personale
            încalcă prevederile GDPR, aveți dreptul de a depune o plângere la
            autoritatea de supraveghere:
          </p>
          <div className="bg-muted/50 rounded-xl p-5 mt-3">
            <p className="font-semibold text-foreground">
              Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
              Caracter Personal (ANSPDCP)
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Adresă: B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, cod poștal 010336, București, România</li>
              <li>Telefon: +40.318.059.211 / +40.318.059.212</li>
              <li>Email: anspdcp@dataprotection.ro</li>
              <li>Website: www.dataprotection.ro</li>
            </ul>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact
          </h2>
          <p>
            Pentru orice întrebări privind prelucrarea datelor dumneavoastră
            personale, ne puteți contacta la:
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
            <li>Adresă: Str. Progresului, Nr. 2, Mătăsari, Jud. Gorj, România</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
