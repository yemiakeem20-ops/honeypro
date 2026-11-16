# HoneyPro landing page

A responsive HoneyPro 5L product landing page with:
- Mobile, tablet, desktop and iOS-friendly responsive layout
- Customer order form (name, phone, email, state, city/LGA, full delivery address, quantity, delivery note)
- Server-side order storage in Supabase
- Password-protected order dashboard at `/admin.html`
- New-order email notification through Resend
- Meta Pixel PageView and Lead events
- Pay-on-delivery messaging and inspection/refusal assurance

## Important defaults to confirm
The landing page currently shows **₦68,500 per 5L keg**, based on the latest price used for HoneyPro. Update it in `config.js` if your current price is different. The page says free delivery in eligible locations; confirm your actual delivery coverage before publishing.

## 1. Create a Supabase project
1. Create a project at https://supabase.com. Choose a region reasonably close to your customers from the available regions and save the database password securely.
2. Open **SQL Editor** and run all of `supabase-schema.sql`.
3. Open **Project Settings → API Keys** (or the project **Connect** dialog). Copy the Project URL and **publishable key** (`sb_publishable_...`).
4. Open `admin-config.js` and replace the two placeholder values. Put the URL in `supabaseUrl` and the publishable key in `supabaseAnonKey` (the Supabase JavaScript client accepts the publishable key in this setting).
5. In Supabase **Authentication → Users**, create your admin login (email + password).
6. Copy that user's UUID. In SQL Editor run:
   `insert into public.honeypro_admins (user_id) values ('YOUR-USER-UUID');`

Create/copy a Supabase **secret key** (`sb_secret_...`) for the backend. It belongs only in Netlify environment variables, never in `admin-config.js`, `config.js`, GitHub, or browser code. The function also accepts the older `SUPABASE_SERVICE_ROLE_KEY` variable as a fallback. Use the new secret key for a fresh setup. The server calculates the unit price from `HONEYPRO_UNIT_PRICE_NAIRA` (default ₦68,500); it does not trust the price submitted by the browser.

## 2. Configure Meta Pixel
1. Open Meta Events Manager and copy your Pixel ID.
2. Paste only the numeric ID into `metaPixelId` in `config.js`.
3. The page sends `PageView` on page load and `Lead` after a successful order submission. Since this is payment on delivery, the form does not report a completed purchase at order submission.

## 3. Configure email notifications
1. Create an account at https://resend.com and verify a sender domain/email according to Resend's instructions.
2. In Netlify site settings → Environment variables, add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SECRET_KEY` = your Supabase secret key (`sb_secret_...`, secret)
   - `HONEYPRO_UNIT_PRICE_NAIRA` = `68500`
   - `RESEND_API_KEY` = your Resend API key
   - `ORDER_NOTIFICATION_EMAIL` = the email address that should receive new order alerts
   - `FROM_EMAIL` = a verified sender, e.g. `HoneyPro Orders <orders@yourdomain.com>`
3. Redeploy after setting environment variables.

If email is not configured, orders will still be saved in Supabase and visible in the dashboard.

## 4. Deploy to Netlify
1. Upload this project to a private GitHub repository, or drag the project folder into Netlify's deploy flow.
2. Netlify must build the function in `netlify/functions/create-order.js`; keep `package.json` and `netlify.toml` in the project root.
3. Add the environment variables above in Netlify.
4. Deploy and test with a real test order before advertising.

## 5. Access orders
Visit `https://YOUR-SITE.netlify.app/admin.html`, sign in with the admin email/password you created, and view the latest 500 orders. Keep the dashboard URL private and use a strong password. The dashboard currently provides read-only order viewing.

## Laptop notifications
The admin dashboard includes browser desktop notifications. Sign in on the laptop, allow notifications when the browser asks, and keep the dashboard open. The dashboard checks for new orders periodically. Email remains the reliable notification channel when the dashboard is closed.

## Before going live
- Confirm price, delivery coverage, and contact details.
- Add your business phone/WhatsApp and a privacy notice explaining how customer delivery details are used.
- Test the form, email notification, dashboard login and mobile display.
- Add spam protection/rate limiting (for example, Cloudflare Turnstile) before scaling paid traffic.
- Consider adding order status editing, CSV export, WhatsApp alerts and abandoned-checkout retargeting in the next version.

## Privacy and customer data
Customer contact and address details are personal information. Restrict dashboard access, do not share Supabase service credentials, and use the information only for order fulfilment and customer service. Add a privacy policy and retention process appropriate to your business and applicable Nigerian data-protection requirements.
