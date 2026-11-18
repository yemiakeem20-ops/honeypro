const cfg = window.HONEYPRO_ADMIN_CONFIG || {};
const client = window.supabase && cfg.supabaseUrl && cfg.supabasePublishableKey &&
  !cfg.supabaseUrl.includes("YOUR-PROJECT") && !cfg.supabasePublishableKey.includes("YOUR_")
  ? window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey) : null;
const loginPanel=document.getElementById("loginPanel"), dashboard=document.getElementById("dashboard"), logout=document.getElementById("logout");
const loginMessage=document.getElementById("loginMessage"), dashMessage=document.getElementById("dashMessage");
const money=n=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(n||0));
let loadedOrders = [];
let lastNotificationCheck = null;
let notificationTimer = null;
if(!client){loginMessage.textContent="Add your Supabase Project URL and Publishable key in admin-config.js first.";}
document.getElementById("loginForm").addEventListener("submit",async e=>{
 e.preventDefault(); if(!client)return;
 loginMessage.textContent="Signing in…";
 const {error}=await client.auth.signInWithPassword({email:document.getElementById("email").value,password:document.getElementById("password").value});
 if(error){loginMessage.textContent=error.message;return;}
 await showDashboard();
});
logout.addEventListener("click",async()=>{if(notificationTimer)clearInterval(notificationTimer);await client.auth.signOut();dashboard.hidden=true;loginPanel.hidden=false;logout.hidden=true;});
document.getElementById("refresh").addEventListener("click",()=>loadOrders());
document.getElementById("exportOrders").addEventListener("click",exportOrdersCsv);
document.getElementById("enablePushNotifications").addEventListener("click",enablePushNotifications);
document.getElementById("testPushNotifications").addEventListener("click",testPushNotifications);

function urlBase64ToUint8Array(value){
 const padding="=".repeat((4-value.length%4)%4);
 const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
 const raw=atob(base64);
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function enablePushNotifications(){
 const button=document.getElementById("enablePushNotifications");
 const cfg=window.HONEYPRO_ADMIN_CONFIG||{};
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
   dashMessage.textContent="This browser does not support background push notifications. Please use current Chrome on Android.";
   return;
 }
 if(!cfg.vapidPublicKey){dashMessage.textContent="Push notification key is not configured.";return;}
 button.disabled=true;button.textContent="Enabling alerts…";
 try{
   const permission=await Notification.requestPermission();
   if(permission!=="granted") throw new Error("Please allow notifications for HoneyPro Admin in your phone settings.");
   const registration=await navigator.serviceWorker.register("/sw.js");
   await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription){
     subscription=await registration.pushManager.subscribe({
       userVisibleOnly:true,
       applicationServerKey:urlBase64ToUint8Array(cfg.vapidPublicKey)
     });
   }
   const {data:{session},error}=await client.auth.getSession();
   if(error||!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
   const response=await fetch("/api/push-subscribe",{
     method:"POST",
     headers:{
       "Content-Type":"application/json",
       "Authorization":`Bearer ${session.access_token}`,
       "apikey":cfg.supabasePublishableKey
     },
     body:JSON.stringify(subscription)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok) throw new Error(result.error||"Could not register this phone for alerts.");
   button.textContent="Order alerts enabled";
   dashMessage.textContent="This phone is registered. New orders can now trigger notifications even when the admin app is closed.";
 }catch(error){
   dashMessage.textContent=error.message||"Could not enable notifications.";
   button.textContent="Enable order alerts";
 }finally{
   button.disabled=false;
 }
}

async function testPushNotifications(){
 const button=document.getElementById("testPushNotifications");
 const cfg=window.HONEYPRO_ADMIN_CONFIG||{};
 button.disabled=true;button.textContent="Sending test…";
 try{
   const {data:{session},error}=await client.auth.getSession();
   if(error||!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
   const response=await fetch("/api/test-push",{
     method:"POST",
     headers:{"Authorization":`Bearer ${session.access_token}`,"apikey":cfg.supabasePublishableKey}
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok) throw new Error(result.error||"Push test failed.");
   const details=(result.results||[]).map(x=>x.ok?`Sent (HTTP ${x.status})`:`Failed (HTTP ${x.status||"—"}): ${x.error||x.detail||"Unknown error"}`).join(" | ");
   dashMessage.textContent=result.ok?"Push service accepted the test notification. "+details:"Push test failed. "+details;
   button.textContent=result.ok?"Test sent":"Test failed";
 }catch(error){
   dashMessage.textContent=error.message||"Could not run push test.";
   button.textContent="Test phone notification";
 }finally{button.disabled=false;}
}

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
 loadedOrders=rows;
 const statusOf=o=>String(o.status||"new").toLowerCase();
 const countStatus=status=>rows.filter(o=>statusOf(o)===status).length;
 document.getElementById("count").textContent=rows.length;
 document.getElementById("newCount").textContent=countStatus("new");
 document.getElementById("confirmedCount").textContent=countStatus("confirmed");
 document.getElementById("processingCount").textContent=countStatus("processing");
 document.getElementById("deliveredCount").textContent=countStatus("delivered");
 document.getElementById("cancelledCount").textContent=countStatus("cancelled");
 document.getElementById("value").textContent=money(rows.reduce((s,x)=>s+Number(x.total_amount||0),0));
 document.getElementById("deliveredValue").textContent=money(rows.filter(o=>statusOf(o)==="delivered").reduce((s,x)=>s+Number(x.total_amount||0),0));
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
  const currentStatus=statusOf(o);
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
function exportOrdersCsv(){
 if(!loadedOrders.length){
   dashMessage.textContent="There are no orders to export yet.";
   return;
 }
 const columns=[
  ["Order ID","id"],["Order Date","created_at"],["Customer Name","full_name"],
  ["Phone","phone"],["WhatsApp","whatsapp_number"],["Email","email"],
  ["State","state"],["City","city"],["Delivery Address","address"],
  ["Delivery Note","delivery_note"],["Quantity","quantity"],
  ["Unit Price (NGN)","unit_price"],["Total Amount (NGN)","total_amount"],
  ["Status","status"]
 ];
 const csvCell=value=>{
  let textValue=value==null?"":String(value);
  if(/^[=+@\- \t\r]/.test(textValue)) textValue="'"+textValue;
  return '"'+textValue.replace(/"/g,'""')+'"';
 };
 const lines=[columns.map(c=>csvCell(c[0])).join(",")];
 loadedOrders.forEach(order=>{
  lines.push(columns.map(c=>csvCell(order[c[1]])).join(","));
 });
 const blob=new Blob(["\uFEFF"+lines.join("\\r\\n")],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob);
 const link=document.createElement("a");
 link.href=url;
 link.download="honeypro-orders-"+new Date().toISOString().slice(0,10)+".csv";
 document.body.appendChild(link);
 link.click();
 link.remove();
 URL.revokeObjectURL(url);
 dashMessage.textContent="CSV export downloaded successfully.";
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