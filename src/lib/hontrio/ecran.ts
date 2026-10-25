import { html } from "@/lib/ecran-domeniu";

/**
 * Ecranul dat de `/api/hontrio/v1/autorizare` cand cererea nu poate merge mai departe.
 *
 * ⚠ E UN ECRAN LA NOI, nu o intoarcere la Hontrio: cand clientul sau adresa de intoarcere nu sunt
 * cele asteptate, RFC 6749 (4.1.2.1) interzice redirectarea, fiindca adresa insasi e suspecta. Omul
 * afla ce s-a intamplat si are o cale inapoi in panoul lui.
 *
 * HTML scris ca sir, ca ecranele din `ecran-domeniu.ts`: ruta raspunde direct, fara Next. Nu intra
 * nimic din cerere in pagina, doar texte fixe.
 */

const MESAJE: Record<"neconfigurat" | "client" | "adresa" | "prea_multe", { titlu: string; text: string }> = {
  neconfigurat: {
    titlu: "Conectarea cu Hontrio nu este disponibilă acum",
    text: "Legătura dintre Edinio și Hontrio este oprită temporar. Încearcă din nou mai târziu.",
  },
  client: {
    titlu: "Cererea de conectare nu este validă",
    text: "Aplicația care a cerut accesul nu este recunoscută de Edinio. Nu s-a trimis nimic nicăieri.",
  },
  adresa: {
    titlu: "Cererea de conectare nu este validă",
    text: "Adresa la care ar fi trebuit să te întoarcem nu este una aprobată. Nu s-a trimis nimic nicăieri.",
  },
  prea_multe: {
    titlu: "Prea multe încercări",
    text: "Au fost prea multe cereri de conectare într-un timp scurt. Așteaptă un minut și încearcă din nou.",
  },
};

export function ecranEroareAutorizare(motiv: keyof typeof MESAJE): string {
  const m = MESAJE[motiv];
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${html(m.titlu)}</title><style>
:root{--bg:#f6f6f4;--card:#fff;--text:#111;--muted:#6b6b6b;--line:#e7e7e3}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e0f;--card:#17171a;--text:#f3f3f2;--muted:#a3a3a3;--line:#2a2a2e}}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:48px 16px;background:var(--bg);color:var(--text);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;line-height:1.55}
.card{width:100%;max-width:460px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:36px 28px;text-align:center}
h1{font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-.01em}
p{margin-top:12px;color:var(--muted);font-size:15px}
a{display:inline-block;margin-top:24px;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;background:var(--text);color:var(--card)}
</style></head><body><main class="card"><h1>${html(m.titlu)}</h1><p>${html(m.text)}</p><a href="/dashboard">Mergi în panoul Edinio</a></main></body></html>`;
}
