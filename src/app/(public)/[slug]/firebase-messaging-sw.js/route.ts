import { headers } from "next/headers";
import { SW_FIREBASE, pushPermis, raspunsJs } from "@/lib/themarketer/push";

/**
 * `/firebase-messaging-sw.js` pe domeniul propriu al magazinului (proxy-ul il rescrie aici, vezi
 * `FISIERE_PUSH_THEMARKETER`): fisierul notificarilor push theMarketer. Vezi `lib/themarketer/push.ts`.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const host = (await headers()).get("host");
  if (!(await pushPermis(slug, host))) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  return raspunsJs(SW_FIREBASE);
}
