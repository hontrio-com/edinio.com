import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t bg-background mt-auto">
      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Edinio. Toate drepturile rezervate.</p>
        <nav className="flex gap-4">
          <Link href="/despre" className="hover:text-foreground transition-colors">Despre</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        </nav>
      </div>
    </footer>
  )
}
