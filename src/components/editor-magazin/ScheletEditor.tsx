import { Skeleton } from "@/components/ui/skeleton";

/**
 * Scheletul editorului cat se incarca. Umple ecranul, ca editorul: din 25.10.2026 editorul nu mai
 * sta in cadrul panoului (vezi `CadruPanou`), deci inaltimea nu mai scade nicio bara.
 */
export function ScheletEditor() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-border px-3 flex items-center gap-3">
        <Skeleton className="h-9 w-16" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-24 ml-auto" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-full lg:w-[360px] border-r border-border p-3 space-y-2">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
        <div className="hidden lg:block flex-1 p-5"><Skeleton className="h-full w-full rounded-xl" /></div>
      </div>
    </div>
  );
}
