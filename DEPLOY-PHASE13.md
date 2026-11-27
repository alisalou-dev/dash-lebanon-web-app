# Dash Lebanon — phase 13 (deploy notes)

## Order of work
1. **Supabase > SQL Editor**: open `sql/04-admin-chat-realtime.sql`, paste it all, press **Run** (once).
2. **Supabase > Edge Functions > ai-chat**: replace the code with `supabase/functions/ai-chat/index.ts`
   (keep the same settings: Verify JWT = OFF) and deploy. This makes the AI assistant answer in English.
3. **Vercel**: upload this folder (or push it to GitHub). No build command is needed; the built files are already in `css/` and `js/`.
   If you change anything inside `src/`, run `node build.js` first.

## What is new
- Orders stay visible with or without an account (Track my order, track by order number + phone).
- Admin > Customers: Make admin / Remove admin (realtime), Points (+/-), Delete user, Disable, search.
- Admin > Settings > Delete data: choose exactly what to delete.
- Admin > Chat and customer Chat page (departments such as Sports), realtime.
- Admin > Activity log.
- Realtime on all tables; English-only interface; mobile fixes.

## Privacy Policy (added)
- New page: `/privacy-policy` (also `/privacy`). Source: `src/js/95-privacy.js`, styles: `src/css/60-privacy.css`.
- Linked from: footer, side menu, sign-up form and checkout (consent lines), and `sitemap.xml`.
- Contact email/WhatsApp in the policy come from Admin > Settings (contact_email, whatsapp_number).
- Have a lawyer review the text before relying on it legally.

## Phase 13 — legal pages + privacy self-service
1. **Supabase > SQL Editor**: run `sql/05-privacy-self-service.sql` once (adds `export_my_data` and `delete_my_account`; nothing is dropped).
2. **Vercel**: upload this folder (built files are already in `css/` and `js/`).
3. New pages (source `src/js/96-legal.js`): `/terms`, `/delivery-policy`, `/returns-policy`, `/points-terms`, `/ai-notice`.
   Linked from footer (Policies column), side menu, sign-up and checkout consent lines, and `sitemap.xml`.
   Delivery fee, free-cancel hours, cancel fee and points rates are read from the store settings.
4. My Account now has **Download my data (PDF)** and **Delete my account** (admins must be demoted first).
5. Privacy Policy: retention is now 90 days for messages/voice notes, and it links to the other policies.
6. Set `contact_email` in Admin > Settings so the email shows in every policy.
7. Have a Lebanese lawyer review all legal texts. Edit wording in `src/js/95-privacy.js` / `96-legal.js`, then run `node build.js`.
