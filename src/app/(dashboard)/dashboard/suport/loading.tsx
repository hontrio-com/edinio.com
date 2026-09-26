export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-6 w-24 rounded-md bg-muted" />
          <div className="mt-2 h-4 w-72 rounded-md bg-muted" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-muted" />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-h-[116px] rounded-xl bg-muted sm:min-h-[168px]" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div className="h-11 bg-muted/60" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border px-5 py-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded-md bg-muted" />
              <div className="h-3 w-1/2 rounded-md bg-muted" />
            </div>
            <div className="h-6 w-36 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
