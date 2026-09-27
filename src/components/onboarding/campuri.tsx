import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* Campurile si butonul principal ale pasilor, intr-un singur loc. */

export function campCls(invalid: boolean) {
  return cn(
    "w-full rounded-lg border bg-surface px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors",
    "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    invalid ? "border-destructive" : "border-border",
  );
}

export function ButonContinua({
  children,
  dezactivat,
  seIncarca,
  onClick,
  type = "submit",
}: {
  children: ReactNode;
  dezactivat?: boolean;
  seIncarca?: boolean;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={dezactivat || seIncarca}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {seIncarca && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkInapoi({ onClick, children = "Înapoi" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-4 block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
