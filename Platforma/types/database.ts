export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bundle_courses: {
        Row: {
          bundle_id: string
          course_id: string
        }
        Insert: {
          bundle_id: string
          course_id: string
        }
        Update: {
          bundle_id?: string
          course_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_courses_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_purchases: {
        Row: {
          amount_paid: number
          bundle_id: string | null
          currency: string
          id: string
          purchased_at: string | null
          status: string
          stripe_session_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_paid: number
          bundle_id?: string | null
          currency?: string
          id?: string
          purchased_at?: string | null
          status?: string
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_paid?: number
          bundle_id?: string | null
          currency?: string
          id?: string
          purchased_at?: string | null
          status?: string
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_purchases_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          id: string
          is_published: boolean | null
          price_eur: number
          price_ron: number
          slug: string
          stripe_price_id_eur: string | null
          stripe_price_id_ron: string | null
          title_en: string
          title_ro: string
        }
        Insert: {
          id?: string
          is_published?: boolean | null
          price_eur: number
          price_ron: number
          slug: string
          stripe_price_id_eur?: string | null
          stripe_price_id_ron?: string | null
          title_en: string
          title_ro: string
        }
        Update: {
          id?: string
          is_published?: boolean | null
          price_eur?: number
          price_ron?: number
          slug?: string
          stripe_price_id_eur?: string | null
          stripe_price_id_ron?: string | null
          title_en?: string
          title_ro?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string | null
          description_en: string | null
          description_ro: string | null
          id: string
          is_published: boolean | null
          price_eur: number
          price_ron: number
          promo_video_url: string | null
          slug: string
          sort_order: number | null
          stripe_price_id_eur: string | null
          stripe_price_id_ron: string | null
          thumbnail_url: string | null
          title_en: string
          title_ro: string
        }
        Insert: {
          created_at?: string | null
          description_en?: string | null
          description_ro?: string | null
          id?: string
          is_published?: boolean | null
          price_eur: number
          price_ron: number
          promo_video_url?: string | null
          slug: string
          sort_order?: number | null
          stripe_price_id_eur?: string | null
          stripe_price_id_ron?: string | null
          thumbnail_url?: string | null
          title_en: string
          title_ro: string
        }
        Update: {
          created_at?: string | null
          description_en?: string | null
          description_ro?: string | null
          id?: string
          is_published?: boolean | null
          price_eur?: number
          price_ron?: number
          promo_video_url?: string | null
          slug?: string
          sort_order?: number | null
          stripe_price_id_eur?: string | null
          stripe_price_id_ron?: string | null
          thumbnail_url?: string | null
          title_en?: string
          title_ro?: string
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          completed: boolean | null
          id: string
          last_watched_at: string | null
          lesson_id: string | null
          progress_seconds: number | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          lesson_id?: string | null
          progress_seconds?: number | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          lesson_id?: string | null
          progress_seconds?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons_by_language"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          bunny_video_id: string | null
          course_id: string | null
          created_at: string | null
          description_en: string | null
          description_ro: string | null
          duration_seconds: number | null
          id: string
          is_preview: boolean | null
          language: string
          sort_order: number
          title_en: string
          title_ro: string
        }
        Insert: {
          bunny_video_id?: string | null
          course_id?: string | null
          created_at?: string | null
          description_en?: string | null
          description_ro?: string | null
          duration_seconds?: number | null
          id?: string
          is_preview?: boolean | null
          language?: string
          sort_order: number
          title_en: string
          title_ro: string
        }
        Update: {
          bunny_video_id?: string | null
          course_id?: string | null
          created_at?: string | null
          description_en?: string | null
          description_ro?: string | null
          duration_seconds?: number | null
          id?: string
          is_preview?: boolean | null
          language?: string
          sort_order?: number
          title_en?: string
          title_ro?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          preferred_language: string | null
          role: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          preferred_language?: string | null
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          preferred_language?: string | null
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_paid: number
          course_id: string | null
          currency: string
          id: string
          purchased_at: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_paid: number
          course_id?: string | null
          currency?: string
          id?: string
          purchased_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_paid?: number
          course_id?: string | null
          currency?: string
          id?: string
          purchased_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lessons_by_language: {
        Row: {
          bunny_video_id: string | null
          course_id: string | null
          course_slug: string | null
          course_title_en: string | null
          course_title_ro: string | null
          created_at: string | null
          description_en: string | null
          description_ro: string | null
          duration_seconds: number | null
          id: string | null
          is_preview: boolean | null
          language: string | null
          sort_order: number | null
          title_en: string | null
          title_ro: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      increment_tool_views: { Args: { tool_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      difficulty_level: "incepator" | "intermediar" | "avansat"
      pricing_type: "gratuit" | "freemium" | "platit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      difficulty_level: ["incepator", "intermediar", "avansat"],
      pricing_type: ["gratuit", "freemium", "platit"],
    },
  },
} as const
