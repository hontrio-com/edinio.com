import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import { MODULE_IMPLICITE, cheieUrmarireValida, idClientValid } from "./config";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  NOTIFICARILE PUSH THEMARKETER: CELE DOUA FISIERE DE PE DOMENIUL MAGAZINULUI
  ═══════════════════════════════════════════════════════════════════════════════

  Pluginul lor oficial scrie la radacina site-ului doua fisiere (`Config::FireBase*`, `Observer::pushStatus`):
    - `firebase-messaging-sw.js`: service worker-ul, care aduce Firebase si scriptul lor de push;
    - `firebase-config.js`: configurarea web Firebase a theMarketer (valori PUBLICE, aceleasi pentru toti
      clientii lor, scrise si in plugin).
  Cererea de permisiune si abonarea le face scriptul lor de urmarire, dupa cum le configureaza comerciantul.

  ⚠ NUMAI PE DOMENIUL PROPRIU. Un service worker controleaza tot domeniul de sub el: pe `www.edinio.com`
  ar fi fost al tuturor magazinelor. Pe adresa platformei, ruta raspunde 404.
  ⚠ NUMAI CU MODULUL PUSH PORNIT, si cu integrarea legata.
*/

export const SW_FIREBASE = [
  'importScripts("https://www.gstatic.com/firebasejs/9.4.0/firebase-app-compat.js");',
  'importScripts("https://www.gstatic.com/firebasejs/9.4.0/firebase-messaging-compat.js");',
  'importScripts("./firebase-config.js");',
  'importScripts("https://t.themarketer.com/firebase.js");',
  "",
].join("\n");

export const CONFIG_FIREBASE = [
  "const firebaseConfig = {",
  '  apiKey: "AIzaSyA3c9lHIzPIvUciUjp1U2sxoTuaahnXuHw",',
  '  projectId: "themarketer-e5579",',
  '  messagingSenderId: "125832801949",',
  '  appId: "1:125832801949:web:0b14cfa2fd7ace8064ae74"',
  "};",
  "firebase.initializeApp(firebaseConfig);",
  "",
].join("\n");

/** Magazinul asta poate servi fisierele push pe gazda ceruta? Nu arunca: la orice dubiu, nu. */
export async function pushPermis(slug: string, host: string | null): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("businesses")
      .select("custom_domain, is_published, store_settings(tm_activ:themarketer_config->enabled, tm_cheie:themarketer_config->>tracking_key, tm_cont:themarketer_config->>customer_id, tm_push:themarketer_config->push, tm_urmarire:themarketer_config->urmarire)")
      .eq("slug", slug)
      .maybeSingle();
    const b = data as unknown as {
      custom_domain: string | null; is_published: boolean | null;
      store_settings: Record<string, unknown> | Record<string, unknown>[] | null;
    } | null;
    if (!b || b.is_published !== true || !esteDomeniulPropriu(host, b.custom_domain)) return false;
    const s = (Array.isArray(b.store_settings) ? b.store_settings[0] : b.store_settings) ?? {};
    /* Numai campurile publice: integrarea se porneste doar dupa proba de conexiune, deci `enabled` e dovada
       ca si cheia REST a trecut. Cheia insasi nu se citeste aici. */
    const legat = s.tm_activ === true && cheieUrmarireValida(s.tm_cheie) && idClientValid(s.tm_cont);
    const urmarire = typeof s.tm_urmarire === "boolean" ? s.tm_urmarire : MODULE_IMPLICITE.urmarire;
    return legat && urmarire && s.tm_push === true;
  } catch {
    return false;
  }
}

export function raspunsJs(corp: string): Response {
  return new Response(corp, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      /* Browserul verifica oricum service worker-ul la fiecare navigare; o ora pe drum ajunge. */
      "cache-control": "public, max-age=3600",
      "service-worker-allowed": "/",
      "x-robots-tag": "noindex",
    },
  });
}
