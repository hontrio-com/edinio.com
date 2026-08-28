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
      abandoned_carts: {
        Row: {
          automation_step: number
          business_id: string
          converted_at: string | null
          created_at: string
          customer_name: string | null
          email: string | null
          id: string
          item_count: number
          items: Json
          last_activity_at: string
          last_recovery_at: string | null
          order_id: string | null
          phone: string | null
          recovery_count: number
          recovery_email_sent_at: string | null
          recovery_sms_sent_at: string | null
          session_id: string
          source: string
          status: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          automation_step?: number
          business_id: string
          converted_at?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          item_count?: number
          items?: Json
          last_activity_at?: string
          last_recovery_at?: string | null
          order_id?: string | null
          phone?: string | null
          recovery_count?: number
          recovery_email_sent_at?: string | null
          recovery_sms_sent_at?: string | null
          session_id: string
          source?: string
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Update: {
          automation_step?: number
          business_id?: string
          converted_at?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          item_count?: number
          items?: Json
          last_activity_at?: string
          last_recovery_at?: string | null
          order_id?: string | null
          phone?: string | null
          recovery_count?: number
          recovery_email_sent_at?: string | null
          recovery_sms_sent_at?: string | null
          session_id?: string
          source?: string
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      aboutyou_batches: {
        Row: {
          alarma_scrisa_la: string | null
          attempts: number
          batch_request_id: string | null
          business_id: string
          citit_la: string | null
          created_at: string
          generatie: number | null
          id: string
          intent_id: string | null
          kind: string
          next_poll_at: string | null
          poll_errors: number
          polled_at: string | null
          related_ids: Json
          result_summary: Json | null
          status: string
          submitted_at: string
          transe: number | null
          tranzient_de_la: string | null
          trimis_la: string | null
        }
        Insert: {
          alarma_scrisa_la?: string | null
          attempts?: number
          batch_request_id?: string | null
          business_id: string
          citit_la: string | null
          created_at?: string
          generatie?: number | null
          id?: string
          intent_id?: string | null
          kind: string
          next_poll_at?: string | null
          poll_errors?: number
          polled_at?: string | null
          related_ids?: Json
          result_summary?: Json | null
          status?: string
          submitted_at?: string
          transe?: number | null
          tranzient_de_la?: string | null
          trimis_la?: string | null
        }
        Update: {
          alarma_scrisa_la?: string | null
          attempts?: number
          batch_request_id?: string | null
          business_id?: string
          citit_la?: string | null
          created_at?: string
          generatie?: number | null
          id?: string
          intent_id?: string | null
          kind?: string
          next_poll_at?: string | null
          poll_errors?: number
          polled_at?: string | null
          related_ids?: Json
          result_summary?: Json | null
          status?: string
          submitted_at?: string
          transe?: number | null
          tranzient_de_la?: string | null
          trimis_la?: string | null
        }
        Relationships: [
          {
            columns: ["business_id"]
            foreignKeyName: "aboutyou_batches_business_id_fkey"
            isOneToOne: false
            referencedColumns: ["id"]
            referencedRelation: "businesses"
          },
        ]
      }
      aboutyou_bulk_jobs: {
        Row: {
          atins_la: string
          business_id: string
          creat_la: string
          doar_trimise: boolean
          dupa: string | null
          id: string
          last_error: string | null
          op: string
          puse: number
          status: string
          status_filtru: string | null
          terminat_la: string | null
        }
        Insert: {
          atins_la?: string
          business_id: string
          creat_la?: string
          doar_trimise?: boolean
          dupa?: string | null
          id?: string
          last_error?: string | null
          op: string
          puse?: number
          status?: string
          status_filtru?: string | null
          terminat_la?: string | null
        }
        Update: {
          atins_la?: string
          business_id?: string
          creat_la?: string
          doar_trimise?: boolean
          dupa?: string | null
          id?: string
          last_error?: string | null
          op?: string
          puse?: number
          status?: string
          status_filtru?: string | null
          terminat_la?: string | null
        }
        Relationships: []
      }
      aboutyou_ceas_stare: {
        Row: {
          actualizat_la: string
          business_id: string
          dorit: string | null
          generatie: number
          style_key: string
        }
        Insert: {
          actualizat_la?: string
          business_id: string
          dorit?: string | null
          generatie?: number
          style_key: string
        }
        Update: {
          actualizat_la?: string
          business_id?: string
          dorit?: string | null
          generatie?: number
          style_key?: string
        }
        Relationships: []
      }
      aboutyou_intentii: {
        Row: {
          business_id: string
          creat_la: string
          id: string
          last_error: string | null
          op: string
          product_id: string
          recuperari: number
          status: string
        }
        Insert: {
          business_id: string
          creat_la?: string
          id?: string
          last_error?: string | null
          op?: string
          product_id: string
          recuperari?: number
          status?: string
        }
        Update: {
          business_id?: string
          creat_la?: string
          id?: string
          last_error?: string | null
          op?: string
          product_id?: string
          recuperari?: number
          status?: string
        }
        Relationships: []
      }
      aboutyou_listari_scoase: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          reasertari: number
          scos_la: string
          status_generatie: number
          style_key: string
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          reasertari?: number
          scos_la?: string
          status_generatie?: number
          style_key: string
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          reasertari?: number
          scos_la?: string
          status_generatie?: number
          style_key?: string
        }
        Relationships: []
      }
      aboutyou_listings: {
        Row: {
          attributes: Json
          ay_master_id: string | null
          brand_id: number | null
          business_id: string
          catalog_confirmat_la: string | null
          category_id: number | null
          color_id: number | null
          country_of_origin: string | null
          created_at: string
          error: string | null
          generatie: number
          hs_code: string | null
          id: string
          issues: Json
          last_status_at: string | null
          last_synced_at: string | null
          material_composition: Json
          pret_confirmat_la: string | null
          product_id: string | null
          rejection_reasons: Json
          size_option_name: string | null
          stare_dinainte: string | null
          remote_poate_exista: boolean
          status: string
          status_dorit: string | null
          status_generatie: number
          stoc_confirmat_la: string | null
          style_key: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          ay_master_id?: string | null
          brand_id?: number | null
          business_id: string
          catalog_confirmat_la: string | null
          category_id?: number | null
          color_id?: number | null
          country_of_origin?: string | null
          created_at?: string
          error?: string | null
          generatie?: number
          hs_code?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          material_composition?: Json
          pret_confirmat_la?: string | null
          product_id?: string | null
          rejection_reasons?: Json
          size_option_name?: string | null
          stare_dinainte?: string | null
          remote_poate_exista?: boolean
          status?: string
          status_dorit?: string | null
          status_generatie?: number
          stoc_confirmat_la: string | null
          style_key: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          ay_master_id?: string | null
          brand_id?: number | null
          business_id?: string
          catalog_confirmat_la?: string | null
          category_id?: number | null
          color_id?: number | null
          country_of_origin?: string | null
          created_at?: string
          error?: string | null
          generatie?: number
          hs_code?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          material_composition?: Json
          pret_confirmat_la?: string | null
          product_id?: string | null
          rejection_reasons?: Json
          size_option_name?: string | null
          stare_dinainte?: string | null
          remote_poate_exista?: boolean
          status?: string
          status_dorit?: string | null
          status_generatie?: number
          stoc_confirmat_la?: string | null
          style_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aboutyou_listings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aboutyou_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      aboutyou_orders: {
        Row: {
          aboutyou_order_number: string
          anulate_eliberate: Json
          business_id: string
          created_at: string
          fulfillment_type: string | null
          id: string
          items: Json
          last_synced_at: string | null
          order_id: string | null
          raw: Json | null
          reintrebat_la: string | null
          shop_country: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aboutyou_order_number: string
          anulate_eliberate: Json
          business_id: string
          created_at?: string
          fulfillment_type?: string | null
          id?: string
          items?: Json
          last_synced_at?: string | null
          order_id?: string | null
          raw?: Json | null
          reintrebat_la?: string | null
          shop_country?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aboutyou_order_number?: string
          anulate_eliberate?: Json
          business_id?: string
          created_at?: string
          fulfillment_type?: string | null
          id?: string
          items?: Json
          last_synced_at?: string | null
          order_id?: string | null
          raw?: Json | null
          reintrebat_la?: string | null
          shop_country?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aboutyou_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aboutyou_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      aboutyou_retururi: {
        Row: {
          aboutyou_order_number: string
          business_id: string
          created_at: string
          id: string
          linie_cheie: string
          nume_produs: string | null
          order_id: string | null
          product_id: string | null
          quantity: number
          repus_in_stoc_la: string | null
          sku: string
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          aboutyou_order_number: string
          business_id: string
          created_at?: string
          id?: string
          linie_cheie?: string
          nume_produs?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          repus_in_stoc_la?: string | null
          sku: string
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          aboutyou_order_number?: string
          business_id?: string
          created_at?: string
          id?: string
          linie_cheie?: string
          nume_produs?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          repus_in_stoc_la?: string | null
          sku?: string
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: []
      }
      aboutyou_sku_istoric: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          scos_la: string
          sku: string
          variant_title: string | null
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          scos_la?: string
          sku: string
          variant_title?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          scos_la?: string
          sku?: string
          variant_title?: string | null
        }
        Relationships: []
      }
      aboutyou_sync_queue: {
        Row: {
          abandonat_la: string | null
          attempts: number
          business_id: string
          created_at: string
          generation: number
          id: string
          last_error: string | null
          next_retry_at: string | null
          offer_id: string
          op: string
          prioritate: number
          product_id: string | null
          revendicat_pana: string | null
        }
        Insert: {
          abandonat_la?: string | null
          attempts?: number
          business_id: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Update: {
          abandonat_la?: string | null
          attempts?: number
          business_id?: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id?: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aboutyou_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aboutyou_sync_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      aboutyou_webhook_inbox: {
        Row: {
          business_id: string
          event_id: string
          event_name: string | null
          id: string
          incercari: number
          last_error: string | null
          payload: Json
          prelucrat_la: string | null
          urmatoarea_incercare: string | null
          primit_la: string
        }
        Insert: {
          business_id: string
          event_id: string
          event_name?: string | null
          id?: string
          incercari?: number
          last_error?: string | null
          payload: Json
          prelucrat_la?: string | null
          urmatoarea_incercare?: string | null
          primit_la?: string
        }
        Update: {
          business_id?: string
          event_id?: string
          event_name?: string | null
          id?: string
          incercari?: number
          last_error?: string | null
          payload?: Json
          prelucrat_la?: string | null
          urmatoarea_incercare?: string | null
          primit_la?: string
        }
        Relationships: []
      }
      aboutyou_variants: {
        Row: {
          ay_status: string | null
          business_id: string
          color_id: number | null
          created_at: string
          ean: string | null
          enabled: boolean
          id: string
          listing_id: string
          product_id: string | null
          quantity: number | null
          retail_price_eur: number | null
          sale_price_eur: number | null
          second_size_id: number | null
          size_id: number | null
          sku: string
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          ay_status?: string | null
          business_id: string
          color_id?: number | null
          created_at?: string
          ean?: string | null
          enabled?: boolean
          id?: string
          listing_id: string
          product_id?: string | null
          quantity?: number | null
          retail_price_eur?: number | null
          sale_price_eur?: number | null
          second_size_id?: number | null
          size_id?: number | null
          sku: string
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          ay_status?: string | null
          business_id?: string
          color_id?: number | null
          created_at?: string
          ean?: string | null
          enabled?: boolean
          id?: string
          listing_id?: string
          product_id?: string | null
          quantity?: number | null
          retail_price_eur?: number | null
          sale_price_eur?: number | null
          second_size_id?: number | null
          size_id?: number | null
          sku?: string
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aboutyou_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aboutyou_variants_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "aboutyou_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aboutyou_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      aboutyou_veghe: {
        Row: {
          alarma_scrisa_la: string | null
          business_id: string
          creat_la: string
          curate_la_rand: number
          id: string
          incident: string | null
          motiv: string
          necesita_om: boolean
          pana_la: string
          pornita_la: string
          product_id: string | null
          reasertari: number
          straine: Json
          style_key: string
          ultima_deriva_la: string | null
          updated_at: string
          urmatoarea_verificare: string
          verificari: number
        }
        Insert: {
          alarma_scrisa_la?: string | null
          business_id: string
          creat_la?: string
          curate_la_rand?: number
          id?: string
          incident?: string | null
          motiv: string
          necesita_om?: boolean
          pana_la: string
          pornita_la?: string
          product_id?: string | null
          reasertari?: number
          straine?: Json
          style_key: string
          ultima_deriva_la?: string | null
          updated_at?: string
          urmatoarea_verificare?: string
          verificari?: number
        }
        Update: {
          alarma_scrisa_la?: string | null
          business_id?: string
          creat_la?: string
          curate_la_rand?: number
          id?: string
          incident?: string | null
          motiv?: string
          necesita_om?: boolean
          pana_la?: string
          pornita_la?: string
          product_id?: string | null
          reasertari?: number
          straine?: Json
          style_key?: string
          ultima_deriva_la?: string | null
          updated_at?: string
          urmatoarea_verificare?: string
          verificari?: number
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          blocks: Json
          cover_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          is_pinned: boolean
          is_published: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      brevo_suppressions: {
        Row: {
          business_id: string
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brevo_suppressions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_daily_stats: {
        Row: {
          business_id: string
          device: string
          event_type: string
          nr: number
          source: string
          zi: string
        }
        Insert: {
          business_id: string
          device?: string
          event_type: string
          nr: number
          source?: string
          zi: string
        }
        Update: {
          business_id?: string
          device?: string
          event_type?: string
          nr?: number
          source?: string
          zi?: string
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
          custom_domain_checked_at: string | null
          custom_domain_healthy: boolean | null
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
          reg_com: string | null
          slug: string
          social: Json
          store_address: string | null
          store_city: string | null
          store_county: string | null
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
          custom_domain_checked_at?: string | null
          custom_domain_healthy?: boolean | null
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
          reg_com?: string | null
          slug: string
          social?: Json
          store_address?: string | null
          store_city?: string | null
          store_county?: string | null
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
          custom_domain_checked_at?: string | null
          custom_domain_healthy?: boolean | null
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
          reg_com?: string | null
          slug?: string
          social?: Json
          store_address?: string | null
          store_city?: string | null
          store_county?: string | null
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
      catalog_cuvant: {
        Row: {
          business_id: string
          cate: number
          cuvant: string
          semnatura: string | null
        }
        Insert: {
          business_id: string
          cate?: number
          cuvant: string
        }
        Update: {
          business_id?: string
          cate?: number
          cuvant?: string
        }
        Relationships: []
      }
      catalog_cuvinte_murdar: {
        Row: {
          business_id: string
          marcat_la: string
        }
        Insert: {
          business_id: string
          marcat_la?: string
        }
        Update: {
          business_id?: string
          marcat_la?: string
        }
        Relationships: []
      }
      catalog_index_cuvant: {
        Row: {
          business_id: string
          cuvant: string
          product_id: string
        }
        Insert: {
          business_id: string
          cuvant: string
          product_id: string
        }
        Update: {
          business_id?: string
          cuvant?: string
          product_id?: string
        }
        Relationships: []
      }
      catalog_murdar: {
        Row: {
          business_id: string
          marcat_la: string
          product_id: string
        }
        Insert: {
          business_id: string
          marcat_la?: string
          product_id: string
        }
        Update: {
          business_id?: string
          marcat_la?: string
          product_id?: string
        }
        Relationships: []
      }
      catalog_produs: {
        Row: {
          are_imagine: boolean
          business_id: string
          category: string | null
          cauta_norm: string
          compare_at_price: number | null
          creat: string
          descriere_scurta: string
          fara_oferta: boolean
          fara_stoc: boolean
          fatete: string[]
          has_range: boolean
          is_bundle: boolean
          is_featured: boolean
          name: string
          optiuni: Json | null
          price: number
          price_max: number
          price_min: number
          prima_imagine: string | null
          product_id: string
          proiectat_la: string | null
          slug: string | null
          sort_order: number
          stock_quantity: number | null
          track_inventory: boolean
        }
        Insert: {
          are_imagine?: boolean
          business_id: string
          category?: string | null
          cauta_norm?: string
          compare_at_price?: number | null
          creat: string
          descriere_scurta?: string
          fara_oferta?: boolean
          fara_stoc?: boolean
          fatete?: string[]
          has_range?: boolean
          is_bundle?: boolean
          is_featured?: boolean
          name: string
          optiuni?: Json | null
          price: number
          price_max: number
          price_min: number
          prima_imagine?: string | null
          product_id: string
          proiectat_la?: string | null
          slug?: string | null
          sort_order?: number
          stock_quantity?: number | null
          track_inventory?: boolean
        }
        Update: {
          are_imagine?: boolean
          business_id?: string
          category?: string | null
          cauta_norm?: string
          compare_at_price?: number | null
          creat?: string
          descriere_scurta?: string
          fara_oferta?: boolean
          fara_stoc?: boolean
          fatete?: string[]
          has_range?: boolean
          is_bundle?: boolean
          is_featured?: boolean
          name?: string
          optiuni?: Json | null
          price?: number
          price_max?: number
          price_min?: number
          prima_imagine?: string | null
          product_id?: string
          proiectat_la?: string | null
          slug?: string | null
          sort_order?: number
          stock_quantity?: number | null
          track_inventory?: boolean
        }
        Relationships: []
      }
      catalog_rezumat: {
        Row: {
          business_id: string
          calculat_la: string
          categorii: string[]
          fara_imagini: boolean
          fara_stoc_ascuns: boolean
          fatete: Json
          price_max: number
          price_min: number
          total: number
        }
        Insert: {
          business_id: string
          calculat_la?: string
          categorii?: string[]
          fara_imagini: boolean
          fara_stoc_ascuns: boolean
          fatete?: Json
          price_max: number
          price_min: number
          total: number
        }
        Update: {
          business_id?: string
          calculat_la?: string
          categorii?: string[]
          fara_imagini?: boolean
          fara_stoc_ascuns?: boolean
          fatete?: Json
          price_max?: number
          price_min?: number
          total?: number
        }
        Relationships: []
      }
      catalog_rezumat_murdar: {
        Row: {
          business_id: string
          marcat_la: string
        }
        Insert: {
          business_id: string
          marcat_la?: string
        }
        Update: {
          business_id?: string
          marcat_la?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
      custom_pages: {
        Row: {
          blocks: Json
          business_id: string
          created_at: string
          id: string
          is_published: boolean
          page_css: string | null
          seo: Json
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          business_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          page_css?: string | null
          seo?: Json
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          business_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          page_css?: string | null
          seo?: Json
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_pages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          county: string | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          key: string
          name: string
          phone: string | null
          postcode: string | null
          source: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          postcode?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          postcode?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dhl_etichete: {
        Row: {
          awb_number: string
          business_id: string
          continut: string
          creat_la: string
          document_transport: string | null
          factura: string | null
          format: string
          luna_ridicare: string | null
          order_id: string
        }
        Insert: {
          awb_number: string
          business_id: string
          continut: string
          creat_la?: string
          document_transport?: string | null
          factura?: string | null
          format: string
          luna_ridicare?: string | null
          order_id: string
        }
        Update: {
          awb_number?: string
          business_id?: string
          continut?: string
          creat_la?: string
          document_transport?: string | null
          factura?: string | null
          format?: string
          luna_ridicare?: string | null
          order_id?: string
        }
        Relationships: []
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
          stripe_session_id: string | null
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
          stripe_session_id?: string | null
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
          stripe_session_id?: string | null
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
      emag_awb: {
        Row: {
          awb_number: string | null
          business_id: string
          cash_on_delivery: number | null
          courier_account_id: number | null
          created_at: string
          emag_id: number | null
          id: string
          livrat_la: string | null
          order_id: string | null
          raspuns_urmarire: Json | null
          status: Json | null
          verificat_la: string | null
        }
        Insert: {
          awb_number?: string | null
          business_id: string
          cash_on_delivery?: number | null
          courier_account_id?: number | null
          created_at?: string
          emag_id?: number | null
          id?: string
          livrat_la?: string | null
          order_id?: string | null
          raspuns_urmarire?: Json | null
          status?: Json | null
          verificat_la?: string | null
        }
        Update: {
          awb_number?: string | null
          business_id?: string
          cash_on_delivery?: number | null
          courier_account_id?: number | null
          created_at?: string
          emag_id?: number | null
          id?: string
          livrat_la?: string | null
          order_id?: string | null
          raspuns_urmarire?: Json | null
          status?: Json | null
          verificat_la?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emag_awb_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emag_awb_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_nomenclatoare: {
        Row: {
          adus_la: string
          business_id: string
          cate: number
          cheie: string
          cont: string | null
          date: Json
          fel: string
          tara: string
          trunchiat: boolean
        }
        Insert: {
          adus_la?: string
          business_id: string
          cate?: number
          cheie?: string
          cont?: string | null
          date: Json
          fel: string
          tara: string
          trunchiat?: boolean
        }
        Update: {
          adus_la?: string
          business_id?: string
          cate?: number
          cheie?: string
          cont?: string | null
          date?: Json
          fel?: string
          tara?: string
          trunchiat?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "emag_nomenclatoare_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_offers: {
        Row: {
          amprenta_continut: string | null
          auto_sync: boolean
          best_offer_sale_price: number | null
          brand: string | null
          business_id: string
          buy_button_rank: number | null
          category_id: number | null
          creat_de_edinio: boolean
          created_at: string
          deriva: Json | null
          doc_errors: Json
          ean: string | null
          emag_id: number
          error: string | null
          family_id: number | null
          family_type_id: number | null
          id: string
          imagini_la_ei: number | null
          issues: Json
          last_status_at: string | null
          last_synced_at: string | null
          number_of_offers: number | null
          nume_emag: string | null
          offer_validation_status: number | null
          ownership: number | null
          part_number: string | null
          part_number_key: string | null
          product_id: string | null
          raspuns_brut: Json | null
          status: string
          status_la_ei: number | null
          stoc_la_ei: number | null
          translation_validation_status: number | null
          updated_at: string
          validation_status: number | null
          variant_title: string | null
        }
        Insert: {
          amprenta_continut?: string | null
          auto_sync?: boolean
          best_offer_sale_price?: number | null
          brand?: string | null
          business_id: string
          buy_button_rank?: number | null
          category_id?: number | null
          creat_de_edinio?: boolean
          created_at?: string
          deriva?: Json | null
          doc_errors?: Json
          ean?: string | null
          emag_id?: number
          error?: string | null
          family_id?: number | null
          family_type_id?: number | null
          id?: string
          imagini_la_ei?: number | null
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          number_of_offers?: number | null
          nume_emag?: string | null
          offer_validation_status?: number | null
          ownership?: number | null
          part_number?: string | null
          part_number_key?: string | null
          product_id?: string | null
          raspuns_brut?: Json | null
          status?: string
          status_la_ei?: number | null
          stoc_la_ei?: number | null
          translation_validation_status?: number | null
          updated_at?: string
          validation_status?: number | null
          variant_title?: string | null
        }
        Update: {
          amprenta_continut?: string | null
          auto_sync?: boolean
          best_offer_sale_price?: number | null
          brand?: string | null
          business_id?: string
          buy_button_rank?: number | null
          category_id?: number | null
          creat_de_edinio?: boolean
          created_at?: string
          deriva?: Json | null
          doc_errors?: Json
          ean?: string | null
          emag_id?: number
          error?: string | null
          family_id?: number | null
          family_type_id?: number | null
          id?: string
          imagini_la_ei?: number | null
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          number_of_offers?: number | null
          nume_emag?: string | null
          offer_validation_status?: number | null
          ownership?: number | null
          part_number?: string | null
          part_number_key?: string | null
          product_id?: string | null
          raspuns_brut?: Json | null
          status?: string
          status_la_ei?: number | null
          stoc_la_ei?: number | null
          translation_validation_status?: number | null
          updated_at?: string
          validation_status?: number | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emag_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emag_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_orders: {
        Row: {
          acknowledged_at: string | null
          business_id: string
          created_at: string
          emag_order_id: number
          id: string
          invoice_number: string | null
          awb_uploaded_at: string | null
          awb_uploaded_number: string | null
          awb_uploaded_numbers: string[]
          ingest_error: string | null
          ingest_failed_at: string | null
          invoice_uploaded_at: string | null
          is_complete: number | null
          last_modified: string | null
          lines: Json
          order_id: string | null
          order_status: number | null
          order_type: number | null
          payment_mode_id: number | null
          raw: Json | null
          updated_at: string
          vouchers: Json
        }
        Insert: {
          acknowledged_at?: string | null
          business_id: string
          created_at?: string
          emag_order_id: number
          id?: string
          invoice_number?: string | null
          awb_uploaded_at?: string | null
          awb_uploaded_number?: string | null
          awb_uploaded_numbers?: string[]
          ingest_error?: string | null
          ingest_failed_at?: string | null
          invoice_uploaded_at?: string | null
          is_complete?: number | null
          last_modified?: string | null
          lines?: Json
          order_id?: string | null
          order_status?: number | null
          order_type?: number | null
          payment_mode_id?: number | null
          raw?: Json | null
          updated_at?: string
          vouchers?: Json
        }
        Update: {
          acknowledged_at?: string | null
          business_id?: string
          created_at?: string
          emag_order_id?: number
          id?: string
          invoice_number?: string | null
          awb_uploaded_at?: string | null
          awb_uploaded_number?: string | null
          awb_uploaded_numbers?: string[]
          ingest_error?: string | null
          ingest_failed_at?: string | null
          invoice_uploaded_at?: string | null
          is_complete?: number | null
          last_modified?: string | null
          lines?: Json
          order_id?: string | null
          order_status?: number | null
          order_type?: number | null
          payment_mode_id?: number | null
          raw?: Json | null
          updated_at?: string
          vouchers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "emag_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emag_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_request_log: {
        Row: {
          business_id: string
          cale: string
          corelatie: string | null
          created_at: string
          durata_ms: number | null
          emag_ids: number[] | null
          eroare: string | null
          id: string
          mesaje: Json
          metoda: string
          status: number
          verdict: string
        }
        Insert: {
          business_id: string
          cale: string
          corelatie?: string | null
          created_at?: string
          durata_ms?: number | null
          emag_ids?: number[] | null
          eroare?: string | null
          id?: string
          mesaje?: Json
          metoda: string
          status?: number
          verdict: string
        }
        Update: {
          business_id?: string
          cale?: string
          corelatie?: string | null
          created_at?: string
          durata_ms?: number | null
          emag_ids?: number[] | null
          eroare?: string | null
          id?: string
          mesaje?: Json
          metoda?: string
          status?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "emag_request_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_rma: {
        Row: {
          awbs: Json
          business_id: string
          created_at: string
          emag_order_id: number | null
          emag_rma_id: number
          id: string
          order_id: string | null
          products: Json
          raw: Json | null
          request_status: number | null
          return_reason: number | null
          return_type: number | null
          updated_at: string
        }
        Insert: {
          awbs?: Json
          business_id: string
          created_at?: string
          emag_order_id?: number | null
          emag_rma_id: number
          id?: string
          order_id?: string | null
          products?: Json
          raw?: Json | null
          request_status?: number | null
          return_reason?: number | null
          return_type?: number | null
          updated_at?: string
        }
        Update: {
          awbs?: Json
          business_id?: string
          created_at?: string
          emag_order_id?: number | null
          emag_rma_id?: number
          id?: string
          order_id?: string | null
          products?: Json
          raw?: Json | null
          request_status?: number | null
          return_reason?: number | null
          return_type?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emag_rma_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emag_rma_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      emag_sync_queue: {
        Row: {
          abandonat_la: string | null
          attempts: number
          business_id: string
          created_at: string
          generation: number
          id: string
          last_error: string | null
          next_retry_at: string | null
          offer_id: string
          op: string
          pauze: number
          prioritate: number
          product_id: string | null
          revendicat_pana: string | null
        }
        Insert: {
          abandonat_la?: string | null
          attempts?: number
          business_id: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id: string
          op?: string
          pauze?: number
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Update: {
          abandonat_la?: string | null
          attempts?: number
          business_id?: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id?: string
          op?: string
          pauze?: number
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emag_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emag_sync_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automations: {
        Row: {
          email_key: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          email_key: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          email_key?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
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
      fedex_etichete: {
        Row: {
          awb_number: string
          business_id: string
          continut: string
          creat_la: string
          format: string
          order_id: string
          stoc: string | null
        }
        Insert: {
          awb_number: string
          business_id: string
          continut: string
          creat_la?: string
          format: string
          order_id: string
          stoc?: string | null
        }
        Update: {
          awb_number?: string
          business_id?: string
          continut?: string
          creat_la?: string
          format?: string
          order_id?: string
          stoc?: string | null
        }
        Relationships: []
      }
      forms: {
        Row: {
          brevo_enabled: boolean | null
          business_id: string
          created_at: string
          email_enabled: boolean
          email_to: string | null
          fields: Json
          id: string
          klaviyo_enabled: boolean | null
          mailchimp_enabled: boolean
          name: string
          submit_label: string
          success_message: string
          updated_at: string
        }
        Insert: {
          brevo_enabled?: boolean | null
          business_id: string
          created_at?: string
          email_enabled?: boolean
          email_to?: string | null
          fields?: Json
          id?: string
          klaviyo_enabled?: boolean | null
          mailchimp_enabled?: boolean
          name: string
          submit_label?: string
          success_message?: string
          updated_at?: string
        }
        Update: {
          brevo_enabled?: boolean | null
          business_id?: string
          created_at?: string
          email_enabled?: boolean
          email_to?: string | null
          fields?: Json
          id?: string
          klaviyo_enabled?: boolean | null
          mailchimp_enabled?: boolean
          name?: string
          submit_label?: string
          success_message?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gmc_products: {
        Row: {
          business_id: string
          created_at: string
          destinations: Json
          error: string | null
          id: string
          issues: Json
          last_status_at: string | null
          last_synced_at: string | null
          offer_id: string
          product_id: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          destinations?: Json
          error?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          offer_id: string
          product_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          destinations?: Json
          error?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          offer_id?: string
          product_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmc_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmc_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      gmc_sync_queue: {
        Row: {
          abandonat_la: string | null
          attempts: number
          business_id: string
          created_at: string
          generation: number
          id: string
          next_retry_at: string | null
          offer_id: string
          op: string
          prioritate: number
          product_id: string | null
          revendicat_pana: string | null
        }
        Insert: {
          abandonat_la?: string | null
          attempts?: number
          business_id: string
          created_at?: string
          generation?: number
          id?: string
          next_retry_at?: string | null
          offer_id: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Update: {
          abandonat_la?: string | null
          attempts?: number
          business_id?: string
          created_at?: string
          generation?: number
          id?: string
          next_retry_at?: string | null
          offer_id?: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmc_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmc_sync_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      intentii_publicare: {
        Row: {
          business_id: string
          cerut_la: string
          id: string
          incercari: number
          marketplace: string
          product_id: string
          rezolvat_la: string | null
          sursa: string
          ultima_eroare: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cerut_la?: string
          id?: string
          incercari?: number
          marketplace: string
          product_id: string
          rezolvat_la?: string | null
          sursa?: string
          ultima_eroare?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cerut_la?: string
          id?: string
          incercari?: number
          marketplace?: string
          product_id?: string
          rezolvat_la?: string | null
          sursa?: string
          ultima_eroare?: string | null
          updated_at?: string
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
      mailchimp_suppressions: {
        Row: {
          business_id: string
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mailchimp_suppressions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          alt_text: string | null
          business_id: string
          caption: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_name: string | null
          folder: string | null
          height: number | null
          id: string
          mime_type: string | null
          r2_key: string
          size_bytes: number | null
          tags: string[]
          title: string | null
          type: string
          updated_at: string
          url: string
          user_id: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          business_id: string
          caption?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          folder?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          r2_key: string
          size_bytes?: number | null
          tags?: string[]
          title?: string | null
          type?: string
          updated_at?: string
          url: string
          user_id: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          business_id?: string
          caption?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          folder?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          r2_key?: string
          size_bytes?: number | null
          tags?: string[]
          title?: string | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_inbox: {
        Row: {
          body: string | null
          business_id: string
          channel: string
          created_at: string
          from_number: string | null
          id: string
          order_id: string | null
          raw: Json | null
          received_at: string
        }
        Insert: {
          body?: string | null
          business_id: string
          channel?: string
          created_at?: string
          from_number?: string | null
          id?: string
          order_id?: string | null
          raw?: Json | null
          received_at?: string
        }
        Update: {
          body?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          from_number?: string | null
          id?: string
          order_id?: string | null
          raw?: Json | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_inbox_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_inbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_sms_log: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          error: string | null
          id: string
          message: string | null
          order_id: string | null
          phone: string | null
          provider_id: string | null
          success: boolean
          template_id: string | null
          trigger_key: string
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          error?: string | null
          id?: string
          message?: string | null
          order_id?: string | null
          phone?: string | null
          provider_id?: string | null
          success?: boolean
          template_id?: string | null
          trigger_key: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          error?: string | null
          id?: string
          message?: string | null
          order_id?: string | null
          phone?: string | null
          provider_id?: string | null
          success?: boolean
          template_id?: string | null
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_sms_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          business_id: string
          config: Json
          conversions: number
          created_at: string
          display: Json
          ends_at: string | null
          id: string
          impressions: number
          is_active: boolean
          name: string
          priority: number
          revenue_added: number
          starts_at: string | null
          trigger: Json
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          config?: Json
          conversions?: number
          created_at?: string
          display?: Json
          ends_at?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          name: string
          priority?: number
          revenue_added?: number
          starts_at?: string | null
          trigger?: Json
          type: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          config?: Json
          conversions?: number
          created_at?: string
          display?: Json
          ends_at?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          name?: string
          priority?: number
          revenue_added?: number
          starts_at?: string | null
          trigger?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      olx_adverts: {
        Row: {
          business_id: string
          created_at: string
          error: string | null
          id: string
          issues: Json
          last_status_at: string | null
          last_synced_at: string | null
          offer_id: string
          olx_advert_id: number | null
          olx_url: string | null
          product_id: string | null
          status: string
          updated_at: string
          valid_to: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          offer_id: string
          olx_advert_id?: number | null
          olx_url?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          valid_to?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          offer_id?: string
          olx_advert_id?: number | null
          olx_url?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "olx_adverts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "olx_adverts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      olx_sync_queue: {
        Row: {
          abandonat_la: string | null
          attempts: number
          business_id: string
          created_at: string
          generation: number
          id: string
          last_error: string | null
          next_retry_at: string | null
          offer_id: string
          op: string
          prioritate: number
          product_id: string | null
          revendicat_pana: string | null
        }
        Insert: {
          abandonat_la?: string | null
          attempts?: number
          business_id: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Update: {
          abandonat_la?: string | null
          attempts?: number
          business_id?: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id?: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "olx_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "olx_sync_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      operatii_externe: {
        Row: {
          actualizat_la: string
          business_id: string | null
          cheie: string
          creat_la: string
          detalii: Json | null
          fel: string
          furnizor: string
          id: string
          incercari: number
          order_id: string | null
          order_number: string | null
          referinta_externa: string | null
          stare: string
          ultima_eroare: string | null
        }
        Insert: {
          actualizat_la?: string
          business_id?: string | null
          cheie: string
          creat_la?: string
          detalii?: Json | null
          fel: string
          furnizor: string
          id?: string
          incercari?: number
          order_id?: string | null
          order_number?: string | null
          referinta_externa?: string | null
          stare?: string
          ultima_eroare?: string | null
        }
        Update: {
          actualizat_la?: string
          business_id?: string | null
          cheie?: string
          creat_la?: string
          detalii?: Json | null
          fel?: string
          furnizor?: string
          id?: string
          incercari?: number
          order_id?: string | null
          order_number?: string | null
          referinta_externa?: string | null
          stare?: string
          ultima_eroare?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          billing_company: Json | null
          business_id: string
          card_discount_amount: number
          cargus_awb_number: string | null
          cargus_service_name: string | null
          cod_discount_amount: number
          cod_fee_amount: number
          colete_awb_number: string | null
          colete_order_id: string | null
          colete_service_name: string | null
          colete_unique_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          dhl_awb_at: string | null
          dhl_awb_number: string | null
          dhl_cost: number | null
          dhl_currency: string | null
          dhl_dispatch_confirmation: string | null
          dhl_local_product_code: string | null
          dhl_product_code: string | null
          dhl_product_name: string | null
          dhl_reference: string | null
          dhl_status_checked_at: string | null
          dhl_status_code: string | null
          dhl_tracking_url: string | null
          discount_amount: number
          discount_code: string | null
          discount_id: string | null
          discount_released_at: string | null
          dpd_awb_number: string | null
          dpd_shipment_id: number | null
          ecolet_awb_at: string | null
          ecolet_awb_number: string | null
          ecolet_order_id: number | null
          ecolet_order_to_send_id: number | null
          ecolet_send_error: string | null
          ecolet_send_state: string | null
          ecolet_service_name: string | null
          ecolet_service_slug: string | null
          ecolet_status_checked_at: string | null
          ecolet_status_code: string | null
          fan_courier_awb_number: string | null
          fedex_awb_at: string | null
          fedex_awb_number: string | null
          fedex_cost: number | null
          fedex_currency: string | null
          fedex_reference: string | null
          fedex_service_name: string | null
          fedex_service_type: string | null
          fedex_status_checked_at: string | null
          fedex_status_code: string | null
          fedex_tracking_url: string | null
          fgo_invoice_link: string | null
          fgo_invoice_number: string | null
          gls_awb_at: string | null
          gls_awb_number: string | null
          gls_evenimente_semnalate: Json | null
          gls_status_checked_at: string | null
          gls_status_code: string | null
          fgo_invoice_series: string | null
          fgo_storno_number: string | null
          fgo_storno_series: string | null
          id: string
          innoship_awb_at: string | null
          innoship_awb_number: string | null
          innoship_cod_status_code: string | null
          innoship_courier_id: number | null
          innoship_courier_name: string | null
          innoship_option_id: string | null
          innoship_order_id: number | null
          innoship_service_id: number | null
          innoship_service_name: string | null
          innoship_status_checked_at: string | null
          innoship_status_code: string | null
          innoship_track_url: string | null
          internal_notes: string | null
          ipay_order_id: string | null
          ipay_order_number: string | null
          netopia_ntp_id: string | null
          items: Json
          klarna_order_id: string | null
          klarna_session_id: string | null
          notes: string | null
          oblio_invoice_link: string | null
          oblio_invoice_number: string | null
          oblio_invoice_series: string | null
          oblio_proforma_link: string | null
          oblio_proforma_number: string | null
          oblio_proforma_series: string | null
          oblio_storno_link: string | null
          oblio_storno_number: string | null
          oblio_storno_series: string | null
          offer_discount_amount: number
          order_number: string
          order_source: Json | null
          pallex_awb_at: string | null
          pallex_awb_number: string | null
          pallex_bordereau_id: number | null
          pallex_consignment_id: number | null
          pallex_status_checked_at: string | null
          pallex_status_id: string | null
          payment_method: string
          payment_status: string
          posta_awb_at: string | null
          packeta_address_id: string | null
          packeta_awb_at: string | null
          packeta_barcode: string | null
          packeta_courier_number: string | null
          packeta_external_tracking: string | null
          packeta_packet_id: string | null
          packeta_pickup_point: string | null
          packeta_status_checked_at: string | null
          packeta_status_code: number | null
          posta_awb_number: string | null
          posta_borderou_id: number | null
          posta_oficiu_id: string | null
          posta_status_checked_at: string | null
          posta_status_code: string | null
          revolut_order_id: string | null
          sameday_awb_at: string | null
          sameday_awb_cost: number | null
          sameday_awb_number: string | null
          sameday_locker_charge_code: string | null
          sameday_return_awb_at: string | null
          sameday_return_awb_number: string | null
          sameday_status_checked_at: string | null
          sameday_status_id: number | null
          sameday_status_label: string | null
          shipo_awb_at: string | null
          shipo_awb_number: string | null
          shipo_cost: number | null
          shipo_courier_name: string | null
          shipo_courier_slug: string | null
          shipo_expedition_id: number | null
          shipo_point_id: number | null
          shipo_point_name: string | null
          shipo_rate_id: number | null
          shipo_status_checked_at: string | null
          shipo_status_code: string | null
          shipo_tracking_url: string | null
          shipping_address: Json
          shipping_cost: number
          smartbill_estimate_number: string | null
          smartbill_estimate_series: string | null
          smartbill_estimate_url: string | null
          smartbill_invoice_number: string | null
          smartbill_invoice_series: string | null
          smartbill_invoice_url: string | null
          smartbill_storno_number: string | null
          smartbill_storno_series: string | null
          smartship_awb_at: string | null
          smartship_awb_number: string | null
          smartship_cost: number | null
          smartship_courier_id: number | null
          smartship_courier_name: string | null
          smartship_offer_ref: string | null
          smartship_offer_status: string | null
          smartship_own_contract: boolean | null
          smartship_pickup_code: string | null
          smartship_status_checked_at: string | null
          smartship_status_code: number | null
          smartship_tracking_url: string | null
          status: string
          stoc_eliberat_la: string | null
          stoc_marketplace_la: string | null
          stoc_rezervat: Json | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          ups_awb_at: string | null
          ups_awb_number: string | null
          ups_cost: number | null
          ups_currency: string | null
          ups_reference: string | null
          ups_service_code: string | null
          ups_service_name: string | null
          ups_status_checked_at: string | null
          ups_status_code: string | null
          ups_status_type: string | null
          ups_tracking_url: string | null
          vat_amount: number
          vat_rate: number
          woot_awb_number: string | null
          woot_order_id: string | null
          woot_service_name: string | null
        }
        Insert: {
          billing_company?: Json | null
          business_id: string
          card_discount_amount?: number
          cargus_awb_number?: string | null
          cargus_service_name?: string | null
          cod_discount_amount?: number
          cod_fee_amount?: number
          colete_awb_number?: string | null
          colete_order_id?: string | null
          colete_service_name?: string | null
          colete_unique_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          dhl_awb_at?: string | null
          dhl_awb_number?: string | null
          dhl_cost?: number | null
          dhl_currency?: string | null
          dhl_dispatch_confirmation?: string | null
          dhl_local_product_code?: string | null
          dhl_product_code?: string | null
          dhl_product_name?: string | null
          dhl_reference?: string | null
          dhl_status_checked_at?: string | null
          dhl_status_code?: string | null
          dhl_tracking_url?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_id?: string | null
          discount_released_at?: string | null
          dpd_awb_number?: string | null
          dpd_shipment_id?: number | null
          ecolet_awb_at?: string | null
          ecolet_awb_number?: string | null
          ecolet_order_id?: number | null
          ecolet_order_to_send_id?: number | null
          ecolet_send_error?: string | null
          ecolet_send_state?: string | null
          ecolet_service_name?: string | null
          ecolet_service_slug?: string | null
          ecolet_status_checked_at?: string | null
          ecolet_status_code?: string | null
          fan_courier_awb_number?: string | null
          fedex_awb_at?: string | null
          fedex_awb_number?: string | null
          fedex_cost?: number | null
          fedex_currency?: string | null
          fedex_reference?: string | null
          fedex_service_name?: string | null
          fedex_service_type?: string | null
          fedex_status_checked_at?: string | null
          fedex_status_code?: string | null
          fedex_tracking_url?: string | null
          fgo_invoice_link?: string | null
          fgo_invoice_number?: string | null
          gls_awb_at?: string | null
          gls_awb_number?: string | null
          gls_evenimente_semnalate?: Json | null
          gls_status_checked_at?: string | null
          gls_status_code?: string | null
          fgo_invoice_series?: string | null
          fgo_storno_number?: string | null
          fgo_storno_series?: string | null
          id?: string
          innoship_awb_at?: string | null
          innoship_awb_number?: string | null
          innoship_cod_status_code?: string | null
          innoship_courier_id?: number | null
          innoship_courier_name?: string | null
          innoship_option_id?: string | null
          innoship_order_id?: number | null
          innoship_service_id?: number | null
          innoship_service_name?: string | null
          innoship_status_checked_at?: string | null
          innoship_status_code?: string | null
          innoship_track_url?: string | null
          internal_notes?: string | null
          ipay_order_id?: string | null
          ipay_order_number?: string | null
          netopia_ntp_id?: string | null
          items: Json
          klarna_order_id?: string | null
          klarna_session_id?: string | null
          notes?: string | null
          oblio_invoice_link?: string | null
          oblio_invoice_number?: string | null
          oblio_invoice_series?: string | null
          oblio_proforma_link?: string | null
          oblio_proforma_number?: string | null
          oblio_proforma_series?: string | null
          oblio_storno_link?: string | null
          oblio_storno_number?: string | null
          oblio_storno_series?: string | null
          offer_discount_amount?: number
          order_number: string
          order_source?: Json | null
          pallex_awb_at?: string | null
          pallex_awb_number?: string | null
          pallex_bordereau_id?: number | null
          pallex_consignment_id?: number | null
          pallex_status_checked_at?: string | null
          pallex_status_id?: string | null
          payment_method?: string
          payment_status?: string
          posta_awb_at?: string | null
          packeta_address_id?: string | null
          packeta_awb_at?: string | null
          packeta_barcode?: string | null
          packeta_courier_number?: string | null
          packeta_external_tracking?: string | null
          packeta_packet_id?: string | null
          packeta_pickup_point?: string | null
          packeta_status_checked_at?: string | null
          packeta_status_code?: number | null
          posta_awb_number?: string | null
          posta_borderou_id?: number | null
          posta_oficiu_id?: string | null
          posta_status_checked_at?: string | null
          posta_status_code?: string | null
          revolut_order_id?: string | null
          sameday_awb_at?: string | null
          sameday_awb_cost?: number | null
          sameday_awb_number?: string | null
          sameday_locker_charge_code?: string | null
          sameday_return_awb_at?: string | null
          sameday_return_awb_number?: string | null
          sameday_status_checked_at?: string | null
          sameday_status_id?: number | null
          sameday_status_label?: string | null
          shipo_awb_at?: string | null
          shipo_awb_number?: string | null
          shipo_cost?: number | null
          shipo_courier_name?: string | null
          shipo_courier_slug?: string | null
          shipo_expedition_id?: number | null
          shipo_point_id?: number | null
          shipo_point_name?: string | null
          shipo_rate_id?: number | null
          shipo_status_checked_at?: string | null
          shipo_status_code?: string | null
          shipo_tracking_url?: string | null
          shipping_address: Json
          shipping_cost?: number
          smartbill_estimate_number?: string | null
          smartbill_estimate_series?: string | null
          smartbill_estimate_url?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          smartbill_invoice_url?: string | null
          smartbill_storno_number?: string | null
          smartbill_storno_series?: string | null
          smartship_awb_at?: string | null
          smartship_awb_number?: string | null
          smartship_cost?: number | null
          smartship_courier_id?: number | null
          smartship_courier_name?: string | null
          smartship_offer_ref?: string | null
          smartship_offer_status?: string | null
          smartship_own_contract?: boolean | null
          smartship_pickup_code?: string | null
          smartship_status_checked_at?: string | null
          smartship_status_code?: number | null
          smartship_tracking_url?: string | null
          status?: string
          stoc_eliberat_la?: string | null
          stoc_marketplace_la?: string | null
          stoc_rezervat?: Json | null
          stripe_session_id?: string | null
          subtotal: number
          total: number
          tracking_number?: string | null
          updated_at?: string
          ups_awb_at?: string | null
          ups_awb_number?: string | null
          ups_cost?: number | null
          ups_currency?: string | null
          ups_reference?: string | null
          ups_service_code?: string | null
          ups_service_name?: string | null
          ups_status_checked_at?: string | null
          ups_status_code?: string | null
          ups_status_type?: string | null
          ups_tracking_url?: string | null
          vat_amount?: number
          vat_rate?: number
          woot_awb_number?: string | null
          woot_order_id?: string | null
          woot_service_name?: string | null
        }
        Update: {
          billing_company?: Json | null
          business_id?: string
          card_discount_amount?: number
          cargus_awb_number?: string | null
          cargus_service_name?: string | null
          cod_discount_amount?: number
          cod_fee_amount?: number
          colete_awb_number?: string | null
          colete_order_id?: string | null
          colete_service_name?: string | null
          colete_unique_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          dhl_awb_at?: string | null
          dhl_awb_number?: string | null
          dhl_cost?: number | null
          dhl_currency?: string | null
          dhl_dispatch_confirmation?: string | null
          dhl_local_product_code?: string | null
          dhl_product_code?: string | null
          dhl_product_name?: string | null
          dhl_reference?: string | null
          dhl_status_checked_at?: string | null
          dhl_status_code?: string | null
          dhl_tracking_url?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_id?: string | null
          discount_released_at?: string | null
          dpd_awb_number?: string | null
          dpd_shipment_id?: number | null
          ecolet_awb_at?: string | null
          ecolet_awb_number?: string | null
          ecolet_order_id?: number | null
          ecolet_order_to_send_id?: number | null
          ecolet_send_error?: string | null
          ecolet_send_state?: string | null
          ecolet_service_name?: string | null
          ecolet_service_slug?: string | null
          ecolet_status_checked_at?: string | null
          ecolet_status_code?: string | null
          fan_courier_awb_number?: string | null
          fedex_awb_at?: string | null
          fedex_awb_number?: string | null
          fedex_cost?: number | null
          fedex_currency?: string | null
          fedex_reference?: string | null
          fedex_service_name?: string | null
          fedex_service_type?: string | null
          fedex_status_checked_at?: string | null
          fedex_status_code?: string | null
          fedex_tracking_url?: string | null
          fgo_invoice_link?: string | null
          fgo_invoice_number?: string | null
          gls_awb_at?: string | null
          gls_awb_number?: string | null
          gls_evenimente_semnalate?: Json | null
          gls_status_checked_at?: string | null
          gls_status_code?: string | null
          fgo_invoice_series?: string | null
          fgo_storno_number?: string | null
          fgo_storno_series?: string | null
          id?: string
          innoship_awb_at?: string | null
          innoship_awb_number?: string | null
          innoship_cod_status_code?: string | null
          innoship_courier_id?: number | null
          innoship_courier_name?: string | null
          innoship_option_id?: string | null
          innoship_order_id?: number | null
          innoship_service_id?: number | null
          innoship_service_name?: string | null
          innoship_status_checked_at?: string | null
          innoship_status_code?: string | null
          innoship_track_url?: string | null
          internal_notes?: string | null
          ipay_order_id?: string | null
          ipay_order_number?: string | null
          netopia_ntp_id?: string | null
          items?: Json
          klarna_order_id?: string | null
          klarna_session_id?: string | null
          notes?: string | null
          oblio_invoice_link?: string | null
          oblio_invoice_number?: string | null
          oblio_invoice_series?: string | null
          oblio_proforma_link?: string | null
          oblio_proforma_number?: string | null
          oblio_proforma_series?: string | null
          oblio_storno_link?: string | null
          oblio_storno_number?: string | null
          oblio_storno_series?: string | null
          offer_discount_amount?: number
          order_number?: string
          order_source?: Json | null
          pallex_awb_at?: string | null
          pallex_awb_number?: string | null
          pallex_bordereau_id?: number | null
          pallex_consignment_id?: number | null
          pallex_status_checked_at?: string | null
          pallex_status_id?: string | null
          payment_method?: string
          payment_status?: string
          posta_awb_at?: string | null
          packeta_address_id?: string | null
          packeta_awb_at?: string | null
          packeta_barcode?: string | null
          packeta_courier_number?: string | null
          packeta_external_tracking?: string | null
          packeta_packet_id?: string | null
          packeta_pickup_point?: string | null
          packeta_status_checked_at?: string | null
          packeta_status_code?: number | null
          posta_awb_number?: string | null
          posta_borderou_id?: number | null
          posta_oficiu_id?: string | null
          posta_status_checked_at?: string | null
          posta_status_code?: string | null
          revolut_order_id?: string | null
          sameday_awb_at?: string | null
          sameday_awb_cost?: number | null
          sameday_awb_number?: string | null
          sameday_locker_charge_code?: string | null
          sameday_return_awb_at?: string | null
          sameday_return_awb_number?: string | null
          sameday_status_checked_at?: string | null
          sameday_status_id?: number | null
          sameday_status_label?: string | null
          shipo_awb_at?: string | null
          shipo_awb_number?: string | null
          shipo_cost?: number | null
          shipo_courier_name?: string | null
          shipo_courier_slug?: string | null
          shipo_expedition_id?: number | null
          shipo_point_id?: number | null
          shipo_point_name?: string | null
          shipo_rate_id?: number | null
          shipo_status_checked_at?: string | null
          shipo_status_code?: string | null
          shipo_tracking_url?: string | null
          shipping_address?: Json
          shipping_cost?: number
          smartbill_estimate_number?: string | null
          smartbill_estimate_series?: string | null
          smartbill_estimate_url?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          smartbill_invoice_url?: string | null
          smartbill_storno_number?: string | null
          smartbill_storno_series?: string | null
          smartship_awb_at?: string | null
          smartship_awb_number?: string | null
          smartship_cost?: number | null
          smartship_courier_id?: number | null
          smartship_courier_name?: string | null
          smartship_offer_ref?: string | null
          smartship_offer_status?: string | null
          smartship_own_contract?: boolean | null
          smartship_pickup_code?: string | null
          smartship_status_checked_at?: string | null
          smartship_status_code?: number | null
          smartship_tracking_url?: string | null
          status?: string
          stoc_eliberat_la?: string | null
          stoc_marketplace_la?: string | null
          stoc_rezervat?: Json | null
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          ups_awb_at?: string | null
          ups_awb_number?: string | null
          ups_cost?: number | null
          ups_currency?: string | null
          ups_reference?: string | null
          ups_service_code?: string | null
          ups_service_name?: string | null
          ups_status_checked_at?: string | null
          ups_status_code?: string | null
          ups_status_type?: string | null
          ups_tracking_url?: string | null
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
          {
            foreignKeyName: "orders_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
        ]
      }
      page_form_submissions: {
        Row: {
          block_id: string | null
          business_id: string
          created_at: string
          data: Json
          form_id: string | null
          id: string
          is_read: boolean
          page_id: string | null
        }
        Insert: {
          block_id?: string | null
          business_id: string
          created_at?: string
          data?: Json
          form_id?: string | null
          id?: string
          is_read?: boolean
          page_id?: string | null
        }
        Update: {
          block_id?: string | null
          business_id?: string
          created_at?: string
          data?: Json
          form_id?: string | null
          id?: string
          is_read?: boolean
          page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_form_submissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_form_submissions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "custom_pages"
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
      posta_plaja: {
        Row: {
          business_id: string
          cifre: number
          created_at: string
          de_la: number
          pana_la: number
          prefix: string
          updated_at: string
          urmator: number
        }
        Insert: {
          business_id: string
          cifre?: number
          created_at?: string
          de_la: number
          pana_la: number
          prefix?: string
          updated_at?: string
          urmator: number
        }
        Update: {
          business_id?: string
          cifre?: number
          created_at?: string
          de_la?: number
          pana_la?: number
          prefix?: string
          updated_at?: string
          urmator?: number
        }
        Relationships: [
          {
            foreignKeyName: "posta_plaja_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_rows: {
        Row: {
          business_id: string
          error: string | null
          external_id: string | null
          id: string
          images_done: boolean
          import_id: string
          parsed: Json | null
          product_id: string | null
          row_index: number
          status: string
        }
        Insert: {
          business_id: string
          error?: string | null
          external_id?: string | null
          id?: string
          images_done?: boolean
          import_id: string
          parsed?: Json | null
          product_id?: string | null
          row_index: number
          status?: string
        }
        Update: {
          business_id?: string
          error?: string | null
          external_id?: string | null
          id?: string
          images_done?: boolean
          import_id?: string
          parsed?: Json | null
          product_id?: string | null
          row_index?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_rows_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "product_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_imports: {
        Row: {
          business_id: string
          created_at: string
          error: string | null
          error_report_url: string | null
          file_name: string | null
          file_url: string | null
          finished_at: string | null
          id: string
          mapping: Json
          options: Json
          source: string
          started_at: string | null
          status: string
          totals: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          error?: string | null
          error_report_url?: string | null
          file_name?: string | null
          file_url?: string | null
          finished_at?: string | null
          id?: string
          mapping?: Json
          options?: Json
          source: string
          started_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          error?: string | null
          error_report_url?: string | null
          file_name?: string | null
          file_url?: string | null
          finished_at?: string | null
          id?: string
          mapping?: Json
          options?: Json
          source?: string
          started_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_imports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          business_id: string
          category: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          images: Json
          is_active: boolean
          import_row_id: string | null
          is_bundle: boolean
          is_featured: boolean
          name: string
          page_sections: Json
          price: number
          shipping_class: string | null
          sku: string | null
          slug: string | null
          sort_order: number
          source: string | null
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
          external_id?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          import_row_id?: string | null
          is_bundle?: boolean
          is_featured?: boolean
          name: string
          page_sections?: Json
          price: number
          shipping_class?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number
          source?: string | null
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
          external_id?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          import_row_id?: string | null
          is_bundle?: boolean
          is_featured?: boolean
          name?: string
          page_sections?: Json
          price?: number
          shipping_class?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number
          source?: string | null
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
      rate_limits: {
        Row: {
          actualizat_la: string
          blocat_pana: string | null
          cheie: string
          fereastra_start: string
          lovituri: number
        }
        Insert: {
          actualizat_la?: string
          blocat_pana?: string | null
          cheie: string
          fereastra_start?: string
          lovituri?: number
        }
        Update: {
          actualizat_la?: string
          blocat_pana?: string | null
          cheie?: string
          fereastra_start?: string
          lovituri?: number
        }
        Relationships: []
      }
      recovery_optout: {
        Row: {
          business_id: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_optout_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          business_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          is_read: boolean
          items: Json
          order_id: string | null
          order_number: string
          reason: string | null
          refund_iban: string | null
          refund_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_read?: boolean
          items?: Json
          order_id?: string | null
          order_number: string
          reason?: string | null
          refund_iban?: string | null
          refund_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_read?: boolean
          items?: Json
          order_id?: string | null
          order_number?: string
          reason?: string | null
          refund_iban?: string | null
          refund_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      stock_feed_sources: {
        Row: {
          business_id: string
          consecutive_failures: number
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          last_error: string | null
          last_import_id: string | null
          last_run_at: string | null
          last_status: string | null
          last_totals: Json | null
          mapping: Json
          name: string
          options: Json
          run_hour: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          business_id: string
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          last_error?: string | null
          last_import_id?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_totals?: Json | null
          mapping?: Json
          name?: string
          options?: Json
          run_hour?: number
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          business_id?: string
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          last_error?: string | null
          last_import_id?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_totals?: Json | null
          mapping?: Json
          name?: string
          options?: Json
          run_hour?: number
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_feed_sources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_feed_sources_last_import_id_fkey"
            columns: ["last_import_id"]
            isOneToOne: false
            referencedRelation: "product_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          abandoned_cart_automation: Json
          abandoned_cart_enabled: boolean
          aboutyou_config: Json
          brevo_config: Json | null
          business_id: string
          card_discount_config: Json
          cargus_config: Json | null
          cod_discount_config: Json
          cod_fee_config: Json | null
          colete_config: Json | null
          cookie_banner_config: Json | null
          created_at: string
          currency: string
          default_shipping_cost: number
          dhl_config: Json | null
          dpd_config: Json | null
          ecolet_config: Json | null
          emag_config: Json
          email_config: Json
          fan_courier_config: Json | null
          facebook_feeds: Json | null
          fedex_config: Json | null
          fgo_config: Json | null
          free_shipping_threshold: number | null
          gls_config: Json | null
          innoship_config: Json | null
          packeta_config: Json | null
          google_analytics_config: Json
          google_merchant_config: Json
          id: string
          ipay_config: Json | null
          klarna_config: Json | null
          klaviyo_config: Json | null
          mailchimp_config: Json | null
          marketing_config: Json | null
          min_order_amount: number | null
          netopia_config: Json | null
          notice_config: Json | null
          notifications_config: Json
          oblio_config: Json | null
          olx_config: Json
          order_counter: number
          order_number_format: string
          page_content: Json
          pallex_config: Json | null
          payment_methods: Json
          posta_config: Json | null
          prices_include_vat: boolean
          returns_config: Json
          revolut_config: Json | null
          sameday_config: Json | null
          shipo_config: Json | null
          shipping_classes: Json
          shipping_enabled: boolean
          shipping_rules: Json
          shipping_zones: Json
          show_vat_breakdown: boolean
          show_vat_label: boolean
          smartbill_config: Json | null
          smartship_config: Json | null
          smso_config: Json | null
          store_policies: Json
          storefront_design: Json
          storefront_design_draft: Json | null
          storefront_design_pub_at: string | null
          stripe_config: Json | null
          trendyol_config: Json
          updated_at: string
          ups_config: Json | null
          vat_enabled: boolean
          vat_rate: number
          woot_config: Json | null
        }
        Insert: {
          abandoned_cart_automation?: Json
          abandoned_cart_enabled?: boolean
          aboutyou_config?: Json
          brevo_config?: Json | null
          business_id: string
          card_discount_config?: Json
          cargus_config?: Json | null
          cod_discount_config?: Json
          cod_fee_config?: Json | null
          colete_config?: Json | null
          cookie_banner_config?: Json | null
          created_at?: string
          currency?: string
          default_shipping_cost?: number
          dhl_config?: Json | null
          dpd_config?: Json | null
          ecolet_config?: Json | null
          emag_config?: Json
          email_config?: Json
          fan_courier_config?: Json | null
          facebook_feeds?: Json | null
          fedex_config?: Json | null
          fgo_config?: Json | null
          free_shipping_threshold?: number | null
          gls_config?: Json | null
          innoship_config?: Json | null
          packeta_config?: Json | null
          google_analytics_config?: Json
          google_merchant_config?: Json
          id?: string
          ipay_config?: Json | null
          klarna_config?: Json | null
          klaviyo_config?: Json | null
          mailchimp_config?: Json | null
          marketing_config?: Json | null
          min_order_amount?: number | null
          netopia_config?: Json | null
          notice_config?: Json | null
          notifications_config?: Json
          oblio_config?: Json | null
          olx_config?: Json
          order_counter?: number
          order_number_format?: string
          page_content?: Json
          pallex_config?: Json | null
          payment_methods?: Json
          posta_config?: Json | null
          prices_include_vat?: boolean
          returns_config?: Json
          revolut_config?: Json | null
          sameday_config?: Json | null
          shipo_config?: Json | null
          shipping_classes?: Json
          shipping_enabled?: boolean
          shipping_rules?: Json
          shipping_zones?: Json
          show_vat_breakdown?: boolean
          show_vat_label?: boolean
          smartbill_config?: Json | null
          smartship_config?: Json | null
          smso_config?: Json | null
          store_policies?: Json
          storefront_design?: Json
          storefront_design_draft?: Json | null
          storefront_design_pub_at?: string | null
          stripe_config?: Json | null
          trendyol_config?: Json
          updated_at?: string
          ups_config?: Json | null
          vat_enabled?: boolean
          vat_rate?: number
          woot_config?: Json | null
        }
        Update: {
          abandoned_cart_automation?: Json
          abandoned_cart_enabled?: boolean
          aboutyou_config?: Json
          brevo_config?: Json | null
          business_id?: string
          card_discount_config?: Json
          cargus_config?: Json | null
          cod_discount_config?: Json
          cod_fee_config?: Json | null
          colete_config?: Json | null
          cookie_banner_config?: Json | null
          created_at?: string
          currency?: string
          default_shipping_cost?: number
          dhl_config?: Json | null
          dpd_config?: Json | null
          ecolet_config?: Json | null
          emag_config?: Json
          email_config?: Json
          fan_courier_config?: Json | null
          facebook_feeds?: Json | null
          fedex_config?: Json | null
          fgo_config?: Json | null
          free_shipping_threshold?: number | null
          gls_config?: Json | null
          innoship_config?: Json | null
          packeta_config?: Json | null
          google_analytics_config?: Json
          google_merchant_config?: Json
          id?: string
          ipay_config?: Json | null
          klarna_config?: Json | null
          klaviyo_config?: Json | null
          mailchimp_config?: Json | null
          marketing_config?: Json | null
          min_order_amount?: number | null
          netopia_config?: Json | null
          notice_config?: Json | null
          notifications_config?: Json
          oblio_config?: Json | null
          olx_config?: Json
          order_counter?: number
          order_number_format?: string
          page_content?: Json
          pallex_config?: Json | null
          payment_methods?: Json
          posta_config?: Json | null
          prices_include_vat?: boolean
          returns_config?: Json
          revolut_config?: Json | null
          sameday_config?: Json | null
          shipo_config?: Json | null
          shipping_classes?: Json
          shipping_enabled?: boolean
          shipping_rules?: Json
          shipping_zones?: Json
          show_vat_breakdown?: boolean
          show_vat_label?: boolean
          smartbill_config?: Json | null
          smartship_config?: Json | null
          smso_config?: Json | null
          store_policies?: Json
          storefront_design?: Json
          storefront_design_draft?: Json | null
          storefront_design_pub_at?: string | null
          stripe_config?: Json | null
          trendyol_config?: Json
          updated_at?: string
          ups_config?: Json | null
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
      stripe_events: {
        Row: {
          created_at: string
          event_id: string
          type: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          type?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          type?: string | null
        }
        Relationships: []
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
      trendyol_batches: {
        Row: {
          attempts: number
          batch_request_id: string
          business_id: string
          created_at: string
          id: string
          kind: string
          next_poll_at: string | null
          poll_errors: number
          polled_at: string | null
          related_ids: Json
          result_summary: Json | null
          status: string
          submitted_at: string
        }
        Insert: {
          attempts?: number
          batch_request_id: string
          business_id: string
          created_at?: string
          id?: string
          kind: string
          next_poll_at?: string | null
          poll_errors?: number
          polled_at?: string | null
          related_ids?: Json
          result_summary?: Json | null
          status?: string
          submitted_at?: string
        }
        Update: {
          attempts?: number
          batch_request_id?: string
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          next_poll_at?: string | null
          poll_errors?: number
          polled_at?: string | null
          related_ids?: Json
          result_summary?: Json | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      trendyol_claim_items: {
        Row: {
          barcode: string | null
          business_id: string
          claim_item_id: string
          claim_item_status: string | null
          claim_row_id: string
          created_at: string
          customer_note: string | null
          decis_la: string | null
          decizie: string | null
          id: string
          order_line_id: string | null
          product_name: string | null
          quantity: number
          raw: Json | null
          reason: string | null
          repus_in_stoc_la: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id: string
          claim_item_id: string
          claim_item_status: string | null
          claim_row_id: string
          created_at?: string
          customer_note?: string | null
          decis_la?: string | null
          decizie?: string | null
          id?: string
          order_line_id?: string | null
          product_name?: string | null
          quantity?: number
          raw?: Json | null
          reason?: string | null
          repus_in_stoc_la?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string
          claim_item_id?: string
          claim_item_status?: string | null
          claim_row_id?: string
          created_at?: string
          customer_note?: string | null
          decis_la?: string | null
          decizie?: string | null
          id?: string
          order_line_id?: string | null
          product_name?: string | null
          quantity?: number
          raw?: Json | null
          reason?: string | null
          repus_in_stoc_la?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_claim_items_claim_row_id_fkey"
            columns: ["claim_row_id"]
            isOneToOne: false
            referencedRelation: "trendyol_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      trendyol_claims: {
        Row: {
          business_id: string
          claim_date: string | null
          claim_id: string
          claim_status: string | null
          created_at: string
          colet_inlocuire: Json | null
          colet_respins: Json | null
          dont_ship_back: boolean | null
          id: string
          last_modified: string | null
          order_id: string | null
          order_number: string | null
          raw: Json | null
          reintrebat_la: string | null
          shipment_package_id: number | null
          storefront: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          claim_date?: string | null
          claim_id: string
          claim_status?: string | null
          created_at?: string
          colet_inlocuire?: Json | null
          colet_respins?: Json | null
          dont_ship_back?: boolean | null
          id?: string
          last_modified?: string | null
          order_id?: string | null
          order_number?: string | null
          raw?: Json | null
          reintrebat_la?: string | null
          shipment_package_id?: number | null
          storefront?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          claim_date?: string | null
          claim_id?: string
          claim_status?: string | null
          created_at?: string
          colet_inlocuire?: Json | null
          colet_respins?: Json | null
          dont_ship_back?: boolean | null
          id?: string
          last_modified?: string | null
          order_id?: string | null
          order_number?: string | null
          raw?: Json | null
          reintrebat_la?: string | null
          shipment_package_id?: number | null
          storefront?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trendyol_listings: {
        Row: {
          arhivat_la: string | null
          attributes: Json
          auto_inventory: boolean
          brand_id: number | null
          business_id: string
          cargo_company_id: number | null
          category_id: number | null
          creat_de_edinio: boolean
          country_of_origin: string | null
          created_at: string
          dimensional_weight: number | null
          error: string | null
          id: string
          inventory_retries: number
          issues: Json
          last_status_at: string | null
          last_synced_at: string | null
          product_id: string | null
          product_main_id: string
          rejection_reasons: Json
          sgr_units: number | null
          sters_cerut_la: string | null
          sters_eroare: string | null
          status: string
          ty_content_id: number | null
          updated_at: string
        }
        Insert: {
          arhivat_la?: string | null
          attributes?: Json
          auto_inventory?: boolean
          brand_id?: number | null
          business_id: string
          cargo_company_id?: number | null
          category_id?: number | null
          creat_de_edinio?: boolean
          country_of_origin?: string | null
          created_at?: string
          dimensional_weight?: number | null
          error?: string | null
          id?: string
          inventory_retries?: number
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          product_id?: string | null
          product_main_id: string
          rejection_reasons?: Json
          sgr_units?: number | null
          sters_cerut_la?: string | null
          sters_eroare?: string | null
          status?: string
          ty_content_id?: number | null
          updated_at?: string
        }
        Update: {
          arhivat_la?: string | null
          attributes?: Json
          auto_inventory?: boolean
          brand_id?: number | null
          business_id?: string
          cargo_company_id?: number | null
          category_id?: number | null
          creat_de_edinio?: boolean
          country_of_origin?: string | null
          created_at?: string
          dimensional_weight?: number | null
          error?: string | null
          id?: string
          inventory_retries?: number
          issues?: Json
          last_status_at?: string | null
          last_synced_at?: string | null
          product_id?: string | null
          product_main_id?: string
          rejection_reasons?: Json
          sgr_units?: number | null
          sters_cerut_la?: string | null
          sters_eroare?: string | null
          status?: string
          ty_content_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_listings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trendyol_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trendyol_orders: {
        Row: {
          business_id: string
          cargo_tracking_number: string | null
          created_at: string
          currency: string | null
          id: string
          invoice_error: string | null
          invoice_number: string | null
          invoice_uploaded_at: string | null
          last_modified_date: number | null
          last_synced_at: string | null
          lines: Json
          order_id: string | null
          order_number: string | null
          shipment_package_id: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cargo_tracking_number?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          invoice_error?: string | null
          invoice_number?: string | null
          invoice_uploaded_at?: string | null
          last_modified_date?: number | null
          last_synced_at?: string | null
          lines?: Json
          order_id?: string | null
          order_number?: string | null
          shipment_package_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cargo_tracking_number?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          invoice_error?: string | null
          invoice_number?: string | null
          invoice_uploaded_at?: string | null
          last_modified_date?: number | null
          last_synced_at?: string | null
          lines?: Json
          order_id?: string | null
          order_number?: string | null
          shipment_package_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trendyol_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      trendyol_sync_queue: {
        Row: {
          abandonat_la: string | null
          attempts: number
          business_id: string
          created_at: string
          generation: number
          id: string
          last_error: string | null
          next_retry_at: string | null
          offer_id: string
          op: string
          prioritate: number
          product_id: string | null
          revendicat_pana: string | null
        }
        Insert: {
          abandonat_la?: string | null
          attempts?: number
          business_id: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Update: {
          abandonat_la?: string | null
          attempts?: number
          business_id?: string
          created_at?: string
          generation?: number
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          offer_id?: string
          op?: string
          prioritate?: number
          product_id?: string | null
          revendicat_pana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trendyol_sync_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trendyol_variants: {
        Row: {
          attributes: Json
          barcode: string
          business_id: string
          created_at: string
          enabled: boolean
          exista_la_ei: boolean
          id: string
          list_price: number | null
          listing_id: string
          product_id: string | null
          quantity: number | null
          sale_price: number | null
          stock_code: string | null
          ty_status: string | null
          updated_at: string
          variant_title: string | null
          vat_rate: number | null
        }
        Insert: {
          attributes?: Json
          barcode: string
          business_id: string
          created_at?: string
          enabled?: boolean
          exista_la_ei?: boolean
          id?: string
          list_price?: number | null
          listing_id: string
          product_id?: string | null
          quantity?: number | null
          sale_price?: number | null
          stock_code?: string | null
          ty_status?: string | null
          updated_at?: string
          variant_title?: string | null
          vat_rate?: number | null
        }
        Update: {
          attributes?: Json
          barcode?: string
          business_id?: string
          created_at?: string
          enabled?: boolean
          exista_la_ei?: boolean
          id?: string
          list_price?: number | null
          listing_id?: string
          product_id?: string | null
          quantity?: number | null
          sale_price?: number | null
          stock_code?: string | null
          ty_status?: string | null
          updated_at?: string
          variant_title?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trendyol_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trendyol_variants_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "trendyol_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trendyol_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ups_etichete: {
        Row: {
          awb_number: string
          business_id: string
          continut: string
          creat_la: string
          document_ramburs: string | null
          format: string
          order_id: string
          semnatura: string | null
        }
        Insert: {
          awb_number: string
          business_id: string
          continut: string
          creat_la?: string
          document_ramburs?: string | null
          format: string
          order_id: string
          semnatura?: string | null
        }
        Update: {
          awb_number?: string
          business_id?: string
          continut?: string
          creat_la?: string
          document_ramburs?: string | null
          format?: string
          order_id?: string
          semnatura?: string | null
        }
        Relationships: []
      }
      users_profile: {
        Row: {
          admin_notes: string | null
          announcements_seen_at: string | null
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          mfa_confirmat_la: string | null
          mfa_email_enabled: boolean
          mfa_otp: string | null
          mfa_otp_expires_at: string | null
          mfa_sesiuni_confirmate: Json
          onboarding_completed: boolean
          onboarding_step: string
          orders_seen_at: string | null
          payment_failed_at: string | null
          plan: string
          plan_expires_at: string | null
          plan_interval: string | null
          role: string
          stripe_customer_id: string | null
          suspended_until: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          announcements_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          mfa_confirmat_la?: string | null
          mfa_email_enabled?: boolean
          mfa_otp?: string | null
          mfa_otp_expires_at?: string | null
          mfa_sesiuni_confirmate?: Json
          onboarding_completed?: boolean
          onboarding_step?: string
          orders_seen_at?: string | null
          payment_failed_at?: string | null
          plan?: string
          plan_expires_at?: string | null
          plan_interval?: string | null
          role?: string
          stripe_customer_id?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          announcements_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          mfa_confirmat_la?: string | null
          mfa_email_enabled?: boolean
          mfa_otp?: string | null
          mfa_otp_expires_at?: string | null
          mfa_sesiuni_confirmate?: Json
          onboarding_completed?: boolean
          onboarding_step?: string
          orders_seen_at?: string | null
          payment_failed_at?: string | null
          plan?: string
          plan_expires_at?: string | null
          plan_interval?: string | null
          role?: string
          stripe_customer_id?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      zz_backup_preturi_bricosmart_20260804: {
        Row: {
          compare_at_price: number | null
          id: string | null
          luat_la: string | null
          page_sections: Json | null
          price: number | null
        }
        Insert: {
          compare_at_price?: number | null
          id?: string | null
          luat_la?: string | null
          page_sections?: Json | null
          price?: number | null
        }
        Update: {
          compare_at_price?: number | null
          id?: string | null
          luat_la?: string | null
          page_sections?: Json | null
          price?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agregeaza_analitice: { Args: { p_zile?: number }; Returns: number }
      aplica_tranzitia_comenzii: { Args: { p_order_id: string; p_status: string; p_payment_status?: string | null; p_business_id?: string; p_elibereaza_stoc?: boolean | null }; Returns: Json }
      catalog_aplica_proiectii: { Args: { p_randuri: Json }; Returns: number }
      /* ⚠ `now()` al bazei. Cine compara cu o coloana scrisa de Postgres (`created_at`) ia
         clipa de aici, nu din Node: altfel paza se bizuie pe potrivirea a doua ceasuri. */
      ceasul_bazei: { Args: Record<string, never>; Returns: string }
      catalog_cauta: { Args: { p_business: string; p_cuvinte: string[]; p_filtre: Json; p_plafon?: number }; Returns: Json }
      catalog_pagina: { Args: { p_business: string; p_filtre: Json; p_limit: number; p_offset: number }; Returns: Json }
      catalog_randuri: { Args: { p_business: string; p_spec: Json }; Returns: Json }
      catalog_reface_cuvinte: { Args: { p_business: string }; Returns: number }
      catalog_scrie_rezumat: { Args: { p_randuri: Json }; Returns: number }
      catalog_verifica: { Args: { p_esantion?: number }; Returns: number }
      // Un id de familie nou, pentru un produs cu variante care se publica pe eMAG.
      emag_familie_noua: { Args: Record<string, never>; Returns: number }
      // Impinge AMANDOUA sirurile eMAG deasupra id-urilor PRELUATE la import.
      // ⚠ In `public` fiindca PostgREST nu cheama decat de acolo, dar cu `execute`
      // retras de la `anon` si `authenticated`: numai cheia de serviciu le poate chema.
      emag_ridica_sirurile: { Args: { p_oferta: number | null; p_familie: number | null }; Returns: Json }
      // Numele de categorie stinse ale unui magazin, subarborii inclusi. Perechea
      // din TypeScript e `numeCategoriiAscunse` (lib/categories/vizibilitate.ts);
      // cele doua trebuie sa dea acelasi raspuns.
      categorii_ascunse: { Args: { p_business: string }; Returns: string[] }
      consuma_stoc_comanda_marketplace: { Args: { p_order_id: string; p_business_id: string; p_produse: Json; p_variante: Json }; Returns: Json }
      curata_analitice_brute: { Args: { p_pastreaza_zile?: number; p_max?: number }; Returns: number }
      // `p_produse_minus` / `p_variante_minus`: ce se DA INAPOI la stoc pentru
      // liniile scoase sau scazute. Se cleameaza in baza la ce scrie in
      // `orders.stoc_rezervat`, deci nu se poate elibera mai mult decat s-a luat.
      // `p_*_necesar`: cat mai datoreaza comanda DUPA editare. Eliberarea nu scade
      // rezervarea sub el, altfel scoaterea unei linii ar manca rezervarea alteia.
      editeaza_comanda_atomic: { Args: { p_order_id: string; p_business_id: string; p_patch: Json; p_produse: Json; p_variante: Json; p_status_asteptat?: string | null; p_produse_minus?: Json; p_variante_minus?: Json; p_produse_necesar?: Json; p_variante_necesar?: Json }; Returns: Json }
      scade_din_rezervat: { Args: { p_rez: Json; p_produse_minus: Json; p_variante_minus: Json; p_produse_necesar?: Json; p_variante_necesar?: Json }; Returns: Json }
      elibereaza_stoc_complet: { Args: { p_produse: Json; p_variante: Json }; Returns: undefined }
      jsonb_merge_config: { Args: { p_business_id: string; p_column: string; p_patch: Json }; Returns: undefined }
      numar_produse_si_comenzi: { Args: Record<PropertyKey, never>; Returns: Json }
      orders_venit_zilnic: { Args: { bid: string; p_zile: number; p_deplasare?: number }; Returns: unknown }
      proba_stoc: { Args: Record<PropertyKey, never>; Returns: Json }
      ajusteaza_stoc_comanda_marketplace: { Args: { p_order_id: string; p_business_id: string | null; p_produse: Json; p_variante: Json }; Returns: Json }
      numara_ofertele_emag: { Args: { p_business_id: string }; Returns: Json }
      ia_jeton_extern: { Args: { p_cheie: string; p_limita: number; p_fereastra_ms?: number }; Returns: Json }
      produse_nesincronizate_emag: { Args: { p_business_id: string; p_rabdare?: unknown; p_limita?: number }; Returns: string[] }
      emag_comenzi_de_verificat_awb: { Args: { p_business_id: string; p_limita?: number; p_de_la?: number }; Returns: { id: string; order_id: string | null; emag_order_id: number | null; order_type: number | null; awb_uploaded_number: string | null; awb_uploaded_numbers: string[] | null }[] }
      emag_awburi_de_urmarit: { Args: { p_business_id: string; p_limita?: number }; Returns: { id: string; emag_id: number | null; order_id: string | null }[] }
      emag_oferte_legate_stramb: { Args: { p_business_id: string; p_limita?: number }; Returns: { id: string; emag_id: number; nume_emag: string | null; nume_produs: string | null }[] }
      emag_produse_noi_nepublicate: { Args: { p_business_id: string; p_ore?: number; p_limita?: number; p_de_cand?: string | null }; Returns: { id: string; created_at: string }[] }
      emag_stinge_propagarea: { Args: { p_business_id: string; p_ceruta_la: string }; Returns: boolean }
      vezi_ritm_extern: { Args: { p_cheie: string; p_fereastra_ms?: number }; Returns: Json }
      pune_pauza_ritm_extern: { Args: { p_cheie: string; p_ms: number }; Returns: string }
      curata_ritm_extern: { Args: Record<PropertyKey, never>; Returns: number }
      revendica_din_coada: { Args: { p_coada: string; p_limita?: number; p_lease?: unknown }; Returns: Json[] }
      revendica_stoc_complet: { Args: { p_produse: Json; p_variante: Json }; Returns: Json }
      rezerva_operatie_externa: { Args: { p_business_id: string | null; p_order_id: string | null; p_fel: string; p_furnizor: string; p_cheie: string }; Returns: Json }
      incheie_operatie_externa: { Args: { p_id: string; p_business_id: string | null; p_stare: string; p_referinta_externa?: string | null; p_detalii?: Json; p_eroare?: string | null }; Returns: Json }
      marcheaza_operatie_anulata: { Args: { p_business_id: string | null; p_cheie: string }; Returns: Json }
      aboutyou_elibereaza_anulari: { Args: { p_business_id: string; p_order_number: string; p_linii: Json }; Returns: Json }
      aboutyou_generatie_noua: { Args: { p_listing_id: string }; Returns: number }
      /* ⚠ `Returns: number | null` — NULL cand randul de listare nu mai exista (a fost scos
         sau refacut intre timp): atunci NU se mai trimite nimic la ei. */
      aboutyou_ceas_pentru_listare: {
        Args: { p_business_id: string; p_style_key: string; p_listare_id: string; p_dorit: string | null }
        Returns: number | null
      }
      /* ⚠ `Returns: number | null` — NULL cand ceasul s-a miscat de la scoatere incoace
         (aproape sigur o relistare): reasertarea nu mai are ce sa stinga. */
      aboutyou_ceas_pentru_reasertare: {
        Args: { p_business_id: string; p_style_key: string; p_generatie_asteptata: number | null }
        Returns: number | null
      }
      aboutyou_ceas_urmator: { Args: { p_business_id: string; p_style_key: string; p_dorit: string | null }; Returns: number }
      aboutyou_incheie_scoaterea: { Args: { p_business_id: string; p_style_key: string; p_generatie: number | null }; Returns: string }
      /* ⚠ Randul de listare SI variantele, intr-o singura tranzactie: ori se schimba tot, ori
         nimic. `p_campuri` se aplica peste coloanele tabelei fara ca ele sa fie numite in SQL. */
      aboutyou_salveaza_listarea: {
        Args: {
          p_business_id: string; p_style_key: string; p_product_id: string
          p_campuri: Json; p_randuri: Json
          /* ⚠ Incarnarea de la care a pornit salvarea. `null` = „am inceput fara listare", si numai
             atunci se poate crea una. Vezi migratia 2026-12-12. */
          p_listare_asteptata?: string | null
        }
        Returns: Json
      }
      aboutyou_salveaza_variante: { Args: { p_business_id: string; p_listing_id: string; p_randuri: Json }; Returns: Json }
      aboutyou_repune_stoc_retur: { Args: { p_business_id: string; p_retur_id: string }; Returns: Json }
      trendyol_comenzi_de_facturat: { Args: { p_business_id: string; p_limita?: number; p_de_la?: number }; Returns: { order_id: string; shipment_package_id: string }[] }
      trendyol_magazine_cu_loturi_deschise: { Args: Record<string, never>; Returns: { business_id: string; cate: number }[] }
      trendyol_magazine_de_reconciliat: { Args: Record<string, never>; Returns: { business_id: string; cate: number }[] }
      trendyol_repune_stoc_retur: { Args: { p_business_id: string; p_claim_item_id: string }; Returns: Json }
      scrie_variante_daca_neschimbat: { Args: { p_business: string; p_product: string; p_asteptat: Json; p_nou: Json }; Returns: string }
      site_analytics_breakdown_zile: { Args: { bid: string; p_zile: number }; Returns: unknown }
      sterge_comanda: { Args: { p_order_id: string; p_business_id?: string }; Returns: Json }
      claim_discount_use: { Args: { p_discount_id: string }; Returns: boolean }
      consuma_limita: {
        Args: {
          p_blocare_sec?: number
          p_cheie: string
          p_fereastra_sec: number
          p_limita: number
        }
        Returns: {
          blocat_pana: string
          permis: boolean
        }[]
      }
      curata_limite: { Args: never; Returns: number }
      customer_orders: {
        Args: {
          bid: string
          cust_key: string
          page_limit?: number
          page_offset?: number
        }
        Returns: {
          created_at: string
          id: string
          item_count: number
          order_number: string
          payment_method: string
          payment_status: string
          status: string
          total: number
          total_count: number
        }[]
      }
      customers_aggregate: {
        Args: {
          bid: string
          page_limit?: number
          page_offset?: number
          search?: string
          sort_key?: string
        }
        Returns: {
          address: string
          aov: number
          city: string
          county: string
          email: string
          first_order_at: string
          key: string
          last_order_at: string
          last_status: string
          name: string
          order_count: number
          paid_order_count: number
          phone: string
          total_count: number
          total_spent: number
        }[]
      }
      customers_summary: {
        Args: { bid: string }
        Returns: {
          average_order_value: number
          returning_customers: number
          total_customers: number
          total_revenue: number
        }[]
      }
      decrement_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      decrement_stock_batch: { Args: { p_items: Json }; Returns: undefined }
      decrement_variant_stock_batch: {
        Args: { p_items: Json }
        Returns: undefined
      }
      increment_discount_uses: {
        Args: { p_discount_id: string }
        Returns: undefined
      }
      increment_offer_stats: {
        Args: {
          p_conversions?: number
          p_impressions?: number
          p_offer_id: string
          p_revenue?: number
        }
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
      normalize_phone: { Args: { raw: string }; Returns: string }
      order_customer_key: {
        Args: {
          customer_email: string
          customer_phone: string
          order_id: string
        }
        Returns: string
      }
      orders_county_counts: {
        Args: { bid: string }
        Returns: {
          cnt: number
          county: string
        }[]
      }
      orders_daily_revenue: {
        Args: { bid: string; t_from: string; t_to?: string }
        Returns: {
          day: string
          order_count: number
          revenue: number
        }[]
      }
      orders_revenue_sum: {
        Args: { bid: string; t_from: string; t_to?: string }
        Returns: number
      }
      orders_status_counts: {
        Args: { bid: string }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      reclaim_order_discount: { Args: { p_order_id: string }; Returns: string }
      /* ⚠ `Returns: string | null` — NULL cand magazinul n-are plaja sau cand
         s-a epuizat. Apelantul TREBUIE sa trateze cazul: vezi comentariul din
         migrations/2026-09-02-posta-curier.sql. */
      posta_aloca_cod: {
        Args: { p_business_id: string }
        Returns: string | null
      }
      release_discount_use: {
        Args: { p_discount_id: string }
        Returns: undefined
      }
      release_order_discount: { Args: { p_order_id: string }; Returns: boolean }
      repretuieste_pachetele_cu: {
        Args: { p_component_id: string }
        Returns: undefined
      }
      reserve_payout_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      reseteaza_limita: { Args: { p_cheie: string }; Returns: undefined }
      site_analytics_breakdown: {
        Args: { bid: string; t_from: string }
        Returns: {
          cnt: number
          device: string
          event_type: string
          source: string
        }[]
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
