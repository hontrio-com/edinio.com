"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Smartphone, CheckCircle2, XCircle, Link2, RefreshCw, KeyRound } from "lucide-react";
import {
  connectNoticeWhatsapp, refreshNoticeWhatsappQr, requestNoticeWhatsappPairing,
  checkNoticeWhatsappStatus, disconnectNoticeWhatsapp,
} from "@/lib/actions/notice.actions";
import type { NoticeWhatsappConfig } from "@/lib/notice";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const STATUS_LABELS: Record<string, string> = {
  pending: "In asteptare conectare",
  authenticated: "Conectat",
  disconnected: "Deconectat",
  banned: "Blocat de WhatsApp",
  unknown: "Necunoscut",
};

export function NoticeWhatsappPanel({
  businessId, token, whatsapp, onChange,
}: {
  businessId: string;
  token: string;
  whatsapp?: NoticeWhatsappConfig;
  onChange: () => void;
}) {
  const connected = !!whatsapp?.enabled && whatsapp?.status === "authenticated";
  const [deviceId, setDeviceId] = useState<string | null>(whatsapp?.device_id ?? null);
  const [status, setStatus] = useState<string>(whatsapp?.status ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Poll device status while we have a device that isn't connected yet.
  useEffect(() => {
    if (!deviceId || connected || status === "authenticated") { stopPolling(); return; }
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (++pollCountRef.current > 45) { stopPolling(); toast.message("Conectarea a expirat. Reincearca."); return; } // ~3 min cap
      const res = await checkNoticeWhatsappStatus(businessId, token, deviceId);
      if ("error" in res) return;
      setStatus(res.status);
      if (res.status === "authenticated") {
        stopPolling();
        toast.success("WhatsApp conectat cu succes.");
        onChange();
      } else if (res.status === "banned" || res.status === "disconnected") {
        stopPolling();
      }
    }, 4000);
    return stopPolling;
  }, [deviceId, connected, status, businessId, token, stopPolling, onChange]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function startConnect() {
    if (!token.trim()) { toast.error("Salveaza intai tokenul API."); return; }
    setBusy(true);
    pollCountRef.current = 0;
    setQr(null); setPairing(null);
    const res = await connectNoticeWhatsapp(businessId, token);
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    setDeviceId(res.device.id);
    setStatus(res.device.status || "pending");
    if (res.device.qr_code) setQr(res.device.qr_code);
  }

  async function refreshQr() {
    if (!deviceId) return;
    setBusy(true);
    const res = await refreshNoticeWhatsappQr(token, deviceId);
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    setQr(res.qr_code);
  }

  async function getPairing() {
    if (!deviceId) return;
    if (!waPhone.trim()) { toast.error("Introdu numarul de WhatsApp."); return; }
    setPairingBusy(true);
    const res = await requestNoticeWhatsappPairing(token, deviceId, waPhone);
    setPairingBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    setPairing(res.pairing_code);
  }

  async function disconnect() {
    setBusy(true);
    const res = await disconnectNoticeWhatsapp(businessId, token, deviceId ?? "");
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    stopPolling();
    setDeviceId(null); setStatus(""); setQr(null); setPairing(null);
    toast.success("WhatsApp deconectat.");
    onChange();
  }

  // ── Connected ── (also when the poll just detected it, before the parent prop syncs)
  if (connected || status === "authenticated") {
    return (
      <Panel className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">WhatsApp conectat</p>
              <p className="text-xs text-muted-foreground">{whatsapp?.device_name || "Dispozitiv"} · activ</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <XCircle />} Deconecteaza
          </Button>
        </div>
      </Panel>
    );
  }

  const isDataImg = !!qr && qr.startsWith("data:image");
  const connecting = !!deviceId;

  // ── Not connected ──
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Conecteaza WhatsApp</p>
        {connecting && status && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {STATUS_LABELS[status] ?? status}
          </span>
        )}
      </div>

      {!connecting ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Leaga un numar de WhatsApp din contul tau notice.ro ca sa trimiti notificarile si pe WhatsApp.
            Vei primi un cod de 6 cifre pe care il introduci in aplicatia WhatsApp.
          </p>
          <Button onClick={startConnect} disabled={busy || !token.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Conecteaza WhatsApp
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          {/* Pairing code — primary method */}
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Conectare cu cod (recomandat)</p>
            </div>
            <p className="mb-2.5 text-xs text-muted-foreground">
              Introdu numarul de WhatsApp, apoi in telefon: WhatsApp → Dispozitive conectate → Conecteaza un dispozitiv → Conecteaza cu numar de telefon.
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
              <Button variant="outline" onClick={getPairing} disabled={pairingBusy} className="whitespace-nowrap">
                {pairingBusy ? <Loader2 className="animate-spin" /> : <KeyRound />} Obtine cod
              </Button>
            </div>
            {pairing && (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cod de asociere</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-primary">{pairing}</p>
              </div>
            )}
          </div>

          {/* QR — only when notice.ro returns a renderable image */}
          {isDataImg && (
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="mb-2 text-sm font-medium text-foreground">Sau scaneaza codul QR</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr!} alt="Cod QR WhatsApp" className="mx-auto h-44 w-44 rounded-lg" />
              <Button variant="ghost" size="sm" onClick={refreshQr} disabled={busy} className="mt-2">
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reimprospateaza QR
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Astept conectarea...
            </p>
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Anuleaza</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
