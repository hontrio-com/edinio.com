"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Truck, Loader2, CalendarClock } from "lucide-react";
import { requestDpdPickupAction } from "@/lib/actions/dpd.actions";
import { Button } from "@/components/ui/button";

export function DpdPickupModal({
  open,
  onClose,
  businessId,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await requestDpdPickupAction(businessId);
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(
        result.count === 1
          ? "Ridicare DPD programata pentru 1 expeditie"
          : `Ridicare DPD programata pentru ${result.count} expeditii`,
      );
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <img src="/integrations/dpd.svg" alt="DPD" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cheama curierul DPD</p>
              <p className="text-xs text-muted-foreground">Programare ridicare colete</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-info/5 border border-info/20 flex gap-2.5">
            <CalendarClock className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              AWB-ul singur nu este suficient: fara o ridicare programata (sau un contract cu ridicare zilnica),
              curierul nu vine dupa colete. Se solicita ridicarea pentru toate AWB-urile DPD generate in
              ultimele 24 de ore. Curierul vine pana la ora 19:00; daca solicitarea ajunge prea tarziu,
              DPD muta automat vizita in urmatoarea zi lucratoare.
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={submitting} size="lg" className="w-full">
            {submitting ? <Loader2 className="animate-spin" /> : <Truck />}
            {submitting ? "Se programeaza..." : "Solicita ridicarea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
