"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { saveNetopiaConfig, disconnectNetopia } from "@/lib/actions/netopia.actions";
import type { NetopiaConfig } from "@/lib/netopia";

interface Props {
  businessId: string;
  initialConfig: NetopiaConfig | null;
}

export default function NetopiaConfigClient({ businessId, initialConfig }: Props) {
  const [posSignature, setPosSignature] = useState(initialConfig?.pos_signature ?? "");
  const [publicKey, setPublicKey] = useState(initialConfig?.public_key ?? "");
  const [privateKey, setPrivateKey] = useState(initialConfig?.private_key ?? "");
  const [sandbox, setSandbox] = useState(initialConfig?.sandbox ?? true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isConnected = !!initialConfig?.enabled;

  async function handleSave() {
    setSaving(true);
    const result = await saveNetopiaConfig(businessId, { pos_signature: posSignature, public_key: publicKey, private_key: privateKey, sandbox });
    setSaving(false);
    if (result.success) {
      toast.success("Configuratie salvata");
    } else {
      toast.error(result.error ?? "Eroare la salvare");
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectNetopia(businessId);
    setDisconnecting(false);
    if (result.success) {
      toast.success("Netopia deconectat");
      setPosSignature("");
      setPublicKey("");
      setPrivateKey("");
      setSandbox(true);
    } else {
      toast.error(result.error ?? "Eroare la stergere");
    }
  }

  return (
    <div className="space-y-6">
      {isConnected && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Netopia este activ si configurat.
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pos_signature">POS Signature</Label>
          <Input
            id="pos_signature"
            value={posSignature}
            onChange={(e) => setPosSignature(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="public_key">Cheie publica (.cer)</Label>
          <Textarea
            id="public_key"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Continutul fisierului .cer primit de la Netopia</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="private_key">Cheie privata (.key)</Label>
          <Textarea
            id="private_key"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Continutul fisierului .key primit de la Netopia</p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="sandbox"
            checked={sandbox}
            onCheckedChange={setSandbox}
          />
          <Label htmlFor="sandbox" className="cursor-pointer">
            Mod sandbox (testare)
          </Label>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || !posSignature.trim() || !publicKey.trim() || !privateKey.trim()}>
          {saving ? "Se salveaza..." : "Salveaza"}
        </Button>
        {isConnected && (
          <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Se sterge..." : "Deconecteaza"}
          </Button>
        )}
      </div>
    </div>
  );
}
