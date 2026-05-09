import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { FileText, Download, ExternalLink, BookOpen, Video, Link2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']

interface Props {
  params: Promise<{ slug: string; locale: string }>
}

type ResourceType = 'pdf' | 'video' | 'link' | 'template'

interface Resource {
  title: string
  description: string
  url: string
  type: ResourceType
  isDownloadable: boolean
}

// Static resources per course - extend when courses have dynamic resources in DB
const RESOURCES_BY_COURSE: Record<string, Resource[]> = {
  default: [
    {
      title: 'Ghid de prompting ChatGPT',
      description: 'Template-uri și tehnici avansate de prompt engineering.',
      url: '#',
      type: 'pdf',
      isDownloadable: true,
    },
    {
      title: 'Cheatsheet - comenzi AI esențiale',
      description: 'Referință rapidă pentru cele mai utile comenzi AI.',
      url: '#',
      type: 'pdf',
      isDownloadable: true,
    },
    {
      title: 'Roadmap AI 2025',
      description: 'Harta completă a instrumentelor AI și a evoluției lor.',
      url: '#',
      type: 'template',
      isDownloadable: false,
    },
    {
      title: 'Comunitate Discord',
      description: 'Alătură-te comunității Edinio pentru întrebări și networking.',
      url: '#',
      type: 'link',
      isDownloadable: false,
    },
  ],
}

const typeConfig: Record<ResourceType, { icon: React.ElementType; label: string }> = {
  pdf: { icon: FileText, label: 'PDF' },
  video: { icon: Video, label: 'Video' },
  link: { icon: Link2, label: 'Link' },
  template: { icon: BookOpen, label: 'Template' },
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `Resurse - ${slug} | Edinio` }
}

export default async function CourseResourcesPage({ params }: Props) {
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

  const resources = RESOURCES_BY_COURSE[slug] ?? RESOURCES_BY_COURSE.default

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Resurse</h1>
        </div>
        <p className="text-muted-foreground">
          Materiale descărcabile și linkuri utile pentru cursul{' '}
          <span className="font-medium text-foreground">{course.title_ro}</span>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {resources.map((resource, i) => {
          const { icon: Icon, label } = typeConfig[resource.type]
          const isPlaceholder = resource.url === '#'

          const inner = (
            <Card
              className={
                isPlaceholder
                  ? 'opacity-60'
                  : 'transition-colors hover:border-primary/50 cursor-pointer'
              }
            >
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-secondary shrink-0">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm leading-snug">{resource.title}</p>
                    {resource.isDownloadable && !isPlaceholder && (
                      <Download className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    {!resource.isDownloadable && !isPlaceholder && (
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {resource.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {label}
                    </Badge>
                    {isPlaceholder && (
                      <Badge variant="outline" className="text-xs">
                        În curând
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )

          if (isPlaceholder) {
            return <div key={i}>{inner}</div>
          }

          return (
            <a
              key={i}
              href={resource.url}
              target={resource.isDownloadable ? undefined : '_blank'}
              rel="noopener noreferrer"
              download={resource.isDownloadable || undefined}
            >
              {inner}
            </a>
          )
        })}
      </div>
    </div>
  )
}
