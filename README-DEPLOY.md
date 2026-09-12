# Backend Deploy Guide (Render — Free)

Ye backend OTP ko server pe generate, hash, aur verify karta hai (5-minute
expiry, single-use, rate-limited — waisa hi jaisa pehle tha).

**CHANGED — OTP ab EmailJS se frontend se bhejta hai, backend se nahi.**
Render ke free tier pe outbound SMTP (Gmail/nodemailer) block/unreliable
hone ki wajah se OTP emails customer tak nahi pahunch rahe the. Ab
`/api/send-otp` OTP wapas frontend ko bhej deta hai, aur `script.js` usi OTP
ko EmailJS (browser se seedha email bhejne wali free service) ke through
customer ke inbox mein deliver karta hai. Iske liye tumhe sirf frontend mein
EmailJS setup karna hai — dekho `frontend/README-EMAILJS.md`.

`EMAIL_USER` / `EMAIL_PASS` (niche Step 1) ab OTP ke liye **zaroori nahi**
hain — lekin inhi env vars ko backend ke baaki features abhi bhi use karte
hain (admin ko internal notification emails: naye leads, wedding enquiries,
customize-package quotes, refer & earn payouts). Agar wo notifications bhi
chahiye to Step 1 follow karo, warna skip kar sakte ho — baaki sab kaam
karega, sirf wo internal emails nahi jaayenge.

## Step 1 — (Optional, sirf admin notification emails ke liye) Gmail App Password banao

(Ya chaho to Resend/SendGrid bhi use kar sakte ho — niche note hai)

1. Apne Gmail account mein **2-Step Verification** on karo:
   https://myaccount.google.com/security
2. Uske baad **App Passwords** section mein jao:
   https://myaccount.google.com/apppasswords
3. Ek naya app password generate karo (naam kuch bhi rakh do, jaise
   "AdmireDworld Travel"). 16-character password milega — ise copy kar lo.
   Ye tumhara normal Gmail password nahi hai, isse safe hai.

## Step 2 — Code ko GitHub pe daalo

1. GitHub par ek naya repository banao (free account: https://github.com).
2. Is `backend` folder ko us repo mein push kar do.
   (Agar Git se familiar nahi ho, GitHub Desktop app use kar sakte ho —
   sirf folder drag-drop karke "commit" aur "push" karna hota hai.)

## Step 3 — Render pe deploy karo

1. https://render.com par free account banao (GitHub se sign in kar sakte ho).
2. Dashboard mein **New +** → **Web Service** pe click karo.
3. Apna GitHub repo select karo.
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **Environment Variables** section mein ye sab add karo (`.env.example`
   file dekh ke, real values ke saath):
   - `JWT_SECRET` → ek lambi random string (niche command se bana sakte ho, **zaroori**)
   - `ALLOWED_ORIGIN` → tumhari website ka URL (jaise `https://admiredworld.netlify.app`, **zaroori**)
   - `EMAIL_SERVICE` → `gmail` (optional — sirf admin notification emails ke liye, OTP ke liye nahi)
   - `EMAIL_USER` → tumhara Gmail address (optional, same reason)
   - `EMAIL_PASS` → Step 1 wala 16-character app password (optional, same reason)
6. **Create Web Service** pe click karo. Render build karke ek URL dega,
   jaise: `https://admiredworld-backend.onrender.com`

### JWT_SECRET generate karne ke liye

Apne computer pe (Node.js installed hone par) terminal mein ye chalao:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Jo string mile, wahi `JWT_SECRET` mein paste karo.

## Step 4 — Frontend ko backend se connect karo

`frontend/js/script.js` file mein sabse upar ye line milegi:
```js
const API_BASE_URL = "http://localhost:4000";
```
Isse apne Render URL se replace kar do:
```js
const API_BASE_URL = "https://admiredworld-backend.onrender.com";
```

Bas — ab real OTP emails jaayengi, aur verification poori tarah server pe
hoga.

## Free tier note

Render ka free web service kuch der inactive rehne ke baad "sleep" ho jaata
hai — pehli request pe wake hone mein ~30-50 seconds lag sakte hain. Agar ye
acceptable nahi hai, Railway.app ka free tier bhi try kar sakte ho, ya paid
Render plan (~$7/month) jo hamesha active rehta hai.

## Alternative email providers

Agar Gmail app password use nahi karna chahte, `server.js` mein
`nodemailer.createTransport` ko Resend ya SendGrid ke SMTP details se bhi
replace kiya ja sakta hai — dono ka free tier available hai.

## New: AI Daily Blog (free, no extra signup needed)

Added `backend/blog.js` — auto-writes one travel blog post a day (title +
article + a matching AI image), using **Pollinations.ai**, which is free
and needs no API key. It's mounted at `/api/blog` in `server.js`.

- `GET /api/blog/latest` — today's post (auto-generates itself the first
  time it's requested each day).
- `GET /api/blog/list` — recent posts.
- `POST /api/blog/set-topic` — queue a topic for tomorrow's post
  (`{ topic, adminKey }`). Leave it unset and the server picks its own
  topic from a rotating list.

Optional new environment variable on Render:
- `ADMIN_KEY` → any secret string of your choice. Protects the
  set-topic endpoint. On the site, open it with `?admin=1` in the URL
  (e.g. `https://yoursite.com/#blog?admin=1`... actually append it to
  the page URL itself, e.g. `https://yoursite.com/?admin=1#blog`) to
  see the "set tomorrow's topic" box.

### New: posts are now fact-checked against Wikipedia before writing

Before writing each day's post, `blog.js` now looks up the topic's subject
(e.g. "Kashmir", "Bali") on Wikipedia's free public API and hands the AI a
short factual summary to ground the article in, instead of letting it write
from pure guesswork. No new signup, key, or env var — it's free and
best-effort: if the lookup fails or finds nothing, the post still generates
exactly as before. This exists because both readers and AI answer engines
(Google AI Overviews, ChatGPT, Perplexity, etc.) favour accurate,
source-backed content over generic AI filler — that's what actually gets a
daily AI blog ranked, cited, and clicked into an enquiry.

### AI Content Provider — now editable from the Admin Dashboard (no redeploy)

`blog.js` and `packages.js` no longer decide the AI provider themselves —
they both call `generateText()` / `generateImageUrl()` from the new shared
`ai-provider.js`, which reads the current provider + API key from
`ai-settings-data.json` (same on-disk JSON pattern as `settings.js`).

- Go to the Admin Dashboard → **Settings → "AI Content Provider"**.
- Pick the text provider — **Gemini** (Google AI Studio), **OpenAI**, or
  the free **Pollinations** — and paste in the matching API key.
- Click **Save AI provider**. That's it — the very next blog post / weekly
  package uses the new provider/key. No env var, no code change, no
  redeploy, and no server restart needed.
- If the selected paid provider ever fails (expired/invalid key, quota hit,
  network issue), `ai-provider.js` automatically falls back to the free
  Pollinations provider for that one call and logs why — so a bad key can
  never stop the daily blog or weekly package from generating.
- Env vars (`AI_TEXT_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.)
  still work as a fallback default, but whatever is saved from the
  dashboard always takes priority.
- Image generation is currently always the free Pollinations provider
  (no key needed) — only the text provider is swappable for now.

Like the other `*-data.json` files in this project (`blog-data.json`,
`refer-data.json`, etc.), `ai-settings-data.json` holds a real secret (the
API key) once you save one — make sure it's excluded from git the same
way (see `.gitignore`) and only ever fetched over the admin-key-protected
`/api/ai-settings` route.

## New: India Packages now come from the backend (with weekly AI auto-add)

Added `backend/packages.js` — mounted at `/api/packages`. Same free
Pollinations.ai provider as the blog. India Packages are no longer
hardcoded on the frontend; the site fetches them from the backend.

- `GET /api/packages/india` — list (auto-adds one new AI-written
  package once a week, on the first visit of that week).
- `GET /api/packages/india/:id` — full detail (day-wise itinerary,
  hotel category, inclusions, exclusions, price/discount).
- `POST /api/packages/india` — add a package (admin).
- `PUT /api/packages/india/:id` — edit a package (admin).
- `DELETE /api/packages/india/:id` — remove a package (admin).

All admin routes are protected by the same `ADMIN_KEY` env var used
by the blog feature. On the site, open the India Packages tab with
`?admin=1` in the URL (e.g. `https://yoursite.com/?admin=1#india`) to
see the "add / manage packages" box — you can add new packages, and
delete any package (AI-added or your own) from there. Editing an
existing package's full itinerary is available via the `PUT` endpoint
directly for now (e.g. from Postman or a quick script) if you need to
change more than name/route/price.

## International Packages — same feature, separate data

International Packages now work exactly like India Packages: backend-
driven, one new AI-written package auto-added per week, and full admin
CRUD — but kept as completely separate endpoints/data so the two never
mix up:

- `GET /api/packages/international`, `GET /api/packages/international/:id`
- `POST` / `PUT` / `DELETE /api/packages/international/:id` (admin, same `ADMIN_KEY`)

Open the International Packages tab with `?admin=1` in the URL to see
its own "add / manage packages" box.

## New: Destination Wedding

Added `backend/wedding.js` — mounted at `/api/wedding`.

- `GET /api/wedding/venues` — curated list of destination wedding venues.
- `POST /api/wedding/enquiry` — saves a couple's enquiry (also emails it
  to `EMAIL_USER` if your Gmail app-password env vars from Step 1 are
  already set — no new env vars needed).
- `GET /api/wedding/admin/enquiries?adminKey=...` — view all enquiries
  (protected by the same `ADMIN_KEY` used by blog/packages).
- `POST` / `DELETE /api/wedding/venues/:id` — add/remove venues (admin).

## New: Refer & Earn (reward on confirmed booking, not on signup)

Added `backend/refer.js` (mounted at `/api/refer`) + `backend/bookings.js`
(mounted at `/api/bookings`) — these two work together:

- Every logged-in visitor gets a shareable referral code + link
  (`yoursite.com/?ref=CODE`).
- When someone signs up via that link, they're just LINKED to the
  referrer and get an instant ₹500 welcome bonus — the referrer earns
  **nothing yet** at this point.
- Every booking a customer confirms on the site is saved via
  `POST /api/bookings` (pending).
- Once you, the admin, mark that booking **confirmed** — either from the
  "Manage bookings" box on the Refer & Earn tab (open the site with
  `?admin=1`), or directly via `POST /api/bookings/admin/confirm`
  (`{ adminKey, bookingId }`) — two things happen automatically, only if
  that customer originally signed up through someone's referral link:
  1. The referrer is credited a **percentage** of that booking's amount
     (env var `REFERRAL_PERCENT`, defaults to `5` i.e. 5%).
  2. The referrer gets an email (in English) telling them their referral's
     booking is confirmed, how much they've earned, and asking them to
     reply with their **payment scanner (UPI QR) or UPI ID** so you can
     pay them out. Uses the same `EMAIL_USER`/`EMAIL_PASS` you already set
     up for OTP emails — no new email env vars needed.
- This is idempotent: confirming the same booking twice never double-pays
  the referrer.
- `GET /api/refer/admin/all?adminKey=...` — view all referrers and their
  earnings.
- `GET /api/bookings/admin/all?adminKey=...` — view every booking
  (pending + confirmed).

### New env var
- `REFERRAL_PERCENT` → optional, e.g. `10` for 10%. Defaults to `5` if
  not set.

## New: Leads & Conversions system

Added `backend/leads.js` (mounted at `/api/leads`) + a matching, purely
additive block at the bottom of `frontend/js/script.js`. This is the
"turn traffic into enquiries" layer on top of everything above:

- **WhatsApp floating button** on every page — one tap opens a chat with
  your number, pre-filled with a starter message. Also logs a lightweight
  lead in the background so a WhatsApp click still shows up in the
  dashboard even if the visitor never fills a form.
- **Exit-intent popup** (desktop) + a **25-second timed popup** (mobile,
  since there's no "mouse leaving the page" signal there) asking for a
  name, phone and what they're planning — shown once per session.
- **Sticky "Get a free quote" bar** that appears after the visitor scrolls
  past the fold, with a dismiss button.
- **Inline call-to-action under the AI daily blog post** — "liked this
  idea? let's plan it for you" with a one-line name+phone form, so blog
  traffic converts into enquiries instead of just reading and leaving.
  The blog's own AI writing prompt was also tweaked to end each post with
  one natural, non-pushy line inviting a free custom itinerary.
- **Newsletter signup box** in the footer.
- Every lead captured this way stores **first-touch and last-touch UTM /
  campaign data** (`utm_source`, `utm_medium`, `utm_campaign`, `gclid`,
  `fbclid`, landing page, referrer) — so you can see which traffic source
  (Google Ads, Instagram, a specific blog post, etc.) is actually
  producing leads, not just how many leads you got.
- If you later add Google Analytics 4 or Meta Pixel to the site (their
  own snippet in `<head>` — not included here), every conversion
  (`lead_submit`, `whatsapp_click`, `popup_shown`, `popup_conversion`,
  `page_view`) is already pushed to `window.dataLayer` / `window.fbq`
  automatically, no extra wiring needed.
- Best-effort email to your team inbox on every new lead, reusing the
  same `EMAIL_USER`/`EMAIL_PASS` already set up for OTP emails.

### Admin: Leads dashboard

Open the site with `?admin=1` in the URL and a small "Leads dashboard"
button appears bottom-left. Enter your `ADMIN_KEY` (same one used
everywhere else in this project) to see every lead — name, phone, email,
what they're planning, which source and campaign brought them in, and a
status dropdown (`new` / `contacted` / `converted` / `closed`) so your
sales team can work through the list.

- `GET /api/leads/admin/all?adminKey=...` — all leads + a source/status
  breakdown.
- `POST /api/leads/admin/status` — update a lead's status
  (`{ adminKey, leadId, status }`).

No new environment variables are required — it reuses `ADMIN_KEY` and the
existing mailer env vars.

## New: Fixed Departures — now backend-driven with real, live seat counts

Added `backend/fixed.js` — mounted at `/api/fixed`. Fixed Departures
(the group tours with a set date) used to be hardcoded on the frontend,
including the "seats left" numbers, which never actually changed no
matter how many people booked.

Now:

- `GET /api/fixed` — list of all fixed departures, with live seat counts
  read straight from disk every time.
- `GET /api/fixed/:id` — one departure's full detail (itinerary, hotel,
  inclusions, exclusions, all its date options).
- `GET /api/fixed/:id/availability` — that departure's date options,
  grouped by month. This is what the **"Check Availability"** button on
  the site's Fixed Departure detail page calls, so it always shows the
  freshest numbers even on a page that's been open a while.
- Every time a customer books a fixed departure, the exact date they
  picked automatically loses one seat — so "kitni seat available hai"
  actually goes down with real bookings instead of being a fixed number.
- Admin: `POST /api/fixed` (add a new departure), `PUT /api/fixed/:id`
  (edit its fields), `DELETE /api/fixed/:id` (remove it),
  `PUT /api/fixed/:id/dates` (set or add one date's seat count — the
  main "update available seats" endpoint), and
  `DELETE /api/fixed/:id/dates/:date` (remove one date option). All
  protected by the same `ADMIN_KEY` used everywhere else in this
  project.
- On the combined Admin Dashboard (`frontend/admin.html`), open the
  **Fixed Departures** tab to add new departures and manage each one's
  dates and seat counts directly — no Postman needed.

No new environment variables — this reuses the existing `ADMIN_KEY`.



Until now, every admin panel above (blog, packages, customize, bookings,
refer, wedding, leads) was scattered across the public site — you had to
open it with `?admin=1` and paste the raw `ADMIN_KEY` into a separate box
on every single tab.

Added `backend/admin-auth.js` (mounted at `/api/admin`) + `frontend/admin.html`
— a single, separate dashboard page with a real username/password login. It
does **not** touch or replace any of the `?admin=1` boxes already on the
main site; both still work if you ever need them, but you'll normally just
use this instead.

### How to open it

Deploy `frontend/admin.html` exactly like the rest of the frontend folder
(same static host as `index.html`) and open:

```
https://your-frontend-domain.com/admin.html
```

Log in with the username/password you set below. Once logged in you'll see
one sidebar with every tab: **Overview, AI Daily Blog, India Packages,
International Packages, Fixed Departures, Customize Package, Bookings,
Refer & Earn, Destination Wedding, Leads & Conversions** — each talks to the exact same
backend endpoints documented above, just from one place. The dashboard
fetches your `ADMIN_KEY` automatically right after login, so you never type
it in by hand again. The session is kept in the browser tab only
(`sessionStorage`) and expires after 12 hours or when the tab is closed —
log in again any time with `/admin.html`.

### New environment variables on Render

- `ADMIN_USERNAME` → the login username (defaults to `admin` if unset).
- `ADMIN_PASSWORD` → the login password. Pick something strong — this is
  the front door to your whole business's data.
  - Optional, more secure alternative: `ADMIN_PASSWORD_HASH`, a bcrypt hash
    instead of a plain password (wins over `ADMIN_PASSWORD` if both are
    set). Generate one locally with:
    ```
    node -e "console.log(require('bcryptjs').hashSync('yourPassword',10))"
    ```
- Reuses the `ADMIN_KEY` and `JWT_SECRET` you already have set — no
  duplicate secret to manage.

Login attempts are rate-limited (10 per 15 minutes per IP) so the login
form can't be brute-forced.

See `backend/.env.example` for a complete list of every environment
variable used across the whole project (existing + new).

---

## 🔧 OTP email nahi aa raha? Yaha se check karo

Agar login karte time OTP email client ki inbox mein nahi pahunch raha, iska
matlab hai server email bhej hi nahi pa raha (ya spam mein ja raha hai). Yeh
naya diagnostic tool use karo — bina Render logs khole bhi asli reason pata
chal jayega:

1. Apne backend ko latest code ke saath redeploy karo (isme naya
   `/api/admin/test-email` route add hua hai).
2. Browser ka address bar mein ye URL kholo (apna backend URL aur admin
   key daal ke) — ya Postman/browser console se ye chalao:

   ```js
   fetch("https://tourpackagewala-backend.onrender.com/api/admin/test-email", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ adminKey: "YAHA_APNI_ADMIN_KEY_DAALO", to: "apna-email@gmail.com" })
   }).then(r => r.json()).then(console.log)
   ```

3. Jo response aayega, wahi asli wajah bata dega:
   - **"EMAIL_USER / EMAIL_PASS are not set..."** → Render → Environment
     mein ye dono variable set hi nahi hain. Step 1 & 2 (upar) follow karo.
   - **"Invalid login"** → sabse common wajah. `EMAIL_PASS` mein apna
     normal Gmail password daala hua hai — Gmail normal password se login
     allow nahi karta. 2-Step Verification on karke naya **App Password**
     banao (16-character, spaces hata ke) aur `EMAIL_PASS` mein wahi daalo.
   - **"ok: true, Test email sent..."** → server sahi se email bhej raha
     hai. Ab check karo:
     - Client ka **Spam / Junk / Promotions** folder — OTP emails naye
       Gmail account se aksar wahi chale jate hain shuruaat mein.
     - Kahin client galat email ID type to nahi kar raha login form mein.

4. Server start hote hi Render ke **Logs** tab mein bhi ek line dikhegi:
   - `✅ Email transporter verified` → email setup sahi hai.
   - `❌ EMAIL SENDING IS BROKEN` → uske saamne wajah bhi likhi hogi.

Is naye route ko bhi wahi `ADMIN_KEY` protect karta hai jo baaki admin
routes use karte hain, so koi bhi random insaan isse spam ke liye use nahi
kar sakta.

---

## 📞 Contact email/phone/WhatsApp change karne pe sirf mera hi device p dikhta hai, baad mein wapas purana aa jata hai?

Ye bhi Render free hosting ke **disk permanent na hone** wali wahi limitation
hai jo upar OTP section mein bataya gaya — thodi der inactive rehne pe
Render free service so jaati hai, aur next request pe wapas jagte waqt saari
locally-saved files (`settings-data.json` samet) reset ho jaati hain apne
purane hardcoded values pe. Isiliye jis device se change kiya wahi turant
dikhta hai (jab tak server chalu hai), lekin thodi der baad koi bhi device
purana email/number dekhta hai.

**Permanent fix**: Admin Dashboard se change karne ke saath-saath, Render →
apni service → **Environment** mein ye variables bhi set kar do — ye kabhi
reset nahi hote, chahe server so jaye ya redeploy ho:

- `CONTACT_EMAIL` → jo email dikhana hai
- `CONTACT_PHONE` → primary phone number
- `CONTACT_PHONE_ALT` → secondary phone number (optional)
- `WHATSAPP_NUMBER` → digits only, country code ke saath (jaise `919639343585`)

Env var set karne ke baad service ek baar **redeploy/restart** karo — ab ye
value hamesha ke liye stick karegi, har device pe, server restart hone ke
baad bhi. Admin Dashboard ka "Save" button ab bhi turant kaam karega (bina
redeploy ke) — bas woh sirf tab tak tikta hai jab tak server dobara restart
na ho; permanent rakhne ke liye env var hi asli tarika hai.

⚠️ **Note**: Yehi wajah Bookings, Leads, Refer & Earn, Wedding enquiries
jaisa transactional data pe bhi lagu hoti hai — ye sab bhi isi tarah ki
local JSON file mein save hote hain, jo Render free tier pe restart pe
reset ho sakti hai. Agar aap chahte ho ki customer bookings/leads kabhi na
khoye, to Render ka paid plan lo jisme **Persistent Disk** add-on hota hai,
ya inhe ek real database (jaise MongoDB Atlas ka free tier) mein migrate
karvao — ye ek bada change hai, jab chaho bata dena, main woh bhi kar dunga.

---

## 🗄️ Permanent storage for Bookings, Leads, Refer & Earn, Wedding enquiries (free MongoDB Atlas)

**Problem this fixes**: Bookings, Leads, Refer & Earn, aur Wedding
enquiries — ye sab customer ka **real data** hai. Pehle ye sab ek local
JSON file mein save hota tha, jo Render free tier ke disk pe rehta tha —
aur wo disk **permanent nahi hai**. Server so ke jaagne pe, ya redeploy
hone pe, ye file wipe ho jaati thi aur customer ka data gayab ho jata tha.

**Fix**: Ab is code mein `MONGODB_URI` set karte hi ye sab data ek free
MongoDB Atlas cluster mein save hone lagega — jo kabhi wipe nahi hota,
chahe Render server kitni baar bhi so-jaag jaye ya redeploy ho.

⚠️ **Agar aap `MONGODB_URI` set nahi karte, to bhi site kaam karegi** —
bas ye sab data purane tarike se local file mein hi save hota rahega
(wahi restart-reset risk ke saath). Ye setup optional hai lekin **strongly
recommended** hai kyunki isme real customer bookings/leads/paise ka
hisaab involved hai.

### Step 1 — Free MongoDB Atlas cluster banao (5 minute, credit card nahi chahiye)

1. [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) pe jaake free account banao.
2. "Build a Database" pe click karo → **M0 (Free)** tier choose karo → koi bhi region select karo (jo aapke Render server ke paas ho, jaise Mumbai/Singapore) → "Create".
3. **Database User** banane ko kahega — ek username/password set karo (isse yaad rakho, aage lagega). "Create User" pe click karo.
4. **Network Access** step mein "Allow Access from Anywhere" choose karo (ya manually `0.0.0.0/0` add karo). Ye zaroori hai kyunki Render ka IP address fixed nahi hota.
5. "Finish and Close" ke baad, apne cluster ke "Connect" button pe click karo → **"Drivers"** choose karo → Node.js driver ka **connection string** copy karo. Ye kuch aisa dikhega:

   ```
   mongodb+srv://tumhara_username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. Us string mein `<password>` ki jagah apna asli password daal do (jo Step 3 mein banaya tha).

### Step 2 — Render mein env var set karo

1. Render dashboard → apni backend service → **Environment** tab.
2. Naya variable add karo:
   - **Key**: `MONGODB_URI`
   - **Value**: Step 1 wali poori connection string (password ke saath)
3. Save karo — Render service khud-ba-khud restart ho jayegi.

### Step 3 — Confirm karo ki connect ho gaya

Render ke **Logs** tab mein service restart hone ke turant baad ye line dhundo:

- `✅ MongoDB connected — bookings/leads/referrals/wedding enquiries are now permanent.` → sab set hai, ab data kabhi nahi khoyega.
- `❌ MongoDB connection failed...` → connection string galat hai (password check karo, `<password>` ki jagah asli password daala hai ya nahi), ya Network Access mein `0.0.0.0/0` allow nahi kiya.
- Agar `MONGODB_URI` bilkul set hi nahi kiya, to `⚠️  MONGODB_URI is not set...` dikhega — matlab ab bhi purane local-file tarike se chal raha hai.

Ye ek baar set karne ke baad, koi code change ya dubara zip download karne ki zaroorat nahi — data hamesha ke liye Mongo mein save hota rahega, chahe Render kitni baar bhi restart/redeploy ho.

### Ye kya-kya cover karta hai

- ✅ Bookings (`/api/bookings`)
- ✅ Leads (`/api/leads`)
- ✅ Refer & Earn — codes, referred count, reward earned (`/api/refer`)
- ✅ Destination Wedding — enquiries AND admin-added venues (`/api/wedding`)

Baaki modules (Blog posts, India/International Packages, Fixed Departures
seat counts, AI provider settings, Site contact settings) filhal isi
upgrade mein shaamil nahi hain — wo apne purane tarike se hi kaam karte
hain (Site Settings pehle se hi env-var fallback wala fix use karta hai,
upar dekho). Agar chaho to inhe bhi isी Mongo store mein migrate kar sakta
hoon — bata dena.
