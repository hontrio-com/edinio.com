-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPANIA SMS ISI SCRIE RANDUL INAINTE DE A TRIMITE, NU DUPA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA STRICAT, SI DE CE E SCUMP
--
-- `sendSmsCampaign` trimite mesajele PE RAND, unul cate unul, intr-o bucla
-- secventiala. Randul campaniei din `sms_campaigns` se scria ABIA DUPA ce bucla
-- se termina. Deci intre primul si ultimul SMS nu exista nicio scriere in baza.
--
-- La o oprire brutala (termen depasit, redesfasurare, instanta taiata), o parte
-- din mesaje au plecat deja catre oameni reali si au consumat credit SMSO adevarat,
-- iar la noi NU ramane nicio urma ca ar fi existat campania. O a doua apasare reia
-- de la primul numar: aceiasi oameni primesc inca o data, si se plateste inca o data.
--
-- ⚠ Fereastra e mai ingusta decat pare, si merita spus ca sa nu se creada mai mult
-- decat e: `sendSms` isi inghite erorile de retea si intoarce `success: false`, deci
-- un numar prost NU rupe bucla, iar campania partiala isi primeste randul normal.
-- Campania invizibila apare STRICT la o oprire brutala.
--
-- ⚠ DE CE E NEVOIE DE MIGRATIE CHIAR SI PENTRU VARIANTA MICA
--
-- `sms_campaigns_status_check` accepta azi DOAR 'sent', 'partial' si 'failed'. Un
-- rand pus inaintea buclei n-are deci ce stare sa poarte: baza l-ar refuza. Asta e
-- si singura schimbare de schema de care e nevoie. Tabela are deja `recipient_count`,
-- `sent_count` si `failed_count`, iar `created_at` da ora inceputului, deci nu se
-- adauga nicio coloana.
--
-- ⚠ E O LARGIRE, NU O INGUSTARE. Constrangerea noua accepta o valoare in plus si nu
-- poate respinge niciun rand care trecea pana acum.
--
-- ⚠ `default 'sent'` RAMANE NEATINS, dinadins. Implicitul e mostenit si orice alt
-- scriitor se bazeaza pe el; codul campaniei da starea explicit. Mutarea implicitului
-- pe 'in_curs' ar fi schimbat comportamentul pentru scriitori pe care nu i-am masurat.
--
-- ⚠ CE NU FACE MIGRATIA ASTA
--
-- Nu impiedica pe nimeni sa primeasca de doua ori. Pentru asta ar trebui urma pe
-- DESTINATAR, nu pe campanie, adica o tabela noua sau un fel nou in registrul de
-- operatii externe. Aia e functionalitate noua si cere plan aprobat. Aici se lasa
-- doar urma campaniei: cat era de trimis, cat a apucat, si ca a ramas neterminata.

alter table public.sms_campaigns drop constraint sms_campaigns_status_check;

alter table public.sms_campaigns add constraint sms_campaigns_status_check
  check (status = any (array['in_curs'::text, 'sent'::text, 'partial'::text, 'failed'::text]));
