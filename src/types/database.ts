
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage": {
                  Row: {
                    "count": number,"created_at": string,"day": string,"scope": string,"scope_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"created_at"?: string,"day": string,"scope": string,"scope_id": string
                  }
                  Update: {
                    "count"?: number,"created_at"?: string,"day"?: string,"scope"?: string,"scope_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"expense_id": string,"id": string,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"expense_id": string,"id"?: string,"room_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"expense_id"?: string,"id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_expense_id_room_id_fkey"
      columns: ["expense_id","room_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"expense_history": {
                  Row: {
                    "action": string,"actor_id": string | null,"at": string,"created_at": string,"expense_id": string,"id": string,"room_id": string,"snapshot": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"at"?: string,"created_at"?: string,"expense_id": string,"id"?: string,"room_id": string,"snapshot": NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"at"?: string,"created_at"?: string,"expense_id"?: string,"id"?: string,"room_id"?: string,"snapshot"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_history_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_history_expense_id_room_id_fkey"
      columns: ["expense_id","room_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"expense_items": {
                  Row: {
                    "amount_original": number,"created_at": string,"expense_id": string,"id": string,"is_adjustment": boolean,"krw_amount": number | null,"name_ko": string | null,"name_original": string,"needs_review": boolean,"position": number,"quantity": number,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_original": number,"created_at"?: string,"expense_id": string,"id"?: string,"is_adjustment"?: boolean,"krw_amount"?: number | null,"name_ko"?: string | null,"name_original": string,"needs_review"?: boolean,"position": number,"quantity"?: number,"room_id": string
                  }
                  Update: {
                    "amount_original"?: number,"created_at"?: string,"expense_id"?: string,"id"?: string,"is_adjustment"?: boolean,"krw_amount"?: number | null,"name_ko"?: string | null,"name_original"?: string,"needs_review"?: boolean,"position"?: number,"quantity"?: number,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_items_expense_id_room_id_fkey"
      columns: ["expense_id","room_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"expense_photos": {
                  Row: {
                    "created_at": string,"expense_id": string,"id": string,"kind": string,"room_id": string,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expense_id": string,"id"?: string,"kind": string,"room_id": string,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"expense_id"?: string,"id"?: string,"kind"?: string,"room_id"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_photos_expense_id_room_id_fkey"
      columns: ["expense_id","room_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"expense_scope": {
                  Row: {
                    "created_at": string,"expense_id": string,"member_id": string,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expense_id": string,"member_id": string,"room_id": string
                  }
                  Update: {
                    "created_at"?: string,"expense_id"?: string,"member_id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_scope_expense_id_room_id_fkey"
      columns: ["expense_id","room_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "expense_scope_member_id_room_id_fkey"
      columns: ["member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "ai_result": Json | null,"amount_original": number,"card_last4": string | null,"category": string | null,"created_at": string,"created_by": string,"currency": string,"deleted_at": string | null,"deleted_by": string | null,"fx_base_date": string | null,"fx_rate": number | null,"fx_source": string,"id": string,"krw_amount": number | null,"krw_charged": number | null,"merchant": string | null,"needs_review": boolean,"paid_local_date": string,"paid_local_time": string | null,"payer_kind": string,"payer_member_id": string | null,"room_id": string,"source": string,"updated_by": string | null,"version": number,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_result"?: Json | null,"amount_original": number,"card_last4"?: string | null,"category"?: string | null,"created_at"?: string,"created_by": string,"currency": string,"deleted_at"?: string | null,"deleted_by"?: string | null,"fx_base_date"?: string | null,"fx_rate"?: number | null,"fx_source": string,"id"?: string,"krw_amount"?: number | null,"krw_charged"?: number | null,"merchant"?: string | null,"needs_review"?: boolean,"paid_local_date": string,"paid_local_time"?: string | null,"payer_kind": string,"payer_member_id"?: string | null,"room_id": string,"source": string,"updated_by"?: string | null,"version"?: number,"visibility"?: string
                  }
                  Update: {
                    "ai_result"?: Json | null,"amount_original"?: number,"card_last4"?: string | null,"category"?: string | null,"created_at"?: string,"created_by"?: string,"currency"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"fx_base_date"?: string | null,"fx_rate"?: number | null,"fx_source"?: string,"id"?: string,"krw_amount"?: number | null,"krw_charged"?: number | null,"merchant"?: string | null,"needs_review"?: boolean,"paid_local_date"?: string,"paid_local_time"?: string | null,"payer_kind"?: string,"payer_member_id"?: string | null,"room_id"?: string,"source"?: string,"updated_by"?: string | null,"version"?: number,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_payer_member_id_room_id_fkey"
      columns: ["payer_member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "expenses_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "base_date": string,"created_at": string,"currency": string,"fetched_at": string,"rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_date": string,"created_at"?: string,"currency": string,"fetched_at"?: string,"rate": number
                  }
                  Update: {
                    "base_date"?: string,"created_at"?: string,"currency"?: string,"fetched_at"?: string,"rate"?: number
                  }
                  Relationships: [
                    
                  ]
                },"item_assignees": {
                  Row: {
                    "created_at": string,"item_id": string,"member_id": string,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"member_id": string,"room_id": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"member_id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_assignees_item_id_room_id_fkey"
      columns: ["item_id","room_id"]
isOneToOne: false
      referencedRelation: "expense_items"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "item_assignees_member_id_room_id_fkey"
      columns: ["member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "account_enc": string,"account_last4": string,"bank_code": string,"bank_name": string,"created_at": string,"holder_name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_enc": string,"account_last4": string,"bank_code": string,"bank_name": string,"created_at"?: string,"holder_name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_enc"?: string,"account_last4"?: string,"bank_code"?: string,"bank_name"?: string,"created_at"?: string,"holder_name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_reveals": {
                  Row: {
                    "at": string,"created_at": string,"id": string,"owner_id": string,"room_id": string,"viewer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"created_at"?: string,"id"?: string,"owner_id": string,"room_id": string,"viewer_id": string
                  }
                  Update: {
                    "at"?: string,"created_at"?: string,"id"?: string,"owner_id"?: string,"room_id"?: string,"viewer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_reveals_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_reveals_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_reveals_viewer_id_fkey"
      columns: ["viewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pool_deposits": {
                  Row: {
                    "amount_krw": number,"created_at": string,"created_by": string | null,"id": string,"member_id": string,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_krw": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id": string,"room_id": string
                  }
                  Update: {
                    "amount_krw"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pool_deposits_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pool_deposits_member_id_room_id_fkey"
      columns: ["member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "pool_deposits_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "age14_confirmed_at": string | null,"ai_notice_ack_at": string | null,"avatar_url": string | null,"created_at": string,"deleted_at": string | null,"id": string,"marketing_opt_in": boolean,"marketing_opt_in_at": string | null,"nickname": string,"overseas_notice_ack_at": string | null,"terms_agreed_at": string | null,"terms_version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "age14_confirmed_at"?: string | null,"ai_notice_ack_at"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id": string,"marketing_opt_in"?: boolean,"marketing_opt_in_at"?: string | null,"nickname"?: string,"overseas_notice_ack_at"?: string | null,"terms_agreed_at"?: string | null,"terms_version"?: string | null
                  }
                  Update: {
                    "age14_confirmed_at"?: string | null,"ai_notice_ack_at"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"marketing_opt_in"?: boolean,"marketing_opt_in_at"?: string | null,"nickname"?: string,"overseas_notice_ack_at"?: string | null,"terms_agreed_at"?: string | null,"terms_version"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"room_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"room_id": string,"target_member_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"room_id": string,"target_member_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"room_id"?: string,"target_member_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_events_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_events_target_member_id_room_id_fkey"
      columns: ["target_member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    }
                  ]
                },"room_fx_overrides": {
                  Row: {
                    "created_at": string,"currency": string,"rate": number,"room_id": string,"set_at": string,"set_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency": string,"rate": number,"room_id": string,"set_at"?: string,"set_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"rate"?: number,"room_id"?: string,"set_at"?: string,"set_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_fx_overrides_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_fx_overrides_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"room_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"guest_name": string | null,"id": string,"joined_at": string,"kind": string,"left_at": string | null,"removed_by": string | null,"representative_member_id": string | null,"room_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"guest_name"?: string | null,"id"?: string,"joined_at"?: string,"kind": string,"left_at"?: string | null,"removed_by"?: string | null,"representative_member_id"?: string | null,"room_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"guest_name"?: string | null,"id"?: string,"joined_at"?: string,"kind"?: string,"left_at"?: string | null,"removed_by"?: string | null,"representative_member_id"?: string | null,"room_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_members_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_representative_member_id_room_id_fkey"
      columns: ["representative_member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "room_members_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "base_currency": string,"created_at": string,"deleted_at": string | null,"end_date": string | null,"id": string,"invite_token": string,"name": string,"owner_id": string,"pool_card_last4": (string)[],"pool_enabled": boolean,"pool_owner_member_id": string | null,"start_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "base_currency": string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id"?: string,"invite_token": string,"name": string,"owner_id": string,"pool_card_last4"?: (string)[],"pool_enabled"?: boolean,"pool_owner_member_id"?: string | null,"start_date"?: string | null
                  }
                  Update: {
                    "base_currency"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id"?: string,"invite_token"?: string,"name"?: string,"owner_id"?: string,"pool_card_last4"?: (string)[],"pool_enabled"?: boolean,"pool_owner_member_id"?: string | null,"start_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rooms_pool_owner_member_id_fkey"
      columns: ["pool_owner_member_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id"]
    }
                  ]
                },"transfers": {
                  Row: {
                    "amount_krw": number,"confirmed_at": string | null,"created_at": string,"from_member_id": string,"id": string,"recorded_by": string | null,"room_id": string,"to_member_id": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_krw": number,"confirmed_at"?: string | null,"created_at"?: string,"from_member_id": string,"id"?: string,"recorded_by"?: string | null,"room_id": string,"to_member_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_krw"?: number,"confirmed_at"?: string | null,"created_at"?: string,"from_member_id"?: string,"id"?: string,"recorded_by"?: string | null,"room_id"?: string,"to_member_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfers_from_member_id_room_id_fkey"
      columns: ["from_member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "transfers_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_to_member_id_room_id_fkey"
      columns: ["to_member_id","room_id"]
isOneToOne: false
      referencedRelation: "room_members"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "transfers_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "member_profiles": {
                  Row: {
                    "avatar_url": string | null,"id": string | null,"nickname": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_allocate_items":
{ Args: { "p_expense_id": string }; Returns: undefined
                           },
"_check_guest_rep":
{ Args: { "p_rep": string,"p_room_id": string }; Returns: undefined
                           },
"_expense_snapshot":
{ Args: { "p_expense_id": string }; Returns: Json
                           },
"_lock_guest":
{ Args: { "p_member_id": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"guest_name": string | null,
"id": string,
"joined_at": string,
"kind": string,
"left_at": string | null,
"removed_by": string | null,
"representative_member_id": string | null,
"room_id": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "room_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"_lock_transfer":
{ Args: { "p_id": string,"p_side": string }; Returns: {
              "amount_krw": number,
"confirmed_at": string | null,
"created_at": string,
"from_member_id": string,
"id": string,
"recorded_by": string | null,
"room_id": string,
"to_member_id": string,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "transfers"
        isOneToOne: true
        isSetofReturn: false
      } },
"_lookup_fx":
{ Args: { "p_currency": string,"p_date": string }; Returns: {
              "base_date": string,"rate": number
            }[]
                           },
"_payout_key":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_record_history":
{ Args: { "p_action": string,"p_expense_id": string }; Returns: undefined
                           },
"add_guest":
{ Args: { "p_name": string,"p_representative_member_id"?: string,"p_room_id": string }; Returns: string
                           },
"can_read_expense":
{ Args: { "p_expense_id": string }; Returns: boolean
                           },
"can_read_item":
{ Args: { "p_item_id": string }; Returns: boolean
                           },
"cancel_transfer":
{ Args: { "p_id": string }; Returns: undefined
                           },
"confirm_transfer":
{ Args: { "p_id": string }; Returns: undefined
                           },
"consume_ai_quota":
{ Args: { "p_global_limit": number,"p_room_id": string }; Returns: undefined
                           },
"create_room":
{ Args: { "p_base_currency": string,"p_end_date"?: string,"p_name": string,"p_start_date"?: string }; Returns: string
                           },
"delete_expense":
{ Args: { "p_expected_version": number,"p_id": string }; Returns: undefined
                           },
"expense_history":
{ Args: { "p_expense_id": string }; Returns: Json[]
                           },
"get_payout_account":
{ Args: { "p_owner_member_id": string,"p_room_id": string }; Returns: {
              "account_masked": string,"account_number": string,"bank_name": string,"holder_name": string,"registered": boolean
            }[]
                           },
"is_others_private_expense":
{ Args: { "p_expense_id": string }; Returns: boolean
                           },
"is_room_member":
{ Args: { "p_room_id": string }; Returns: boolean
                           },
"join_room":
{ Args: { "p_token": string }; Returns: string
                           },
"leave_room":
{ Args: { "p_room_id": string }; Returns: undefined
                           },
"member_profile_rows":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"id": string,"nickname": string
            }[]
                           },
"my_member_id":
{ Args: { "p_room_id": string }; Returns: string
                           },
"my_rooms":
{ Args: Record<PropertyKey, never>; Returns: {
              "base_currency": string,"end_date": string,"member_count": number,"my_net": number,"name": string,"room_id": string,"start_date": string,"status": string,"total_krw": number
            }[]
                           },
"new_invite_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"preview_invite":
{ Args: { "p_token": string }; Returns: Json
                           },
"reconfirm_pending_fx":
{ Args: { "p_room_id": string }; Returns: number
                           },
"record_transfer":
{ Args: { "p_amount_krw": number,"p_from_member_id": string,"p_id": string,"p_room_id": string,"p_to_member_id": string }; Returns: undefined
                           },
"reject_transfer":
{ Args: { "p_id": string }; Returns: undefined
                           },
"remove_guest":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"request_payout_account":
{ Args: { "p_owner_member_id": string,"p_room_id": string }; Returns: undefined
                           },
"room_balances":
{ Args: { "p_confirmed_only"?: boolean,"p_room_id": string }; Returns: {
              "fx_pending_count": number,"joined_at": string,"kind": string,"left_at": string,"member_id": string,"net": number,"owed": number,"paid": number,"representative_member_id": string
            }[]
                           },
"rotate_invite":
{ Args: { "p_room_id": string }; Returns: string
                           },
"save_expense":
{ Args: { "p_expected_version"?: number,"p_payload": Json }; Returns: Json
                           },
"set_payout_account":
{ Args: { "p_account_number": string,"p_bank_code": string,"p_bank_name": string,"p_holder_name": string }; Returns: undefined
                           },
"set_pool":
{ Args: { "p_card_last4": (string)[],"p_enabled": boolean,"p_owner_member_id": string,"p_room_id": string }; Returns: undefined
                           },
"update_guest":
{ Args: { "p_member_id": string,"p_name"?: string,"p_representative_member_id"?: string }; Returns: undefined
                           },
"update_room":
{ Args: { "p_base_currency": string,"p_end_date": string,"p_name": string,"p_room_id": string,"p_start_date": string }; Returns: undefined
                           },
"upsert_pool_deposits":
{ Args: { "p_room_id": string,"p_rows": Json }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
