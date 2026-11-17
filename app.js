const cfg = window.HONEYPRO_CONFIG || {};
const unitPrice = Number(cfg.unitPriceNaira || 68500);
const money = n => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n);
const quantity = document.getElementById("quantity");
const totalPrice = document.getElementById("totalPrice");
function updatePrice(){
  const total = unitPrice * Number(quantity.value || 1);
  document.getElementById("unitPrice").textContent = money(unitPrice);
  totalPrice.textContent = money(total);
  document.getElementById("stickyPrice").textContent = money(unitPrice);
}
quantity.addEventListener("change",updatePrice); updatePrice();
document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("orderForm");
const msg = document.getElementById("formMessage");
const button = document.getElementById("submitButton");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  msg.className = "form-message"; msg.textContent = "";
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const qty = Number(data.quantity);
  const order = {
    full_name: data.fullName.trim(),
    phone: data.phone.trim(),
    whatsapp_number: data.whatsappNumber.trim() || null,
    email: data.email.trim() || null,
    state: data.state.trim(),
    city: data.city.trim(),
    address: data.address.trim(),
    delivery_note: data.deliveryNote.trim() || null,
    quantity: qty,
    unit_price: unitPrice,
    total_amount: unitPrice * qty,
    currency: "NGN",
    consent: true,
    source: "website",
    status: "new"
  };
  button.disabled = true; button.textContent = "Submitting your order…";
  try {
    const response = await fetch("/api/create-order", {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(order)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "We couldn't submit your order. Please try again.");
    if (typeof window.fbq === "function") {
  window.fbq("track", "Lead", {
    content_name: "HoneyPro 5L Honey",
    currency: "NGN",
    value: order.total_amount
  });
}

if (window.ttq && typeof window.ttq.track === "function") {
  window.ttq.track("SubmitForm", {
    content_name: "HoneyPro 5L Honey",
    currency: "NGN",
    value: order.total_amount
  });
}
    form.reset(); updatePrice();
    msg.className = "form-message success";
    msg.textContent = "Thank you! Your order has been received. Our team will call you to confirm delivery. Please keep your phone available.";
    msg.scrollIntoView({behavior:"smooth",block:"center"});
  } catch (error) {
    msg.className = "form-message error";
    msg.textContent = error.message || "Something went wrong. Please try again or contact us.";
  } finally {
    button.disabled = false; button.textContent = "Place My Order — Pay on Delivery";
  }
});
