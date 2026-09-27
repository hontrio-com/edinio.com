import { ETICHETA_DEZABONARE, textDeTrimis } from "@/lib/sms/mesaj";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PREVIZUALIZAREA: iPhone 17 + Mesaje (iOS 26)                     (27.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: „sa simulezi 1 la 1 un iPhone 17 si iMessage”. Totul e desenat la
  dimensiunile LOGICE ale ecranului (393 x 852 pt, ca pe telefon), apoi micsorat
  cu `scale`, ca proportiile sa ramana exacte: Dynamic Island, bara de stare,
  antetul aplicatiei Mesaje cu butoanele „de sticla” din iOS 26, bula gri primita
  (un SMS de la o firma e mesaj text, nu iMessage, deci GRI, la stanga), bara de
  scriere si indicatorul de jos.

  ⚠ Textul din bula e `textDeTrimis`: exact ce pleaca (variabile, dezabonare,
  diacritice scoase), nu ce scrie omul in camp.
*/

const LATIME = 393;
const INALTIME = 852;
const RAMA = 11;

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';

export function PreviewTelefon({ mesaj, prenume, magazin, expeditor, latime = 290 }: {
  mesaj: string; prenume: string; magazin: string;
  /** Sender ID-ul din SMSO: asa apare expeditorul pe telefonul clientului. */
  expeditor?: string | null;
  /** Latimea desenului in pagina, cu rama cu tot. */
  latime?: number;
}) {
  const text = mesaj.trim() ? textDeTrimis(mesaj, { prenume, magazin }) : "";
  const [inainte, dupa] = text.split(ETICHETA_DEZABONARE);
  const nume = (expeditor || magazin || "Magazin").trim();
  const initiale = nume.replace(/[^A-Za-z0-9ĂÂÎȘȚăâîșț ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((c) => c[0]).join("").toUpperCase() || "M";

  const total = LATIME + 2 * RAMA;
  const s = latime / total;

  return (
    <div className="mx-auto select-none" style={{ width: latime, height: (INALTIME + 2 * RAMA) * s }} aria-label="Previzualizarea SMS-ului pe un iPhone" role="img">
      <div style={{ width: total, height: INALTIME + 2 * RAMA, transform: `scale(${s})`, transformOrigin: "top left", position: "relative", fontFamily: FONT }}>
        {/* Butoanele laterale: Action, volum sus/jos (stanga); pornire si Camera Control (dreapta) */}
        <span style={buton("left", 172, 34)} />
        <span style={buton("left", 238, 62)} />
        <span style={buton("left", 312, 62)} />
        <span style={buton("right", 262, 96)} />
        <span style={{ ...buton("right", 470, 64), width: 4, background: "linear-gradient(90deg,#8d8f93,#c8cacd)" }} />

        {/* Rama de aluminiu si ecranul */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 66, padding: RAMA,
          background: "linear-gradient(145deg,#e7e8ea 0%,#b9bcc1 22%,#f4f5f6 48%,#a9acb1 74%,#dcdee1 100%)",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.6)",
        }}>
          <div style={{ position: "relative", width: LATIME, height: INALTIME, borderRadius: 56, overflow: "hidden", background: "#000", padding: 3 }}>
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 53, overflow: "hidden", background: "#fff", color: "#000" }}>
              <BaraDeStare />
              {/* Dynamic Island */}
              <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 124, height: 36, borderRadius: 20, background: "#000", zIndex: 5 }}>
                <span style={{ position: "absolute", right: 14, top: 12, width: 12, height: 12, borderRadius: 6, background: "radial-gradient(circle at 35% 35%,#2a3550,#0a0d14 70%)" }} />
              </div>

              <Antet nume={nume} initiale={initiale} />

              {/* Conversatia */}
              <div style={{ position: "absolute", top: 196, left: 0, right: 0, bottom: 104, overflowY: "hidden", padding: "0 14px" }}>
                <p style={{ textAlign: "center", fontSize: 12, lineHeight: "15px", color: "#8e8e93", margin: "6px 0 10px" }}>
                  <span style={{ fontWeight: 600 }}>Mesaj text</span><br />Astăzi 9:41
                </p>
                {text ? (
                  <div style={{ position: "relative", display: "inline-block", maxWidth: "76%", marginLeft: 6 }}>
                    <div style={{
                      position: "relative", zIndex: 1, background: "#e9e9eb", color: "#000", borderRadius: 19,
                      padding: "8px 13px 9px", fontSize: 17, lineHeight: "22px", letterSpacing: -0.4,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {inainte}
                      {dupa !== undefined && <><span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>smso.ro/u/7kQ2x</span>{dupa}</>}
                    </div>
                    {/* Coada bulei, ca in Mesaje: iese din coltul de jos-stanga si se curbeaza spre varf */}
                    <svg width="17" height="21" viewBox="0 0 17 21" aria-hidden style={{ position: "absolute", zIndex: 0, bottom: 0, left: -5 }}>
                      <path d="M17 0v21c-6.2.4-12.6-.5-17-1.6 3.6-1.7 6.2-5.3 6.2-11.4V0H17Z" fill="#e9e9eb" />
                    </svg>
                  </div>
                ) : (
                  <p style={{ textAlign: "center", fontSize: 13, color: "#8e8e93", marginTop: 60 }}>Scrie mesajul și îl vezi aici.</p>
                )}
                {text && (
                  <p style={{ textAlign: "center", fontSize: 12, lineHeight: "16px", color: "#8e8e93", margin: "18px 12px 0" }}>
                    Expeditorul nu se află în lista de contacte.<br />
                    <span style={{ color: "#007aff" }}>Raportați mesaj nedorit</span>
                  </p>
                )}
              </div>

              <BaraDeScriere />
              {/* Indicatorul de acasa */}
              <span style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 139, height: 5, borderRadius: 3, background: "#000" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buton(parte: "left" | "right", top: number, h: number): React.CSSProperties {
  return {
    position: "absolute", top, [parte]: -3, width: 5, height: h, borderRadius: 3,
    background: parte === "left" ? "linear-gradient(90deg,#9ea1a6,#d9dbde)" : "linear-gradient(90deg,#d9dbde,#9ea1a6)",
    boxShadow: "0 0 0 .5px rgba(0,0,0,.25)",
  } as React.CSSProperties;
}

/** 9:41, semnal, Wi-Fi, baterie: ca pe un iPhone cu Dynamic Island. */
function BaraDeStare() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, zIndex: 4 }}>
      <span style={{ position: "absolute", left: 50, top: 19, fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>9:41</span>
      <div style={{ position: "absolute", right: 30, top: 21, display: "flex", alignItems: "center", gap: 6 }}>
        {/* semnal */}
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 4.8} y={9 - i * 3} width="3.2" height={3 + i * 3} rx="1" fill="#000" />)}
        </svg>
        {/* Wi-Fi */}
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
          <path d="M8 11.4 5.9 9.2a3 3 0 0 1 4.2 0L8 11.4Z" fill="#000" />
          <path d="M3.6 7a6.3 6.3 0 0 1 8.8 0l-1.3 1.3a4.5 4.5 0 0 0-6.2 0L3.6 7Z" fill="#000" />
          <path d="M1.2 4.6a9.8 9.8 0 0 1 13.6 0l-1.3 1.3a8 8 0 0 0-11 0L1.2 4.6Z" fill="#000" />
        </svg>
        {/* baterie */}
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="#000" strokeOpacity=".35" />
          <rect x="2" y="2" width="20" height="9" rx="2.5" fill="#000" />
          <path d="M25 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="#000" fillOpacity=".4" />
        </svg>
      </div>
    </div>
  );
}

/** Antetul Mesajelor din iOS 26: buton „inapoi” de sticla, avatar cu initiale, numele cu sageata. */
function Antet({ nume, initiale }: { nume: string; initiale: string }) {
  const sticla: React.CSSProperties = {
    background: "rgba(255,255,255,.72)", backdropFilter: "blur(14px)",
    boxShadow: "0 1px 4px rgba(0,0,0,.08), inset 0 0 0 .5px rgba(0,0,0,.08)",
  };
  return (
    <div style={{ position: "absolute", top: 54, left: 0, right: 0, height: 136, zIndex: 3 }}>
      <div style={{ ...sticla, position: "absolute", left: 16, top: 12, width: 44, height: 44, borderRadius: 22, display: "grid", placeItems: "center" }}>
        <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden><path d="M10 2 2.5 10 10 18" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div style={{ ...sticla, position: "absolute", right: 16, top: 12, width: 44, height: 44, borderRadius: 22, display: "grid", placeItems: "center" }}>
        <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden>
          <rect x="1" y="2" width="15" height="12" rx="3.2" fill="none" stroke="#000" strokeWidth="1.9" />
          <path d="m17.5 6.3 4.3-2.6c.5-.3 1.2.1 1.2.7v7.2c0 .6-.7 1-1.2.7l-4.3-2.6V6.3Z" fill="#000" />
        </svg>
      </div>
      <div style={{ position: "absolute", left: "50%", top: 4, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 54, height: 54, borderRadius: 27, display: "grid", placeItems: "center",
          background: "linear-gradient(180deg,#a8aeb9 0%,#858a95 100%)", color: "#fff", fontSize: 22, fontWeight: 600, letterSpacing: .5,
        }}>{initiale}</div>
        <div style={{ ...sticla, marginTop: 6, borderRadius: 14, padding: "4px 10px", display: "flex", alignItems: "center", gap: 3, maxWidth: 200 }}>
          <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nume}</span>
          <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden><path d="m1 1 4 4-4 4" fill="none" stroke="#8e8e93" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </div>
      </div>
    </div>
  );
}

/** Bara de jos: „+”, campul „Mesaj text” si microfonul, cu sticla din iOS 26. */
function BaraDeScriere() {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, height: 52, display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(120,120,128,.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 2v12M2 8h12" stroke="#3c3c43" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" /></svg>
      </div>
      <div style={{
        flex: 1, height: 40, borderRadius: 20, border: "1px solid rgba(60,60,67,.18)", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 0 16px",
      }}>
        <span style={{ fontSize: 17, color: "#c4c4c6", letterSpacing: -0.4 }}>Mesaj text</span>
        <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden>
          <rect x="4" y="1" width="6" height="11" rx="3" fill="#8e8e93" />
          <path d="M1.5 9a5.5 5.5 0 0 0 11 0M7 14.5V18" fill="none" stroke="#8e8e93" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
