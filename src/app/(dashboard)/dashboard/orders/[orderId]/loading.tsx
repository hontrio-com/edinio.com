export default function Loading() {
  return (
    <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-6 w-48 bg-muted rounded-lg" />
        <div className="h-6 w-24 bg-muted rounded-full" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-muted rounded-xl h-48" />
        <div className="bg-muted rounded-xl h-48" />
      </div>
      <div className="bg-muted rounded-xl h-52" />
    </div>
  );
}
