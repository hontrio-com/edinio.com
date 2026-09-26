"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Loader2, Send, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useDialogAccesibil } from "../useDialogAccesibil";
import { CATEGORII, PRIORITATI, type CategorieTichet, type PrioritateTichet } from "@/lib/support/tichete";
import {
  ACCEPT, CATE_FISIERE, ICONITA_CATEGORIEI, adaugaFisiere, incarcaFisiere, marimeaFisierului,
} from "./atasamente";

const SUBIECT_MAXIM = 150;

const campCls =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const etichetaCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TICHET NOU                                                      (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CATEGORIA NU ARE O VALOARE ALEASA DINAINTE. Formularul vechi pornea pe
  „Tehnic", iar un tichet despre abonament trimis in graba ajungea acolo. Cu
  opt categorii, o alegere implicita ar fi gresita de sapte ori din opt, deci
  butonul de trimitere asteapta pana alegi. Ruta refuza si ea un tichet fara
  categorie.

  ⚠ Categoria se poate primi gata aleasa (`categorieInitiala`): placile din
  ecranul gol duc aici cu ea pusa.
*/
export function TichetNou({
  businesses,
  userEmail,
  categorieInitiala,
  onClose,
}: {
  businesses: { id: string; business_name: string; store_name: string | null }[];
  userEmail: string;
  categorieInitiala: CategorieTichet | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const idTitlu = useId();
  const cutia = useDialogAccesibil(true, onClose);
  const fisierRef = useRef<HTMLInputElement>(null);

  const [categorie, setCategorie] = useState<CategorieTichet | null>(categorieInitiala);
  const [prioritate, setPrioritate] = useState<PrioritateTichet>("normal");
  const [subiect, setSubiect] = useState("");
  const [descriere, setDescriere] = useState("");
  const [magazin, setMagazin] = useState(businesses[0]?.id ?? "");
  const [fisiere, setFisiere] = useState<File[]>([]);
  const [tras, setTras] = useState(false);
  const [trimite, setTrimite] = useState(false);

  const gata = categorie !== null && subiect.trim() !== "" && descriere.trim() !== "";

  async function trimiteTichetul(e: React.FormEvent) {
    e.preventDefault();
    if (!gata || trimite) return;
    setTrimite(true);
    try {
      const adrese = await incarcaFisiere(fisiere);
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subiect.trim(),
          category: categorie,
          priority: prioritate,
          content: descriere.trim(),
          business_id: magazin || null,
          attachment_urls: adrese,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ticket?: { id: string } };
      if (!res.ok || !data.ticket) throw new Error(data.error ?? "Tichetul nu s-a putut trimite. Încearcă din nou.");
      toast.success("Tichetul a plecat. Îți răspundem aici și pe email.");
      router.push(`/dashboard/suport/${data.ticket.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tichetul nu s-a putut trimite. Încearcă din nou.");
      setTrimite(false);
    }
  }

  const prioritateAleasa = PRIORITATI.find((p) => p.cheie === prioritate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitlu}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl ring-1 ring-foreground/10 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 id={idTitlu} className="text-base font-semibold text-foreground">Tichet nou</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Spune-ne ce s-a întâmplat și îți răspundem în cel mult 24 de ore.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={trimiteTichetul} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            {/* Categoria */}
            <fieldset>
              <legend className={etichetaCls}>Despre ce e vorba?</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CATEGORII.map((c) => {
                  const Icon = ICONITA_CATEGORIEI[c.cheie];
                  const ales = categorie === c.cheie;
                  return (
                    <button
                      key={c.cheie}
                      type="button"
                      onClick={() => setCategorie(c.cheie)}
                      aria-pressed={ales}
                      className={cn(
                        "group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                        ales
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-foreground/20 hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                          ales ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-medium leading-tight text-foreground">{c.eticheta}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{c.descriere}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {businesses.length > 1 && (
              <div>
                <label htmlFor={`${idTitlu}-magazin`} className={etichetaCls}>Magazinul</label>
                <select
                  id={`${idTitlu}-magazin`}
                  value={magazin}
                  onChange={(e) => setMagazin(e.target.value)}
                  className={campCls}
                >
                  <option value="">Contul, nu un magazin anume</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.store_name ?? b.business_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Subiectul */}
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor={`${idTitlu}-subiect`} className={etichetaCls}>Subiect</label>
                <span className="text-[11px] tabular-nums text-muted-foreground">{subiect.length}/{SUBIECT_MAXIM}</span>
              </div>
              <input
                id={`${idTitlu}-subiect`}
                value={subiect}
                onChange={(e) => setSubiect(e.target.value)}
                maxLength={SUBIECT_MAXIM}
                placeholder="De exemplu: Nu se generează AWB-ul pentru easybox"
                className={campCls}
                autoComplete="off"
              />
            </div>

            {/* Descrierea */}
            <div>
              <label htmlFor={`${idTitlu}-descriere`} className={etichetaCls}>Ce s-a întâmplat</label>
              <textarea
                id={`${idTitlu}-descriere`}
                value={descriere}
                onChange={(e) => setDescriere(e.target.value)}
                rows={5}
                placeholder="Ce ai făcut, ce te așteptai să se întâmple și ce ai văzut în schimb. Numărul comenzii sau linkul produsului ne ajută să ajungem direct acolo."
                className={cn(campCls, "resize-y min-h-[120px] leading-relaxed")}
              />
            </div>

            {/* Prioritatea */}
            <fieldset>
              <legend className={etichetaCls}>Cât de urgent e</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 sm:grid-cols-4">
                {PRIORITATI.map((p) => (
                  <button
                    key={p.cheie}
                    type="button"
                    onClick={() => setPrioritate(p.cheie)}
                    aria-pressed={prioritate === p.cheie}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                      prioritate === p.cheie
                        ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.eticheta}
                  </button>
                ))}
              </div>
              {prioritateAleasa && (
                <p className="mt-1.5 text-xs text-muted-foreground">{prioritateAleasa.descriere}</p>
              )}
            </fieldset>

            {/* Atasamentele */}
            <div>
              <span className={etichetaCls}>
                Capturi de ecran sau fișiere <span className="font-normal normal-case tracking-normal">(opțional)</span>
              </span>
              <input
                ref={fisierRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => { setFisiere((f) => adaugaFisiere(f, e.target.files)); e.target.value = ""; }}
              />
              {fisiere.length < CATE_FISIERE && (
                <button
                  type="button"
                  onClick={() => fisierRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setTras(true); }}
                  onDragLeave={() => setTras(false)}
                  onDrop={(e) => { e.preventDefault(); setTras(false); setFisiere((f) => adaugaFisiere(f, e.dataTransfer.files)); }}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
                    tras ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25 hover:bg-muted/30",
                  )}
                >
                  <UploadCloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground">Trage fișierele aici sau alege-le</span>
                  <span className="text-xs text-muted-foreground">Poze sau PDF, cel mult {CATE_FISIERE}, până la 10 MB fiecare</span>
                </button>
              )}
              {fisiere.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {fisiere.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
                      {f.type.startsWith("image/")
                        ? <ImageIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        : <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{f.name}</span>
                      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">{marimeaFisierului(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFisiere((x) => x.filter((_, j) => j !== i))}
                        aria-label={`Scoate ${f.name}`}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col-reverse gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              Răspunsul vine aici și pe <span className="font-medium text-foreground">{userEmail}</span>
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Renunță</Button>
              <Button type="submit" disabled={!gata || trimite}>
                {trimite ? <Loader2 className="animate-spin" /> : <Send />}
                {trimite ? "Se trimite…" : "Trimite tichetul"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
