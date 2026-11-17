import { createClient } from "@supabase/supabase-js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": new URL(request.url).origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseSecret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseSecret) {
    return json({ error: "Order service is not configured yet." }, 500);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid order details." }, 400);
  }

  const required = ["full_name", "phone", "state", "city", "address"];
  if (required.some(k => typeof input[k] !== "string" || !input[k].trim())) {
    return json({ error: "Please complete all required delivery details." }, 400);
  }

  const quantity = Number(input.quantity);
  const unit = Number(env.HONEYPRO_UNIT_PRICE_NAIRA || 68500);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5 ||
      !Number.isFinite(unit) || unit < 1) {
    return json({ error: "Invalid quantity." }, 400);
  }

  if (input.consent !== true) {
    return json({ error: "Please confirm your order details." }, 400);
  }

  const order = {
    full_name: input.full_name.trim().slice(0, 120),
    phone: input.phone.trim().slice(0, 30),
    whatsapp_number: typeof input.whatsapp_number === "string"
      ? input.whatsapp_number.trim().slice(0, 30) || null : null,
    email: typeof input.email === "string" ? input.email.trim().slice(0, 160) || null : null,
    state: input.state.trim().slice(0, 80),
    city: input.city.trim().slice(0, 100),
    address: input.address.trim().slice(0, 500),
    delivery_note: typeof input.delivery_note === "string"
      ? input.delivery_note.trim().slice(0, 500) || null : null,
    quantity,
    unit_price: unit,
    total_amount: quantity * unit,
    currency: "NGN",
    consent: true,
    source: "website",
    status: "new"
  };

  const supabase = createClient(env.SUPABASE_URL, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from("honeypro_orders")
    .insert(order)
    .select("id,created_at")
    .single();

  if (error) {
    console.error("Supabase order insert failed:", error.message);
    return json({ error: "We could not save your order. Please try again." }, 500);
  }

  if (env.RESEND_API_KEY && env.ORDER_NOTIFICATION_EMAIL) {
    const html = `<h2>New HoneyPro order</h2>
      <p><b>Order:</b> ${escapeHtml(data.id)}</p>
      <p><b>Customer:</b> ${escapeHtml(order.full_name)}</p>
      <p><b>Phone:</b> ${escapeHtml(order.phone)}</p>
      <p><b>WhatsApp:</b> ${escapeHtml(order.whatsapp_number || "Not provided")}</p>
      <p><b>Address:</b> ${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)}</p>
      <p><b>Quantity:</b> ${quantity}</p>
      <p><b>Total:</b> ₦${order.total_amount.toLocaleString("en-NG")}</p>
      <p><b>Note:</b> ${escapeHtml(order.delivery_note || "None")}</p>`;

    try {
      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL || "HoneyPro Orders <onboarding@resend.dev>",
          to: [env.ORDER_NOTIFICATION_EMAIL],
          subject: `New HoneyPro order — ${order.full_name}`,
          html
        })
      });
      if (!mail.ok) console.error("Email notification failed:", await mail.text());
    } catch (error) {
      console.error("Email notification error:", error.message);
    }
  }

  return json({ ok: true, orderId: data.id });
}
