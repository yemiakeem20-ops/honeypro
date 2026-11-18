import { buildPushPayload } from "@block65/webcrypto-web-push";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !secret) return json({ error: "Push service is not configured." }, 500);

  const auth = request.headers.get("Authorization") || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const publishableKey = request.headers.get("apikey") || "";
  if (!accessToken || !publishableKey) return json({ error: "Please sign in again." }, 401);

  const userResponse = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) return json({ error: "Admin session expired. Please sign in again." }, 401);
  const user = await userResponse.json();

  let subscription;
  try { subscription = await request.json(); }
  catch { return json({ error: "Invalid push subscription." }, 400); }
  if (!subscription?.endpoint?.startsWith("https://") ||
      !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return json({ error: "The browser returned an incomplete push subscription." }, 400);
  }

  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const save = await fetch(base + "/rest/v1/honeypro_push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: {
      apikey: secret, Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      user_id: user.id, endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
      updated_at: new Date().toISOString()
    })
  });
  if (!save.ok) {
    console.error("Could not save push subscription:", await save.text());
    return json({ error: "Could not save this phone's notification registration. Check the push subscriptions table." }, 500);
  }
  return json({ ok: true });
}
