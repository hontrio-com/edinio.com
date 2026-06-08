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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          county: string | null
          cover_url: string | null
          created_at: string
          cui: string | null
          custom_domain: string | null
          description: string | null
          email: string | null
          features: Json
          gallery: Json
          id: string
          is_published: boolean
          lat: number | null
          lng: number | null
          logo_url: string | null
          niche_id: string | null
          phone: string | null
          primary_color: string
          slug: string
          social: Json
          store_name: string | null
          suspended_until: string | null
          tagline: string | null
          type: string
          updated_at: string
          user_id: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          city?: string | null
          county?: string | null
          cover_url?: string | null
          created_at?: string
          cui?: string | null
          custom_domain?: string | null
          description?: string | null
          email?: string | null
          features?: Json
          gallery?: Json
          id?: string
          is_published?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          niche_id?: string | null
          phone?: string | null
          primary_color?: string
          slug: string
          social?: Json
          store_name?: string | null
          suspended_until?: string | null
          tagline?: string | null
          type?: string
          updated_at?: string
          user_id: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          county?: string | null
          cover_url?: string | null
          created_at?: string
          cui?: string | null
          custom_domain?: string | null
          description?: string | null
          email?: string | null
          features?: Json
          gallery?: Json
          id?: string
          is_published?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          niche_id?: string | null
          phone?: string | null
          primary_color?: string
          slug?: string
          social?: Json
          store_name?: string | null
          suspended_until?: string | null
          tagline?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          business_id: string
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number | null
          type: string
          updated_at: string
          uses_count: number
          value: number
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          type: string
          updated_at?: string
          uses_count?: number
          value?: number
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          type?: string
          updated_at?: string
          uses_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_orders: {
        Row: {
          admin_notes: string | null
          business_id: string
          contact_info: Json
          created_at: string
          domain: string
          id: string
          period: number
          price_per_year: number
          status: string
          tld: string
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          business_id: string
          contact_info?: Json
          created_at?: string
          domain: string
          id?: string
          period?: number
          price_per_year?: number
          status?: string
          tld: string
          total_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          business_id?: string
          contact_info?: Json
          created_at?: string
          domain?: string
          id?: string
          period?: number
          price_per_year?: number
          status?: string
          tld?: string
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          auto_renew: boolean
          business_id: string
          created_at: string
          domain: string
          expiry_date: string | null
          id: string
          source: string
          status: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          business_id: string
          created_at?: string
          domain: string
          expiry_date?: string | null
          id?: string
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          business_id?: string
          created_at?: string
          domain?: string
          expiry_date?: string | null
          id?: string
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domains_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          details: Json | null
          id: string
          message: string
          severity: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          severity?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          severity?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          plan: string
          smartbill_error: string | null
          smartbill_number: string | null
          smartbill_series: string | null
          status: string
          stripe_invoice_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          plan: string
          smartbill_error?: string | null
          smartbill_number?: string | null
          smartbill_series?: string | null
          status?: string
          stripe_invoice_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          plan?: string
          smartbill_error?: string | null
          smartbill_number?: string | null
          smartbill_series?: string | null
          status?: string
          stripe_invoice_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          business_id: string
          cargus_awb_number: string | null
          cargus_service_name: string | null
          colete_awb_number: string | null
          colete_order_id: string | null
          colete_service_name: string | null
          colete_unique_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          discount_amount: number
          discount_code: string | null
          dpd_awb_number: string | null
          dpd_shipment_id: number | null
          fan_courier_awb_number: string | null
          fgo_invoice_link: string | null
          fgo_invoice_number: string | null
          fgo_invoice_series: string | null
          fgo_storno_number: string | null
          fgo_storno_series: string | null
          id: string
          internal_notes: string | null
          items: Json
          notes: string | null
          oblio_invoice_number: string | null
          oblio_invoice_series: string | null
          oblio_proforma_number: string | null
          oblio_proforma_series: string | null
          oblio_storno_number: string | null
          oblio_storno_series: string | null
          order_number: string
          payment_method: string
          payment_status: string
          sameday_awb_number: string | null
          shipping_address: Json
          shipping_cost: number
          smartbill_estimate_number: string | null
          smartbill_estimate_series: string | null
          smartbill_invoice_number: string | null
          smartbill_invoice_series: string | null
          smartbill_storno_number: string | null
          smartbill_storno_series: string | null
          status: string
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          vat_amount: number
          vat_rate: number
          woot_awb_number: string | null
          woot_order_id: string | null
          woot_service_name: string | null
        }
        Insert: {
          business_id: string
          cargus_awb_number?: string | null
          cargus_service_name?: string | null
          colete_awb_number?: string | null
          colete_order_id?: string | null
          colete_service_name?: string | null
          colete_unique_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          discount_amount?: number
          discount_code?: string | null
          dpd_awb_number?: string | null
          dpd_shipment_id?: number | null
          fan_courier_awb_number?: string | null
          fgo_invoice_link?: string | null
          fgo_invoice_number?: string | null
          fgo_invoice_series?: string | null
          fgo_storno_number?: string | null
          fgo_storno_series?: string | null
          id?: string
          internal_notes?: string | null
          items: Json
          notes?: string | null
          oblio_invoice_number?: string | null
          oblio_invoice_series?: string | null
          oblio_proforma_number?: string | null
          oblio_proforma_series?: string | null
          oblio_storno_number?: string | null
          oblio_storno_series?: string | null
          order_number: string
          payment_method?: string
          payment_status?: string
          sameday_awb_number?: string | null
          shipping_address: Json
          shipping_cost?: number
          smartbill_estimate_number?: string | null
          smartbill_estimate_series?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          smartbill_storno_number?: string | null
          smartbill_storno_series?: string | null
          status?: string
          stripe_session_id?: string | null
          subtotal: number
          total: number
          tracking_number?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          woot_awb_number?: string | null
          woot_order_id?: string | null
          woot_service_name?: string | null
        }
        Update: {
          business_id?: string
          cargus_awb_number?: string | null
          cargus_service_name?: string | null
          colete_awb_number?: string | null
          colete_order_id?: string | null
          colete_service_name?: string | null
          colete_unique_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          discount_amount?: number
          discount_code?: string | null
          dpd_awb_number?: string | null
          dpd_shipment_id?: number | null
          fan_courier_awb_number?: string | null
          fgo_invoice_link?: string | null
          fgo_invoice_number?: string | null
          fgo_invoice_series?: string | null
          fgo_storno_number?: string | null
          fgo_storno_series?: string | null
          id?: string
          internal_notes?: string | null
          items?: Json
          notes?: string | null
          oblio_invoice_number?: string | null
          oblio_invoice_series?: string | null
          oblio_proforma_number?: string | null
          oblio_proforma_series?: string | null
          oblio_storno_number?: string | null
          oblio_storno_series?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          sameday_awb_number?: string | null
          shipping_address?: Json
          shipping_cost?: number
          smartbill_estimate_number?: string | null
          smartbill_estimate_series?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          smartbill_storno_number?: string | null
          smartbill_storno_series?: string | null
          status?: string
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          woot_awb_number?: string | null
          woot_order_id?: string | null
          woot_service_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          business_id: string
          category: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          images: Json
          is_active: boolean
          is_featured: boolean
          name: string
          page_sections: Json
          price: number
          sku: string | null
          slug: string | null
          sort_order: number
          stock_quantity: number | null
          tags: Json
          track_inventory: boolean
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          business_id: string
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          is_featured?: boolean
          name: string
          page_sections?: Json
          price: number
          sku?: string | null
          slug?: string | null
          sort_order?: number
          stock_quantity?: number | null
          tags?: Json
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          business_id?: string
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          is_featured?: boolean
          name?: string
          page_sections?: Json
          price?: number
          sku?: string | null
          slug?: string | null
          sort_order?: number
          stock_quantity?: number | null
          tags?: Json
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      site_analytics: {
        Row: {
          business_id: string
          country: string
          created_at: string
          device: string | null
          event_type: string
          id: string
          metadata: Json
          referrer: string | null
          source: string | null
        }
        Insert: {
          business_id: string
          country?: string
          created_at?: string
          device?: string | null
          event_type: string
          id?: string
          metadata?: Json
          referrer?: string | null
          source?: string | null
        }
        Update: {
          business_id?: string
          country?: string
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          referrer?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          business_id: string
          created_at: string
          failed_count: number
          filters: Json | null
          id: string
          message: string
          recipient_count: number
          sent_count: number
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          failed_count?: number
          filters?: Json | null
          id?: string
          message: string
          recipient_count?: number
          sent_count?: number
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          failed_count?: number
          filters?: Json | null
          id?: string
          message?: string
          recipient_count?: number
          sent_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          business_id: string
          created_at: string
          id: string
          message: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          message: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          business_id: string
          cargus_config: Json | null
          colete_config: Json | null
          created_at: string
          currency: string
          default_shipping_cost: number
          dpd_config: Json | null
          fan_courier_config: Json | null
          fgo_config: Json | null
          free_shipping_threshold: number | null
          id: string
          marketing_config: Json | null
          min_order_amount: number | null
          netopia_config: Json | null
          notifications_config: Json
          oblio_config: Json | null
          order_counter: number
          order_number_format: string
          page_content: Json
          payment_methods: Json
          prices_include_vat: boolean
          sameday_config: Json | null
          shipping_enabled: boolean
          shipping_zones: Json
          show_vat_breakdown: boolean
          smartbill_config: Json | null
          smso_config: Json | null
          store_policies: Json
          stripe_config: Json | null
          updated_at: string
          vat_enabled: boolean
          vat_rate: number
          woot_config: Json | null
        }
        Insert: {
          business_id: string
          cargus_config?: Json | null
          colete_config?: Json | null
          created_at?: string
          currency?: string
          default_shipping_cost?: number
          dpd_config?: Json | null
          fan_courier_config?: Json | null
          fgo_config?: Json | null
          free_shipping_threshold?: number | null
          id?: string
          marketing_config?: Json | null
          min_order_amount?: number | null
          netopia_config?: Json | null
          notifications_config?: Json
          oblio_config?: Json | null
          order_counter?: number
          order_number_format?: string
          page_content?: Json
          payment_methods?: Json
          prices_include_vat?: boolean
          sameday_config?: Json | null
          shipping_enabled?: boolean
          shipping_zones?: Json
          show_vat_breakdown?: boolean
          smartbill_config?: Json | null
          smso_config?: Json | null
          store_policies?: Json
          stripe_config?: Json | null
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
          woot_config?: Json | null
        }
        Update: {
          business_id?: string
          cargus_config?: Json | null
          colete_config?: Json | null
          created_at?: string
          currency?: string
          default_shipping_cost?: number
          dpd_config?: Json | null
          fan_courier_config?: Json | null
          fgo_config?: Json | null
          free_shipping_threshold?: number | null
          id?: string
          marketing_config?: Json | null
          min_order_amount?: number | null
          netopia_config?: Json | null
          notifications_config?: Json
          oblio_config?: Json | null
          order_counter?: number
          order_number_format?: string
          page_content?: Json
          payment_methods?: Json
          prices_include_vat?: boolean
          sameday_config?: Json | null
          shipping_enabled?: boolean
          shipping_zones?: Json
          show_vat_breakdown?: boolean
          smartbill_config?: Json | null
          smso_config?: Json | null
          store_policies?: Json
          stripe_config?: Json | null
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
          woot_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          id?: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          business_id: string | null
          category: string
          created_at: string
          has_unread_reply: boolean
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          category?: string
          created_at?: string
          has_unread_reply?: boolean
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          category?: string
          created_at?: string
          has_unread_reply?: boolean
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type?: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          type?: string
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      users_profile: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          mfa_email_enabled: boolean
          mfa_otp: string | null
          mfa_otp_expires_at: string | null
          onboarding_completed: boolean
          plan: string
          plan_expires_at: string | null
          role: string
          stripe_customer_id: string | null
          suspended_until: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          mfa_email_enabled?: boolean
          mfa_otp?: string | null
          mfa_otp_expires_at?: string | null
          onboarding_completed?: boolean
          plan?: string
          plan_expires_at?: string | null
          role?: string
          stripe_customer_id?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          mfa_email_enabled?: boolean
          mfa_otp?: string | null
          mfa_otp_expires_at?: string | null
          onboarding_completed?: boolean
          plan?: string
          plan_expires_at?: string | null
          role?: string
          stripe_customer_id?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_discount_uses: {
        Args: { p_discount_id: string }
        Returns: undefined
      }
      increment_referral_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      increment_tool_views: { Args: { tool_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      mark_payout_complete: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      next_order_number: { Args: { p_business_id: string }; Returns: number }
      reserve_payout_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
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
