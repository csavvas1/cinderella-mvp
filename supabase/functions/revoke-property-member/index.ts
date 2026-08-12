// ============================================================================
// revoke-property-member — the OWNER of a shared property removes a partner's
// access. RLS lets a member delete only their own row, so removing someone ELSE
// needs the service role. We verify the caller actually owns the address before
// deleting the target's property_members row.
//
// POST { address_id: string, member_uid: string }  ->  { ok: true } | { error }
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

  let addressId = "", memberUid = "";
  try {
    const b = await req.json();
    addressId = String(b.address_id ?? "").trim();
    memberUid = String(b.member_uid ?? "").trim();
  } catch { return json({ error: "bad json" }, 400); }
  if (!addressId || !memberUid) return json({ error: "address_id + member_uid required" }, 400);

  // the caller must OWN the address
  const { data: addr } = await admin.from("addresses").select("user_id").eq("id", addressId).maybeSingle();
  if (!addr) return json({ error: "address not found" }, 404);
  if (addr.user_id !== uid) return json({ error: "not your property" }, 403);

  const { error } = await admin.from("property_members")
    .delete().eq("address_id", addressId).eq("user_id", memberUid);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
