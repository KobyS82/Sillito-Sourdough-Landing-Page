# Sillito Sourdough - Operations Runbook

> **Paste this whole file into any AI before asking it for help with the sourdough site.**
> It contains no passwords or keys. Never paste secrets (admin password, Supabase keys, Resend key) into an AI; if it asks for one, say no and set it in the Vercel dashboard yourself.
> Written 2026-10-28 from the code at commit `a93d200`. Where something could not be checked it says "unverified".

## 1. What it is
Customers visit the site, pick products (sourdough, cookies), pick a pickup location, pick a pickup date, and place an order. They pay cash or Venmo at pickup (no online payment). Koby logs into `/admin.html` with a password to confirm or cancel orders, set products and prices, create pickup slots and capacities, mark orders paid, and email or text customers. Customers can see their orders at `/portal.html` through an emailed 24-hour magic link.
Tech: plain static HTML/CSS/JS pages plus Node serverless functions in `/api`, hosted on **Vercel**. Data lives in **Supabase** (Postgres, accessed over its REST API). Email goes out through **Resend**. SMS code exists (Twilio) but is not configured. There is **no package.json, no build step, and no npm dependencies**, so there is nothing to `npm install`.

## 2. Where everything lives
| Thing | Value |
|---|---|
| Local folder | `S:\projects\main\sillito-sourdough` (moved from Desktop in 2026-09; Vercel deploys from GitHub so the move changed nothing live) |
| GitHub repo | `KobyS82/Sillito-Sourdough-Landing-Page` (branches `master` and `dev`) |
| Git remote name | **`Sillito-Sourdough-Landing-Page`** (there is NO remote called `origin`) |
| Live domain | **sillitosourdough.ORG** (live site redirects to `www.sillitosourdough.org`). **sillitosourdough.com is NOT registered.** |
| Vercel project | unverified (name not readable here; `vercel` CLI on the PC is broken - its node shim is missing). Find it at vercel.com dashboard, the project linked to the GitHub repo above. |
| Supabase project | unverified name/ref. URL is in `SUPABASE_URL` (Vercel env). Open supabase.com dashboard, find the project whose URL matches. |
| Email provider | Resend (resend.com). Domain `sillitosourdough.org` verified in Resend since 2026-08-18. Domain verification is per Resend *account*. |
| Old repo (DO NOT USE) | `S:\projects\side\websites\sillito-sourdough-2025` (GitHub `KobyS82/sillito-sourdough`), the abandoned 2025 version |

**Environment variables (names only).** Serverless functions read them from the **Vercel dashboard** (Project > Settings > Environment Variables), NOT from the local `.env`. They drift apart silently. **Vercel is the truth.** Vercel marks them sensitive, so you can overwrite but not read them.
| Name | Used by | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | every `api/*.js` | admin login. **Verified set in Vercel 2026-10-28** (`/api/customers` with no password returns 401). Never delete it: if unset, requests with no password pass every admin check (`undefined === undefined`). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `lib/db.js:2-3` | required; service-role key is a full-access secret |
| `RESEND_API_KEY` | `lib/email.js:1` | if unset, emails are silently skipped (only a console warning) |
| `EMAIL_FROM` | `lib/email.js:2` | optional; overrides the default sender `Sillito Sourdough <hello@sillitosourdough.org>`. Must be an @sillitosourdough.org address. |
| `ADMIN_EMAIL` | `api/orders.js:6` | optional; gets a "New order" email. If unset, Koby gets no new-order email. |
| `SITE_URL` | `api/portal.js:6`, `api/notify.js:6` | base URL for magic links and blast buttons. If unset, magic links are broken (start with `/portal.html`). Should be `https://www.sillitosourdough.org`. Whether it is set in Vercel: unverified. |
| `PORTAL_SECRET` | `api/portal.js:5` | signs magic links; falls back to the public default `'change-me-please'` if unset. **Verified set in Vercel 2026-10-28** (a token signed with the default was rejected with 401). Never delete it: without it anyone could forge a link to any customer's orders. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | `lib/sms.js:1-3` | SMS; not configured, SMS silently skipped |
The local `.env` (git-ignored) only matters for running locally. It has `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; it has no Resend key. Do not rewrite it with PowerShell `Set-Content -Encoding utf8` (adds a BOM that breaks parsing); edit it in an editor.

## 3. How a change goes live
Deploys are automatic: pushing to the GitHub repo's **master** branch makes Vercel build and publish production. (Whether `dev` makes a preview deploy: unverified, but Vercel normally does.)
1. Edit files in `S:\projects\main\sillito-sourdough`.
2. Test locally (optional but wise). There is no npm script. With Node and the Vercel CLI working: `cd S:\projects\main\sillito-sourdough; npx vercel dev` (needs login and project link; unverified). Static-only edits (HTML/CSS/text) can be checked by opening `index.html` in a browser, but the order form needs `/api` so it will show errors without `vercel dev`.
3. Commit and push:
```powershell
cd S:\projects\main\sillito-sourdough
git status
git add -A
git commit -m "describe the change"
git push Sillito-Sourdough-Landing-Page master
```
4. Wait ~1 minute. Verify: open `https://www.sillitosourdough.org`, hard-refresh (Ctrl+Shift+R). Cheap proof a deploy landed: `curl.exe -s https://www.sillitosourdough.org/admin.html | Select-String "placeholder"` and look for a line you changed. Serverless code (`lib/`, `api/`) is invisible from outside, so check Vercel dashboard > Deployments shows "Ready" for your commit.
5. If env vars changed in Vercel, you must **redeploy** (Deployments > the latest > ... > Redeploy) for them to take effect.

**Roll back a bad deploy:** Vercel dashboard > the project > Deployments > find the last good one > ... menu > **Promote to Production** (instant). Then fix the code and push again. Promoting does not change git, so the bad commit is still on `master` until you `git revert <sha>` and push.
**Database changes are not deployed by git.** SQL in `supabase-schema*.sql` is run by hand in the Supabase SQL Editor.

## 4. How do I change X
| I want to change | Where | Code or config? |
|---|---|---|
| Products, prices, deals (e.g. "3 for $10"), descriptions, hide a product | **Admin page > Products** (writes to the Supabase `products` table via `api/products.js:28-40`; editable fields listed at line 32). Initial seed data: `supabase-schema-v2.sql:92-104`. | config (admin UI) |
| Add a brand-new product | No admin UI. Insert a row in Supabase table `products` (columns in `supabase-schema-v2.sql:4-14`; `id` is a short text key like `cookies`) via the Supabase Table Editor. Then add capacity for it on slots. | database |
| Price text shown on homepage | `index.html:180` ("Cookies: $4 each or $10 for 3") is **hard-coded text**, separate from the DB price. Update both. | code |
| Pickup locations (names, notes) | Supabase table `locations` (seed at `supabase-schema-v2.sql:107-119`; read by `api/locations.js:15`). No admin UI found for editing; use Supabase Table Editor. Only rows with `active = true` show. | database |
| Bake / pickup days and times | **Admin page > Schedule** creates recurring templates (`api/schedule.js:33-49`: location, weekday, start/end), then "generate slots" for a date range (`api/schedule.js:63-120`). One-off slots: admin > Slots (`api/slots.js:41-61`). Customers only see slots that exist. | config (admin UI) |
| How many items per pickup (capacity) | Per slot per product: admin > Slots (`api/slots.js:68-79`). Blank capacity = unlimited. The order check is `api/orders.js:163-176`. | config |
| **Order cutoff** ("how close to pickup can people still order") | `api/slots.js:10-14`: customers only see slots dated **today + 2 days or later**. Change the `2` on line 12. Admin sees all slots. | code |
| **Sold out** | Set that slot's capacity equal to what is booked (admin > Slots), or cancel the slot (`api/slots.js:63-66`, admin button). The order API refuses over-capacity orders (`api/orders.js:170`). | config |
| **Pause all ordering** | Cancel or do not generate future slots: with no slots, the homepage bar says "No pickups scheduled yet" (`script.js:46-51`) and no date can be chosen. Alternatively set every product inactive in admin > Products (hides them, `api/products.js:18-20`). | config |
| Homepage text | Header tagline `index.html:19`; intro paragraph `index.html:32`; payment section `index.html:163-182`; footer `index.html:190-196`. | code |
| Photos | The homepage currently uses **no photos** (no `<img>` tags in `index.html`). To add one, put the file in the repo folder and add an `<img src="file.jpg">` in `index.html`; styling in `styles.css`. | code |
| Venmo handle | `index.html:177` (link and label) | code |
| Order confirmation / "in the queue" / cancelled emails (wording, colours, signature) | `lib/email.js`: queue email `:103-118`, confirmed `:120-141`, cancelled `:143-150`, admin new-order `:152-173`, magic link `:175-182`, blast `:184-192`, header/footer chrome `:16-36`. Subject lines are in `api/orders.js:58, 99, 117, 225, 230`. | code |
| Email sender address | Default is `lib/email.js:2`; or set `EMAIL_FROM` in Vercel (overrides the default). Must be `@sillitosourdough.org`. | env / code |
| Where new-order alerts go | Set `ADMIN_EMAIL` in Vercel (`api/orders.js:6,228`). | env |
| **Admin password** | Vercel dashboard > Settings > Environment Variables > edit `ADMIN_PASSWORD` > Save > **Redeploy**. Also update the local `.env` if you run locally. Not in code. Login check: `admin.js:27-45`. | env |
| Magic-link lifetime (24 h) | `api/portal.js:15` | code |
| Text-message wording | `api/orders.js:73, 105, 123, 235` (no effect until Twilio is set up) | code |

## 5. Things that break and how to fix them
**Order emails not arriving.** The code returns success to the customer even if the email fails (notifications are fire-and-forget, `api/orders.js:221-237`), so a "successful" order does not prove an email went out.
1. Is `RESEND_API_KEY` set in Vercel? If not, emails are silently skipped.
2. Resend dashboard > Logs: look for the send attempt and its error. Vercel dashboard > the deployment > Logs / Functions: search for `[Email] Resend error:` or `RESEND_API_KEY not set`.
3. Resend dashboard > Domains: `sillitosourdough.org` must be **Verified** *in the same Resend account that owns the key in Vercel*. A key from another Resend account (e.g. the chore app's separate key) will fail with "domain not verified".
4. The sender must end in `@sillitosourdough.org`. If Vercel has an `EMAIL_FROM` env var, check it is not a `.com` address. `.com` is not a real domain.
5. Check the customer's spam folder.
**OPEN ITEM (as of 2026-10-28): a real test order has never been placed to confirm emails arrive end-to-end.** The `.com` to `.org` sender fix (commit `a93d200`, 2026-09-17) is deployed, but nobody has verified an email actually lands. Do this: place a real order on the live site with Koby's own email (pick a slot, tiny quantity), confirm the "You're in the queue" email arrives, then in admin Confirm the order and check the second email, then Cancel it (this restores capacity). Check `ADMIN_EMAIL` is set so the new-order alert is tested too.

**Admin login says "Wrong password".** Local `.env` and Vercel disagree (Koby has hit this before). The live site uses the Vercel value. Reset it in Vercel (see section 4) and redeploy. Note: the login test is `admin.js:35`, a call to `/api/availability` that returns 401 on mismatch. A 500 or network error also shows "Wrong password", so also check the Supabase/Vercel logs.

**Pages load but products/dates are empty or admin shows errors (Supabase).**
- Free Supabase projects **pause after about a week of inactivity**: Supabase dashboard > Restore project. Public endpoints then return 500.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` wrong or missing in Vercel: `lib/db.js:15` throws "SUPABASE_URL not configured".
- Row Level Security: the schema files switch RLS **off** on all tables (`supabase-schema.sql`, `supabase-schema-v2.sql:83-89`) and the server uses the service-role key, which bypasses RLS anyway. If RLS got turned on, inserts can fail. Note `200 []` from Supabase can hide a blocked write.
- Missing table errors: the SQL files were not run. Run `supabase-schema.sql` then `supabase-schema-v2.sql` in the Supabase SQL Editor (both are safe to re-run).

**Build/deploy fails on Vercel.** There is no build step, so failures are usually: a JavaScript syntax error in a file under `api/` or `lib/` (check the Vercel build log), a bad `vercel.json` (currently just `{}`; leave it), or an empty `index.html` (this caused a blank page once, commit `ea43bfc`). Fix by promoting the previous deployment, then repair the file. Run `node --check api\orders.js` on a file you edited to catch syntax errors (needs Node).

**Magic link (view my orders) goes to a broken URL.** `SITE_URL` is missing in Vercel (`api/portal.js:78`).

## 6. Do NOT
- **Do not edit `S:\projects\side\websites\sillito-sourdough-2025`.** It is the old 2025 version. The live one is `S:\projects\main\sillito-sourdough`.
- **Do not use `.com` anywhere.** The domain is `sillitosourdough.ORG`. `.com` is unregistered (no website, no email).
- **Do not run `git push origin`.** The remote is called `Sillito-Sourdough-Landing-Page`. Branch is `master`.
- **Do not trust the local `.env` as what production uses.** Vercel's env vars are what run.
- **Do not paste or commit** `.env`, the Supabase service-role key, the Resend key, or the admin password. `.env` is git-ignored; keep it that way.
- Do not run `vercel env pull` or `vercel deploy` casually; `env pull` writes secrets to disk.
- Do not delete the `products`, `pickup_slots`, `orders`, `customers` tables or rerun seed SQL carelessly: `supabase-schema-v2.sql:100-104` overwrites product prices and descriptions on re-run.
- Do not use Cloudflare/DNS changes on `sillitosourdough.org` without checking Resend's DNS records (SPF/DKIM) stay intact - deleting them breaks email.
- Do not "fix" `config.js` (`LOAVES_AVAILABLE`): nothing loads it (not referenced by any HTML or JS). It is a leftover from the old weekly-count system.
- Do not email-blast without testing on yourself first (admin > Notify sends to real customers, `api/notify.js`).

## 7. Code map
| File | What it is |
|---|---|
| `index.html`, `script.js`, `styles.css` | Customer site: 4-step order flow (products, location, date, info) |
| `admin.html`, `admin.js`, `admin.css` | Admin dashboard (orders, products, slots, schedule, customers, blasts). Password sent with every request. |
| `portal.html` | Customer "view my orders" page (magic-link login) |
| `api/orders.js` | Place order (public POST) and admin list/confirm/cancel/complete/markPaid/sendPickup |
| `api/slots.js` | List pickup slots (hides those inside the 2-day buffer), create/cancel slots, set capacity |
| `api/schedule.js` | Recurring weekly templates and slot generation |
| `api/products.js` | List products, admin edit (price, deal, active) |
| `api/locations.js` | List active pickup locations (read-only) |
| `api/customers.js` | Admin customer list |
| `api/notify.js` | Admin email/SMS blasts, waitlist notifications |
| `api/portal.js` | Magic-link create/verify (HMAC signed, 24h), customer order view/cancel |
| `api/availability.js` | OLD weekly-availability system (`weeks` table). Still used as the admin login probe (`admin.js:35`). |
| `lib/db.js` | Tiny Supabase REST wrapper (select/insert/upsert/update/del) |
| `lib/email.js` | Resend sender and all HTML email templates |
| `lib/sms.js` | Twilio sender (inactive without env vars) |
| `supabase-schema.sql`, `supabase-schema-v2.sql` | Table definitions, run by hand in Supabase |
| `config.js` | Dead file (unused) |
| `vercel.json` | Empty `{}` |

## 8. Hard-coded things that could become settings
| Value | Where | Move to | Ease |
|---|---|---|---|
| Order cutoff buffer (2 days) | `api/slots.js:12` | env var `ORDER_BUFFER_DAYS` (one-line change) | Easy |
| Homepage price note and Venmo handle | `index.html:177,180` | env/admin; or just edit the text | Easy (edit) / Medium (make dynamic) |
| Pickup locations editing | no admin UI (Supabase table only) | add admin page using existing `locations` table | Medium |
| Add-new-product UI | admin has only edit | add POST to `api/products.js` plus a form | Medium |
| Default sender / "Austin, TX" / copy in emails | `lib/email.js:2,27,31` | `EMAIL_FROM` env already exists; copy would need a settings table | Easy (env) / Medium |
| Magic-link lifetime (24 h) | `api/portal.js:15` | env var | Easy |
| Recurring-order preference `loaves: 1` | `api/orders.js:216` | n/a, probably dead feature | Easy |
| Hero text, tagline, payment blurb | `index.html:19,32,163-182` | Supabase `settings` table plus admin form | Hard-ish (needs fetch + admin UI) |
| Email subject lines | `api/orders.js:58,99,117,225,230` | env or settings table | Easy |
| Chewy affiliate link placeholder `CHEWY_AFFILIATE_LINK` | `index.html:194` | replace with real URL or delete the line (it is a literal broken link today) | Easy |
| Admin auth (password sent in URL query on GETs, shared across all endpoints) | every `api/*.js` | proper session/auth | Hard. Also: if `ADMIN_PASSWORD` is ever unset in Vercel, `undefined === undefined` lets API calls with no password through. Keep it set. |
