import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Ecranele pe care proxy-ul le da pe un domeniu propriu care nu serveste (inca) un magazin.
 *
 * Doua cazuri, doua ecrane (vezi `proxy.ts`):
 *   - domeniul e legat de un magazin NEPUBLICAT: „se deschide in curand”, cu numele,
 *     logo-ul si culoarea magazinului, plus o legatura discreta pentru proprietar catre
 *     magazinul lui de pe platforma, unde il vede intreg daca e logat;
 *   - domeniul nu e legat de niciun magazin: un ecran Edinio, cu ce are de facut
 *     proprietarul domeniului.
 *
 * ⚠ HTML scris ca SIR, cu stilurile inauntru: proxy-ul raspunde direct, fara Next si fara
 * foile de stil ale aplicatiei (un `rewrite` nu-si poate pastra statusul 404, vezi proxy).
 * Tot ce vine din baza (nume, logo, culoare) trece prin `html`/`culoareSigura`/`logoSigur`:
 * numele magazinului il scrie comerciantul, deci n-are voie sa ajunga brut in pagina.
 */

/** Scapa textul pentru HTML (continut si atribute intre ghilimele). */
export function html(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Numai `#rgb` / `#rrggbb`; orice altceva cade pe culoarea implicita. */
export function culoareSigura(c: string | null | undefined): string {
  return typeof c === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : "#111111";
}

/** Numai `https://` sau o imagine `data:image/...` (logo-urile vechi sunt si asa); altfel fara logo. */
export function logoSigur(u: string | null | undefined): string | null {
  if (typeof u !== "string") return null;
  const v = u.trim();
  if (/^https:\/\//i.test(v) && v.length <= 2000) return v;
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(v) && v.length <= 200_000) return v;
  return null;
}

const STIL = `
:root{--bg:#f6f6f4;--card:#ffffff;--text:#111111;--muted:#6b6b6b;--line:#e7e7e3;--accent:#111111}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e0f;--card:#17171a;--text:#f3f3f2;--muted:#a3a3a3;--line:#2a2a2e}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55}
.fundal{position:fixed;inset:0;pointer-events:none;background:radial-gradient(60rem 40rem at 50% -10%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 70%)}
main{position:relative;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px}
.card{width:100%;max-width:480px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04),0 20px 50px -20px rgba(0,0,0,.18)}
.sigla{width:88px;height:88px;margin:0 auto 24px;border-radius:22px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff;border:1px solid var(--line)}
.sigla img{max-width:78%;max-height:78%;object-fit:contain}
.initiala{background:var(--accent);border:0;color:#fff;font-size:36px;font-weight:700;letter-spacing:-.02em}
.eticheta{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.punct{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent);animation:puls 2s ease-in-out infinite}
@keyframes puls{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.punct{animation:none}}
h1{font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-.02em;word-break:break-word}
.text{margin-top:12px;color:var(--muted);font-size:15px}
.linie{height:1px;background:var(--line);margin:28px 0 20px}
.mic{font-size:13px;color:var(--muted)}
.buton{display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;color:var(--text);border:1px solid var(--line);background:var(--card);transition:background .15s}
.buton:hover{background:color-mix(in srgb,var(--text) 6%,var(--card))}
.buton.plin{margin-top:24px;background:var(--text);color:var(--card);border-color:var(--text)}
.buton.plin:hover{opacity:.9;background:var(--text)}
ol{text-align:left;margin:20px 0 0;padding-left:20px;color:var(--muted);font-size:14px}
ol li{margin-top:8px}ol b{color:var(--text);font-weight:600}
.subsol{margin-top:28px;font-size:12px;color:var(--muted)}
.subsol a{color:inherit}
@media (max-width:420px){.card{padding:32px 20px;border-radius:20px}h1{font-size:24px}}
`;

function pagina(a: { titlu: string; accent: string; corp: string }): string {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="robots" content="noindex">`
    + `<title>${html(a.titlu)}</title>`
    + `<style>${STIL}:root{--accent:${a.accent}}</style></head>`
    + `<body><div class="fundal"></div><main>${a.corp}</main></body></html>`;
}

/**
 * Domeniul unui magazin NEPUBLICAT. Vizitatorul vede „se deschide in curand”; proprietarul
 * are o legatura catre magazinul lui de pe platforma, unde il vede intreg daca e logat
 * (pe domeniul propriu nu e logat niciodata: sesiunea lui traieste pe edinio.com).
 */
export function ecranMagazinNepublicat(m: { slug: string; nume: string; logo: string | null; culoare: string | null }): string {
  const nume = m.nume.trim() || "Magazin";
  const accent = culoareSigura(m.culoare);
  const logo = logoSigur(m.logo);
  const sigla = logo
    ? `<div class="sigla"><img src="${html(logo)}" alt="${html(nume)}"></div>`
    : `<div class="sigla initiala" aria-hidden="true">${html(Array.from(nume)[0]?.toUpperCase() ?? "M")}</div>`;
  const previzualizare = `${PLATFORM_ORIGIN}/${encodeURIComponent(m.slug)}`;
  return pagina({
    titlu: `${nume} · În curând`,
    accent,
    corp: `<div class="card">${sigla}`
      + `<div class="eticheta"><span class="punct"></span>În curând</div>`
      + `<h1>${html(nume)}</h1>`
      + `<p class="text">Magazinul se pregătește de deschidere. Revino în curând, lucrăm ca totul să fie gata pentru tine.</p>`
      + `<div class="linie"></div>`
      + `<p class="mic">Ești proprietarul magazinului?</p>`
      + `<a class="buton" href="${html(previzualizare)}">Vezi magazinul în contul tău <span aria-hidden="true">→</span></a>`
      + `<p class="mic" style="margin-top:12px">După ce îl publici din panou, magazinul apare chiar la această adresă.</p>`
      + `</div><p class="subsol">Magazin creat cu <a href="${PLATFORM_ORIGIN}">Edinio</a></p>`,
  });
}

/** Un domeniu care ajunge la noi, dar nu e legat de niciun magazin. */
export function ecranDomeniuNeconectat(domeniu: string): string {
  const d = domeniu.trim().slice(0, 253);
  return pagina({
    titlu: "Domeniu neconectat",
    accent: "#111111",
    corp: `<div class="card">`
      + `<div class="sigla initiala" aria-hidden="true">e</div>`
      + `<h1>Acest domeniu nu este conectat încă</h1>`
      + `<p class="text"><b>${html(d)}</b> ajunge la Edinio, dar nu e legat de niciun magazin.</p>`
      + `<ol>`
      + `<li><b>Ești proprietarul?</b> Leagă domeniul din panou, la Setări, secțiunea Domeniu.</li>`
      + `<li><b>Tocmai l-ai legat?</b> Schimbarea poate dura câteva minute până ajunge peste tot.</li>`
      + `</ol>`
      + `<a class="buton plin" href="${PLATFORM_ORIGIN}/dashboard">Mergi în panou</a>`
      + `</div><p class="subsol"><a href="${PLATFORM_ORIGIN}">Edinio</a></p>`,
  });
}
