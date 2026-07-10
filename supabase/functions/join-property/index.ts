// ============================================================================
// join-property Edge Function — a partner joins a shared property by its share
// code. RLS won't let a stranger read someone else's address by code, so this
// runs with the service role: verify the caller's JWT, match the code, insert a
// property_members row (partner). Returns the joined property summary.
//
// POST { code: string }  ->  { property: { id, nickname } }  |  { error }
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const uid = userData.user.id;

  let code = "";
  try { code = String((await req.json()).code ?? "").trim(); } catch { return json({ error: "bad json" }, 400); }
  if (!code) return json({ error: "code required" }, 400);

  const { data: addr } = await admin.from("addresses")
    .select("id, nickname, user_id, share_code").eq("share_code", code).maybeSingle();
  if (!addr) return json({ error: "Invalid code" }, 404);
  if (addr.user_id === uid) return json({ error: "That's your own property" }, 400);

  // insert membership (idempotent via unique constraint)
  const { error } = await admin.from("property_members")
    .insert({ address_id: addr.id, user_id: uid, role: "partner" });
  // ignore duplicate (already a member)
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    return json({ error: error.message }, 500);
  }

  return json({ property: { id: addr.id, nickname: addr.nickname } });
});
