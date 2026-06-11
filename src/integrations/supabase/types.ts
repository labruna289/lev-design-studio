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
      analyses: {
        Row: {
          contrast: string | null
          created_at: string
          face_shape: string | null
          finish: string | null
          harmony: number | null
          id: string
          metal: string | null
          notes: string | null
          palette: Json
          season: string | null
          undertone: string | null
          user_id: string
        }
        Insert: {
          contrast?: string | null
          created_at?: string
          face_shape?: string | null
          finish?: string | null
          harmony?: number | null
          id?: string
          metal?: string | null
          notes?: string | null
          palette?: Json
          season?: string | null
          undertone?: string | null
          user_id: string
        }
        Update: {
          contrast?: string | null
          created_at?: string
          face_shape?: string | null
          finish?: string | null
          harmony?: number | null
          id?: string
          metal?: string | null
          notes?: string | null
          palette?: Json
          season?: string | null
          undertone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      looks: {
        Row: {
          blurb: string
          created_at: string
          harmony: number
          id: string
          name: string
          number: string
          occasion: string
          palette: Json
          position: number
          slug: string
          why: string
        }
        Insert: {
          blurb: string
          created_at?: string
          harmony?: number
          id?: string
          name: string
          number: string
          occasion: string
          palette?: Json
          position?: number
          slug: string
          why: string
        }
        Update: {
          blurb?: string
          created_at?: string
          harmony?: number
          id?: string
          name?: string
          number?: string
          occasion?: string
          palette?: Json
          position?: number
          slug?: string
          why?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          house: string
          id: string
          initial: string
          kind: string
          look_id: string
          name: string
          note: string
          position: number
          price: string
        }
        Insert: {
          created_at?: string
          house: string
          id?: string
          initial: string
          kind: string
          look_id: string
          name: string
          note: string
          position?: number
          price: string
        }
        Update: {
          created_at?: string
          house?: string
          id?: string
          initial?: string
          kind?: string
          look_id?: string
          name?: string
          note?: string
          position?: number
          price?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_looks: {
        Row: {
          created_at: string
          id: string
          look_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          look_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          look_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_looks_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          id: string
          look_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          look_id: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          look_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          budget_register: string | null
          created_at: string
          display_name: string | null
          id: string
          style_direction: string | null
          updated_at: string
        }
        Insert: {
          budget_register?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          style_direction?: string | null
          updated_at?: string
        }
        Update: {
          budget_register?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          style_direction?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
