export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users_profile: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          plan: "free" | "basic" | "premium" | "ultra";
          plan_expires_at: string | null;
          stripe_customer_id: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          plan?: "free" | "basic" | "premium" | "ultra";
          plan_expires_at?: string | null;
          stripe_customer_id?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          avatar_url?: string | null;
          plan?: "free" | "basic" | "premium" | "ultra";
          plan_expires_at?: string | null;
          stripe_customer_id?: string | null;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          user_id: string;
          type: "ministore";
          slug: string;
          niche_id: string | null;
          business_name: string;
          tagline: string | null;
          description: string | null;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          website: string | null;
          address: string | null;
          city: string | null;
          county: string | null;
          lat: number | null;
          lng: number | null;
          logo_url: string | null;
          cover_url: string | null;
          primary_color: string;
          social: Json;
          gallery: Json;
          features: Json;
          is_published: boolean;
          custom_domain: string | null;
          suspended_until: string | null;
          cui: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: "ministore";
          slug: string;
          niche_id?: string | null;
          business_name: string;
          tagline?: string | null;
          description?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          website?: string | null;
          address?: string | null;
          city?: string | null;
          county?: string | null;
          lat?: number | null;
          lng?: number | null;
          logo_url?: string | null;
          cover_url?: string | null;
          primary_color?: string;
          social?: Json;
          gallery?: Json;
          features?: Json;
          is_published?: boolean;
          custom_domain?: string | null;
          suspended_until?: string | null;
          cui?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "ministore";
          slug?: string;
          niche_id?: string | null;
          business_name?: string;
          tagline?: string | null;
          description?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          website?: string | null;
          address?: string | null;
          city?: string | null;
          county?: string | null;
          lat?: number | null;
          lng?: number | null;
          logo_url?: string | null;
          cover_url?: string | null;
          primary_color?: string;
          social?: Json;
          gallery?: Json;
          features?: Json;
          is_published?: boolean;
          custom_domain?: string | null;
          suspended_until?: string | null;
          cui?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          business_id: string;
          parent_id: string | null;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          parent_id?: string | null;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          parent_id?: string | null;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          slug: string | null;
          description: string | null;
          price: number;
          compare_at_price: number | null;
          sku: string | null;
          stock_quantity: number | null;
          track_inventory: boolean;
          images: Json;
          category: string | null;
          tags: Json;
          is_active: boolean;
          is_featured: boolean;
          weight_grams: number | null;
          sort_order: number;
          page_sections: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          slug?: string | null;
          description?: string | null;
          price: number;
          compare_at_price?: number | null;
          sku?: string | null;
          stock_quantity?: number | null;
          track_inventory?: boolean;
          images?: Json;
          category?: string | null;
          tags?: Json;
          is_active?: boolean;
          is_featured?: boolean;
          weight_grams?: number | null;
          sort_order?: number;
          page_sections?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string | null;
          description?: string | null;
          price?: number;
          compare_at_price?: number | null;
          sku?: string | null;
          stock_quantity?: number | null;
          track_inventory?: boolean;
          images?: Json;
          category?: string | null;
          tags?: Json;
          is_active?: boolean;
          is_featured?: boolean;
          weight_grams?: number | null;
          sort_order?: number;
          page_sections?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      discounts: {
        Row: {
          id: string;
          business_id: string;
          code: string;
          type: "percent" | "fixed" | "free_shipping";
          value: number;
          min_order_amount: number | null;
          max_uses: number | null;
          uses_count: number;
          is_active: boolean;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          code: string;
          type: "percent" | "fixed" | "free_shipping";
          value?: number;
          min_order_amount?: number | null;
          max_uses?: number | null;
          uses_count?: number;
          is_active?: boolean;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          type?: "percent" | "fixed" | "free_shipping";
          value?: number;
          min_order_amount?: number | null;
          max_uses?: number | null;
          is_active?: boolean;
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          business_id: string;
          order_number: string;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string;
          shipping_address: Json;
          items: Json;
          subtotal: number;
          shipping_cost: number;
          discount_code: string | null;
          discount_amount: number;
          total: number;
          vat_amount: number;
          vat_rate: number;
          status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
          payment_method: string;
          payment_status: "unpaid" | "paid" | "refunded";
          notes: Json | null;
          internal_notes: string | null;
          tracking_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          order_number: string;
          customer_name: string;
          customer_email?: string | null;
          customer_phone: string;
          shipping_address: Json;
          items: Json;
          subtotal: number;
          shipping_cost?: number;
          discount_code?: string | null;
          discount_amount?: number;
          total: number;
          vat_amount?: number;
          vat_rate?: number;
          status?: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
          payment_method?: string;
          payment_status?: "unpaid" | "paid" | "refunded";
          notes?: Json | null;
          internal_notes?: string | null;
          tracking_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
          payment_status?: "unpaid" | "paid" | "refunded";
          internal_notes?: string | null;
          tracking_number?: string | null;
          vat_amount?: number;
          vat_rate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          id: string;
          business_id: string;
          currency: string;
          shipping_enabled: boolean;
          free_shipping_threshold: number | null;
          default_shipping_cost: number;
          shipping_zones: Json;
          payment_methods: Json;
          min_order_amount: number | null;
          store_policies: Json;
          page_content: Json;
          order_number_format: string;
          vat_enabled: boolean;
          vat_rate: number;
          prices_include_vat: boolean;
          show_vat_breakdown: boolean;
          notifications_config: Json;
          smso_config: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          currency?: string;
          shipping_enabled?: boolean;
          free_shipping_threshold?: number | null;
          default_shipping_cost?: number;
          shipping_zones?: Json;
          payment_methods?: Json;
          min_order_amount?: number | null;
          store_policies?: Json;
          page_content?: Json;
          order_number_format?: string;
          vat_enabled?: boolean;
          vat_rate?: number;
          prices_include_vat?: boolean;
          show_vat_breakdown?: boolean;
          notifications_config?: Json;
          smso_config?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          currency?: string;
          shipping_enabled?: boolean;
          free_shipping_threshold?: number | null;
          default_shipping_cost?: number;
          shipping_zones?: Json;
          payment_methods?: Json;
          min_order_amount?: number | null;
          store_policies?: Json;
          page_content?: Json;
          order_number_format?: string;
          vat_enabled?: boolean;
          vat_rate?: number;
          prices_include_vat?: boolean;
          show_vat_breakdown?: boolean;
          notifications_config?: Json;
          smso_config?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_analytics: {
        Row: {
          id: string;
          business_id: string;
          event_type: string;
          device: string | null;
          source: string | null;
          referrer: string | null;
          country: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          event_type: string;
          device?: string | null;
          source?: string | null;
          referrer?: string | null;
          country?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          [key: string]: never;
        };
        Relationships: [];
      };
      sms_campaigns: {
        Row: {
          id: string;
          business_id: string;
          message: string;
          recipient_count: number;
          sent_count: number;
          failed_count: number;
          status: "sent" | "partial" | "failed";
          filters: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          message: string;
          recipient_count?: number;
          sent_count?: number;
          failed_count?: number;
          status?: "sent" | "partial" | "failed";
          filters?: Json | null;
          created_at?: string;
        };
        Update: {
          status?: "sent" | "partial" | "failed";
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          amount: number;
          currency: string;
          smartbill_series: string | null;
          smartbill_number: string | null;
          stripe_invoice_id: string | null;
          smartbill_error: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan: string;
          amount: number;
          currency?: string;
          smartbill_series?: string | null;
          smartbill_number?: string | null;
          stripe_invoice_id?: string | null;
          smartbill_error?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          smartbill_series?: string | null;
          smartbill_number?: string | null;
          smartbill_error?: string | null;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_discount_uses: {
        Args: { p_discount_id: string };
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
