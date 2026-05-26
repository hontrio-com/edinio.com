export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-muted rounded-lg" />
          <div className="h-4 w-48 bg-muted rounded-lg" />
        </div>
        <div className="h-9 w-40 bg-muted rounded-xl" />
      </div>
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="bg-muted rounded-xl overflow-hidden">
        <div className="h-12 border-b border-border/50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-border/30 flex items-center px-5 gap-4">
            <div className="h-4 w-32 bg-muted-foreground/10 rounded" />
            <div className="h-4 w-40 bg-muted-foreground/10 rounded" />
            <div className="h-4 w-20 bg-muted-foreground/10 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
