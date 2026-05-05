import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Wrench, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']

interface Props {
  params: Promise<{ slug: string; locale: string }>
}

// Static tools per course — extend this when courses have dynamic tool lists in DB
const TOOLS_BY_COURSE: Record<
  string,
  {
    name: string
    description: string
    url: string
    category: string
    isFree: boolean
  }[]
> = {
  default: [
    {
      name: 'ChatGPT',
      description: 'Asistentul AI de la OpenAI, ideal pentru brainstorming și redactare.',
      url: 'https://chat.openai.com',
      category: 'AI Chat',
      isFree: true,
    },
    {
      name: 'Claude',
      description: 'AI de la Anthropic, excelent pentru analiză și cod.',
      url: 'https://claude.ai',
      category: 'AI Chat',
      isFree: true,
    },
    {
      name: 'Midjourney',
      description: 'Generare de imagini AI de înaltă calitate.',
      url: 'https://midjourney.com',
      category: 'Imagini AI',
      isFree: false,
    },
    {
      name: 'Perplexity',
      description: 'Motor de căutare cu AI pentru răspunsuri cu surse.',
      url: 'https://perplexity.ai',
      category: 'Cercetare',
      isFree: true,
    },
    {
      name: 'Notion AI',
      description: 'Productivitate și notițe augmentate cu AI.',
      url: 'https://notion.so',
      category: 'Productivitate',
      isFree: false,
    },
    {
      name: 'Make (Integromat)',
      description: 'Automatizări vizuale fără cod între aplicații.',
      url: 'https://make.com',
      category: 'Automatizare',
      isFree: true,
    },
  ],
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `Unelte — ${slug} | Edinio` }
}

export default async function CourseToolsPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  const course = courseData as CourseRow | null
  if (!course) notFound()

  const { data: purchaseData } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .eq('status', 'completed')
    .maybeSingle()

  if (!purchaseData) redirect(`/cursuri/${slug}`)

  const tools = TOOLS_BY_COURSE[slug] ?? TOOLS_BY_COURSE.default

  const categories = [...new Set(tools.map((t) => t.category))]

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Unelte</h1>
        </div>
        <p className="text-muted-foreground">
          Instrumente recomandate pentru cursul{' '}
          <span className="font-medium text-foreground">{course.title_ro}</span>.
        </p>
      </div>

      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {category}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools
              .filter((t) => t.category === category)
              .map((tool) => (
                <a
                  key={tool.name}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="group-hover:text-primary transition-colors">
                          {tool.name}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {tool.description}
                      </p>
                      <Badge variant={tool.isFree ? 'secondary' : 'outline'} className="text-xs">
                        {tool.isFree ? 'Gratuit' : 'Plătit'}
                      </Badge>
                    </CardContent>
                  </Card>
                </a>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
