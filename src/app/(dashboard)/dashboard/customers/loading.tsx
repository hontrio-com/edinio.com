export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="space-y-2 mb-5">
        <div className="h-6 w-32 bg-muted rounded-lg" />
        <div className="h-4 w-48 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-10 w-full bg-muted rounded-xl mb-4" />
      <div className="bg-muted rounded-xl overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-border/30 flex items-center px-5 gap-4">
            <div className="h-9 w-9 bg-muted-foreground/10 rounded-full" />
            <div className="h-4 w-40 bg-muted-foreground/10 rounded" />
            <div className="h-4 w-24 bg-muted-foreground/10 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
