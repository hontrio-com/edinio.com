export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-44 bg-muted rounded-lg" />
        <div className="h-4 w-60 bg-muted rounded-lg" />
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-12" />
          ))}
        </div>
        <div className="md:col-span-2 bg-muted rounded-xl h-96" />
      </div>
    </div>
  );
}
