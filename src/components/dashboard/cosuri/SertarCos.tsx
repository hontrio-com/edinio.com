"use client";

import Image from "next/image";
import { BellOff, Bell, Mail, MessageSquare, Trash2, X } from "lucide-react";

import { formatPrice } from "@/lib/utils/format";
import { NUMELE_STARII, cateInCos, stareaCosului } from "@/lib/abandoned/starea-cosului";
import type { AbandonedCartRow } from "@/lib/abandoned-cart";

import { EticheraStare } from "./EticheteStare";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TOT CE E IN COS, FARA SA PLECI DIN LISTA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE LIPSEA. Randul spunea „3 produse · 577 lei" si atat. Comerciantul care
  voia sa stie CE a lasat omul in cos - ca sa scrie un mesaj care sa aiba sens,
  sau ca sa hotarasca daca merita un SMS platit - nu avea de unde afla.

  ⚠ SI CRONOLOGIA MESAJELOR e aici, nu doar „i s-a trimis": cand a plecat
  fiecare, pe ce canal, de mana sau din automatizare, si daca a fost deschis.
  Fara ea, „Contactat" nu spune daca s-a trimis un mesaj acum o ora sau trei
  acum o luna.
*/

function candCu(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Bucharest",
  });
}

export function SertarCos({
  cos, smsEnabled, seLucreaza, onInchide, onTrimite, onIgnora, onSterge,
}: {
  cos: AbandonedCartRow;
  smsEnabled: boolean;
  seLucreaza: boolean;
  onInchide: () => void;
  onTrimite: (canal: "email" | "sms") => void;
  onIgnora: (catre: boolean) => void;
  onSterge: () => void;
}) {
  const stare = stareaCosului(cos);
  const ignorat = !!cos.ignorat_la;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => !seLucreaza && onInchide()} />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-card shadow-2xl ring-1 ring-foreground/10">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {cos.customer_name || "Client anonim"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[cos.phone, cos.email].filter(Boolean).join(" · ") || "Fără contact"}
            </p>
          </div>
          <button
            onClick={onInchide}
            aria-label="Închide"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="flex items-center gap-2">
            <EticheraStare cos={cos} />
            <span className="text-xs text-muted-foreground">{NUMELE_STARII[stare].explicatie}</span>
          </div>

          {/* ── Ce e in cos ─────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">
              În coș · {cateInCos(cos.items, cos.item_count)}
            </p>
            <div className="divide-y divide-border rounded-xl border border-border">
              {cos.items.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  {/*
                    ⚠ NU E UN COS GOL, e un instantaneu care nu se mai poate reface:
                    produsele au iesit din catalog, sau cer o varianta pe care randul
                    salvat n-o poarta. Linkul de recuperare l-ar duce pe om intr-un zid.
                  */}
                  Produsele din acest coș nu mai pot fi recuperate: au ieșit din catalog sau
                  cer o variantă pe care coșul salvat nu o mai are.
                </p>
              ) : cos.items.map((it, i) => (
                <div key={`${it.product_id}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {it.image_url && (
                      <Image src={it.image_url} alt="" fill sizes="40px" className="object-cover" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{it.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {it.variant_title ? `${it.variant_title} · ` : ""}
                      {it.quantity} buc × {formatPrice(it.price)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                    {formatPrice((Number(it.price) || 0) * (Number(it.quantity) || 0))}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valoare coș</span>
              <span className="font-bold tabular-nums text-foreground">{formatPrice(cos.subtotal)}</span>
            </div>
            {/*
              ⚠ SUMA E CEA SALVATA LA CAPTURA. Preturile se iau din catalog abia
              cand pleaca mesajul sau cand se recupereaza cosul, deci pe un produs
              scumpit intre timp cifra de aici e mai mica decat ce ar plati omul.
            */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Valoarea e cea de la momentul abandonului. La recuperare, prețurile se iau din catalog.
            </p>
          </div>

          {/* ── Ce i s-a trimis ─────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">Mesaje trimise</p>
            {cos.mesaje.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {cos.recovery_email_sent_at || cos.recovery_sms_sent_at
                  /*
                    ⚠ Cosurile de dinainte de jurnalul de mesaje (21.09.2026) au
                    data trimiterii, dar nu si randurile. Se spune pe fata, in loc
                    sa arate „niciun mesaj" pentru unul care chiar a primit.
                  */
                  ? `I s-a trimis un mesaj (${candCu(cos.recovery_email_sent_at ?? cos.recovery_sms_sent_at)}), dinainte să ținem evidența pe mesaj.`
                  : "Niciun mesaj de recuperare încă."}
              </p>
            ) : (
              <ol className="space-y-2">
                {cos.mesaje.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 text-muted-foreground">
                      {m.canal === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground">
                        {m.canal === "email" ? "Email" : "SMS"}
                        {m.sursa === "automatizare" ? ` · automat${m.pas != null ? `, pasul ${m.pas + 1}` : ""}` : " · trimis manual"}
                      </p>
                      <p className="text-muted-foreground">
                        {candCu(m.trimis_la)}
                        {m.deschis_la
                          ? ` · a deschis linkul ${candCu(m.deschis_la)}`
                          : " · linkul nu a fost deschis"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── Ce se poate face ────────────────────────────────────────── */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex gap-2">
              <button
                onClick={() => onTrimite("email")}
                disabled={seLucreaza || !cos.email || ignorat}
                title={ignorat ? "Coșul e ignorat: nu mai primește mesaje" : undefined}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail className="h-3.5 w-3.5" /> Trimite email
              </button>
              {smsEnabled && (
                <button
                  onClick={() => onTrimite("sms")}
                  disabled={seLucreaza || !cos.phone || ignorat}
                  title={ignorat ? "Coșul e ignorat: nu mai primește mesaje" : undefined}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Trimite SMS
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onIgnora(!ignorat)}
                disabled={seLucreaza}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {ignorat ? <><Bell className="h-3.5 w-3.5" /> Scoate din ignorate</> : <><BellOff className="h-3.5 w-3.5" /> Ignoră</>}
              </button>
              <button
                onClick={onSterge}
                disabled={seLucreaza}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Șterge
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
