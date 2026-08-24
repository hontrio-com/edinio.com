"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Link2, Loader2, Send, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  categoriileMagazinuluiEmag, detaliiCategorieEmag, publicaCategoriaPeEmag,
  salveazaMapareCategorieEmag, stergeMapareCategorieEmag, sugereazaCategoriiEmag,
  type DetaliiCategorieEmag,
} from "@/lib/actions/emag.actions";

/**
 * Legarea categoriilor magazinului de cele eMAG.
 *
 * ═══ ⚠ ECRANUL FĂRĂ CARE NU SE POATE PUBLICA NIMIC ═══
 *
 * eMAG nu primește un produs fără `category_id`, iar categoria decide și ce
 * caracteristici sunt obligatorii. Fără ecranul ăsta, singura cale ar fi fost ca
 * cineva să scrie harta de mână în baza de date.
 *
 * ═══ CE FACE ECRANUL ȘI CE NU FACE ═══
 *
 * Sugestiile se ARATĂ, nu se aplică. O potrivire pe nume între „Tricouri" al
 * magazinului și mii de categorii eMAG e o ghiceală, oricât de bine ar fi scrisă —
 * iar aplicată singură, produsele ar fi plecat într-o categorie greșită, s-ar fi
 * publicat acolo, și s-ar fi aflat de la primul cumpărător nedumerit.
 *
 * ⚠ TREI LUCRURI SE ARATĂ ÎNAINTE DE SALVARE, NU DUPĂ:
 *
 *   caracteristicile obligatorii — altfel oferta pleacă, arde din cele 3 cereri pe
 *     secundă, și se întoarce respinsă cu un mesaj pe care omul îl vede ore mai
 *     târziu, într-o altă listă;
 *   tipul de familie — fără el, mărimile aceluiași produs apar pe eMAG ca produse
 *     fără legătură, iar clientul nu poate schimba mărimea. Nu dă nicio eroare;
 *   EAN-ul obligatoriu — se spune din vreme, ca omul să știe că trebuie completat
 *     pe produse, nu să afle din respingeri.
 */

const CAMP =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

interface CategorieMagazin {
  nume: string;
  produse: number;
  mapare: { category_id: number; family_type_id?: number; characteristics?: { id: number; value: string }[] } | null;
}

interface Sugestie {
  id: number;
  label: string;
  scor: number;
  incredere: string;
}

export function EmagCategoryMapping({ businessId }: { businessId: string }) {
  const [categorii, setCategorii] = useState<CategorieMagazin[] | null>(null);
  const [sugestii, setSugestii] = useState<Record<string, Sugestie[]>>({});
  const [raft, setRaft] = useState<{ cate: number; adusLa: number | null; dinMemorie: boolean } | null>(null);
  const [deschisa, setDeschisa] = useState<string | null>(null);
  const [seIncarca, incepe] = useTransition();

  useEffect(() => {
    let viu = true;
    void (async () => {
      const r = await categoriileMagazinuluiEmag(businessId);
      if (!viu) return;
      if ("error" in r) {
        toast.error(r.error);
        setCategorii([]);
        return;
      }
      setCategorii(r.categorii);
    })();
    return () => {
      viu = false;
    };
  }, [businessId]);

  function reincarca() {
    void (async () => {
      const r = await categoriileMagazinuluiEmag(businessId);
      if (!("error" in r)) setCategorii(r.categorii);
    })();
  }

  function ceruSugestii(fortat = false) {
    incepe(async () => {
      const r = await sugereazaCategoriiEmag(businessId, { fortat });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setSugestii(r.sugestii);
      setRaft({ cate: r.cate, adusLa: r.adusLa, dinMemorie: r.dinMemorie });
      /*
       * ⚠ Trunchierea SE SPUNE. `category/read` are peste zece mii de categorii, iar
       * când n-au fost aduse toate, sugestiile sunt căutate într-o parte din ele.
       * Netăcută, lipsa unei sugestii bune ar fi părut o slăbiciune a potrivirii, nu
       * o listă incompletă — iar omul ar fi renunțat să caute.
       */
      if (r.trunchiat) {
        toast.warning("Nu s-au putut aduce toate categoriile eMAG. Sugestiile sunt căutate doar în cele aduse.");
      } else {
        toast.success("Sugestii pregătite.");
      }
    });
  }

  if (categorii === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se citesc categoriile magazinului…
        </div>
      </div>
    );
  }

  const nemapate = categorii.filter((c) => !c.mapare).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Leagă categoriile de eMAG</h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            eMAG nu primește un produs fără categorie, iar categoria hotărăște ce
            caracteristici sunt obligatorii. Produsele din categoriile nelegate nu se pot
            publica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => ceruSugestii(false)}
          disabled={seIncarca}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seIncarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Sugerează
        </button>
      </div>

      {/*
        ⚠ SE SPUNE DE UNDE VINE LISTA ȘI CÂND A FOST ADUSĂ.
        Raftul eMAG se ține minte, ca ecranul să nu aștepte până la douăzeci de secunde
        la fiecare apăsare — dar o listă memorată care se dă drept proaspătă e o
        minciună mică ce devine mare exact când comerciantul tocmai a primit acces la o
        categorie nouă și n-o găsește. Deci scrie când s-a adus, și are buton.
      */}
      {raft && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {raft.cate} categorii eMAG
            {raft.dinMemorie && raft.adusLa
              ? `, aduse ${new Date(raft.adusLa).toLocaleDateString("ro-RO", { day: "numeric", month: "long" })}`
              : ", aduse acum"}
          </span>
          {raft.dinMemorie && (
            <button
              type="button"
              onClick={() => ceruSugestii(true)}
              disabled={seIncarca}
              className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
            >
              Reîmprospătează lista
            </button>
          )}
        </p>
      )}

      {categorii.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Niciun produs din magazin nu are categorie. Pune-le una întâi, în pagina de produse.
        </p>
      ) : (
        <>
          {nemapate > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {nemapate === 1 ? "O categorie nu e legată" : `${nemapate} categorii nu sunt legate`} de
                eMAG. Produsele din ele rămân nepublicate.
              </span>
            </p>
          )}

          <ul className="mt-4 divide-y divide-border">
            {categorii.map((c) => (
              <li key={c.nume} className="py-3">
                <RandCategorie
                  businessId={businessId}
                  categorie={c}
                  sugestii={sugestii[c.nume] ?? []}
                  deschisa={deschisa === c.nume}
                  laDeschidere={() => setDeschisa(deschisa === c.nume ? null : c.nume)}
                  laSchimbare={reincarca}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN RÂND
   ═══════════════════════════════════════════════════════════════════════════ */

function RandCategorie({
  businessId, categorie, sugestii, deschisa, laDeschidere, laSchimbare,
}: {
  businessId: string;
  categorie: CategorieMagazin;
  sugestii: Sugestie[];
  deschisa: boolean;
  laDeschidere: () => void;
  laSchimbare: () => void;
}) {
  const [idEmag, setIdEmag] = useState(String(categorie.mapare?.category_id ?? ""));
  const [detalii, setDetalii] = useState<DetaliiCategorieEmag | null>(null);
  const [tipFamilie, setTipFamilie] = useState<string>(String(categorie.mapare?.family_type_id ?? ""));
  const [valori, setValori] = useState<Record<number, string>>(() =>
    Object.fromEntries((categorie.mapare?.characteristics ?? []).map((c) => [c.id, c.value])),
  );
  const [seLucreaza, incepe] = useTransition();

  function ceruDetalii(id: number) {
    incepe(async () => {
      const r = await detaliiCategorieEmag(businessId, id);
      if ("error" in r) {
        toast.error(r.error);
        setDetalii(null);
        return;
      }
      setDetalii(r);
      /* Un singur tip de familie: se alege singur. Alegerea dintr-unul nu e o alegere. */
      if (r.tipuriFamilie.length === 1 && !tipFamilie) setTipFamilie(String(r.tipuriFamilie[0].id));
    });
  }

  function salveaza() {
    const id = Number(idEmag);
    if (!Number.isFinite(id) || id <= 0) {
      toast.error("Alege o categorie eMAG.");
      return;
    }
    incepe(async () => {
      const r = await salveazaMapareCategorieEmag(businessId, categorie.nume, {
        category_id: id,
        family_type_id: tipFamilie ? Number(tipFamilie) : null,
        characteristics: Object.entries(valori).map(([k, v]) => ({ id: Number(k), value: v })),
      });
      if ("error" in r) {
        /* ⚠ Se spune CARE caracteristici lipsesc, nu doar că lipsesc ceva. */
        toast.error(r.lipsa?.length ? `${r.error} Lipsesc: ${r.lipsa.join(", ")}.` : r.error);
        return;
      }
      /*
       * ═══ ⚠ CE NU E FIXAT AICI VINE DIN FISA PRODUSULUI (§19) ═══
       *
       * Inainte, maparea era REFUZATA pana cand se fixa o valoare pentru fiecare
       * caracteristica obligatorie. Ceea ce e absurd tocmai la cele care conteaza: nu
       * toate tricourile sunt „M", iar `Mărime` e obligatorie.
       *
       * Acum se salveaza, dar se spune limpede ce trebuie sa aiba fiecare produs in
       * specificatiile lui — iar produsele care n-au sunt oprite INAINTE de trimitere,
       * cu numele caracteristicii scris. Netacut, un „salvat" curat l-ar fi lasat pe om
       * sa creada ca a terminat, si ar fi aflat din refuzuri.
       */
      if (r.dinFisa.length > 0) {
        toast.success(
          `„${categorie.nume}” e legată de eMAG. `
          + `${r.dinFisa.join(", ")} vin din specificațiile fiecărui produs, `
          + "cele fără ele nu pleacă.",
          { duration: 9000 },
        );
      } else {
        toast.success(`„${categorie.nume}” e legată de eMAG.`);
      }
      laSchimbare();
    });
  }

  function sterge() {
    incepe(async () => {
      const r = await stergeMapareCategorieEmag(businessId, categorie.nume);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Legătura a fost scoasă. Ofertele deja publicate rămân pe eMAG.");
      laSchimbare();
    });
  }

  function publica() {
    incepe(async () => {
      const r = await publicaCategoriaPeEmag(businessId, categorie.nume);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.puse === 0
          ? "Nu e niciun produs activ în categoria asta."
          : `${r.puse} ${r.puse === 1 ? "produs pus" : "produse puse"} la rând pentru publicare.`,
      );
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={laDeschidere} className="min-w-0 text-left">
          <span className="block truncate text-sm font-medium">{categorie.nume}</span>
          <span className="block text-xs text-muted-foreground">
            {categorie.produse} {categorie.produse === 1 ? "produs" : "produse"}
            {categorie.mapare ? ` · legată de eMAG #${categorie.mapare.category_id}` : " · nelegată"}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {categorie.mapare ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              <Check className="h-3 w-3" /> Legată
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Nelegată</span>
          )}
          <button
            type="button"
            onClick={laDeschidere}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
          >
            {deschisa ? "Închide" : categorie.mapare ? "Schimbă" : "Leagă"}
          </button>
        </div>
      </div>

      {deschisa && (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-background p-4">
          {sugestii.length > 0 && (
            <div>
              <p className="text-xs font-medium">Sugestii</p>
              {/* ⚠ Se ARATĂ, nu se aplică. O potrivire pe nume e o ghiceală; aplicată
                  singură, produsele ar fi plecat într-o categorie greșită și s-ar fi
                  publicat acolo. */}
              <div className="mt-2 flex flex-wrap gap-2">
                {sugestii.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setIdEmag(String(s.id));
                      ceruDetalii(s.id);
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    {s.label}{" "}
                    <span className="text-muted-foreground">
                      #{s.id} · {s.incredere}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1">
              <span className="mb-1 block text-xs font-medium">Id categorie eMAG</span>
              <input
                className={CAMP}
                value={idEmag}
                inputMode="numeric"
                placeholder="ex. 506"
                onChange={(e) => setIdEmag(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              type="button"
              onClick={() => ceruDetalii(Number(idEmag))}
              disabled={seLucreaza || !idEmag}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              {seLucreaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Verifică
            </button>
          </div>

          {detalii && <CerinteleCategoriei
            detalii={detalii}
            tipFamilie={tipFamilie}
            setTipFamilie={setTipFamilie}
            valori={valori}
            setValori={setValori}
          />}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={salveaza}
              disabled={seLucreaza}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {seLucreaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvează legătura
            </button>

            {categorie.mapare && (
              <>
                <button
                  type="button"
                  onClick={publica}
                  disabled={seLucreaza}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Publică {categorie.produse} {categorie.produse === 1 ? "produs" : "produse"}
                </button>
                <button
                  type="button"
                  onClick={sterge}
                  disabled={seLucreaza}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Scoate legătura
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE CERE CATEGORIA
   ═══════════════════════════════════════════════════════════════════════════ */

function CerinteleCategoriei({
  detalii, tipFamilie, setTipFamilie, valori, setValori,
}: {
  detalii: DetaliiCategorieEmag;
  tipFamilie: string;
  setTipFamilie: (v: string) => void;
  valori: Record<number, string>;
  setValori: (v: Record<number, string>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">{detalii.nume}</strong> (#{detalii.id})
      </p>

      {(detalii.eanObligatoriu || detalii.garantieObligatorie) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {/* ⚠ Se spune DIN VREME, nu se află din respingeri. Un produs fără EAN
                într-o categorie care îl cere e respins cu o eroare de documentație,
                iar omul o vede abia peste ore, în lista de oferte. */}
            Categoria cere{" "}
            {[detalii.eanObligatoriu && "cod de bare (EAN) pe fiecare produs",
              detalii.garantieObligatorie && "garanție"].filter(Boolean).join(" și ")}
            . Produsele fără ele vor fi respinse de eMAG.
          </span>
        </p>
      )}

      {detalii.tipuriFamilie.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Grup de variante</span>
          <select className={CAMP} value={tipFamilie} onChange={(e) => setTipFamilie(e.target.value)}>
            <option value="">Fără grup</option>
            {detalii.tipuriFamilie.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nume}
              </option>
            ))}
          </select>
          {/* ⚠ Fără el, mărimile apar pe eMAG ca produse fără legătură, iar clientul
              nu poate schimba mărimea. eMAG NU dă nicio eroare pentru asta. */}
          <span className="mt-1 block text-xs text-muted-foreground">
            Fără grup, mărimile aceluiași produs apar pe eMAG ca produse separate, iar
            cumpărătorul nu poate schimba mărimea din pagină.
          </span>
        </label>
      )}

      {detalii.obligatorii.length > 0 && (
        <div>
          <p className="text-xs font-medium">
            Caracteristici obligatorii ({detalii.obligatorii.length})
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se trimit pentru toate produsele din categoria asta. Fără ele, eMAG respinge
            ofertele.
          </p>
          <div className="mt-2 space-y-2">
            {detalii.obligatorii.map((c) => (
              <label key={c.id} className="block">
                <span className="mb-1 block text-xs">{c.nume}</span>
                {c.valori.length > 0 && !c.valoriNoi ? (
                  <select
                    className={CAMP}
                    value={valori[c.id] ?? ""}
                    onChange={(e) => setValori({ ...valori, [c.id]: e.target.value })}
                  >
                    <option value="">Alege o valoare</option>
                    {c.valori.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={CAMP}
                    list={`car-${c.id}`}
                    value={valori[c.id] ?? ""}
                    onChange={(e) => setValori({ ...valori, [c.id]: e.target.value })}
                  />
                )}
                {c.valori.length > 0 && c.valoriNoi && (
                  <datalist id={`car-${c.id}`}>
                    {c.valori.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
