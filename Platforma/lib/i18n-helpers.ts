export function lessonTitle(
  lesson: { title_ro: string; title_en: string },
  language: 'ro' | 'en'
): string {
  return language === 'ro' ? lesson.title_ro : (lesson.title_en || lesson.title_ro)
}

export function courseTitle(
  course: { title_ro: string; title_en: string },
  language: 'ro' | 'en'
): string {
  return language === 'ro' ? course.title_ro : (course.title_en || course.title_ro)
}

export function lessonDescription(
  lesson: { description_ro: string | null; description_en: string | null },
  language: 'ro' | 'en'
): string | null {
  return language === 'ro' ? lesson.description_ro : (lesson.description_en ?? lesson.description_ro)
}
