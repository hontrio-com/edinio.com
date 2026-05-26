export default function Loading() {
  return (
    <div className="p-6 max-w-3xl mx-auto animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-24 bg-muted rounded-lg" />
        <div className="h-4 w-48 bg-muted rounded-lg" />
      </div>
      <div className="flex gap-2 mb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-xl h-20" />
        ))}
      </div>
      <div className="h-10 w-32 bg-muted rounded-xl" />
    </div>
  );
}
