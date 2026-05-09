import { LegalPage, LSection, LSubSection, LList, LTable, LCompanyBox } from '@/components/marketing/legal-page'

export const metadata = {
  title: 'Politică Cookies | Edinio',
  description: 'Politica privind cookie-urile platformei Edinio.com — SC VOID SFT GAMES SRL',
}

export default function CookiesPage() {
  return (
    <LegalPage title="Politică privind Cookie-urile" lastUpdated="09 mai 2026">

      <LSection num="1" title="Ce sunt cookie-urile">
        <p>
          Cookie-urile sunt fișiere text de mici dimensiuni pe care un site web le stochează pe dispozitivul
          dumneavoastră (calculator, telefon, tabletă) atunci când vizitați acel site. Sunt utilizate pe scară
          largă pentru a face site-urile web să funcționeze eficient, pentru a reține preferințele utilizatorilor
          și pentru a furniza informații proprietarilor site-ului.
        </p>
        <p>Pe lângă cookie-uri clasice, utilizăm și tehnologii similare:</p>
        <LList items={[
          'Local Storage — stocare de date în browserul dumneavoastră',
          'Session Storage — stocare temporară de date, ștearsă la închiderea browserului',
          'Pixeli de urmărire — imagini invizibile utilizate pentru măsurarea comportamentului',
        ]} />
      </LSection>

      <LSection num="2" title="Temeiul legal">
        <p>Utilizarea cookie-urilor pe Platforma Edinio.com se realizează în conformitate cu:</p>
        <LList items={[
          'Regulamentul (UE) 2016/679 (GDPR)',
          'Legea nr. 506/2004 privind prelucrarea datelor cu caracter personal și protecția vieții private în sectorul comunicațiilor electronice',
          'Directiva 2002/58/CE (Directiva ePrivacy), modificată prin Directiva 2009/136/CE',
        ]} />
        <p>
          <strong>Cookie-urile strict necesare</strong> funcționează pe baza interesului legitim al operatorului
          (art. 6(1)(f) GDPR) și nu necesită consimțământul dumneavoastră.
        </p>
        <p>
          <strong>Cookie-urile analitice, de marketing și de preferințe</strong> sunt plasate exclusiv pe baza
          consimțământului dumneavoastră explicit (art. 6(1)(a) GDPR), exprimat prin interacțiunea cu bannerul
          de cookie-uri afișat la prima vizită.
        </p>
      </LSection>

      <LSection num="3" title="Tipurile de cookie-uri utilizate">
        <LSubSection id="3.1." title="Cookie-uri strict necesare">
          <p>
            Aceste cookie-uri sunt esențiale pentru funcționarea Platformei și nu pot fi dezactivate.
            Fără ele, anumite funcționalități de bază nu ar funcționa corect.
          </p>
          <LTable
            heads={['Nume cookie', 'Furnizor', 'Scop', 'Durată']}
            rows={[
              ['sb-access-token', 'Supabase', 'Autentificarea sesiunii utilizatorului logat', 'Sesiune'],
              ['sb-refresh-token', 'Supabase', 'Reînnoirea automată a sesiunii de autentificare', '30 zile'],
              ['edinio-geo', 'Edinio.com', 'Reținerea limbii și valutei detectate (RO/EN)', '24 ore'],
              ['__stripe_mid', 'Stripe', 'Prevenirea fraudelor la plată', '1 an'],
              ['__stripe_sid', 'Stripe', 'Identificarea sesiunii de plată', '30 minute'],
              ['csrf-token', 'Edinio.com', 'Protecție împotriva atacurilor CSRF', 'Sesiune'],
            ]}
          />
          <p className="text-xs italic" style={{ color: 'rgba(10,26,15,0.45)' }}>
            Nu necesită consimțământ — baza legală: interes legitim.
          </p>
        </LSubSection>

        <LSubSection id="3.2." title="Cookie-uri de preferințe">
          <p>Aceste cookie-uri rețin alegerile dumneavoastră pe Platformă pentru a oferi o experiență personalizată.</p>
          <LTable
            heads={['Nume cookie', 'Furnizor', 'Scop', 'Durată']}
            rows={[
              ['edinio-locale', 'Edinio.com', 'Reținerea limbii selectate manual (RO/EN)', '1 an'],
              ['preferred_currency', 'Edinio.com', 'Reținerea valutei preferate (RON/EUR)', '1 an'],
              ['cookie-consent', 'Edinio.com', 'Reținerea opțiunilor dumneavoastră privind cookie-urile', '1 an'],
            ]}
          />
          <p className="text-xs italic" style={{ color: 'rgba(10,26,15,0.45)' }}>
            Necesită consimțământ — pot fi dezactivate fără a afecta funcționalitatea de bază.
          </p>
        </LSubSection>

        <LSubSection id="3.3." title="Cookie-uri analitice">
          <p>
            Aceste cookie-uri colectează informații despre modul în care vizitatorii utilizează Platforma.
            Toate datele sunt agregate și anonimizate — nu permit identificarea personală a utilizatorilor.
          </p>
          <LTable
            heads={['Nume cookie', 'Furnizor', 'Scop', 'Durată']}
            rows={[
              ['_ga', 'Google Analytics 4', 'Identificarea unică a utilizatorilor pentru statistici', '2 ani'],
              ['_ga_*', 'Google Analytics 4', 'Reținerea stării sesiunii de analiză', '2 ani'],
              ['_gid', 'Google Analytics 4', 'Diferențierea utilizatorilor în statistici', '24 ore'],
              ['_gat', 'Google Analytics 4', 'Limitarea ratei de cereri trimise către GA', '1 minut'],
            ]}
          />
          <p className="text-xs italic" style={{ color: 'rgba(10,26,15,0.45)' }}>
            Necesită consimțământ. Datele colectate: paginile vizitate, durata vizitei, sursa traficului,
            tipul dispozitivului. Funcția de anonimizare IP este activată.
          </p>
        </LSubSection>

        <LSubSection id="3.4." title="Cookie-uri de marketing">
          <p>
            Aceste cookie-uri sunt utilizate pentru a măsura eficiența campaniilor publicitare derulate pe
            platformele Meta (Facebook, Instagram) și pentru a personaliza reclamele afișate dumneavoastră.
          </p>
          <LTable
            heads={['Nume cookie', 'Furnizor', 'Scop', 'Durată']}
            rows={[
              ['_fbp', 'Meta Platforms', 'Identificarea vizitatorilor pentru publicitate Facebook/Instagram', '3 luni'],
              ['_fbc', 'Meta Platforms', 'Reținerea parametrului de click din reclame Facebook', '3 luni'],
              ['fr', 'Meta Platforms', 'Livrarea și măsurarea relevanței reclamelor Meta', '3 luni'],
            ]}
          />
          <p className="text-xs italic" style={{ color: 'rgba(10,26,15,0.45)' }}>
            Necesită consimțământ — refuzul acestora nu afectează accesul la cursuri.
          </p>
          <div className="p-3 rounded-lg mt-2" style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.12)' }}>
            <p className="text-xs">
              <strong>Important:</strong> Utilizăm și Meta Conversions API (CAPI) — o tehnologie server-side care
              transmite date despre evenimentele de conversie direct de pe serverele noastre către Meta, cu datele
              hashed (criptate ireversibil). Această transmisie se activează exclusiv când efectuați o acțiune
              concretă pe Platformă.
            </p>
          </div>
        </LSubSection>
      </LSection>

      <LSection num="4" title="Cookie-uri terțe">
        <p>
          Unele cookie-uri sunt plasate de servicii terțe. Aceste cookie-uri sunt guvernate de politicile de
          confidențialitate ale respectivelor companii, nu de prezenta Politică:
        </p>
        <LTable
          heads={['Furnizor terț', 'Scop', 'Politică confidențialitate']}
          rows={[
            ['Google LLC', 'Google Analytics 4', 'policies.google.com/privacy'],
            ['Meta Platforms Ireland', 'Meta Pixel, publicitate', 'facebook.com/privacy/policy'],
            ['Stripe Inc.', 'Procesare plăți, anti-fraudă', 'stripe.com/privacy'],
            ['Vercel Inc.', 'Infrastructură hosting', 'vercel.com/legal/privacy-policy'],
          ]}
        />
      </LSection>

      <LSection num="5" title="Durata cookie-urilor">
        <LList items={[
          'Cookie-uri de sesiune — șterse automat când închideți browserul. Nu sunt stocate permanent pe dispozitivul dumneavoastră.',
          'Cookie-uri persistente — rămân pe dispozitivul dumneavoastră pentru o perioadă determinată (specificată în tabelele de mai sus) sau până când le ștergeți manual.',
        ]} />
      </LSection>

      <LSection num="6" title="Cum vă gestionați consimțământul">
        <LSubSection id="6.1." title="Bannerul de cookie-uri">
          <p>La prima vizită pe Edinio.com, vi se afișează un banner prin care puteți:</p>
          <LList items={[
            'Accepta toate cookie-urile (inclusiv analitice și de marketing)',
            'Accepta doar necesarele (refuzi cookie-urile analitice și de marketing)',
          ]} />
          <p>Alegerea dumneavoastră este reținută în cookie-ul cookie-consent timp de 1 an. Puteți reveni oricând asupra deciziei.</p>
        </LSubSection>

        <LSubSection id="6.2." title="Modificarea preferințelor ulterior">
          <p>Puteți modifica preferințele privind cookie-urile oricând prin:</p>
          <LList items={[
            'Ștergerea cookie-ului cookie-consent din browser (bannerul va reapărea la următoarea vizită)',
            'Secțiunea Setări cont → Confidențialitate (pentru utilizatorii logați)',
          ]} />
        </LSubSection>

        <LSubSection id="6.3." title="Controlul prin setările browserului">
          <p>Puteți controla cookie-urile și prin setările browserului dumneavoastră:</p>
          <LList items={[
            'Google Chrome: Setări → Confidențialitate și securitate → Cookie-uri și alte date ale site-urilor',
            'Mozilla Firefox: Opțiuni → Confidențialitate și securitate → Cookie-uri și date ale site-urilor',
            'Safari: Preferințe → Confidențialitate → Gestionare date site-uri',
            'Microsoft Edge: Setări → Cookie-uri și permisiuni pentru site-uri',
          ]} />
          <div className="p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs" style={{ color: 'rgba(10,26,15,0.65)' }}>
              <strong>Atenție:</strong> Blocarea tuturor cookie-urilor prin browser poate afecta funcționalitatea
              Platformei, inclusiv imposibilitatea de a vă autentifica sau de a accesa cursurile achiziționate.
            </p>
          </div>
        </LSubSection>

        <LSubSection id="6.4." title="Dezactivarea Google Analytics">
          <p>
            Puteți dezactiva colectarea datelor de către Google Analytics instalând extensia de browser
            Google Analytics Opt-out Add-on, disponibilă la:{' '}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#16a34a' }}>
              tools.google.com/dlpage/gaoptout
            </a>
          </p>
        </LSubSection>

        <LSubSection id="6.5." title="Dezactivarea publicității Meta personalizate">
          <p>Puteți gestiona preferințele de publicitate Meta accesând:</p>
          <LList items={[
            'facebook.com/adpreferences pentru Facebook',
            'instagram.com/accounts/privacy_and_security pentru Instagram',
          ]} />
        </LSubSection>
      </LSection>

      <LSection num="7" title="Impactul refuzului cookie-urilor">
        <LTable
          heads={['Categorie', 'Impact dacă refuzați']}
          rows={[
            ['Strict necesare', 'Nu pot fi refuzate — esențiale pentru funcționare'],
            ['Preferințe', 'Platforma nu va reține limba și valuta selectată'],
            ['Analitice', 'Niciun impact asupra funcționalității cursurilor'],
            ['Marketing', 'Reclamele Meta pot fi mai puțin relevante pentru dumneavoastră'],
          ]}
        />
      </LSection>

      <LSection num="8" title="Actualizări ale politicii">
        <p>
          Putem actualiza prezenta Politică privind Cookie-urile pentru a reflecta modificări în tehnologiile
          utilizate, legislație sau practicile noastre. Data ultimei actualizări este afișată în antetul
          documentului. În cazul modificărilor semnificative, vă vom notifica prin afișarea unui banner
          actualizat de consimțământ pe Platformă.
        </p>
      </LSection>

      <LSection num="9" title="Contact">
        <LCompanyBox />
        <p className="mt-4">
          Autoritatea de supraveghere: <strong>ANSPDCP</strong> —{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#16a34a' }}>
            www.dataprotection.ro
          </a>
        </p>
        <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <p className="text-xs" style={{ color: 'rgba(10,26,15,0.38)' }}>
            Politică privind Cookie-urile valabilă începând cu 09 mai 2026 · SC VOID SFT GAMES SRL — Edinio.com
          </p>
        </div>
      </LSection>

    </LegalPage>
  )
}
