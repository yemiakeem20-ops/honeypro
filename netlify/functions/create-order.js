
const { createClient } = require("@supabase/supabase-js");

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const {
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY,
    ORDER_NOTIFICATION_EMAIL,
    FROM_EMAIL
  } = process.env;

  const supabaseSecret = SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !supabaseSecret) {
    return json(500, { error: "Order service is not configured yet." });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid order details." });
  }

  const required = ["full_name", "phone", "state", "city", "address"];
  if (required.some(k => typeof input[k] !== "string" || !input[k].trim())) {
    return json(400, { error: "Please complete all required delivery details." });
  }

  const quantity = Number(input.quantity);
  const unit = Number(process.env.HONEYPRO_UNIT_PRICE_NAIRA || 68500);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5 ||
      !Number.isFinite(unit) || unit < 1) {
    return json(400, { error: "Invalid quantity." });
  }

  if (input.consent !== true) {
    return json(400, { error: "Please confirm your order details." });
  }

  const order = {
    full_name: input.full_name.trim().slice(0, 120),
    phone: input.phone.trim().slice(0, 30),
    email: typeof input.email === "string" ? input.email.trim().slice(0, 160) : null,
    state: input.state.trim().slice(0, 80),
    city: input.city.trim().slice(0, 100),
    address: input.address.trim().slice(0, 500),
    delivery_note: typeof input.delivery_note === "string" ? input.delivery_note.trim().slice(0, 500) : null,
    quantity,
    unit_price: unit,
    total_amount: quantity * unit,
    currency: "NGN",
    consent: true,
    source: "website",
    status: "new"
  };

  const supabase = createClient(SUPABASE_URL, supabaseSecret);
  const { data, error } = await supabase
    .from("honeypro_orders")
    .insert(order)
    .select("id,created_at")
    .single();

  if (error) {
    console.error("Supabase order insert failed:", error.message);
    return json(500, { error: "We could not save your order. Please try again." });
  }

  if (RESEND_API_KEY && ORDER_NOTIFICATION_EMAIL) {
    const html = `<h2>New HoneyPro order</h2>
      <p><b>Order:</b> ${data.id}</p>
      <p><b>Customer:</b> ${escapeHtml(order.full_name)}</p>
      <p><b>Phone:</b> ${escapeHtml(order.phone)}</p>
      <p><b>Address:</b> ${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)}</p>
      <p><b>Quantity:</b> ${quantity}</p>
      <p><b>Total:</b> ₦${order.total_amount.toLocaleString("en-NG")}</p>
      <p><b>Note:</b> ${escapeHtml(order.delivery_note || "None")}</p>`;

    try {
      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: FROM_EMAIL || "HoneyPro Orders <onboarding@resend.dev>",
          to: [ORDER_NOTIFICATION_EMAIL],
          subject: `New HoneyPro order — ${order.full_name}`,
          html
        })
      });

      if (!mail.ok) console.error("Email notification failed:", await mail.text());
    } catch (e) {
      console.error("Email notification error:", e.message);
    }
  }

  return json(200, { ok: true, orderId: data.id });
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
