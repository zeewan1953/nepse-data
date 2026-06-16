import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _admin: SupabaseClient | null = null;
let _public: SupabaseClient | null = null;

/**
 * Admin client — uses service role key, bypasses RLS.
 * Use ONLY in server-side API routes, NEVER on the client.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_admin) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars");
      }
      _admin = createClient(
        supabaseUrl,
        supabaseServiceKey || supabaseAnonKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
    }
    return Reflect.get(_admin, prop);
  },
});

/**
 * Public client — uses anon key, respects RLS.
 */
export const supabasePublic: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_public) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars");
      }
      _public = createClient(supabaseUrl, supabaseAnonKey);
    }
    return Reflect.get(_public, prop);
  },
});
