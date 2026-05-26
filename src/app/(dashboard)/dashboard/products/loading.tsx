export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-6 w-28 bg-muted rounded-lg" />
          <div className="h-4 w-44 bg-muted rounded-lg" />
        </div>
        <div className="h-9 w-36 bg-muted rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-xl overflow-hidden">
            <div className="h-48 bg-muted-foreground/10" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 bg-muted-foreground/10 rounded" />
              <div className="h-4 w-1/2 bg-muted-foreground/10 rounded" />
              <div className="h-8 w-full bg-muted-foreground/10 rounded-lg mt-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
