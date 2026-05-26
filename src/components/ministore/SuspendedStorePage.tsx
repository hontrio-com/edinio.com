import { ShoppingBag } from "lucide-react";

interface Props {
  businessName: string;
  primaryColor: string;
  phone: string | null;
}

export function SuspendedStorePage({ businessName, primaryColor, phone }: Props) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: primaryColor }}
      >
        <ShoppingBag className="h-7 w-7 text-white" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">{businessName}</h1>
      <p className="text-muted-foreground mb-1">Magazinul este momentan indisponibil.</p>
      <p className="text-sm text-muted-foreground mb-8">
        Proprietarul lucreaza la reactivarea magazinului. Te rugam sa revii mai tarziu.
      </p>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white rounded-xl transition-opacity hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Contacteaza-ne
        </a>
      )}
    </div>
  );
}
