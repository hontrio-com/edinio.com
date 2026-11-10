import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/*
  ═══ DUPA PLATA, ACTIUNILE PAGINII DE PLAN NU SE MAI REDIRECTIONEAZA PE /dashboard (10.11.2026) ═══

  Gasit la proba de dinaintea lansarii editorului, cu un cont nou: `createBusiness` a creat magazinul, dar actiunea de
  imediat dupa (`verificaPlataOnboarding`, tot pe `/onboarding/plan`) a primit de la `updateSession` un 307 spre
  `/dashboard`. Fetch-ul actiunii a urmat redirectarea, a primit HTML, iar pagina a aratat „A apărut o eroare” si din nou
  planurile, unui om care tocmai platise.

  Proba ruleaza CHIAR `updateSession`, cu `NextRequest` adevarate. Singurul lucru inlocuit e Supabase: un server HTTP
  local care raspunde la `auth/v1/user` (omul e autentificat) si la `users_profile` (onboardingul e terminat).
*/

const cereri: string[] = [];

const supabase = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  cereri.push(`${req.method} ${url.pathname}`);
  const json = (corp: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  if (url.pathname === "/auth/v1/user") {
    return json({ id: "om-cu-magazin", aud: "authenticated", role: "authenticated", email: "om@proba.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-10T00:00:00Z" });
  }
  if (url.pathname === "/rest/v1/users_profile") {
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    return json(unul ? { onboarding_completed: true } : [{ onboarding_completed: true }]);
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ message: "ruta de proba necunoscuta" }));
});

let updateSession: (typeof import("./middleware"))["updateSession"];
let NextRequest: (typeof import("next/server"))["NextRequest"];
let cookieSesiune = "";

before(async () => {
  await new Promise<void>((r) => supabase.listen(0, "127.0.0.1", () => r()));
  const { port } = supabase.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  ({ updateSession } = await import("./middleware"));
  ({ NextRequest } = await import("next/server"));

  // Sesiunea, in formatul @supabase/ssr, sub numele pe care il citeste clientul pentru adresa de mai sus.
  const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const acum = Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000);
  const sesiune = {
    access_token: `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub: "om-cu-magazin", session_id: "s1", exp: acum, role: "authenticated" }))}.semnatura`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: acum,
    refresh_token: "reimprospatare-de-proba",
    user: { id: "om-cu-magazin", aud: "authenticated", role: "authenticated", email: "om@proba.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-10T00:00:00Z" },
  };
  cookieSesiune = `sb-127-auth-token=base64-${b64url(JSON.stringify(sesiune))}`;
});

after(async () => {
  await new Promise<void>((r) => supabase.close(() => r()));
});

describe("onboardingul terminat: navigarea merge in panou, actiunile de server raman pe loc", () => {
  test("⚠⚠ actiunea de server de pe pagina de plan (dupa createBusiness) NU primeste 307 spre /dashboard", async () => {
    const r = await updateSession(new NextRequest("http://localhost:3000/onboarding/plan?success=1&sid=cs_test_1", {
      method: "POST",
      headers: { cookie: cookieSesiune, "next-action": "7f00aa", accept: "text/x-component" },
    }));
    assert.equal(r.headers.get("location"), null, "actiunea a fost redirectionata");
    assert.notEqual(r.status, 307);
    assert.ok(cereri.includes("GET /auth/v1/user"), "proba nu a ajuns la omul autentificat: nu dovedeste nimic");
  });

  test("navigarea pe /onboarding a unui om cu onboardingul terminat merge tot in panou, ca inainte", async () => {
    const r = await updateSession(new NextRequest("http://localhost:3000/onboarding/plan?success=1", {
      headers: { cookie: cookieSesiune, accept: "text/html" },
    }));
    assert.equal(r.status, 307);
    assert.equal(new URL(r.headers.get("location") ?? "http://x/nimic").pathname, "/dashboard");
  });

  test("un POST fara antetul actiunii (un formular obisnuit) e tratat ca navigare", async () => {
    const r = await updateSession(new NextRequest("http://localhost:3000/onboarding/details", {
      method: "POST",
      headers: { cookie: cookieSesiune, accept: "text/html" },
    }));
    assert.equal(r.status, 307);
  });
});
