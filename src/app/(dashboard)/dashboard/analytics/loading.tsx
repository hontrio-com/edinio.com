export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-32 bg-muted rounded-lg" />
        <div className="h-4 w-52 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-xl h-24" />
        ))}
      </div>
      <div className="bg-muted rounded-xl h-72" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-muted rounded-xl h-48" />
        <div className="bg-muted rounded-xl h-48" />
      </div>
    </div>
  );
}
