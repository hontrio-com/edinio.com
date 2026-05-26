export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-6 w-36 bg-muted rounded-lg" />
          <div className="h-4 w-56 bg-muted rounded-lg" />
        </div>
        <div className="h-9 w-28 bg-muted rounded-xl" />
      </div>
      <div className="bg-muted rounded-xl overflow-hidden">
        <div className="h-11 border-b border-border/50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-border/30 flex items-center px-5 gap-6">
            <div className="h-4 w-28 bg-muted-foreground/10 rounded font-mono" />
            <div className="h-6 w-24 bg-muted-foreground/10 rounded-lg" />
            <div className="h-4 w-16 bg-muted-foreground/10 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
