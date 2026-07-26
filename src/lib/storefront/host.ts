/**
 * Recunoasterea hosturilor care NU sunt trafic real de magazin.
 *
 * Deploy-urile de preview de pe Vercel (branch-uri de lucru) si rularea locala
 * folosesc ACEEASI baza de date ca productia: nu exista branch DB si nici un
 * URL de Supabase separat pe medii. Orice scriere de telemetrie facuta in timp
 * ce testam ar polua datele reale ale comerciantilor, asa ca o sarim.
 *
 * Verificarea se face pe host, nu pe `process.env.VERCEL_ENV`, pentru ca
 * `.env.local` este produs de `vercel env pull` si contine `VERCEL_ENV=production`
 * chiar si pe masina de dezvoltare - deci variabila de mediu ar clasifica gresit
 * rularea locala drept productie. Hostul cererii nu poate minti:
 *  - trafic real  -> `www.edinio.com` sau domeniul propriu al magazinului
 *  - preview      -> `<deploy>.vercel.app`
 *  - dezvoltare   -> `localhost`
 */
export function isNonProductionHost(host: string): boolean {
  const bare = host.split(":")[0].toLowerCase();
  return bare === "localhost" || bare === "127.0.0.1" || bare.endsWith(".vercel.app");
}
