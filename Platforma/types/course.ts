export interface Course {
  id: string
  slug: string
  title_ro: string
  title_en: string
  description_ro: string | null
  description_en: string | null
  price_ron: number
  price_eur: number
  stripe_price_id_ron: string | null
  stripe_price_id_eur: string | null
  thumbnail_url: string | null
  promo_video_url: string | null
  is_published: boolean
  sort_order: number
}

export interface Lesson {
  id: string
  course_id: string
  title_ro: string
  title_en: string
  description_ro: string | null
  description_en: string | null
  bunny_video_id: string | null
  duration_seconds: number | null
  sort_order: number
  is_preview: boolean
  language: 'ro' | 'en'
}

export interface Purchase {
  id: string
  user_id: string
  course_id: string
  stripe_session_id: string | null
  amount_paid: number
  currency: string
  status: 'pending' | 'completed' | 'refunded'
  purchased_at: string
}

export interface LessonProgress {
  lesson_id: string
  completed: boolean
  progress_seconds: number
  last_watched_at: string
}

export interface Bundle {
  id: string
  slug: string
  title_ro: string
  title_en: string
  price_ron: number
  price_eur: number
  stripe_price_id_ron: string | null
  stripe_price_id_eur: string | null
  is_published: boolean
}
