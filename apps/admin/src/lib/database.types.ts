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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          actor_email: string
          created_at: string
          id: string
          payload: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email: string
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admins: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
          is_super: boolean
          role: "viewer" | "editor" | "super"
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
          is_super?: boolean
          role?: "viewer" | "editor" | "super"
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
          is_super?: boolean
          role?: "viewer" | "editor" | "super"
        }
        Relationships: []
      }
      audit_runs: {
        Row: {
          commit_sha: string | null
          created_by: string | null
          dimensions: Json
          id: string
          overall: number
          pr_url: string | null
          run_at: string
          summary: string
          totals: Json
        }
        Insert: {
          commit_sha?: string | null
          created_by?: string | null
          dimensions?: Json
          id?: string
          overall?: number
          pr_url?: string | null
          run_at?: string
          summary?: string
          totals?: Json
        }
        Update: {
          commit_sha?: string | null
          created_by?: string | null
          dimensions?: Json
          id?: string
          overall?: number
          pr_url?: string | null
          run_at?: string
          summary?: string
          totals?: Json
        }
        Relationships: []
      }
      changelog_entries: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: []
      }
      changelog_sends: {
        Row: {
          entry_count: number
          id: string
          recipients: number
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          entry_count?: number
          id?: string
          recipients?: number
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          entry_count?: number
          id?: string
          recipients?: number
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: []
      }
      discord_account_links: {
        Row: {
          confirmed_at: string | null
          created_at: string
          discord_channel_id: string | null
          discord_user_id: string | null
          discord_username: string | null
          email_normalized: string
          id: string
          initiated_from: string
          link_token_expires: string | null
          link_token_hash: string | null
          revoked_at: string | null
          scopes: Json
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          email_normalized: string
          id?: string
          initiated_from: string
          link_token_expires?: string | null
          link_token_hash?: string | null
          revoked_at?: string | null
          scopes?: Json
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          email_normalized?: string
          id?: string
          initiated_from?: string
          link_token_expires?: string | null
          link_token_hash?: string | null
          revoked_at?: string | null
          scopes?: Json
        }
        Relationships: []
      }
      discord_dm_memory: {
        Row: {
          discord_user_id: string
          summary: string
          summary_through: string | null
          updated_at: string
        }
        Insert: {
          discord_user_id: string
          summary?: string
          summary_through?: string | null
          updated_at?: string
        }
        Update: {
          discord_user_id?: string
          summary?: string
          summary_through?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discord_dm_messages: {
        Row: {
          archived_at: string | null
          author: string
          body: string
          created_at: string
          discord_user_id: string
          id: number
        }
        Insert: {
          archived_at?: string | null
          author: string
          body: string
          created_at?: string
          discord_user_id: string
          id?: never
        }
        Update: {
          archived_at?: string | null
          author?: string
          body?: string
          created_at?: string
          discord_user_id?: string
          id?: never
        }
        Relationships: []
      }
      email_brand: {
        Row: {
          amber: string
          error: string
          id: boolean
          income: string
          ink: string
          ink2: string
          ink3: string
          ink4: string
          line: string
          paper: string
          sender_name: string
          updated_at: string
          updated_by: string | null
          white: string
        }
        Insert: {
          amber?: string
          error?: string
          id?: boolean
          income?: string
          ink?: string
          ink2?: string
          ink3?: string
          ink4?: string
          line?: string
          paper?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
          white?: string
        }
        Update: {
          amber?: string
          error?: string
          id?: boolean
          income?: string
          ink?: string
          ink2?: string
          ink3?: string
          ink4?: string
          line?: string
          paper?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
          white?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          id: string
          occurred_at: string
          raw: Json | null
          recipient: string | null
          resend_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          occurred_at?: string
          raw?: Json | null
          recipient?: string | null
          resend_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          occurred_at?: string
          raw?: Json | null
          recipient?: string | null
          resend_id?: string | null
          type?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          email_key: string
          error: string | null
          id: string
          recipient_count: number
          resend_id: string | null
          status: string
          subject: string
          trigger: string
        }
        Insert: {
          created_at?: string
          email_key: string
          error?: string | null
          id?: string
          recipient_count?: number
          resend_id?: string | null
          status?: string
          subject?: string
          trigger?: string
        }
        Update: {
          created_at?: string
          email_key?: string
          error?: string | null
          id?: string
          recipient_count?: number
          resend_id?: string | null
          status?: string
          subject?: string
          trigger?: string
        }
        Relationships: []
      }
      email_schedules: {
        Row: {
          audience_kind: string
          audience_list: string[]
          created_at: string
          created_by: string | null
          cta_href: string
          dispatch: string
          email_key: string
          enabled: boolean
          frequency: string
          id: string
          invoke_fn: string | null
          invoke_mode: string | null
          is_builtin: boolean
          kind: string
          last_run_at: string | null
          run_at: string | null
          send_dow: number | null
          send_hour: number
          trigger_label: string | null
          updated_at: string
        }
        Insert: {
          audience_kind?: string
          audience_list?: string[]
          created_at?: string
          created_by?: string | null
          cta_href?: string
          dispatch?: string
          email_key: string
          enabled?: boolean
          frequency?: string
          id?: string
          invoke_fn?: string | null
          invoke_mode?: string | null
          is_builtin?: boolean
          kind?: string
          last_run_at?: string | null
          run_at?: string | null
          send_dow?: number | null
          send_hour?: number
          trigger_label?: string | null
          updated_at?: string
        }
        Update: {
          audience_kind?: string
          audience_list?: string[]
          created_at?: string
          created_by?: string | null
          cta_href?: string
          dispatch?: string
          email_key?: string
          enabled?: boolean
          frequency?: string
          id?: string
          invoke_fn?: string | null
          invoke_mode?: string | null
          is_builtin?: boolean
          kind?: string
          last_run_at?: string | null
          run_at?: string | null
          send_dow?: number | null
          send_hour?: number
          trigger_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_schedules_email_key_fkey"
            columns: ["email_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["email_key"]
          },
        ]
      }
      email_settings: {
        Row: {
          id: boolean
          signals_floor_days: number
          signals_intent_min: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          signals_floor_days?: number
          signals_intent_min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          signals_floor_days?: number
          signals_intent_min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          cta_label: string
          email_key: string
          eyebrow: string
          footer: string
          heading: string
          intro: string
          is_custom: boolean
          label: string
          preheader: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          cta_label?: string
          email_key: string
          eyebrow?: string
          footer?: string
          heading?: string
          intro?: string
          is_custom?: boolean
          label: string
          preheader?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          cta_label?: string
          email_key?: string
          eyebrow?: string
          footer?: string
          heading?: string
          intro?: string
          is_custom?: boolean
          label?: string
          preheader?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_email: string | null
          anon_id: string | null
          created_at: string
          event_name: string
          id: string
          path: string | null
          props: Json
          referrer: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          anon_id?: string | null
          created_at?: string
          event_name: string
          id?: string
          path?: string | null
          props?: Json
          referrer?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          anon_id?: string | null
          created_at?: string
          event_name?: string
          id?: string
          path?: string | null
          props?: Json
          referrer?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      penny_prompts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_live: boolean
          notes: string | null
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_live?: boolean
          notes?: string | null
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_live?: boolean
          notes?: string | null
          version?: number
        }
        Relationships: []
      }
      penny_site_chats: {
        Row: {
          buying_signal: boolean
          created_at: string
          cta_emitted: boolean
          id: string
          message: string
          on_waitlist: boolean
          page_url: string | null
          referrer: string | null
          role: string
          session_id: string
          soft_decline: boolean
          tone: string | null
          turn_index: number
          user_agent: string | null
        }
        Insert: {
          buying_signal?: boolean
          created_at?: string
          cta_emitted?: boolean
          id?: string
          message: string
          on_waitlist?: boolean
          page_url?: string | null
          referrer?: string | null
          role: string
          session_id: string
          soft_decline?: boolean
          tone?: string | null
          turn_index: number
          user_agent?: string | null
        }
        Update: {
          buying_signal?: boolean
          created_at?: string
          cta_emitted?: boolean
          id?: string
          message?: string
          on_waitlist?: boolean
          page_url?: string | null
          referrer?: string | null
          role?: string
          session_id?: string
          soft_decline?: boolean
          tone?: string | null
          turn_index?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      penny_site_leads: {
        Row: {
          created_at: string
          id: string
          kind: string
          page_url: string | null
          referrer: string | null
          session_id: string
          source: string
          user_agent: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          page_url?: string | null
          referrer?: string | null
          session_id: string
          source: string
          user_agent?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          page_url?: string | null
          referrer?: string | null
          session_id?: string
          source?: string
          user_agent?: string | null
          value?: string
        }
        Relationships: []
      }
      penny_voice: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_live: boolean
          notes: string | null
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_live?: boolean
          notes?: string | null
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_live?: boolean
          notes?: string | null
          version?: number
        }
        Relationships: []
      }
      sig_digest_sends: {
        Row: {
          id: string
          lead_count: number
          reason: string | null
          sent_at: string
        }
        Insert: {
          id?: string
          lead_count?: number
          reason?: string | null
          sent_at?: string
        }
        Update: {
          id?: string
          lead_count?: number
          reason?: string | null
          sent_at?: string
        }
        Relationships: []
      }
      sig_icp_examples: {
        Row: {
          body: string
          created_at: string
          embedding: string | null
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          embedding?: string | null
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          embedding?: string | null
          id?: string
        }
        Relationships: []
      }
      sig_items: {
        Row: {
          author_handle: string | null
          author_url: string | null
          body: string | null
          captured_at: string
          captured_via: string
          external_url: string | null
          id: string
          platform: string
          posted_at: string | null
          raw: Json
          source_id: string | null
          status: string
          title: string | null
        }
        Insert: {
          author_handle?: string | null
          author_url?: string | null
          body?: string | null
          captured_at?: string
          captured_via?: string
          external_url?: string | null
          id?: string
          platform: string
          posted_at?: string | null
          raw?: Json
          source_id?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          author_handle?: string | null
          author_url?: string | null
          body?: string | null
          captured_at?: string
          captured_via?: string
          external_url?: string | null
          id?: string
          platform?: string
          posted_at?: string | null
          raw?: Json
          source_id?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sig_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sig_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sig_items_backup_20260622: {
        Row: {
          author_handle: string | null
          author_url: string | null
          body: string | null
          captured_at: string | null
          captured_via: string | null
          external_url: string | null
          id: string | null
          platform: string | null
          posted_at: string | null
          raw: Json | null
          source_id: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          author_handle?: string | null
          author_url?: string | null
          body?: string | null
          captured_at?: string | null
          captured_via?: string | null
          external_url?: string | null
          id?: string | null
          platform?: string | null
          posted_at?: string | null
          raw?: Json | null
          source_id?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          author_handle?: string | null
          author_url?: string | null
          body?: string | null
          captured_at?: string | null
          captured_via?: string | null
          external_url?: string | null
          id?: string | null
          platform?: string | null
          posted_at?: string | null
          raw?: Json | null
          source_id?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      sig_keywords: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          term: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          term: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          term?: string
        }
        Relationships: []
      }
      sig_lead_events: {
        Row: {
          actor_email: string | null
          created_at: string
          detail: Json
          id: string
          kind: string
          lead_id: string
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          lead_id: string
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sig_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sig_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sig_lead_events_backup_20260622: {
        Row: {
          actor_email: string | null
          created_at: string | null
          detail: Json | null
          id: string | null
          kind: string | null
          lead_id: string | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string | null
          detail?: Json | null
          id?: string | null
          kind?: string | null
          lead_id?: string | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string | null
          detail?: Json | null
          id?: string | null
          kind?: string | null
          lead_id?: string | null
        }
        Relationships: []
      }
      sig_leads: {
        Row: {
          assignee: string | null
          channel: string
          contact_company: string | null
          contact_details: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          draft: string | null
          draft_model: string | null
          id: string
          item_id: string
          notes: string | null
          outcome: string | null
          send_method: string | null
          sent_at: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          channel?: string
          contact_company?: string | null
          contact_details?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          draft?: string | null
          draft_model?: string | null
          id?: string
          item_id: string
          notes?: string | null
          outcome?: string | null
          send_method?: string | null
          sent_at?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          channel?: string
          contact_company?: string | null
          contact_details?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          draft?: string | null
          draft_model?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          outcome?: string | null
          send_method?: string | null
          sent_at?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sig_leads_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "sig_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sig_leads_backup_20260622: {
        Row: {
          assignee: string | null
          channel: string | null
          created_at: string | null
          draft: string | null
          draft_model: string | null
          id: string | null
          item_id: string | null
          outcome: string | null
          send_method: string | null
          sent_at: string | null
          stage: string | null
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          channel?: string | null
          created_at?: string | null
          draft?: string | null
          draft_model?: string | null
          id?: string | null
          item_id?: string | null
          outcome?: string | null
          send_method?: string | null
          sent_at?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          channel?: string | null
          created_at?: string | null
          draft?: string | null
          draft_model?: string | null
          id?: string | null
          item_id?: string | null
          outcome?: string | null
          send_method?: string | null
          sent_at?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sig_scores: {
        Row: {
          competitor: string | null
          geo: string | null
          intent: number | null
          item_id: string
          model: string | null
          pain_tags: string[]
          relevance: number | null
          role: string | null
          scored_at: string
        }
        Insert: {
          competitor?: string | null
          geo?: string | null
          intent?: number | null
          item_id: string
          model?: string | null
          pain_tags?: string[]
          relevance?: number | null
          role?: string | null
          scored_at?: string
        }
        Update: {
          competitor?: string | null
          geo?: string | null
          intent?: number | null
          item_id?: string
          model?: string | null
          pain_tags?: string[]
          relevance?: number | null
          role?: string | null
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sig_scores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "sig_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sig_scores_backup_20260622: {
        Row: {
          competitor: string | null
          geo: string | null
          intent: number | null
          item_id: string | null
          model: string | null
          pain_tags: string[] | null
          relevance: number | null
          role: string | null
          scored_at: string | null
        }
        Insert: {
          competitor?: string | null
          geo?: string | null
          intent?: number | null
          item_id?: string | null
          model?: string | null
          pain_tags?: string[] | null
          relevance?: number | null
          role?: string | null
          scored_at?: string | null
        }
        Update: {
          competitor?: string | null
          geo?: string | null
          intent?: number | null
          item_id?: string | null
          model?: string | null
          pain_tags?: string[] | null
          relevance?: number | null
          role?: string | null
          scored_at?: string | null
        }
        Relationships: []
      }
      sig_settings: {
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
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      sig_sources: {
        Row: {
          cadence_minutes: number | null
          captured_via: string
          created_at: string
          enabled: boolean
          id: string
          last_polled_at: string | null
          platform: string
          query: string | null
          updated_at: string
        }
        Insert: {
          cadence_minutes?: number | null
          captured_via?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_polled_at?: string | null
          platform: string
          query?: string | null
          updated_at?: string
        }
        Update: {
          cadence_minutes?: number | null
          captured_via?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_polled_at?: string | null
          platform?: string
          query?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      support_contacts: {
        Row: {
          created_at: string
          discord_user_id: string | null
          discord_username: string | null
          email: string | null
          id: string
          last_seen_at: string
        }
        Insert: {
          created_at?: string
          discord_user_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      support_feedback: {
        Row: {
          channel: string | null
          comment: string | null
          contact_id: string | null
          conversation_ref: string | null
          created_at: string
          id: string
          rating: string
          source: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_ref?: string | null
          created_at?: string
          id?: string
          rating: string
          source: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_ref?: string | null
          created_at?: string
          id?: string
          rating?: string
          source?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_feedback_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "support_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author: string
          body: string
          created_at: string
          delivered_to_channel_at: string | null
          id: string
          ticket_id: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          delivered_to_channel_at?: string | null
          id?: string
          ticket_id: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          delivered_to_channel_at?: string | null
          id?: string
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
          bot_confidence: string | null
          bot_reason: string | null
          channel: string
          channel_thread_ref: string
          contact_id: string
          created_at: string
          first_message: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          bot_confidence?: string | null
          bot_reason?: string | null
          channel: string
          channel_thread_ref: string
          contact_id: string
          created_at?: string
          first_message: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          bot_confidence?: string | null
          bot_reason?: string | null
          channel?: string
          channel_thread_ref?: string
          contact_id?: string
          created_at?: string
          first_message?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "support_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          email: string
          id: string
          referred_by: string | null
          signed_up_at: string | null
          slug: string | null
          source: string | null
        }
        Insert: {
          email: string
          id?: string
          referred_by?: string | null
          signed_up_at?: string | null
          slug?: string | null
          source?: string | null
        }
        Update: {
          email?: string
          id?: string
          referred_by?: string | null
          signed_up_at?: string | null
          slug?: string | null
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _normalize_email: { Args: { p_email: string }; Returns: string }
      add_sig_icp_example: { Args: { p_body: string }; Returns: string }
      admin_audit_facets: {
        Args: never
        Returns: {
          actions: string[]
          actors: string[]
        }[]
      }
      admin_discord_erase: {
        Args: { p_discord_user_id?: string; p_email?: string }
        Returns: Json
      }
      admin_events_daily: {
        Args: { p_since?: string }
        Returns: {
          day: string
          identified: number
          total: number
        }[]
      }
      admin_funnel: {
        Args: { p_since?: string; p_until?: string }
        Returns: {
          stage: string
          stage_order: number
          visitors: number
        }[]
      }
      admin_list_audit: {
        Args: {
          p_action?: string
          p_actor?: string
          p_limit?: number
          p_since?: string
        }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          id: string
          payload: Json
          target_id: string
          target_type: string
        }[]
      }
      admin_list_discord_links: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          confirmed_at: string
          created_at: string
          discord_channel_id: string
          discord_user_id: string
          discord_username: string
          email_normalized: string
          id: string
          initiated_from: string
          revoked_at: string
          scopes: Json
          status: string
        }[]
      }
      admin_list_events: {
        Args: { p_event_name?: string; p_limit?: number; p_since?: string }
        Returns: {
          actor_email: string
          anon_id: string
          created_at: string
          event_name: string
          id: string
          props: Json
          source: string
        }[]
      }
      admin_list_waitlist: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          row_data: Json
          signed_up_at: string
        }[]
      }
      admin_waitlist_daily: {
        Args: { p_days?: number }
        Returns: {
          day: string
          signups: number
        }[]
      }
      admin_waitlist_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          referred_count: number
          referrer_email: string
          referrer_slug: string
        }[]
      }
      admin_waitlist_sources: {
        Args: never
        Returns: {
          signups: number
          source: string
        }[]
      }
      append_message: {
        Args: { p_author: string; p_body: string; p_ticket_id: string }
        Returns: string
      }
      attach_discord_channel: {
        Args: { p_discord_channel_id: string; p_discord_user_id: string }
        Returns: undefined
      }
      changelog_digest: { Args: { p_days?: number }; Returns: Json }
      changelog_trigger_digest: { Args: never; Returns: undefined }
      confirm_discord_link: {
        Args: {
          p_discord_user_id?: string
          p_discord_username?: string
          p_email?: string
          p_raw_token: string
        }
        Returns: {
          discord_user_id: string
          email_normalized: string
          link_id: string
        }[]
      }
      create_prompt_version: {
        Args: { p_body: string; p_notes?: string }
        Returns: string
      }
      create_ticket: {
        Args: {
          p_bot_confidence?: string
          p_bot_reason?: string
          p_bot_reply: string
          p_channel: string
          p_channel_thread_ref: string
          p_discord_user_id: string
          p_discord_username: string
          p_email: string
          p_first_message: string
          p_priority?: string
          p_subject: string
          p_topic?: string
        }
        Returns: string
      }
      create_voice_version: {
        Args: { p_body: string; p_notes?: string }
        Returns: string
      }
      delete_sig_icp_example: { Args: { p_id: string }; Returns: undefined }
      delete_sig_source: { Args: { p_id: string }; Returns: undefined }
      discord_dm_append: {
        Args: {
          p_bot_msg: string
          p_discord_user_id: string
          p_user_msg: string
        }
        Returns: number
      }
      discord_dm_disconnect: {
        Args: { p_discord_user_id: string }
        Returns: undefined
      }
      discord_dm_erase: { Args: { p_discord_user_id: string }; Returns: Json }
      discord_dm_load: {
        Args: { p_discord_user_id: string; p_limit?: number }
        Returns: Json
      }
      discord_dm_set_summary: {
        Args: { p_discord_user_id: string; p_keep?: number; p_summary: string }
        Returns: undefined
      }
      email_activity: { Args: { p_days?: number }; Returns: Json }
      email_dispatch_tick: { Args: never; Returns: undefined }
      fetch_undelivered_admin_messages: {
        Args: never
        Returns: {
          body: string
          channel: string
          channel_thread_ref: string
          message_id: string
          ticket_id: string
          ticket_status: string
          ticket_subject: string
        }[]
      }
      get_analytics: { Args: never; Returns: Json }
      get_feedback_for_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      get_live_prompt: {
        Args: never
        Returns: {
          body: string
          id: string
          updated_at: string
          version: number
        }[]
      }
      get_live_voice: {
        Args: never
        Returns: {
          body: string
          id: string
          updated_at: string
          version: number
        }[]
      }
      get_sig_lead: { Args: { p_lead_id: string }; Returns: Json }
      get_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      get_user_context_for_discord: {
        Args: { p_discord_user_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_super: { Args: never; Returns: boolean }
      list_prompts: {
        Args: never
        Returns: {
          body: string
          created_at: string
          created_by: string
          created_by_email: string
          id: string
          is_live: boolean
          notes: string
          version: number
        }[]
      }
      list_recent_feedback: {
        Args: { p_limit?: number }
        Returns: {
          channel: string
          comment: string
          created_at: string
          id: string
          rating: string
          source: string
          ticket_id: string
          ticket_subject: string
        }[]
      }
      list_sig_icp_examples: {
        Args: never
        Returns: {
          body: string
          created_at: string
          has_embedding: boolean
          id: string
        }[]
      }
      list_sig_items: {
        Args: {
          p_limit?: number
          p_min_intent?: number
          p_platform?: string
          p_status?: string
        }
        Returns: {
          author_handle: string
          body: string
          captured_at: string
          captured_via: string
          competitor: string
          external_url: string
          geo: string
          id: string
          intent: number
          pain_tags: string[]
          platform: string
          posted_at: string
          relevance: number
          role: string
          status: string
          title: string
        }[]
      }
      list_sig_keywords: {
        Args: never
        Returns: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          term: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sig_keywords"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_sig_leads: {
        Args: { p_limit?: number; p_stage?: string }
        Returns: {
          author_handle: string
          channel: string
          competitor: string
          created_at: string
          external_url: string
          has_draft: boolean
          id: string
          intent: number
          item_id: string
          platform: string
          sent_at: string
          stage: string
          title: string
        }[]
      }
      list_sig_settings: {
        Args: never
        Returns: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "sig_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_sig_sources: {
        Args: never
        Returns: {
          cadence_minutes: number | null
          captured_via: string
          created_at: string
          enabled: boolean
          id: string
          last_polled_at: string | null
          platform: string
          query: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sig_sources"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_tickets: {
        Args: { p_status?: string }
        Returns: {
          channel: string
          contact_discord: string
          contact_email: string
          created_at: string
          first_message: string
          id: string
          message_count: number
          priority: string
          status: string
          subject: string
          topic: string
          updated_at: string
        }[]
      }
      list_voice: {
        Args: never
        Returns: {
          body: string
          created_at: string
          created_by: string
          created_by_email: string
          id: string
          is_live: boolean
          notes: string
          version: number
        }[]
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_payload?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
      mark_sig_lead_sent: {
        Args: { p_channel?: string; p_lead_id: string }
        Returns: undefined
      }
      mint_discord_link_token: {
        Args: {
          p_discord_user_id?: string
          p_discord_username?: string
          p_email?: string
          p_initiated_from?: string
        }
        Returns: {
          expires_at: string
          link_id: string
          raw_token: string
        }[]
      }
      penny_site_chats_purge: { Args: never; Returns: undefined }
      referral_count: { Args: { p_slug: string }; Returns: number }
      reply_to_ticket: {
        Args: { p_body: string; p_resolve?: boolean; p_ticket_id: string }
        Returns: string
      }
      revoke_discord_link: {
        Args: { p_discord_user_id?: string; p_email?: string }
        Returns: number
      }
      save_sig_lead_card: {
        Args: {
          p_contact_company?: string
          p_contact_details?: string
          p_contact_email?: string
          p_contact_name?: string
          p_draft: string
          p_lead_id: string
          p_notes?: string
          p_stage: string
        }
        Returns: undefined
      }
      save_sig_lead_draft: {
        Args: { p_draft: string; p_lead_id: string }
        Returns: undefined
      }
      set_live_prompt: { Args: { p_id: string }; Returns: undefined }
      set_live_voice: { Args: { p_id: string }; Returns: undefined }
      set_sig_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      set_ticket_topic: {
        Args: { p_ticket_id: string; p_topic: string }
        Returns: undefined
      }
      sig_analytics_pipeline: { Args: { p_days?: number }; Returns: Json }
      sig_analytics_themes: {
        Args: { p_days?: number; p_gran?: string }
        Returns: Json
      }
      sig_claim_pending: {
        Args: { p_limit?: number }
        Returns: {
          author_handle: string | null
          author_url: string | null
          body: string | null
          captured_at: string
          captured_via: string
          external_url: string | null
          id: string
          platform: string
          posted_at: string | null
          raw: Json
          source_id: string | null
          status: string
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "sig_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sig_digest: { Args: { p_hours?: number }; Returns: Json }
      sig_digest_window_hours: { Args: { p_cap?: number }; Returns: number }
      sig_due_sources: {
        Args: never
        Returns: {
          cadence_minutes: number | null
          captured_via: string
          created_at: string
          enabled: boolean
          id: string
          last_polled_at: string | null
          platform: string
          query: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sig_sources"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sig_ingest_item: {
        Args: {
          p_author_handle?: string
          p_author_url?: string
          p_body?: string
          p_captured_via?: string
          p_external_url?: string
          p_platform: string
          p_posted_at?: string
          p_raw?: Json
          p_source_id?: string
          p_title?: string
        }
        Returns: string
      }
      sig_mark_source_polled: { Args: { p_id: string }; Returns: undefined }
      sig_quick_add_item: {
        Args: {
          p_author_handle?: string
          p_author_url?: string
          p_body?: string
          p_external_url?: string
          p_platform: string
          p_title?: string
        }
        Returns: string
      }
      sig_relevance: { Args: { p_embedding: string }; Returns: number }
      sig_set_example_embedding: {
        Args: { p_embedding: string; p_id: string }
        Returns: undefined
      }
      sig_set_lead_draft: {
        Args: { p_draft: string; p_lead_id: string; p_model?: string }
        Returns: undefined
      }
      sig_source_counts: {
        Args: never
        Returns: {
          n: number
          source_id: string
        }[]
      }
      sig_submit_score: {
        Args: {
          p_competitor?: string
          p_contact_company?: string
          p_contact_name?: string
          p_geo?: string
          p_intent: number
          p_item_id: string
          p_model?: string
          p_pain_tags?: string[]
          p_promote?: boolean
          p_relevance: number
          p_role?: string
        }
        Returns: string
      }
      sig_trigger_digest: { Args: never; Returns: undefined }
      sig_unembedded_examples: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          id: string
        }[]
      }
      signup_to_waitlist: {
        Args: {
          p_email: string
          p_referred_by?: string
          p_slug_seed?: string
          p_source?: string
        }
        Returns: {
          already_on_list: boolean
          slug: string
        }[]
      }
      submit_feedback: {
        Args: {
          p_channel?: string
          p_comment?: string
          p_contact_email?: string
          p_conversation_ref?: string
          p_discord_user_id?: string
          p_rating?: string
          p_source: string
          p_ticket_id?: string
        }
        Returns: string
      }
      track_event: {
        Args: {
          p_anon_id?: string
          p_event_name: string
          p_path?: string
          p_props?: Json
          p_referrer?: string
          p_source?: string
          p_user_agent?: string
        }
        Returns: string
      }
      update_sig_lead_stage: {
        Args: { p_lead_id: string; p_stage: string }
        Returns: undefined
      }
      upsert_sig_keyword: {
        Args: {
          p_enabled?: boolean
          p_id?: string
          p_kind: string
          p_term: string
        }
        Returns: string
      }
      upsert_sig_source: {
        Args: {
          p_cadence_minutes?: number
          p_captured_via?: string
          p_enabled?: boolean
          p_id?: string
          p_platform: string
          p_query?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
