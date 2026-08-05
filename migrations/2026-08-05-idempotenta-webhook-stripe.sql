-- ============================================================================
-- MEDIU — Webhook-ul Stripe devine idempotent (audit 05.08.2026, constatarea 11)
--
-- PROBLEMA:
--   Stripe livreaza AT-LEAST-ONCE: la orice raspuns non-2xx sau timeout,
--   retrimite ACELASI eveniment. Ramura `domain_order` din
--   src/app/api/stripe/webhook/route.ts facea TOT inline inainte de a raspunde —
--   insert in domain_orders, apel SmartBill, insert in invoices, email admin —
--   si nu avea nicio dedupe. Iar `createSmartbillInvoice` (src/lib/smartbill.ts)
--   face fetch FARA timeout si inghite erorile, deci handlerul atarna in loc sa
--   cada rapid. Rezultatul unei singure relivrari: a doua comanda de domeniu, un
--   al DOILEA document fiscal pe aceeasi incasare (storno la ANAF) si inca un
--   email catre admin.
--
--   `unique(stripe_invoice_id)` pe invoices nu ajuta: apelul SmartBill se face
--   INAINTE de insert, deci a doua factura se emite oricum si doar nu mai e
--   inregistrata — o factura orfana, mai rea decat una duplicata vizibila.
--
-- CE ADAUGA MIGRATIA (codul o foloseste, dar merge si fara ea — degradat):
--   1. `stripe_events` — registrul evenimentelor deja procesate, cu event_id ca
--      PRIMARY KEY. Webhook-ul insereaza randul ca PRIMA instructiune: a doua
--      livrare se loveste de 23505 si iese inainte de orice scriere.
--      Codul sterge randul daca evenimentul NU a fost dus la capat (raspuns
--      non-2xx sau exceptie), altfel reluarea Stripe ar fi respinsa ca duplicat
--      si o plata reusita ar ramane neprocesata pentru totdeauna.
--   2. `domain_orders.stripe_session_id` + index UNIC — a doua plasa, pe cheia
--      platii: aceeasi sesiune de checkout nu poate produce doua comenzi.
--
-- NU E APLICATA. Pana se aplica, webhook-ul functioneaza fara dedupe (registrul
-- lipsa e tratat ca „proceseaza", iar insertul se reia fara coloana), deci
-- comportamentul ramane exact cel de azi. Se aplica IMPREUNA cu deploy-ul.
-- ============================================================================

-- 1) Registrul evenimentelor Stripe deja procesate ---------------------------
create table if not exists public.stripe_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);

-- Doar pentru curatenia periodica (randurile vechi nu mai apara nimic: Stripe
-- nu reia un eveniment dupa ~3 zile). Ex: delete from public.stripe_events
-- where created_at < now() - interval '30 days';
create index if not exists stripe_events_created_at_idx
  on public.stripe_events (created_at);

-- Tabel de uz intern: doar service role scrie in el (webhook-ul). RLS pornit
-- fara nicio politica = nimeni cu cheia anon/authenticated nu vede si nu scrie.
alter table public.stripe_events enable row level security;

-- 2) Cheia platii pe comanda de domeniu --------------------------------------
alter table public.domain_orders
  add column if not exists stripe_session_id text;

-- Partial: comenzile vechi (si eventualele inregistrari manuale) au NULL si nu
-- trebuie sa se ciocneasca intre ele.
create unique index if not exists domain_orders_stripe_session_id_key
  on public.domain_orders (stripe_session_id)
  where stripe_session_id is not null;

-- DUPA aplicare, PostgREST trebuie sa isi reincarce schema, altfel insertul cu
-- coloana noua tot esueaza cu PGRST204 (vezi incidentul MFA din 04.08).
notify pgrst, 'reload schema';
