// ─── Policy template generator ────────────────────────────────────────────────
// Templates conform legislației române:
//   • OUG nr. 34/2014 (drepturile consumatorilor în contracte la distanță)
//   • GDPR + Legea nr. 190/2018
//   • Legea nr. 365/2002 (comerțul electronic)
//   • Legea nr. 449/2003 + Legea nr. 159/2017 (garanția produselor)
//   • OG nr. 21/1992 (protecția consumatorilor)

function v(val: string | null | undefined, fallback = "[completați]"): string {
  return val?.trim() || fallback;
}

function buildAddr(
  address: string | null,
  city: string | null,
  county: string | null
): string {
  return [address, city, county].filter(Boolean).join(", ") || "[adresa completă]";
}

export function buildPolicyTemplates(vars: {
  businessName: string | null;
  cui: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
}): Record<string, string> {
  const name  = v(vars.businessName, "[Denumire Firmă]");
  const cui   = v(vars.cui,          "[CUI/CIF]");
  const addr  = buildAddr(vars.address, vars.city, vars.county);
  const phone = v(vars.phone, "[Telefon]");
  const email = v(vars.email, "[Email]");
  const year  = new Date().getFullYear();

  return {
    terms:        termsTemplate(name, cui, addr, phone, email, year),
    delivery:     deliveryTemplate(name, email, phone),
    return:       returnTemplate(name, email, phone),
    privacy:      privacyTemplate(name, cui, addr, phone, email, year),
    gdpr:         gdprTemplate(name, email),
    cancellation: cancellationTemplate(name, email, phone),
  };
}

// ─── 1. Termeni și Condiții ────────────────────────────────────────────────────

function termsTemplate(
  name: string, cui: string, addr: string,
  phone: string, email: string, year: number
): string {
  return `
<h2>Termeni și Condiții Generale de Vânzare</h2>
<p><em>Ultima actualizare: ${year}</em></p>

<h3>1. Identificarea Vânzătorului</h3>
<p><strong>${name}</strong>, cu codul de identificare fiscală <strong>${cui}</strong>, cu sediul în <strong>${addr}</strong>, e-mail: <strong>${email}</strong>, telefon: <strong>${phone}</strong> (denumit în continuare „Vânzătorul"), operează prezenta platformă de comerț electronic.</p>

<h3>2. Acceptarea Termenilor și Condițiilor</h3>
<p>Accesarea site-ului și plasarea unei comenzi implică acceptarea integrală și necondiționată a prezentelor Termeni și Condiții Generale de Vânzare (denumite în continuare „T&amp;C"). Dacă nu ești de acord cu acești termeni, te rugăm să nu utilizezi site-ul.</p>
<p>Vânzătorul își rezervă dreptul de a modifica T&amp;C în orice moment. Modificările intră în vigoare de la data publicării lor pe site și nu afectează comenzile deja confirmate.</p>

<h3>3. Produse și Servicii</h3>
<p>Produsele prezentate pe site sunt disponibile în limita stocului existent. Imaginile produselor au caracter exclusiv ilustrativ; culorile efective pot varia ușor față de cele afișate pe ecran, în funcție de setările dispozitivului. Caracteristicile esențiale ale fiecărui produs sunt descrise în pagina dedicată acestuia.</p>
<p>Vânzătorul depune toate eforturile pentru a asigura acuratețea informațiilor despre produse, însă nu poate garanta că acestea sunt complete, corecte sau actualizate în orice moment. În cazul unor erori de afișare a prețurilor sau a caracteristicilor, Vânzătorul va contacta Cumpărătorul înainte de procesarea comenzii.</p>

<h3>4. Prețuri și Modalități de Plată</h3>
<p>Prețurile sunt exprimate în Lei (RON) și includ TVA, unde este aplicabil, conform legislației fiscale în vigoare. Prețurile pot fi modificate în orice moment, modificările neafectând comenzile deja confirmate.</p>
<p>Modalitățile de plată disponibile sunt cele afișate la finalul comenzii (plată ramburs, card bancar, transfer bancar etc.). Vânzătorul nu percepe taxe suplimentare pentru utilizarea instrumentelor de plată acceptate, cu excepția cazurilor menționate explicit.</p>

<h3>5. Plasarea și Confirmarea Comenzii</h3>
<p>Comanda este plasată în momentul în care Cumpărătorul a completat toate informațiile solicitate și a apăsat butonul de confirmare. Prin plasarea comenzii, Cumpărătorul declară că datele furnizate sunt reale și complete.</p>
<p>Vânzătorul transmite o confirmare automată de primire a comenzii prin e-mail. Aceasta nu constituie acceptarea comenzii, ci doar înregistrarea ei. Contractul de vânzare-cumpărare se consideră încheiat în momentul expedierii produsului și al transmiterii confirmării de expediere.</p>
<p>Vânzătorul poate refuza o comandă în cazul în care: produsul nu mai este disponibil în stoc, datele de contact sunt incorecte sau incomplete, există indicii de fraudă sau în alte situații justificate, cu notificarea prealabilă a Cumpărătorului.</p>

<h3>6. Livrarea</h3>
<p>Condițiile de livrare sunt detaliate în <strong>Politica de Livrare</strong>. În conformitate cu art. 18 din OUG nr. 34/2014, Vânzătorul are obligația de a livra produsele în cel mult <strong>30 de zile calendaristice</strong> de la data confirmării comenzii, dacă nu s-a convenit un alt termen. Riscul pierderii sau deteriorării produselor trece la Cumpărător în momentul predării fizice a acestora.</p>

<h3>7. Dreptul de Retragere</h3>
<p>În conformitate cu OUG nr. 34/2014 (care transpune Directiva UE 2011/83/UE privind drepturile consumatorilor), Cumpărătorul persoană fizică are dreptul de a se retrage din contract în termen de <strong>14 zile calendaristice</strong> de la data primirii fizice a produsului, fără a invoca niciun motiv. Condițiile detaliate sunt disponibile în <strong>Politica de Retur</strong>.</p>

<h3>8. Garanția Legală de Conformitate</h3>
<p>Toate produsele comercializate beneficiază de <strong>garanția legală de conformitate de 2 ani</strong> de la data livrării, în conformitate cu Legea nr. 449/2003 privind vânzarea produselor și garanțiile asociate acestora, modificată prin Legea nr. 159/2017.</p>
<p>În cazul unui defect de conformitate constatat în termen de 2 ani de la livrare, Cumpărătorul are dreptul, în ordine, la: repararea gratuită a produsului, înlocuirea gratuită cu un produs similar, reducerea corespunzătoare a prețului sau rezoluțiunea contractului și rambursarea integrală a prețului, dacă repararea sau înlocuirea nu este posibilă sau implică inconveniente majore pentru consumator.</p>
<p>Suplimentar, unele produse pot beneficia de garanție comercială oferită de Vânzător sau de producător, ale cărei condiții sunt specificate în documentele produsului.</p>

<h3>9. Proprietate Intelectuală</h3>
<p>Toate elementele site-ului (texte, imagini, grafice, logo-uri, mărci comerciale, cod sursă) sunt proprietatea Vânzătorului sau sunt utilizate cu acordul titularilor de drepturi. Orice reproducere, distribuire, transmitere sau utilizare a acestora, fără acordul scris prealabil al Vânzătorului, este interzisă și constituie o încălcare a drepturilor de proprietate intelectuală, sancționată conform legii.</p>

<h3>10. Limitarea Răspunderii</h3>
<p>Vânzătorul nu răspunde pentru daune indirecte, incidentale sau consecvente rezultate din utilizarea produselor achiziționate. Răspunderea totală a Vânzătorului față de Cumpărător, indiferent de cauza acțiunii, nu va depăși valoarea produsului achiziționat. Aceste limitări nu se aplică în cazul vătămărilor corporale sau decesului cauzate de neglijența Vânzătorului, sau în alte situații în care răspunderea nu poate fi limitată prin lege.</p>

<h3>11. Forță Majoră</h3>
<p>Niciuna dintre părți nu va fi considerată răspunzătoare pentru neexecutarea sau executarea cu întârziere a obligațiilor contractuale dacă aceasta este cauzată de un eveniment de forță majoră — orice eveniment extern, imprevizibil, absolut invincibil și inevitabil (calamități naturale, conflicte armate, pandemii, acte ale autorităților publice, pene generalizate de curent, atacuri cibernetice la scară națională etc.). Partea care invocă forța majoră are obligația de a notifica cealaltă parte în termen de 5 zile lucrătoare de la producerea evenimentului.</p>

<h3>12. Soluționarea Litigiilor</h3>
<p>Orice neînțelegere apărută între Vânzător și Cumpărător va fi soluționată, în primă instanță, pe cale amiabilă. În cazul în care nu se ajunge la o soluție amiabilă, litigiile vor fi supuse instanțelor judecătorești competente de pe raza județului în care Vânzătorul își are sediul social, aplicându-se legislația română.</p>
<p>Consumatorii pot apela și la soluționarea alternativă a litigiilor (SAL) prin:</p>
<ul>
<li><strong>ANPC</strong> (Autoritatea Națională pentru Protecția Consumatorilor) — <em>www.anpc.ro</em>, Centrul SAL: <em>https://reclamatii.anpc.ro</em></li>
<li><strong>Platforma ODR</strong> a Comisiei Europene (pentru litigii online) — <em>https://ec.europa.eu/consumers/odr</em></li>
</ul>

<h3>13. Legea Aplicabilă</h3>
<p>Prezentele Termeni și Condiții sunt guvernate de legislația română în vigoare. Orice litigiu va fi de competența instanțelor judecătorești din România.</p>
`.trim();
}

// ─── 2. Politica de Livrare ───────────────────────────────────────────────────

function deliveryTemplate(name: string, email: string, phone: string): string {
  return `
<h2>Politica de Livrare</h2>

<h3>1. Zone de Livrare</h3>
<p>${name} livrează produsele pe întreg teritoriul României. Pentru livrări în afara României, te rugăm să ne contactezi la <strong>${email}</strong> sau <strong>${phone}</strong> pentru a verifica disponibilitatea și costurile aferente.</p>

<h3>2. Termene de Livrare</h3>
<p>Comenzile sunt procesate în termen de <strong>1–2 zile lucrătoare</strong> de la confirmarea plății (sau de la plasarea comenzii, în cazul plății ramburs). Termenul estimat de livrare este de <strong>2–5 zile lucrătoare</strong> de la data expedierii, în funcție de curier și de zona de destinație.</p>
<p>În conformitate cu art. 18 din OUG nr. 34/2014, <strong>termenul maxim legal de livrare este de 30 de zile calendaristice</strong> de la data încheierii contractului. În cazul depășirii acestui termen, Cumpărătorul poate solicita rezilierea contractului și rambursarea integrală a sumei achitate, conform art. 19 din același act normativ.</p>
<p>Termenele de livrare pot fi prelungite în perioadele de vârf (sărbători legale, campanii promoționale) sau din cauza unor circumstanțe independente de voința Vânzătorului. În aceste situații, Cumpărătorul va fi notificat prin e-mail sau telefon.</p>

<h3>3. Costuri de Livrare</h3>
<p>Costul livrării este afișat în mod transparent la finalizarea comenzii, înainte ca aceasta să fie plasată. Costul variază în funcție de greutatea coletului, dimensiuni și zona de livrare. <strong>Livrarea gratuită</strong> este disponibilă pentru comenzile care depășesc pragul de valoare afișat pe site (acolo unde este activată această opțiune).</p>

<h3>4. Modalități de Livrare</h3>
<p>Livrarea se efectuează prin intermediul firmelor de curierat cu care colaborăm. Curierii disponibili și prețurile aferente sunt afișate la finalizarea comenzii. Vânzătorul nu poate garanta că un anumit curier va fi disponibil în orice moment sau în orice zonă.</p>

<h3>5. Recepția Coletului</h3>
<p>La primirea coletului, te rugăm să verifici integritatea ambalajului <strong>în prezența curierului</strong>. Dacă ambalajul prezintă urme vizibile de deteriorare, ai dreptul să refuzi coletul sau să soliciți curierului consemnarea stării acestuia în procesul-verbal de livrare (aviz de însoțire).</p>
<p>Orice daune constatate după semnarea de primire a coletului, fără mențiuni pe documentul curierului, pot limita drepturile tale de despăgubire față de firma de curierat. Te rugăm să ne contactezi la <strong>${email}</strong> sau <strong>${phone}</strong> în cel mai scurt timp posibil dacă produsul a fost deteriorat în transport.</p>

<h3>6. Livrare Eșuată</h3>
<p>Dacă livrarea nu poate fi efectuată din cauza absenței destinatarului sau a unei adrese incorecte, curierii vor lăsa o notificare și vor efectua, de regulă, un al doilea tentativ de livrare. Dacă livrarea eșuează în mod repetat, coletul se va întoarce la Vânzător. În acest caz, Cumpărătorul va fi contactat și va suporta costurile de retur și re-expediere.</p>

<h3>7. Transferul Riscului</h3>
<p>Conform art. 20 din OUG nr. 34/2014, riscul pierderii sau deteriorării produselor trece la Cumpărător în momentul predării fizice a produselor, adică în momentul în care acesta sau un terț desemnat de acesta (altul decât transportatorul) intră în posesia fizică a bunurilor.</p>

<h3>8. Contact</h3>
<p>Pentru orice nelămurire legată de livrare, ne poți contacta la: <strong>${email}</strong> | <strong>${phone}</strong>.</p>
`.trim();
}

// ─── 3. Politica de Retur ─────────────────────────────────────────────────────

function returnTemplate(name: string, email: string, phone: string): string {
  return `
<h2>Politica de Retur și Dreptul de Retragere</h2>

<h3>1. Dreptul Legal de Retragere (14 Zile)</h3>
<p>În conformitate cu OUG nr. 34/2014 privind drepturile consumatorilor în cadrul contractelor încheiate cu profesioniștii (care transpune Directiva UE 2011/83/UE), orice consumator persoană fizică are dreptul de a se retrage din contractul la distanță în termen de <strong>14 zile calendaristice</strong>, fără a invoca niciun motiv și fără a suporta alte costuri decât cele prevăzute la art. 13 alin. (3) și art. 14 din OUG nr. 34/2014.</p>
<p>Termenul de retragere expiră după 14 zile calendaristice din ziua în care tu sau o terță parte indicată de tine (alta decât transportatorul) intri în posesia fizică a produsului. Pentru comenzile cu mai multe produse livrate separat, termenul curge de la data primirii ultimului produs.</p>

<h3>2. Exercitarea Dreptului de Retragere</h3>
<p>Pentru a exercita dreptul de retragere, trebuie să ne informezi printr-o declarație neechivocă (scrisoare trimisă prin poștă sau e-mail) cu privire la decizia ta de a te retrage din prezentul contract. Poți utiliza modelul de formular de retragere prevăzut în Anexa nr. 2 a OUG nr. 34/2014, dar utilizarea lui nu este obligatorie.</p>
<p>Ne poți contacta la:</p>
<ul>
<li><strong>E-mail:</strong> ${email}</li>
<li><strong>Telefon:</strong> ${phone}</li>
</ul>
<p>Pentru respectarea termenului de retragere, este suficient să trimiți comunicarea privind exercitarea dreptului de retragere înainte de expirarea perioadei de retragere.</p>

<h3>3. Produse Excluse de la Dreptul de Retragere</h3>
<p>Conform art. 16 din OUG nr. 34/2014, dreptul de retragere <strong>nu se aplică</strong> pentru:</p>
<ul>
<li>Produse realizate după specificațiile Cumpărătorului sau personalizate clar;</li>
<li>Produse susceptibile de deteriorare rapidă sau cu termen de valabilitate scurt (alimente perisabile, flori etc.);</li>
<li>Produse sigilate care nu pot fi returnate din motive de protecție a sănătății sau din motive de igienă și care au fost desigilate după livrare;</li>
<li>Produse care sunt, după livrare, amestecate inseparabil cu alte produse datorită naturii acestora;</li>
<li>Înregistrări audio sau video sigilate sau programe informatice sigilate care au fost desigilate după livrare;</li>
<li>Ziare, periodice sau reviste, cu excepția abonamentelor la astfel de publicații;</li>
<li>Conținut digital care nu este livrat pe un suport material și a cărui executare a început cu acordul prealabil expres al consumatorului și după confirmarea din partea acestuia că a luat cunoștință de faptul că pierde dreptul de retragere.</li>
</ul>

<h3>4. Condiții de Returnare a Produsului</h3>
<p>Produsele returnate trebuie să îndeplinească următoarele condiții:</p>
<ul>
<li>Să fie în starea originală, nefolosite și nedeteriorare;</li>
<li>Să fie returnate în ambalajul original, cu toate accesoriile, documentele și cadourile incluse în comandă;</li>
<li>Să nu prezinte urme de uzură, murdărie sau deteriorări produse de Cumpărător.</li>
</ul>
<p>Conform art. 14 alin. (2) din OUG nr. 34/2014, Cumpărătorul este responsabil de orice diminuare a valorii produselor rezultată din manipulări, altele decât cele necesare pentru a stabili natura, caracteristicile și funcționarea produselor.</p>

<h3>5. Procedura de Retur</h3>
<p>Pașii pentru returnarea unui produs:</p>
<ul>
<li>Trimite o notificare de retragere la <strong>${email}</strong> sau <strong>${phone}</strong>, indicând numărul comenzii și produsul/produsele pe care dorești să le returnezi;</li>
<li>Vei primi instrucțiunile de returnare și, după caz, eticheta de retur;</li>
<li>Ambalează produsul corespunzător și expediază-l în termen de <strong>14 zile calendaristice</strong> de la data la care ai comunicat decizia de retragere;</li>
<li>Păstrează dovada expedierii.</li>
</ul>

<h3>6. Costurile Returnării</h3>
<p>Costul returului este suportat de <strong>Cumpărător</strong>, cu excepția cazului în care ${name} a acceptat să suporte aceste costuri sau dacă produsul a fost livrat din eroare ori este defect. Vânzătorul va informa Cumpărătorul cu privire la costul estimat al returnării la momentul confirmării returului.</p>

<h3>7. Rambursarea</h3>
<p>Vânzătorul rambursează toate sumele primite, inclusiv costurile de livrare inițiale (cu excepția costurilor suplimentare generate de alegerea unui alt tip de livrare decât livrarea standard), în termen de <strong>14 zile calendaristice</strong> de la data la care a fost informat despre decizia de retragere. Rambursarea se efectuează prin aceeași metodă de plată folosită de Cumpărător, cu excepția cazului în care acesta a acceptat în mod expres o altă metodă.</p>
<p>Vânzătorul poate amâna rambursarea până la primirea produselor returnate sau până când Cumpărătorul furnizează dovada că a expediat produsele, în funcție de care situație intervine prima.</p>

<h3>8. Garanția Legală de Conformitate</h3>
<p>Independent de dreptul de retragere, produsele beneficiază de <strong>garanția legală de conformitate de 2 ani</strong> de la data livrării, conform Legii nr. 449/2003 cu modificările și completările ulterioare. În cazul unui defect de conformitate, contactează-ne la <strong>${email}</strong> sau <strong>${phone}</strong>. Produsele defecte se returnează pe cheltuiala Vânzătorului.</p>

<h3>9. Contact Retur</h3>
<p>Pentru orice solicitare de retur sau pentru asistență, te rugăm să ne contactezi la: <strong>${email}</strong> | <strong>${phone}</strong>. Programul de lucru al departamentului de asistență clienți este afișat pe site.</p>
`.trim();
}

// ─── 4. Politica de Confidențialitate ────────────────────────────────────────

function privacyTemplate(
  name: string, cui: string, addr: string,
  phone: string, email: string, year: number
): string {
  return `
<h2>Politica de Confidențialitate</h2>
<p><em>Ultima actualizare: ${year}</em></p>
<p>Această politică de confidențialitate descrie modul în care <strong>${name}</strong> colectează, utilizează, stochează și protejează datele cu caracter personal, în conformitate cu Regulamentul (UE) 2016/679 al Parlamentului European și al Consiliului din 27 aprilie 2016 (GDPR) și Legea nr. 190/2018 privind măsurile de punere în aplicare a GDPR în România.</p>

<h3>1. Datele Operatorului de Date</h3>
<p>Operatorul de date cu caracter personal este:</p>
<ul>
<li><strong>Denumire:</strong> ${name}</li>
<li><strong>CUI/CIF:</strong> ${cui}</li>
<li><strong>Adresă sediu:</strong> ${addr}</li>
<li><strong>E-mail:</strong> ${email}</li>
<li><strong>Telefon:</strong> ${phone}</li>
</ul>

<h3>2. Ce Date Colectăm</h3>
<p>Colectăm datele cu caracter personal pe care ni le furnizezi direct, atunci când:</p>
<ul>
<li>Plasezi o comandă: nume și prenume, adresă de livrare, număr de telefon, adresă de e-mail;</li>
<li>Creezi un cont: adresă de e-mail, parolă (stocată criptat);</li>
<li>Ne contactezi: conținutul mesajului și datele de identificare;</li>
<li>Te abonezi la newsletter: adresă de e-mail.</li>
</ul>
<p>Colectăm, de asemenea, automat date tehnice privind navigarea pe site: adresa IP, tipul de browser, paginile vizitate, data și ora accesului (prin cookies și tehnologii similare — a se vedea Secțiunea 8).</p>

<h3>3. Scopurile și Temeiul Juridic al Prelucrării</h3>
<p>Prelucrăm datele tale cu caracter personal în baza următoarelor temeiuri juridice prevăzute de art. 6 din GDPR:</p>
<ul>
<li><strong>Executarea contractului (art. 6 alin. 1 lit. b GDPR):</strong> procesarea comenzilor, livrarea produselor, gestionarea retururilor și reclamațiilor, transmiterea confirmărilor de comandă;</li>
<li><strong>Obligație legală (art. 6 alin. 1 lit. c GDPR):</strong> emiterea facturilor, respectarea obligațiilor fiscale și contabile, transmiterea de informații autorităților competente la cererea acestora;</li>
<li><strong>Interes legitim (art. 6 alin. 1 lit. f GDPR):</strong> prevenirea și detectarea fraudelor, securitatea site-ului, îmbunătățirea serviciilor noastre, marketing direct față de clienții existenți (cu posibilitate de opoziție);</li>
<li><strong>Consimțământ (art. 6 alin. 1 lit. a GDPR):</strong> trimiterea de newsletter-uri și comunicări de marketing, utilizarea cookie-urilor neeesențiale.</li>
</ul>

<h3>4. Destinatarii Datelor</h3>
<p>Datele tale pot fi transmise, în condițiile legii, următoarelor categorii de destinatari:</p>
<ul>
<li><strong>Firme de curierat</strong> — pentru efectuarea livrărilor;</li>
<li><strong>Procesatori de plăți</strong> — pentru procesarea tranzacțiilor financiare;</li>
<li><strong>Furnizori de servicii IT</strong> — pentru găzduire web, e-mail tranzacțional, analiză web;</li>
<li><strong>Contabili și auditori</strong> — pentru îndeplinirea obligațiilor legale;</li>
<li><strong>Autorități publice</strong> — la solicitarea expresă și în temeiul obligațiilor legale (ANAF, Poliție, ANPC etc.).</li>
</ul>
<p>Nu vindem, nu închiriem și nu cedăm datele tale cu caracter personal unor terțe părți în scop comercial.</p>

<h3>5. Transferuri Internaționale de Date</h3>
<p>Unii dintre furnizorii noștri de servicii IT pot fi localizați în afara Spațiului Economic European (SEE). În astfel de cazuri, ne asigurăm că transferul de date are loc în condiții adecvate de protecție, bazate pe decizii de adecvare ale Comisiei Europene, clauze contractuale standard (SCC) sau alte garanții adecvate, conform Capitolului V din GDPR.</p>

<h3>6. Perioada de Stocare</h3>
<p>Stocăm datele tale pentru perioadele minime impuse de lege și/sau necesare scopului prelucrării:</p>
<ul>
<li><strong>Date de facturare și contabile:</strong> 10 ani (conform Legii contabilității nr. 82/1991);</li>
<li><strong>Date privind comenzile:</strong> 3 ani de la data ultimei comenzi (termen de prescripție);</li>
<li><strong>Date de cont:</strong> pe durata existenței contului + 2 ani de la ștergere;</li>
<li><strong>Date de marketing (newsletter):</strong> până la retragerea consimțământului;</li>
<li><strong>Date tehnice (loguri, IP):</strong> maxim 12 luni.</li>
</ul>

<h3>7. Drepturile Persoanei Vizate</h3>
<p>Conform GDPR, ai dreptul la: acces, rectificare, ștergere, restricționarea prelucrării, portabilitate și opoziție. Detaliile complete privind aceste drepturi și modalitățile de exercitare sunt disponibile în <strong>Secțiunea GDPR — Drepturile Tale</strong>.</p>

<h3>8. Cookie-uri</h3>
<p>Site-ul utilizează cookie-uri și tehnologii similare. Cookie-urile esențiale (necesare funcționării site-ului) sunt active implicit. Cookie-urile de analiză și marketing necesită consimțământul tău explicit, acordat prin intermediul bannerului de cookie-uri afișat la prima vizită.</p>
<p>Poți gestiona preferințele privind cookie-urile din setările browser-ului sau prin revocarea consimțământului din panoul de setări cookie al site-ului.</p>

<h3>9. Securitatea Datelor</h3>
<p>Implementăm măsuri tehnice și organizatorice adecvate pentru protejarea datelor tale împotriva accesului neautorizat, pierderii, distrugerii sau divulgării. Conexiunile cu site-ul sunt securizate prin protocol HTTPS/TLS. Parola contului este stocată în formă criptată (hash). În cazul unui incident de securitate care îți afectează drepturile, vei fi notificat conform cerințelor GDPR.</p>

<h3>10. Modificarea Politicii de Confidențialitate</h3>
<p>Această politică poate fi actualizată periodic. Versiunea actualizată va fi publicată pe site cu menționarea datei ultimei modificări. Te încurajăm să verifici periodic această pagină.</p>

<h3>11. Contact</h3>
<p>Pentru orice întrebare sau solicitare privind datele tale personale, ne poți contacta la:<br/>
<strong>E-mail:</strong> ${email}<br/>
<strong>Adresă:</strong> ${addr}</p>
<p>Ai dreptul de a depune o plângere la <strong>Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</strong>, cu sediul în B-dul Gheorghe Magheru nr. 28–30, sector 1, București, e-mail: <em>anspdcp@dataprotection.ro</em>, website: <em>www.dataprotection.ro</em>.</p>
`.trim();
}

// ─── 5. GDPR — Drepturile Tale ────────────────────────────────────────────────

function gdprTemplate(name: string, email: string): string {
  return `
<h2>GDPR — Drepturile Tale ca Persoană Vizată</h2>

<p>Conform Regulamentului (UE) 2016/679 (GDPR), ai o serie de drepturi cu privire la datele tale cu caracter personal prelucrate de <strong>${name}</strong>. Mai jos găsești o descriere detaliată a fiecărui drept și a modului în care îl poți exercita.</p>

<h3>1. Dreptul de Acces (Art. 15 GDPR)</h3>
<p>Ai dreptul de a obține din partea noastră o confirmare dacă prelucrăm date cu caracter personal care te privesc și, în caz afirmativ, acces la datele respective, împreună cu informații despre: scopurile prelucrării, categoriile de date, destinatarii datelor, perioada de stocare, dreptul de rectificare/ștergere/restricționare, dreptul de a depune o plângere.</p>
<p>Poți solicita o copie gratuită a datelor tale personale. Pentru copii suplimentare, putem percepe o taxă administrativă rezonabilă.</p>

<h3>2. Dreptul la Rectificare (Art. 16 GDPR)</h3>
<p>Ai dreptul de a obține rectificarea datelor inexacte care te privesc, fără întârzieri nejustificate. Ținând cont de scopurile prelucrării, ai dreptul de a completa datele incomplete.</p>

<h3>3. Dreptul la Ștergere — „Dreptul de a fi Uitat" (Art. 17 GDPR)</h3>
<p>Ai dreptul de a obține ștergerea datelor tale personale, fără întârzieri nejustificate, în unul din următoarele cazuri:</p>
<ul>
<li>Datele nu mai sunt necesare pentru scopul pentru care au fost colectate;</li>
<li>Îți retragi consimțământul și nu există alt temei juridic pentru prelucrare;</li>
<li>Te opui prelucrării și nu există motive legitime prevalente;</li>
<li>Datele au fost prelucrate ilegal;</li>
<li>Ștergerea este necesară pentru respectarea unei obligații legale.</li>
</ul>
<p>Dreptul la ștergere nu se aplică dacă prelucrarea este necesară pentru executarea unui contract, respectarea unei obligații legale, sau constatarea, exercitarea sau apărarea unui drept în instanță.</p>

<h3>4. Dreptul la Restricționarea Prelucrării (Art. 18 GDPR)</h3>
<p>Ai dreptul de a obține restricționarea prelucrării în situațiile în care:</p>
<ul>
<li>Contești exactitatea datelor, pe o perioadă care ne permite verificarea;</li>
<li>Prelucrarea este ilegală, dar optezi pentru restricționare în loc de ștergere;</li>
<li>Nu mai avem nevoie de date, dar tu le soliciți pentru constatarea, exercitarea sau apărarea unui drept;</li>
<li>Te-ai opus prelucrării, în așteptarea verificării motivelor legitime.</li>
</ul>
<p>Pe durata restricționării, datele vor fi stocate, dar nu prelucrate în alt mod fără consimțământul tău sau pentru constatarea, exercitarea ori apărarea unor drepturi.</p>

<h3>5. Dreptul la Portabilitatea Datelor (Art. 20 GDPR)</h3>
<p>Ai dreptul de a primi datele tale personale pe care ni le-ai furnizat într-un format structurat, utilizat frecvent și care poate fi citit automat (ex: JSON, CSV). De asemenea, ai dreptul de a transmite aceste date altui operator, fără impedimente din partea noastră, atunci când:</p>
<ul>
<li>Prelucrarea se bazează pe consimțământ sau pe un contract; și</li>
<li>Prelucrarea este efectuată prin mijloace automate.</li>
</ul>

<h3>6. Dreptul de Opoziție (Art. 21 GDPR)</h3>
<p>Ai dreptul de a te opune în orice moment, din motive legate de situația ta particulară, prelucrării datelor tale în temeiul interesului legitim al operatorului. Vom înceta prelucrarea dacă nu demonstrăm motive legitime și imperioase care justifică prelucrarea și prevalează asupra intereselor, drepturilor și libertăților tale, sau dacă prelucrarea nu este necesară pentru constatarea, exercitarea sau apărarea unui drept în instanță.</p>
<p><strong>Marketing direct:</strong> Ai dreptul absolut de a te opune în orice moment prelucrării datelor tale în scopuri de marketing direct, inclusiv creării de profiluri. În urma opoziției tale, datele nu vor mai fi prelucrate în aceste scopuri.</p>

<h3>7. Dreptul de a Nu Face Obiectul unei Decizii Automate (Art. 22 GDPR)</h3>
<p>Ai dreptul de a nu face obiectul unei decizii bazate exclusiv pe prelucrarea automată, inclusiv crearea de profiluri, care produce efecte juridice sau te afectează în mod similar semnificativ. Acest drept nu se aplică dacă decizia este necesară pentru încheierea sau executarea unui contract, este autorizată prin lege sau se bazează pe consimțământul tău explicit.</p>

<h3>8. Cum Îți Exerciți Drepturile</h3>
<p>Pentru a-ți exercita oricare din drepturile de mai sus, ne poți contacta la: <strong>${email}</strong>. Vei primi un răspuns în termen de cel mult <strong>30 de zile calendaristice</strong> de la primirea solicitării. Această perioadă poate fi prelungită cu până la 60 de zile suplimentare, în cazuri complexe, cu notificarea ta prealabilă.</p>
<p>Solicitarea poate fi transmisă gratuit. Dacă solicitările sunt în mod vădit nefondate sau excesive (în special din cauza caracterului lor repetitiv), putem percepe o taxă rezonabilă sau putem refuza să dăm curs cererii.</p>
<p>Putem solicita informații suplimentare pentru a-ți verifica identitatea, în vederea protejării datelor tale față de divulgarea neautorizată.</p>

<h3>9. Dreptul de a Depune o Plângere la ANSPDCP</h3>
<p>Dacă consideri că prelucrarea datelor tale cu caracter personal încalcă prevederile GDPR, ai dreptul de a depune o plângere la autoritatea de supraveghere competentă:</p>
<ul>
<li><strong>Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</strong></li>
<li>Adresă: B-dul Gheorghe Magheru nr. 28–30, sector 1, 010336 București</li>
<li>E-mail: <em>anspdcp@dataprotection.ro</em></li>
<li>Website: <em>www.dataprotection.ro</em></li>
</ul>
<p>Ai, de asemenea, dreptul de a exercita o cale de atac judiciară eficientă împotriva operatorului sau împotriva autorității de supraveghere.</p>
`.trim();
}

// ─── 6. Politica de Anulare a Comenzii ───────────────────────────────────────

function cancellationTemplate(name: string, email: string, phone: string): string {
  return `
<h2>Politica de Anulare a Comenzii</h2>

<h3>1. Anularea Comenzii Înainte de Expediere</h3>
<p>Poți solicita anularea comenzii în orice moment <strong>înainte ca produsul să fie expediat</strong>. Contactează-ne de urgență la:</p>
<ul>
<li><strong>Telefon:</strong> ${phone} (recomandat, pentru un răspuns rapid)</li>
<li><strong>E-mail:</strong> ${email}</li>
</ul>
<p>Menționează în solicitare <strong>numărul comenzii</strong> și motivul anulării (opțional). Vom confirma anularea în cel mai scurt timp posibil. Dacă comanda nu a fost încă expediată, vom anula comanda și îți vom rambursa integral suma achitată în termen de <strong>14 zile calendaristice</strong>, prin aceeași metodă de plată utilizată.</p>

<h3>2. Anularea Comenzii după Expediere</h3>
<p>Dacă comanda a fost deja expediată, nu o mai putem anula în sistem. În acest caz, ai două opțiuni:</p>
<ul>
<li><strong>Refuzarea coletului</strong> la livrare: comunică curierului că refuzi coletul. Acesta va fi returnat la noi, iar suma achitată va fi rambursată (cu deducerea costurilor de transport dus-întors, dacă este cazul);</li>
<li><strong>Dreptul de retragere de 14 zile:</strong> după primirea coletului, poți exercita dreptul legal de retragere conform <strong>Politicii de Retur</strong>, în termen de 14 zile calendaristice de la primire, fără a invoca niciun motiv.</li>
</ul>

<h3>3. Comenzi Ramburs Neridicate</h3>
<p>Dacă ai plasat o comandă cu plată ramburs și nu ridici coletul în termenul specificat de firmă de curierat, acesta va fi returnat la ${name}. În acest caz, costurile de transport (dus și întors) vor fi suportate de Cumpărător. Ne rezervăm dreptul de a solicita plata în avans pentru comenzile ulterioare ale aceluiași client, în cazul refuzurilor repetate nejustificate.</p>

<h3>4. Produse Care Nu Pot fi Anulate</h3>
<p>Anumite categorii de produse nu pot fi anulate sau returnate, conform art. 16 din OUG nr. 34/2014:</p>
<ul>
<li>Produse realizate la comandă sau personalizate conform specificațiilor tale (de exemplu: gravuri, dimensiuni non-standard, imprimeuri personalizate);</li>
<li>Produse perisabile sau cu termen scurt de valabilitate;</li>
<li>Produse sigilate care au fost deschise (din motive de igienă sau sănătate);</li>
<li>Conținut digital livrat electronic, după descărcare/activare, cu acordul tău prealabil expres.</li>
</ul>

<h3>5. Rambursarea</h3>
<p>În cazul anulării comenzii, suma achitată va fi rambursată astfel:</p>
<ul>
<li><strong>Card bancar/transfer:</strong> suma va fi returnată în contul din care s-a efectuat plata, în termen de <strong>3–14 zile lucrătoare</strong>, în funcție de banca emitentă;</li>
<li><strong>Ramburs (numerar la livrare):</strong> suma va fi transferată în contul bancar indicat de tine, în termen de <strong>14 zile calendaristice</strong> de la confirmare.</li>
</ul>
<p>Nu percepem penalități sau comisioane pentru anularea comenzilor efectuate cu bună-credință.</p>

<h3>6. Anularea Comenzii de Către Vânzător</h3>
<p>${name} își rezervă dreptul de a anula o comandă în următoarele situații:</p>
<ul>
<li>Produsul nu mai este disponibil în stoc (epuizat după plasarea comenzii);</li>
<li>Prețul afișat a conținut o eroare evidentă (de exemplu, un produs de 1.000 lei afișat la 1 leu);</li>
<li>Datele de contact furnizate sunt incorecte sau incomplete și Cumpărătorul nu poate fi contactat;</li>
<li>Există indicii clare de fraudă sau utilizare abuzivă a platformei.</li>
</ul>
<p>În toate aceste cazuri, Cumpărătorul va fi notificat prin e-mail sau telefon și suma achitată va fi rambursată integral.</p>

<h3>7. Contact</h3>
<p>Pentru orice solicitare de anulare sau pentru asistență, contactează-ne la:<br/>
<strong>Telefon:</strong> ${phone}<br/>
<strong>E-mail:</strong> ${email}</p>
`.trim();
}
