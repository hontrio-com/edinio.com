import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de confidentialitate | Edinio",
  description:
    "Informatii despre cum colectam, utilizam si protejam datele dumneavoastra personale pe platforma Edinio.",
};

export default function ConfidentialitatePage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Politica de confidentialitate
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
            <li><strong>Sediu social:</strong> Str. Progresului, Nr. 2, Matasari, Jud. Gorj, Romania</li>
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
            Prezenta politica este elaborata in conformitate cu Regulamentul
            (UE) 2016/679 (GDPR) si Legea nr. 190/2018 privind masuri de
            punere in aplicare a GDPR.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Rolul Edinio: operator si persoana imputernicita
          </h2>
          <p>
            Edinio actioneaza in doua calitati distincte in privinta datelor
            cu caracter personal:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            2.1. Operator de date
          </h3>
          <p>
            Edinio este operator de date (data controller) pentru datele
            personale ale Utilizatorilor platformei (persoanele care isi
            creeaza cont si administreaza un magazin). In aceasta calitate,
            Edinio stabileste scopurile si mijloacele de prelucrare conform
            Art. 4 pct. 7 din GDPR.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            2.2. Persoana imputernicita (procesor de date)
          </h3>
          <p>
            Pentru datele clientilor finali colectate prin magazinele create pe
            Platforma (nume, telefon, adresa, comenzi), Edinio actioneaza ca
            persoana imputernicita (data processor) in sensul Art. 28 din
            GDPR. Utilizatorul (proprietarul magazinului) este operatorul de
            date pentru clientii sai si este responsabil sa asigure
            conformitatea cu GDPR in relatia cu acestia.
          </p>
          <p className="mt-3">
            Edinio prelucreaza datele clientilor finali exclusiv in scopul
            furnizarii Serviciului si pe baza instructiunilor Utilizatorului.
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
                  <td className="py-2 pr-4">Nume complet, email, parola (criptata)</td>
                  <td className="py-2">Inregistrare</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Profil</td>
                  <td className="py-2 pr-4">Fotografie profil (optional)</td>
                  <td className="py-2">Setari cont</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Afacere</td>
                  <td className="py-2 pr-4">Nume afacere, CUI (optional), telefon, email, adresa, oras, judet, descriere</td>
                  <td className="py-2">Configurare magazin</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Personalizare</td>
                  <td className="py-2 pr-4">Logo, imagine de coperta, culoare principala</td>
                  <td className="py-2">Configurare magazin</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Integrari</td>
                  <td className="py-2 pr-4">Chei API si credentiale pentru servicii terte (plati, curierat, facturare)</td>
                  <td className="py-2">Setari magazin</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            3.2. Date ale clientilor finali (vizitatori si cumparatori ai magazinelor)
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
                  <td className="py-2 pr-4">Comanda</td>
                  <td className="py-2 pr-4">Nume, telefon, email (optional), judet, oras, adresa de livrare</td>
                  <td className="py-2">Plasare comanda</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Tranzactie</td>
                  <td className="py-2 pr-4">Produse comandate, cantitati, preturi, metoda de plata, costuri livrare</td>
                  <td className="py-2">Plasare comanda</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Analiza</td>
                  <td className="py-2 pr-4">Tip dispozitiv, tara, referrer, sursa trafic, data vizitei</td>
                  <td className="py-2">Vizitare magazin</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            3.3. Date tehnice
          </h3>
          <p>
            In mod automat, la accesarea Platformei, colectam: adresa IP,
            tipul si versiunea browserului, sistemul de operare, rezolutia
            ecranului, paginile accesate si durata vizitei. Aceste date sunt
            colectate in baza interesului nostru legitim de a asigura
            securitatea si performanta Platformei (Art. 6 alin. 1 lit. f din
            GDPR).
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Scopul si temeiul legal al prelucrarii
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
                  <td className="py-2 pr-4">Crearea si administrarea contului</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Furnizarea serviciului (hosting magazin, procesare comenzi)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Autentificare si securitate cont (inclusiv MFA)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Facturare si obligatii fiscale</td>
                  <td className="py-2 pr-4">Obligatie legala - Art. 6(1)(c)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Notificari privind serviciul (email, SMS)</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Statistici si analiza trafic</td>
                  <td className="py-2 pr-4">Interes legitim - Art. 6(1)(f)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Suport tehnic</td>
                  <td className="py-2 pr-4">Executarea contractului - Art. 6(1)(b)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Prevenirea fraudei si securitate</td>
                  <td className="py-2 pr-4">Interes legitim - Art. 6(1)(f)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Comunicari de marketing (doar cu acord)</td>
                  <td className="py-2 pr-4">Consimtamant - Art. 6(1)(a)</td>
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
            Datele personale pot fi transmise urmatoarelor categorii de
            destinatari, exclusiv in scopul furnizarii Serviciului:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.1. Furnizori de infrastructura
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Supabase Inc.</strong> &ndash; hosting baza de date, autentificare, stocare fisiere.
              Serverele sunt localizate in UE (Stockholm, Suedia, regiune eu-north-1).
              Supabase respecta GDPR si dispune de Acord de prelucrare a datelor (DPA).
            </li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.2. Procesatori de plati (configurati de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> &ndash; procesare plati online. Stripe este certificat PCI-DSS Level 1. Datele cardului nu sunt stocate pe serverele Edinio.</li>
            <li><strong>NetOpia Payments</strong> &ndash; procesare plati online (procesator romanesc).</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.3. Servicii de curierat (configurate de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Cargus, SameDay, DPD, Fan Courier, Colete.ro, Woot &ndash; pentru generarea AWB-urilor si livrarea comenzilor. Se transmit: nume destinatar, telefon, adresa de livrare, detalii colet.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.4. Servicii de facturare (configurate de Utilizator)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>SmartBill, Oblio, Factura.online &ndash; pentru emiterea facturilor. Se transmit: date client, produse, preturi.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.5. Servicii de comunicare
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Resend</strong> &ndash; trimitere email-uri tranzactionale (confirmari comanda, notificari cont, resetare parola).</li>
            <li><strong>SMSO</strong> &ndash; trimitere SMS-uri (notificari comanda, campanii SMS &ndash; configurate de Utilizator).</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.6. Servicii de analiza si marketing (configurate de Utilizator pe magazinul sau)
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Google Analytics / Google Tag Manager</strong> &ndash; analiza trafic si conversii.</li>
            <li><strong>Meta (Facebook Pixel)</strong> &ndash; tracking conversii si remarketing.</li>
            <li><strong>TikTok Pixel</strong> &ndash; tracking conversii.</li>
          </ul>
          <p className="mt-3">
            Serviciile de analiza si marketing de la pct. 5.6 sunt activate
            exclusiv de Utilizator pe magazinul sau. Edinio nu activeaza aceste
            servicii pe Platforma principala (edinio.com).
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            5.7. Alte situatii
          </h3>
          <p>
            Datele pot fi dezvaluite autoritatilor competente in cazul in care
            exista o obligatie legala in acest sens, conform legislatiei
            romane sau europene.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Transferuri internationale de date
          </h2>
          <p>
            Baza de date principala este stocata in Uniunea Europeana
            (Stockholm, Suedia), prin Supabase Inc.
          </p>
          <p className="mt-3">
            Unele servicii terte (Stripe, Resend, Google, Meta, TikTok) pot
            prelucra date in afara Spatiului Economic European. In aceste
            cazuri, transferul se realizeaza pe baza urmatoarelor garantii
            adecvate, conform Art. 46 din GDPR:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Clauze contractuale standard (SCC) aprobate de Comisia Europeana</li>
            <li>Decizii de adecvare ale Comisiei Europene (acolo unde exista)</li>
            <li>Certificari de protectie a datelor (ex. EU-US Data Privacy Framework)</li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Durata stocarii datelor
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Tip date</th>
                  <th className="text-left py-2 font-semibold">Durata pastrare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Date cont (nume, email)</td>
                  <td className="py-2">Pe durata contului + 30 zile dupa stergere</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date afacere si magazin</td>
                  <td className="py-2">Pe durata contului + 30 zile dupa stergere</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date comenzi si tranzactii</td>
                  <td className="py-2">10 ani (obligatie fiscala, conform Codului Fiscal roman)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Facturi si documente fiscale</td>
                  <td className="py-2">10 ani (obligatie legala)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date analitice (trafic)</td>
                  <td className="py-2">24 luni, apoi anonimizate</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Date suport tehnic (tichet-uri)</td>
                  <td className="py-2">3 ani de la inchiderea tichetului</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Cookie-uri de autentificare</td>
                  <td className="py-2">Durata sesiunii sau conform setarilor browserului</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Log-uri de securitate</td>
                  <td className="py-2">12 luni</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            La expirarea perioadelor de retentie, datele sunt sterse sau
            anonimizate ireversibil. Datele a caror pastrare este impusa de
            lege nu pot fi sterse la cererea persoanei vizate pana la
            expirarea termenului legal.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Drepturile dumneavoastra
          </h2>
          <p>
            In conformitate cu Art. 15-22 din GDPR, beneficiati de
            urmatoarele drepturi:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>Dreptul de acces</strong> (Art. 15) &ndash; sa obtineti confirmarea prelucrarii datelor si o copie a acestora</li>
            <li><strong>Dreptul la rectificare</strong> (Art. 16) &ndash; sa solicitati corectarea datelor inexacte</li>
            <li><strong>Dreptul la stergere</strong> (Art. 17) &ndash; sa solicitati stergerea datelor (&quot;dreptul de a fi uitat&quot;)</li>
            <li><strong>Dreptul la restrictionare</strong> (Art. 18) &ndash; sa solicitati limitarea prelucrarii in anumite situatii</li>
            <li><strong>Dreptul la portabilitate</strong> (Art. 20) &ndash; sa primiti datele intr-un format structurat, utilizat frecvent si care poate fi citit automat</li>
            <li><strong>Dreptul la opozitie</strong> (Art. 21) &ndash; sa va opuneti prelucrarii bazate pe interes legitim</li>
            <li><strong>Dreptul de a nu fi supus deciziilor automate</strong> (Art. 22) &ndash; inclusiv profilarea cu efecte juridice</li>
            <li><strong>Dreptul de retragere a consimtamantului</strong> (Art. 7) &ndash; in orice moment, fara a afecta legalitatea prelucrarii anterioare</li>
          </ul>
          <p className="mt-3">
            Pentru exercitarea acestor drepturi, consultati pagina{" "}
            <Link href="/gdpr" className="text-primary hover:underline">
              Drepturile GDPR
            </Link>{" "}
            sau contactati-ne la{" "}
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
            Implementam masuri tehnice si organizatorice adecvate pentru
            protectia datelor personale, in conformitate cu Art. 32 din GDPR,
            inclusiv:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Criptarea datelor in tranzit (TLS/SSL) si in repaus</li>
            <li>Controlul accesului bazat pe roluri (Row Level Security la nivel de baza de date)</li>
            <li>Autentificare cu doi factori (MFA) disponibila pentru conturile utilizatorilor</li>
            <li>Parolele sunt stocate folosind algoritmi de hashing siguri (bcrypt)</li>
            <li>Backup-uri automate ale bazei de date</li>
            <li>Monitorizarea si logarea accesului la date</li>
            <li>Evaluari periodice ale vulnerabilitatilor</li>
          </ul>
          <p className="mt-3">
            Datele cardurilor de plata nu sunt stocate pe serverele Edinio.
            Procesarea platilor cu cardul se realizeaza exclusiv prin
            procesatori certificati PCI-DSS (Stripe, NetOpia).
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Protectia datelor copiilor
          </h2>
          <p>
            Platforma Edinio nu este destinata persoanelor cu varsta sub 18
            ani. Nu colectam cu buna stiinta date personale de la minori. In
            conformitate cu Art. 8 din GDPR si Art. 5 din Legea 190/2018,
            varsta minima pentru consimtamantul digital in Romania este de 16
            ani.
          </p>
          <p className="mt-3">
            Daca descoperim ca am colectat date de la un minor fara
            consimtamantul parental adecvat, vom sterge acele date fara
            intarziere.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Notificarea incidentelor de securitate
          </h2>
          <p>
            In conformitate cu Art. 33-34 din GDPR, in cazul unei incalcari a
            securitatii datelor cu caracter personal:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Vom notifica ANSPDCP (Autoritatea Nationala de Supraveghere a Prelucrarii Datelor cu Caracter Personal) in termen de 72 de ore de la data la care am luat cunostinta de incident, cu exceptia cazului in care este improbabil ca incalcarea sa genereze un risc pentru drepturile persoanelor vizate</li>
            <li>Vom notifica persoanele vizate afectate fara intarziere nejustificata daca incalcarea este susceptibila sa genereze un risc ridicat pentru drepturile si libertatile acestora</li>
          </ul>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Modificari ale politicii
          </h2>
          <p>
            Ne rezervam dreptul de a actualiza prezenta Politica de
            confidentialitate. Modificarile semnificative vor fi comunicate
            prin email si/sau prin notificare in Platforma, cu cel putin 30
            de zile inainte de intrarea in vigoare.
          </p>
          <p className="mt-3">
            Data ultimei actualizari este afisata la inceputul acestei pagini.
            Va recomandam sa consultati periodic aceasta pagina.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Plangeri
          </h2>
          <p>
            Daca considerati ca prelucrarea datelor dumneavoastra personale
            incalca prevederile GDPR, aveti dreptul de a depune o plangere la
            autoritatea de supraveghere:
          </p>
          <div className="bg-muted/50 rounded-xl p-5 mt-3">
            <p className="font-semibold text-foreground">
              Autoritatea Nationala de Supraveghere a Prelucrarii Datelor cu
              Caracter Personal (ANSPDCP)
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Adresa: B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, cod postal 010336, Bucuresti, Romania</li>
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
            Pentru orice intrebari privind prelucrarea datelor dumneavoastra
            personale, ne puteti contacta la:
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
            <li>Adresa: Str. Progresului, Nr. 2, Matasari, Jud. Gorj, Romania</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
