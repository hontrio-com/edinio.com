import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { SectionHeader } from './section-header'
import { BookOpen, ExternalLink, ShoppingBag, ArrowRight, CheckCircle2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

interface Purchase {
  id: string
  amount_paid: number
  currency: string
  purchased_at: string
  stripe_session_id: string | null
  courses: {
    id: string
    title_ro: string
    slug: string
    thumbnail_url: string | null
  } | null
}

export function SubscriptionSection({ purchases }: { purchases: Purchase[] }) {
  const totalPaid = purchases.reduce((sum, p) => sum + p.amount_paid, 0)
  const currency = (purchases[0]?.currency ?? 'ron') as 'ron' | 'eur'

  if (purchases.length === 0) {
    return (
      <div>
        <SectionHeader
          label="Abonament"
          title="Cursurile tale"
          description="Toate cursurile achiziționate pe contul tău."
        />
        <div className="flex flex-col items-center justify-center py-14 text-center space-y-3">
          <div className="p-3 rounded-full bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Nicio achiziție încă</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explorează cursurile disponibile.
            </p>
          </div>
          <Link
            href="/cursuri"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 h-8 text-xs mt-2')}
          >
            Explorează cursurile
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        label="Abonament"
        title="Cursurile tale"
        description="Toate cursurile achiziționate pe contul tău."
      />

      {/* Summary pills */}
      <div className="flex items-center gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full border border-border/50">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          {purchases.length} {purchases.length === 1 ? 'curs' : 'cursuri'} active
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full border border-border/50">
          Total: {formatPrice(totalPaid, currency)}
        </span>
      </div>

      {/* Lista achiziții */}
      <div className="divide-y divide-border/60">
        {purchases.map((purchase) => {
          const course = purchase.courses
          return (
            <div key={purchase.id} className="flex items-center gap-4 py-3.5 group">
              <div className="h-8 w-8 rounded-lg bg-muted border border-border/50 flex items-center justify-center shrink-0">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {course?.title_ro ?? 'Curs indisponibil'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(purchase.purchased_at), 'd MMM yyyy', { locale: ro })}
                  {' · '}
                  {formatPrice(purchase.amount_paid, purchase.currency as 'ron' | 'eur')}
                </p>
              </div>

              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {course?.slug && (
                  <Link
                    href={`/curs/${course.slug}`}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Deschide
                  </Link>
                )}
                {purchase.stripe_session_id && (
                  <a
                    href={`/api/stripe/invoice?session_id=${purchase.stripe_session_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Factură"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Garanție */}
      <div className="mt-6 pt-5 border-t flex items-start gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Garanție 30 de zile</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Nu ești mulțumit? Scrie-ne la{' '}
            <a
              href="mailto:support@edinio.com"
              className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
            >
              support@edinio.com
            </a>
            {' '}și îți returnăm banii integral, fără întrebări.
          </p>
        </div>
      </div>
    </div>
  )
}
