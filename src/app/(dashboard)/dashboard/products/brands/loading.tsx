export default function Loading() {
  return (
    <div className="p-6 max-w-4xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-6 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-36 bg-muted rounded-xl" />
      </div>
      <div className="bg-muted rounded-xl overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-border/30 flex items-center px-5 gap-3">
            <div className="h-9 w-9 bg-muted-foreground/10 rounded-lg flex-shrink-0" />
            <div className="h-4 w-40 bg-muted-foreground/10 rounded" />
            <div className="h-4 w-16 bg-muted-foreground/10 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
