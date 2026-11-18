import { buildPushPayload } from "@block65/webcrypto-web-push";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !secret || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return json({ error: "Push service configuration is incomplete. Check Production variables and secrets." }, 500);
  }

  const auth = request.headers.get("Authorization") || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const publishableKey = request.headers.get("apikey") || "";
  if (!accessToken || !publishableKey) return json({ error: "Please sign in again." }, 401);

  const userResponse = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) return json({ error: "Admin session expired. Please sign in again." }, 401);

  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const list = await fetch(base + "/rest/v1/honeypro_push_subscriptions?select=id,endpoint,p256dh,auth", {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` }
  });
  if (!list.ok) return json({ error: "Could not read saved phone subscriptions: " + (await list.text()).slice(0, 300) }, 500);

  const subscriptions = await list.json();
  if (!subscriptions.length) return json({ error: "No registered phone subscriptions were found." }, 404);

  const results = await Promise.all(subscriptions.map(async sub => {
    try {
      const subscription = {
        endpoint: sub.endpoint, expirationTime: null,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      const payload = await buildPushPayload({
        data: JSON.stringify({
          title: "HoneyPro push test",
          body: "Your HoneyPro admin phone is receiving background notifications.",
          url: "/admin.html",
          tag: "honeypro-push-test"
        }),
        options: { ttl: 60 }
      }, subscription, {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY
      });
      const sent = await fetch(subscription.endpoint, payload);
      const responseText = sent.ok ? "" : (await sent.text()).slice(0, 300);
      return { id: sub.id, ok: sent.ok, status: sent.status, detail: responseText };
    } catch (error) {
      return { id: sub.id, ok: false, error: error?.message || String(error) };
    }
  }));

  return json({ ok: results.some(x => x.ok), results });
}
