"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { JUDETE } from "@/lib/ro/judete";
import {
  LIMITE_PROFIL,
  POZA_MAX_OCTETI,
  curataProfilul,
  eBucuresti,
  greseliProfil,
  type GreseliProfil,
  type ProfilCont,
} from "@/lib/cont/profil-reguli";
import { Mesaj } from "./ui/piese";
import { BUTON_DISCRET, BUTON_PRIMAR, BUTON_SECUNDAR, CAMP, ETICHETA_CAMP, STIL_PRIMAR } from "./ui/clase";

/**
 * Profilul contului: poza, numele, telefonul si adresa de livrare.
 *
 * ⚠ Poza se micsoreaza IN BROWSER inainte sa plece: o poza de telefon are des 5-12
 * MB, iar Vercel refuza orice cerere peste 4,5 MB inainte sa ajunga la server.
 * Serverul o taie apoi patrat, la 256x256, si scoate metadatele (locul, telefonul).
 */

const LATURA_MAX = 1280;

async function micsoreazaPoza(fisier: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(fisier, { imageOrientation: "from-image" });
    const scara = Math.min(1, LATURA_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scara));
    const h = Math.max(1, Math.round(bmp.height * scara));
    const panza = document.createElement("canvas");
    panza.width = w;
    panza.height = h;
    const ctx = panza.getContext("2d");
    if (!ctx) throw new Error("fara canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => panza.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) throw new Error("fara blob");
    return blob;
  } catch {
    /* Browserul n-o poate deschide (de pilda HEIC in afara Safari): pleaca asa cum e, iar serverul hotaraste. */
    return fisier;
  }
}

function Camp({
  id,
  eticheta,
  facultativ = false,
  greseala,
  ajutor,
  children,
}: {
  id: string;
  eticheta: string;
  facultativ?: boolean;
  greseala?: string;
  ajutor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ETICHETA_CAMP}>
        {eticheta}
        {facultativ && <span className="ml-1 font-normal text-[var(--st-muted)]">(optional)</span>}
      </label>
      {children}
      {greseala ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-destructive">{greseala}</p>
      ) : ajutor ? (
        <p className="mt-1.5 text-xs text-[var(--st-muted)]">{ajutor}</p>
      ) : null}
    </div>
  );
}

export function EditeazaProfilul({
  profil,
  pozaSrc,
  avatarSvg,
}: {
  profil: ProfilCont;
  pozaSrc: string | null;
  /** Avatarul implicit (blob din id, desenat pe server), cand nu are poza. */
  avatarSvg: string;
}) {
  const router = useRouter();
  const uid = useId();
  const id = (n: string) => `${uid}-${n}`;
  const inputPoza = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    nume: profil.nume,
    telefon: profil.telefon,
    judet: profil.adresa.judet,
    localitate: profil.adresa.localitate,
    adresa: profil.adresa.adresa,
    codPostal: profil.adresa.codPostal,
  });
  const [greseli, setGreseli] = useState<GreseliProfil>({});
  const [eroare, setEroare] = useState("");
  const [salvat, setSalvat] = useState(false);
  const [asteapta, setAsteapta] = useState(false);

  const [poza, setPoza] = useState<string | null>(pozaSrc);
  const [eroarePoza, setEroarePoza] = useState("");
  const [lucreazaPoza, setLucreazaPoza] = useState<"urca" | "scoate" | null>(null);

  const bucuresti = eBucuresti(f.judet);
  const schimba = (camp: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setSalvat(false);
    setGreseli((g) => ({ ...g, [camp]: undefined }));
    setF((x) => {
      /* Schimbarea judetului goleste localitatea: un „Sector 3” ramas din Bucuresti n-are sens in Cluj. */
      if (camp === "judet" && eBucuresti(x.judet) !== eBucuresti(v)) return { ...x, judet: v, localitate: "" };
      return { ...x, [camp]: v };
    });
  };
  const aria = (camp: keyof GreseliProfil) =>
    greseli[camp] ? { "aria-invalid": true as const, "aria-describedby": `${id(camp)}-err` } : {};

  async function salveaza(e: React.FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    setEroare("");
    setSalvat(false);
    const p = curataProfilul(f);
    const g = greseliProfil(p);
    if (Object.keys(g).length > 0) {
      setGreseli(g);
      document.getElementById(id(Object.keys(g)[0]))?.focus();
      return;
    }
    setAsteapta(true);
    try {
      const r = await fetch("/api/cont/profil", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.reintra) {
        router.push("/cont/intra");
        return;
      }
      if (!r.ok) {
        if (j.greseli) setGreseli(j.greseli);
        setEroare(j.eroare ?? "Nu am putut salva. Incearca din nou.");
        return;
      }
      setF({ nume: p.nume, telefon: p.telefon, judet: p.judet, localitate: p.localitate, adresa: p.adresa, codPostal: p.codPostal });
      setSalvat(true);
      router.refresh();
    } catch {
      setEroare("Nu am putut salva. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  async function urcaPoza(e: React.ChangeEvent<HTMLInputElement>) {
    const fisier = e.target.files?.[0];
    e.target.value = "";
    if (!fisier) return;
    setEroarePoza("");
    if (!fisier.type.startsWith("image/")) {
      setEroarePoza("Alege un fisier imagine (JPG, PNG sau WebP).");
      return;
    }
    setLucreazaPoza("urca");
    try {
      const mica = await micsoreazaPoza(fisier);
      if (mica.size > POZA_MAX_OCTETI) {
        setEroarePoza("Poza e prea mare. Alege alta poza.");
        return;
      }
      const date = new FormData();
      date.append("poza", mica, "poza.jpg");
      const r = await fetch("/api/cont/poza", { method: "POST", body: date });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.reintra) {
        router.push("/cont/intra");
        return;
      }
      if (!r.ok) {
        setEroarePoza(j.eroare ?? "Nu am putut salva poza. Incearca din nou.");
        return;
      }
      setPoza(`/api/cont/poza?v=${Date.now().toString(36)}`);
      router.refresh();
    } catch {
      setEroarePoza("Nu am putut salva poza. Verifica legatura la internet.");
    } finally {
      setLucreazaPoza(null);
    }
  }

  async function scoatePoza() {
    setEroarePoza("");
    setLucreazaPoza("scoate");
    try {
      const r = await fetch("/api/cont/poza", { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEroarePoza(j.eroare ?? "Nu am putut scoate poza. Incearca din nou.");
        return;
      }
      setPoza(null);
      router.refresh();
    } catch {
      setEroarePoza("Nu am putut scoate poza. Verifica legatura la internet.");
    } finally {
      setLucreazaPoza(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Poza ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--st-border)]">
          {poza ? (
            // eslint-disable-next-line @next/next/no-img-element -- poza e privata (cu sesiune), nu trece prin optimizatorul de imagini
            <img src={poza} alt="Poza ta de profil" className="h-full w-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="block h-full w-full bg-[var(--st-surface)] [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: avatarSvg }}
            />
          )}
          {lucreazaPoza && (
            <span className="absolute inset-0 grid place-items-center" style={{ backgroundColor: "color-mix(in srgb, var(--st-text) 45%, transparent)" }}>
              <LoaderCircle className="h-6 w-6 animate-spin text-[var(--st-surface)]" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputPoza}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={urcaPoza}
            />
            <button type="button" disabled={lucreazaPoza !== null} onClick={() => inputPoza.current?.click()} className={BUTON_SECUNDAR}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              {poza ? "Schimba poza" : "Adauga o poza"}
            </button>
            {poza && (
              <button type="button" disabled={lucreazaPoza !== null} onClick={scoatePoza} className={BUTON_DISCRET}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Sterge poza
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--st-muted)]">JPG, PNG sau WebP. O vezi doar tu, in contul tau.</p>
          {eroarePoza && <Mesaj fel="eroare">{eroarePoza}</Mesaj>}
        </div>
      </div>

      {/* ── Datele ── */}
      <form onSubmit={salveaza} noValidate className="space-y-5 border-t border-[var(--st-border)] pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Camp id={id("nume")} eticheta="Nume si prenume" greseala={greseli.nume}>
            <input id={id("nume")} value={f.nume} onChange={schimba("nume")} autoComplete="name"
              maxLength={LIMITE_PROFIL.nume} className={CAMP} {...aria("nume")} />
          </Camp>
          <Camp id={id("telefon")} eticheta="Telefon" facultativ greseala={greseli.telefon}>
            <input id={id("telefon")} type="tel" inputMode="tel" value={f.telefon} onChange={schimba("telefon")}
              autoComplete="tel" maxLength={LIMITE_PROFIL.telefon} placeholder="07xx xxx xxx" className={CAMP} {...aria("telefon")} />
          </Camp>
        </div>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-[var(--st-text)]">
            Adresa de livrare <span className="font-normal text-[var(--st-muted)]">(optional)</span>
          </legend>
          <p className="-mt-2 text-xs leading-relaxed text-[var(--st-muted)]">
            O completam automat in formularul de comanda, ca sa nu o mai scrii de fiecare data.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Camp id={id("judet")} eticheta="Judet" greseala={greseli.judet}>
              <select id={id("judet")} value={f.judet} onChange={schimba("judet")} autoComplete="address-level1"
                className={CAMP} {...aria("judet")}>
                <option value="">Alege judetul</option>
                {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </Camp>
            <Camp id={id("localitate")} eticheta={bucuresti ? "Sector" : "Localitate"} greseala={greseli.localitate}>
              {bucuresti ? (
                <select id={id("localitate")} value={f.localitate} onChange={schimba("localitate")} autoComplete="address-level2"
                  className={CAMP} {...aria("localitate")}>
                  <option value="">Alege sectorul</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={`Sector ${n}`}>{`Sector ${n}`}</option>)}
                </select>
              ) : (
                <input id={id("localitate")} value={f.localitate} onChange={schimba("localitate")} autoComplete="address-level2"
                  maxLength={LIMITE_PROFIL.localitate} className={CAMP} {...aria("localitate")} />
              )}
            </Camp>
            <div className="sm:col-span-2">
              <Camp id={id("adresa")} eticheta="Strada si numarul" greseala={greseli.adresa} ajutor="Strada, numarul, blocul, scara, apartamentul.">
                <input id={id("adresa")} value={f.adresa} onChange={schimba("adresa")} autoComplete="street-address"
                  maxLength={LIMITE_PROFIL.adresa} className={CAMP} {...aria("adresa")} />
              </Camp>
            </div>
            <Camp id={id("codPostal")} eticheta="Cod postal" facultativ greseala={greseli.codPostal}>
              <input id={id("codPostal")} value={f.codPostal} onChange={schimba("codPostal")} autoComplete="postal-code"
                inputMode="numeric" maxLength={LIMITE_PROFIL.codPostal} className={CAMP} {...aria("codPostal")} />
            </Camp>
          </div>
        </fieldset>

        {eroare && <Mesaj fel="eroare">{eroare}</Mesaj>}
        {salvat && <Mesaj fel="succes">Datele au fost salvate.</Mesaj>}

        <button type="submit" disabled={asteapta} className={BUTON_PRIMAR} style={STIL_PRIMAR}>
          {asteapta && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {asteapta ? "Se salveaza..." : "Salveaza"}
        </button>
      </form>
    </div>
  );
}
