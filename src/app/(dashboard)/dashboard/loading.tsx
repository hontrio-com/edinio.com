export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-7 w-48 bg-muted rounded-lg" />
      <div className="h-4 w-72 bg-muted rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-xl h-24" />
        ))}
      </div>
      <div className="bg-muted rounded-xl h-64" />
    </div>
  );
}
