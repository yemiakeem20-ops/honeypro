const cfg = window.HONEYPRO_ADMIN_CONFIG || {};
const client = window.supabase && cfg.supabaseUrl && cfg.supabasePublishableKey &&
  !cfg.supabaseUrl.includes("YOUR-PROJECT") && !cfg.supabasePublishableKey.includes("YOUR_")
  ? window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey) : null;
const loginPanel=document.getElementById("loginPanel"), dashboard=document.getElementById("dashboard"), logout=document.getElementById("logout");
const loginMessage=document.getElementById("loginMessage"), dashMessage=document.getElementById("dashMessage");
const money=n=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(n||0));
let lastNotificationCheck = null;
let notificationTimer = null;
if(!client){loginMessage.textContent="Add your Supabase Project URL and Publishable key in admin-config.js first.";}
document.getElementById("loginForm").addEventListener("submit",async e=>{
 e.preventDefault(); if(!client)return;
 loginMessage.textContent="Signing in…";
 const {error}=await client.auth.signInWithPassword({email:document.getElementById("email").value,password:document.getElementById("password").value});
 if(error){loginMessage.textContent=error.message;return;}
 if("Notification" in window && Notification.permission==="default"){
   try { await Notification.requestPermission(); } catch (_) {}
 }
 await showDashboard();
});
logout.addEventListener("click",async()=>{if(notificationTimer)clearInterval(notificationTimer);await client.auth.signOut();dashboard.hidden=true;loginPanel.hidden=false;logout.hidden=true;});
document.getElementById("refresh").addEventListener("click",()=>loadOrders());
async function showDashboard(){
 const {data:{session}}=await client.auth.getSession();
 if(!session)return;
 loginPanel.hidden=true;dashboard.hidden=false;logout.hidden=false;
 await loadOrders();
 lastNotificationCheck = new Date().toISOString();
 if(notificationTimer)clearInterval(notificationTimer);
 notificationTimer=setInterval(checkForNewOrders,30000);
}
async function loadOrders(){
 dashMessage.textContent="Loading…";
 const {data,error}=await client.from("honeypro_orders").select("*").order("created_at",{ascending:false}).limit(500);
 if(error){dashMessage.textContent=error.message;return;}
 const rows=data||[];
 document.getElementById("count").textContent=rows.length;
 document.getElementById("newCount").textContent=rows.filter(x=>x.status==="new").length;
 document.getElementById("value").textContent=money(rows.reduce((s,x)=>s+Number(x.total_amount||0),0));
 const tbody=document.getElementById("orders");tbody.replaceChildren();
if(!rows.length){tbody.innerHTML='<tr><td colspan="9">No orders yet.</td></tr>';}
 rows.forEach(o=>{
  const tr=document.createElement("tr");
const cells=[
  new Date(o.created_at).toLocaleString("en-NG"),
  o.full_name,
  o.phone,
  o.whatsapp_number || "Not provided",
  o.email || "Not provided",
  `${o.address}, ${o.city}, ${o.state}`,
  o.quantity,
  money(o.total_amount)
];
  cells.forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
  const statusCell=document.createElement("td");
  const statusSelect=document.createElement("select");
  statusSelect.className="order-status-select";
  statusSelect.setAttribute("aria-label",`Update status for order ${o.id}`);
  const statusOptions=["new","confirmed","processing","delivered","cancelled"];
  const currentStatus=String(o.status||"new").toLowerCase();
  if(!statusOptions.includes(currentStatus)) statusOptions.unshift(currentStatus);
  statusOptions.forEach(value=>{
    const option=document.createElement("option");
    option.value=value;
    option.textContent=value.charAt(0).toUpperCase()+value.slice(1);
    statusSelect.appendChild(option);
  });
  statusSelect.value=currentStatus;
  statusSelect.addEventListener("change",()=>updateOrderStatus(o.id,statusSelect));
  statusCell.appendChild(statusSelect);
  tr.appendChild(statusCell);tbody.appendChild(tr);
 });
 dashMessage.textContent="Showing up to 500 most recent orders. Desktop alerts work while this dashboard is open.";
}
async function updateOrderStatus(orderId,select){
 const nextStatus=select.value;
 select.disabled=true;
 dashMessage.textContent="Saving order status…";
 const {error}=await client.from("honeypro_orders").update({status:nextStatus}).eq("id",orderId);
 select.disabled=false;
 if(error){
   dashMessage.textContent=`Could not update status: ${error.message}. Check the Supabase UPDATE permission.`;
   await loadOrders();
   return;
 }
 dashMessage.textContent=`Order status updated to ${nextStatus}.`;
 await loadOrders();
}
async function checkForNewOrders(){
 if(!client || !lastNotificationCheck || document.hidden) return;
 const since=lastNotificationCheck;
 lastNotificationCheck=new Date().toISOString();
 const {data,error}=await client.from("honeypro_orders").select("id,full_name,phone,total_amount,created_at").gt("created_at",since).order("created_at",{ascending:true});
 if(error || !data || !data.length)return;
 for(const order of data){
   if("Notification" in window && Notification.permission==="granted"){
     const n=new Notification("New HoneyPro order",{
       body:`${order.full_name} · ${order.phone} · ${money(order.total_amount)}`,
       tag:`honeypro-${order.id}`
     });
     n.onclick=()=>{window.focus();n.close();};
   }
 }
 await loadOrders();
}
if(client){client.auth.getSession().then(({data})=>{if(data.session)showDashboard();});}
