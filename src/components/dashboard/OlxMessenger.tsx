"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  MessageSquare, Loader2, X, Send, ArrowLeft, User as UserIcon, ExternalLink, Tag,
  Star, Search, Paperclip, ChevronDown,
} from "lucide-react";
import { replyOlxThread, type OlxAdvertRow } from "@/lib/actions/olx.actions";
import {
  deschideOlxConversatia, getOlxAtasamente, getOlxThreadsPage, setOlxThreadFavorit,
  type OlxAtasament, type OlxConversatie,
} from "@/lib/actions/olx-mesaje.actions";
import type { OlxThread } from "@/lib/olx/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export function OlxMessenger({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [threads, setThreads] = useState<OlxThread[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [areMaiMulte, setAreMaiMulte] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [seIncarca, startIncarcare] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getOlxThreadsPage(businessId, 0).then((r) => {
      if (cancelled) return;
      /*
       * ⚠ Prima incarcare NU scoate un toast. Cartonasul se deseneaza si pe magazinele care n-au
       * conectat inca OLX, iar acolo raspunsul e „Conectează mai întâi contul OLX" — un toast de
       * eroare la fiecare intrare in pagina, pentru ceva ce omul n-a cerut. Motivul se pastreaza
       * si se arata inauntru, in lista, unde chiar e vorba despre conversatii.
       */
      if ("error" in r) { setThreads([]); setAreMaiMulte(false); setEroare(r.error); return; }
      setThreads(r.threads);
      setOffset(r.urmatorulOffset);
      setAreMaiMulte(r.areMaiMulte);
      setEroare(null);
    });
    return () => { cancelled = true; };
  }, [businessId]);

  const unreadTotal = (threads ?? []).reduce((n, t) => n + (t.unread_count ?? 0), 0);
  const count = threads?.length ?? 0;

  /* O singura sursa de adevar pentru conversatii: modalul se inchide, lista incarcata ramane. */
  const actualizeazaConversatia = useCallback((threadId: number, petic: Partial<OlxThread>) => {
    setThreads((prev) => (prev ?? []).map((t) => (t.id === threadId ? { ...t, ...petic } : t)));
  }, []);

  const incarcaMaiMulte = useCallback(() => {
    startIncarcare(async () => {
      const r = await getOlxThreadsPage(businessId, offset);
      /* Aici omul A APASAT, deci raspunsul i se spune. */
      if ("error" in r) { toast.error(r.error); return; }
      setThreads((prev) => {
        /*
         * ⚠ Paginarea pe offset merge peste o lista care SE REASEAZA: un mesaj nou urca firul lui
         * in capul listei, deci o conversatie deja adusa poate reveni in pagina urmatoare. Doua
         * randuri cu acelasi `key` sunt o eroare React si un fir care apare de doua ori.
         */
        const vazute = new Set((prev ?? []).map((t) => t.id));
        return [...(prev ?? []), ...r.threads.filter((t) => !vazute.has(t.id))];
      });
      /*
       * ⚠ Offsetul vine de la server si numara randurile BRUTE. Daca l-am calcula din lungimea
       * listei noastre, o pagina intreaga de duplicate ar lasa offsetul pe loc si butonul ar cere
       * la nesfarsit aceeasi pagina.
       */
      setOffset(r.urmatorulOffset);
      setAreMaiMulte(r.areMaiMulte);
    });
  }, [businessId, offset]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Mesaje de la cumpărători</h3>
          {unreadTotal > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{unreadTotal} noi</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={threads === null}>
          {threads === null ? <Loader2 className="animate-spin" /> : <MessageSquare />}
          Deschide{count > 0 ? ` (${count})` : ""}
        </Button>
      </div>

      {open && (
        <MessengerModal
          businessId={businessId}
          threads={threads ?? []}
          adverts={adverts}
          eroare={eroare}
          areMaiMulte={areMaiMulte}
          seIncarca={seIncarca}
          onLoadMore={incarcaMaiMulte}
          onThreadUpdate={actualizeazaConversatia}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Ce am aflat despre o conversatie DESCHISA: numele omului si textul mesajelor, pentru cautare. */
interface ConversatieCunoscuta {
  nume: string | null;
  text: string;
}

function MessengerModal({
  businessId, threads, adverts, eroare, areMaiMulte, seIncarca, onLoadMore, onThreadUpdate, onClose,
}: {
  businessId: string;
  threads: OlxThread[];
  adverts: OlxAdvertRow[];
  eroare: string | null;
  areMaiMulte: boolean;
  seIncarca: boolean;
  onLoadMore: () => void;
  onThreadUpdate: (threadId: number, petic: Partial<OlxThread>) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [doarNecitite, setDoarNecitite] = useState(false);
  const [cautare, setCautare] = useState("");
  const [cunoscute, setCunoscute] = useState<Record<number, ConversatieCunoscuta>>({});
  const [favoritInLucru, setFavoritInLucru] = useState<number | null>(null);

  // On desktop, pre-open the first conversation (two-pane view). On mobile we
  // leave nothing selected so the CONVERSATION LIST shows first (like OLX).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
        setSelectedId((cur) => cur ?? threads[0]?.id ?? null);
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map advert id -> product name for friendly list labels.
  const advertName = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of adverts) if (a.olx_advert_id) m.set(a.olx_advert_id, a.name);
    return m;
  }, [adverts]);

  const eticheta = useCallback((t: OlxThread) => {
    const cunoscut = cunoscute[t.id]?.nume;
    if (cunoscut) return cunoscut;
    const nume = t.advert_id ? advertName.get(t.advert_id) : undefined;
    return nume ?? (t.advert_id ? `Anunț ${t.advert_id}` : `Conversație #${t.id}`);
  }, [advertName, cunoscute]);

  /*
   * ⚠ FILTRUL SI CAUTAREA LUCREAZA PE CE E DEJA INCARCAT, dinadins — nicio cerere noua la fiecare
   * tasta apasata. Textul mesajelor exista numai pentru conversatiile deschise macar o data in
   * sesiunea asta; de aceea sub campul de cautare scrie exact asta, ca omul sa nu creada ca a
   * cautat in tot istoricul si n-a gasit nimic.
   */
  const listaFiltrata = useMemo(() => {
    const q = cautare.trim().toLowerCase();
    return threads.filter((t) => {
      if (doarNecitite && (t.unread_count ?? 0) === 0) return false;
      if (!q) return true;
      const c = cunoscute[t.id];
      const bucati = [
        t.advert_id ? advertName.get(t.advert_id) : undefined,
        c?.nume ?? undefined,
        c?.text,
        String(t.id),
      ];
      return bucati.some((b) => typeof b === "string" && b.toLowerCase().includes(q));
    });
  }, [threads, doarNecitite, cautare, cunoscute, advertName]);

  const necititeTotal = threads.filter((t) => (t.unread_count ?? 0) > 0).length;

  /* Firul deschis se cauta in lista INTREAGA: un filtru pus dupa nu are voie sa-l inchida. */
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  /*
   * Ce am aflat deschizand conversatia: intra in cautare, iar bulina de necitit se stinge NUMAI
   * daca OLX a confirmat marcarea. Vezi nota din `deschideOlxConversatia`.
   */
  const notaConversatie = useCallback((
    threadId: number, date: { nume: string | null; text: string; marcatCitit: boolean },
  ) => {
    setCunoscute((prev) => ({ ...prev, [threadId]: { nume: date.nume, text: date.text } }));
    if (date.marcatCitit) onThreadUpdate(threadId, { unread_count: 0 });
  }, [onThreadUpdate]);

  async function comutaFavorit(t: OlxThread) {
    if (favoritInLucru !== null) return;
    const dorit = !t.is_favourite;
    setFavoritInLucru(t.id);
    const r = await setOlxThreadFavorit(businessId, t.id, dorit);
    setFavoritInLucru(null);
    if ("error" in r) { toast.error(r.error); return; }
    /* Steaua se deseneaza dupa raspuns, nu inainte: e o stare care traieste la ei. */
    onThreadUpdate(t.id, { is_favourite: r.favorit });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-card shadow-xl sm:h-[85vh] sm:rounded-2xl sm:border sm:border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Mesaje OLX</h2>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: conversation list */}
          <aside className={cn(
            "w-full shrink-0 flex-col overflow-y-auto border-r border-border sm:w-80 sm:flex",
            selected ? "hidden sm:flex" : "flex",
          )}>
            {/* Search + unread filter */}
            <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-card px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={cautare}
                  onChange={(e) => setCautare(e.target.value)}
                  placeholder="Caută după nume sau text..."
                  className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setDoarNecitite((v) => !v)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    doarNecitite ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  Doar necitite{necititeTotal > 0 ? ` (${necititeTotal})` : ""}
                </button>
                <span className="text-[11px] text-muted-foreground">{listaFiltrata.length} din {threads.length}</span>
              </div>
              {cautare.trim() && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Textul mesajelor se caută doar în conversațiile deschise până acum.
                </p>
              )}
            </div>

            {eroare && threads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{eroare}</div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nicio conversație încă.</div>
            ) : listaFiltrata.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nicio conversație nu se potrivește filtrelor.
              </div>
            ) : (
              listaFiltrata.map((t) => {
                const active = t.id === selectedId;
                return (
                  <div key={t.id} className={cn(
                    "flex items-center border-b border-border pr-1 transition-colors",
                    active ? "bg-primary/5" : "hover:bg-muted/50",
                  )}>
                    {/* ⚠ Steaua e un buton separat, langa rand, nu inauntru: un buton in alt buton
                        e HTML nevalid, iar clicul pe stea ar deschide si conversatia. */}
                    <button onClick={() => setSelectedId(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{eticheta(t)}</span>
                          {(t.unread_count ?? 0) > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {t.total_count ?? 0} mesaje{t.created_at ? ` · ${t.created_at.slice(0, 10)}` : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => comutaFavorit(t)}
                      disabled={favoritInLucru !== null}
                      aria-label={t.is_favourite ? "Scoate din favorite" : "Adaugă la favorite"}
                      aria-pressed={t.is_favourite === true}
                      className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {favoritInLucru === t.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Star className={cn("h-4 w-4", t.is_favourite && "fill-amber-400 text-amber-400")} />}
                    </button>
                  </div>
                );
              })
            )}

            {/* ⚠ Pana azi ecranul avea DOAR primele cincizeci de conversatii, fara sa spuna nicaieri
                ca s-a oprit acolo. Butonul apare numai cand chiar mai poate fi ceva. */}
            {areMaiMulte && (
              <div className="p-3">
                <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore} disabled={seIncarca}>
                  {seIncarca ? <Loader2 className="animate-spin" /> : <ChevronDown />}
                  Încarcă mai multe
                </Button>
              </div>
            )}
          </aside>

          {/* Right: active conversation */}
          <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden sm:flex")}>
            {selected ? (
              <ConversationView
                key={selected.id}
                businessId={businessId}
                thread={selected}
                fallbackTitle={selected.advert_id ? advertName.get(selected.advert_id) : undefined}
                onLoaded={notaConversatie}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Selectează o conversație din stânga.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Mesajele pentru care merita cerut detaliul, ca sa aflam atasamentele.
 *
 * ⚠ Fiecare id de aici inseamna o cerere separata la OLX. Cand lista de mesaje spune limpede ca un
 * mesaj n-are atasamente (`[]` sau `null`), nu-l mai intrebam. Cand campul LIPSESTE, nu stim nimic
 * si trebuie intrebat — serverul taie oricum la zece, vezi `MAX_MESAJE_DETALIATE`.
 *
 * Numai mesajele PRIMITE: ce am trimis noi l-am trimis din acest ecran, fara atasamente.
 */
function mesajeDeIntrebat(conversatie: OlxConversatie | null): number[] {
  return (conversatie?.messages ?? [])
    .filter((m) => m.type === "received")
    .filter((m) => !(m.attachments === null || (Array.isArray(m.attachments) && m.attachments.length === 0)))
    .map((m) => m.id);
}

function ConversationView({ businessId, thread, fallbackTitle, onLoaded, onBack }: {
  businessId: string;
  thread: OlxThread;
  fallbackTitle?: string;
  onLoaded: (threadId: number, date: { nume: string | null; text: string; marcatCitit: boolean }) => void;
  onBack: () => void;
}) {
  const [convo, setConvo] = useState<OlxConversatie | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, startSend] = useTransition();
  const [atasamente, setAtasamente] = useState<Record<number, OlxAtasament[]>>({});
  const [notaAtasamente, setNotaAtasamente] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * ⚠ CATE ERAU NECITITE LA DESCHIDERE se prinde O DATA, intr-un `ref`.
   *
   * Citit din `thread.unread_count`, ar fi intrat in dependentele efectului de incarcare — iar
   * marcarea reusita il pune pe zero prin parinte, deci efectul s-ar fi pornit inca o data, cu un
   * al doilea drum complet la OLX la fiecare deschidere de conversatie.
   */
  const aveaNecitite = useRef((thread.unread_count ?? 0) > 0);
  /* ⚠ Firele se schimba repede la clic; ce se intoarce pentru un fir parasit nu mai are ce scrie. */
  const viu = useRef(true);
  useEffect(() => { viu.current = true; return () => { viu.current = false; }; }, []);

  /* Acelasi raspuns se asaza pe ecran si la deschidere, si dupa trimiterea unui mesaj. */
  const aplica = useCallback((res: OlxConversatie | { error: string }) => {
    setLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      setConvo({ messages: [], buyer: null, advert: null, marcatCitit: false });
      return;
    }
    setConvo(res);
    onLoaded(thread.id, {
      nume: res.buyer?.name ?? null,
      text: res.messages.map((m) => m.text ?? "").join(" \n"),
      marcatCitit: res.marcatCitit,
    });
    /*
     * ⚠ AICI E REPARATIA: pana azi marcarea „citit" pleca cu `void`, iar bulina se stingea in
     * ecran in aceeasi clipa. Daca POST-ul pica, la OLX firul ramanea necitit — inclusiv in
     * aplicatia lor de pe telefon — iar la noi arata citit. Acum starea se schimba numai cand ei
     * confirma, si cand nu confirma se SPUNE. Se spune insa numai cand chiar era ceva de citit:
     * pe un fir deja citit, mesajul ar fi zgomot despre nimic.
     */
    if (!res.marcatCitit && aveaNecitite.current) {
      toast.error("Conversația a rămas necitită la OLX. Încearcă din nou peste câteva momente.");
    }
    if (res.marcatCitit) aveaNecitite.current = false;
  }, [thread.id, onLoaded]);

  // The parent remounts this via key={thread.id}, so `loading` starts true fresh
  // per conversation — no synchronous setState needed here.
  useEffect(() => {
    let anulat = false;
    deschideOlxConversatia(businessId, thread.id, {
      advertId: thread.advert_id, interlocutorId: thread.interlocutor_id,
    }).then((res) => { if (!anulat) aplica(res); });
    return () => { anulat = true; };
  }, [businessId, thread.id, thread.advert_id, thread.interlocutor_id, aplica]);

  /* Reincarcarea de dupa un raspuns trimis: acelasi drum, acelasi asezat pe ecran. */
  async function reincarca() {
    const res = await deschideOlxConversatia(businessId, thread.id, {
      advertId: thread.advert_id, interlocutorId: thread.interlocutor_id,
    });
    if (viu.current) aplica(res);
  }

  /*
   * Atasamentele se cer DUPA ce textul e pe ecran, intr-un al doilea drum: puse in aceeasi
   * asteptare cu mesajele, ar fi intarziat cu pana la zece cereri exact ce vrea omul intai.
   */
  useEffect(() => {
    const ids = mesajeDeIntrebat(convo);
    if (ids.length === 0) return;
    let cancelled = false;
    getOlxAtasamente(businessId, thread.id, ids).then((r) => {
      if (cancelled) return;
      if ("error" in r) { setNotaAtasamente("Atașamentele nu s-au putut încărca."); return; }
      setAtasamente(Object.fromEntries(r.mesaje.map((m) => [m.messageId, m.atasamente])));
      /* ⚠ Un mesaj necitit nu se socoteste „fara atasamente": tacerea ar arata identic cu golul. */
      setNotaAtasamente(r.necitite > 0 ? `Atașamentele a ${r.necitite} mesaje nu s-au putut încărca.` : null);
    });
    return () => { cancelled = true; };
  }, [businessId, thread.id, convo]);

  // Auto-scroll to the newest message (DOM op — safe inside an effect).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo?.messages.length]);

  function send() {
    const text = reply.trim();
    if (!text) return;
    startSend(async () => {
      const res = await replyOlxThread(businessId, thread.id, text);
      if ("error" in res) { toast.error(res.error); return; }
      setReply("");
      await reincarca();
    });
  }

  const buyerName = convo?.buyer?.name ?? "Utilizator OLX";
  const advert = convo?.advert;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Conversation header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onBack} aria-label="Înapoi" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"><ArrowLeft className="h-5 w-5" /></button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
          {convo?.buyer?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={convo.buyer.avatar} alt="" className="h-full w-full object-cover" />
          ) : <UserIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{buyerName}</p>
          <p className="truncate text-xs text-muted-foreground">{fallbackTitle ?? advert?.title ?? "Conversație"}</p>
        </div>
      </div>

      {/* Advert context card */}
      {advert && (advert.title || advert.image) && (
        <a href={advert.url ?? undefined} target="_blank" rel="noreferrer"
          className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {advert.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={advert.image} alt="" className="h-full w-full object-cover" />
            ) : <Tag className="h-5 w-5 text-muted-foreground" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{advert.title}</span>
            {advert.price && <span className="block text-xs font-semibold text-primary">{advert.price}</span>}
          </span>
          {advert.url && <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </a>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : convo && convo.messages.length > 0 ? (
          convo.messages.map((m) => {
            const fisiere = atasamente[m.id] ?? [];
            return (
              <div key={m.id} className={cn("flex", m.type === "sent" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  m.type === "sent" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground",
                )}>
                  {m.text && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                  {fisiere.length > 0 && (
                    <div className={cn("flex flex-col gap-1.5", m.text ? "mt-1.5" : "")}>
                      {fisiere.map((a, i) => (
                        <a key={`${a.url}#${i}`} href={a.url} target="_blank" rel="noreferrer" title={a.name}
                          className="block overflow-hidden rounded-lg">
                          {a.esteImagine ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt={a.name} className="max-h-48 w-full rounded-lg border border-border object-cover" />
                          ) : (
                            <span className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-2 py-1.5 text-xs underline-offset-2 hover:underline">
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{a.name}</span>
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                  {/* ⚠ Un mesaj poate fi DOAR atasament. Fara asta, bula ramanea goala. */}
                  {!m.text && fisiere.length === 0 && (
                    <span className="italic opacity-70">Mesaj fără text</span>
                  )}
                  {m.created_at && <span className="mt-1 block text-[10px] opacity-70">{m.created_at.slice(0, 16).replace("T", " ")}</span>}
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Niciun mesaj în această conversație.</p>
        )}
        {notaAtasamente && (
          <p className="pt-1 text-center text-[11px] text-muted-foreground">{notaAtasamente}</p>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Scrie un mesaj..."
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button onClick={send} disabled={sending || !reply.trim()} aria-label="Trimite">
          {sending ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
