-- ═══════════════════════════════════════════════════════════════════════════
-- CONTACTELE SUPRIMATE: SI TELEFON, SI MOTIV (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA GRESIT.
--
-- `recovery_optout` avea DOAR `email`. Dezabonarea de la SMS nu se putea nici
-- macar exprima, deci cu atat mai putin respecta: un om care cere sa nu mai
-- primeasca mesaje nu avea unde sa fie trecut, daca lasase doar telefonul.
--
-- Iar lista era citita numai de cron. Trimiterea de mana din panou
-- (`sendAbandonedCartEmail`, `sendAbandonedCartSms`) nu o atingea deloc: un
-- client dezabonat putea primi mai departe mesaje, apasate cu mana. Pe
-- productie plecasera deja 34 de emailuri si 21 de SMS-uri catre oameni
-- adevarati, deci nu era o gaura teoretica.
--
-- ⚠ NU E DOAR „DEZABONARE". Un numar gresit, un email respins de serverul lor
-- sau o reclamatie de spam inseamna tot „nu mai trimite", dar din alt motiv, si
-- comerciantul trebuie sa vada CARE - altfel se intreaba de ce nu pleaca
-- mesajul. De-aia `motiv`.
--
-- ⚠ EMAILUL DEVINE OPTIONAL, fiindca acum exista randuri numai cu telefon.
-- Indexul unic vechi ramane valabil: `lower(email)` pe un rand cu email NULL nu
-- intra in el, deci nu se ciocnesc intre ele randurile de telefon.

alter table public.recovery_optout
  alter column email drop not null,
  add column if not exists phone text,
  add column if not exists motiv text not null default 'dezabonare';

comment on column public.recovery_optout.motiv is
  'De ce nu se mai trimite: dezabonare | numar_invalid | email_respins | reclamatie_spam | nu_contacta.';

-- ⚠ Un rand fara NICIUN contact n-ar suprima pe nimeni, dar ar trece de indexuri
-- (ambele sunt partiale) si ar sta acolo ca un contact suprimat care nu e nimeni.
alter table public.recovery_optout
  drop constraint if exists recovery_optout_are_un_contact;
alter table public.recovery_optout
  add constraint recovery_optout_are_un_contact
  check (email is not null or phone is not null);

-- Acelasi telefon nu se trece de doua ori pentru acelasi magazin.
create unique index if not exists recovery_optout_business_phone_uidx
  on public.recovery_optout (business_id, phone)
  where phone is not null;

notify pgrst, 'reload schema';
