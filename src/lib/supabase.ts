import { createClient } from "@supabase/supabase-js";

// Frontend-safe client. Uses the publishable/anon key only — every table is
// protected by row-level security (see the schema), so this key can be shipped
// in the browser. The secret/service key must NEVER appear in frontend code.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.");
}

export const supabase = createClient(url, anonKey);
