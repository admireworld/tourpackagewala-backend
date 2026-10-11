/* ===========================================================
   AdmireDworld Travel — front-end logic

   OTP LOGIN:
   OTP is generated, bcrypt-hashed, stored, and verified on the
   backend exactly as before (5-min expiry, single-use, rate
   limited). Point API_BASE_URL at your deployed backend (see
   /backend/README-DEPLOY.md for how to deploy it for free).

   CHANGED — OTP DELIVERY NOW VIA EMAILJS (sent from the browser):
   The backend's server-side SMTP (Gmail/nodemailer) was unreliable
   on the free hosting tier, so OTP emails weren't reaching
   customers. /api/send-otp now returns the OTP in its response,
   and THIS file sends it to the customer's inbox using EmailJS
   (emailjs.com — free tier, sends straight from the browser, no
   backend SMTP involved). Fill in the three EMAILJS_* values below
   after setting up a free EmailJS account — see
   /frontend/README-EMAILJS.md for exact steps.
=========================================================== */
const API_BASE_URL = "https://tourpackagewala-backend.onrender.com";

/* ---------- EmailJS config (for sending the login OTP) ----------
 * Get these from https://dashboard.emailjs.com after following
 * /frontend/README-EMAILJS.md — takes about 5 minutes, free tier
 * covers 200 emails/month which is plenty for OTP logins.
 */
const EMAILJS_PUBLIC_KEY  = "KPnBOycv19y-cCULj";   // Account → General → Public Key
const EMAILJS_SERVICE_ID  = "service_qmjc6uo";     // Email Services → your service's ID
const EMAILJS_TEMPLATE_ID = "template_a0ogwoj";    // Email Templates → your template's ID

if (window.emailjs && EMAILJS_PUBLIC_KEY && !EMAILJS_PUBLIC_KEY.startsWith("YOUR_")) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

/* Sends the OTP to the customer's inbox via EmailJS. Throws if EmailJS
 * isn't configured yet (caught by the callers below, shown as a friendly
 * error) or if EmailJS itself fails to send. */
async function sendOtpViaEmailJS(toEmail, toName, otp){
  if (!window.emailjs) {
    throw new Error("Email service failed to load. Please refresh the page and try again.");
  }
  if (!EMAILJS_PUBLIC_KEY || EMAILJS_PUBLIC_KEY.startsWith("YOUR_") ||
      !EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID.startsWith("YOUR_") ||
      !EMAILJS_TEMPLATE_ID || EMAILJS_TEMPLATE_ID.startsWith("YOUR_")) {
    throw new Error("OTP email isn't set up yet — see /frontend/README-EMAILJS.md to finish configuration.");
  }
  await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: toEmail,
    to_name: toName,
    otp: otp,
  });
}

/* ---------- SPA deep-link restore (for static hosts without URL rewrites) ----------
 * If this static site is hosted somewhere that can't rewrite every path to
 * index.html (see 404.html + PACKAGE-DETAIL-PAGE-UPDATE.md), the 404 page
 * bounces the browser to "/?p=/package/india/...". As soon as we see that
 * "p" param, put the real path back in the address bar (so the rest of the
 * app — and the package deep-link logic further down — just sees a normal
 * "/package/..." URL) before anything else on the page runs.
 */
(function restoreDeepLinkFromRedirect(){
  const params = new URLSearchParams(location.search);
  const restored = params.get("p");
  if(restored && restored.startsWith("/")){
    history.replaceState(null, "", restored);
  }
})();

/* ---------- Package data ---------- */
const indiaPackages = [
  { id:"in1", name:"Kashmir Valley Escape", loc:"Srinagar · Gulmarg · Pahalgam", tag:"6D/5N", cat:"hills",
    desc:"Shikara stays, snow-capped meadows and Mughal gardens.", price:24999, colors:["#2B3968","#3D5FA8"] },
  { id:"in2", name:"Kerala Backwaters", loc:"Alleppey · Kumarakom · Munnar", tag:"5D/4N", cat:"offbeat",
    desc:"Houseboat nights and tea garden mornings.", price:21999, colors:["#3D5FA8","#2C4680"] },
  { id:"in3", name:"Royal Rajasthan", loc:"Jaipur · Udaipur · Jodhpur", tag:"7D/6N", cat:"heritage",
    desc:"A combo of forts, havelis and desert sunsets.", price:28999, colors:["#C98620","#2B3968"] },
  { id:"in4", name:"Goa Beach Break", loc:"North &amp; South Goa", tag:"4D/3N", cat:"beach",
    desc:"Beach shacks, water sports and laid-back vibes.", price:15999, colors:["#3D5FA8","#E3A23E"] },
  { id:"in5", name:"Himachal Hills", loc:"Manali · Shimla · Kasol", tag:"6D/5N", cat:"hills",
    desc:"Pine forests, river valleys and mountain cafes.", price:19999, colors:["#2B3968","#3D5FA8"] },
  { id:"in6", name:"Meghalaya Offbeat", loc:"Shillong · Cherrapunji", tag:"5D/4N", cat:"offbeat",
    desc:"Living root bridges and waterfall trails.", price:23999, colors:["#2C4680","#3D5FA8"] },
];

const intlPackages = [
  { id:"it1", name:"Bali Island Retreat", loc:"Ubud · Seminyak · Nusa Penida", tag:"6D/5N", cat:"beach",
    desc:"Rice terraces, beach clubs and temple visits.", price:54999, colors:["#3D5FA8","#E3A23E"] },
  { id:"it2", name:"Dubai City Lights", loc:"Downtown · Palm Jumeirah", tag:"5D/4N", cat:"city",
    desc:"Desert safari, skyline views and shopping.", price:49999, colors:["#2B3968","#C98620"] },
  { id:"it3", name:"Switzerland Alps", loc:"Zurich · Interlaken · Lucerne", tag:"7D/6N", cat:"scenic",
    desc:"Snow trains and alpine lake towns.", price:129999, colors:["#3D5FA8","#2B3968"] },
  { id:"it4", name:"Maldives Overwater", loc:"Male Atoll", tag:"4D/3N", cat:"honeymoon",
    desc:"Overwater villas and coral reef snorkeling.", price:89999, colors:["#2C4680","#3D5FA8"] },
  { id:"it5", name:"Thailand Highlights", loc:"Bangkok · Phuket · Krabi", tag:"6D/5N", cat:"beach",
    desc:"Islands, street food and night markets.", price:44999, colors:["#3D5FA8","#2B3968"] },
  { id:"it6", name:"Singapore Explorer", loc:"Marina Bay · Sentosa", tag:"5D/4N", cat:"city",
    desc:"Skyline views, theme parks and gardens.", price:59999, colors:["#2B3968","#3D5FA8"] },
];

const fixedDepartures = [
  { id:"fd1", name:"Char Dham Yatra", loc:"Yamunotri · Gangotri · Kedarnath · Badrinath", date:"12 May 2027",
    d:"12", m:"May", days:"11D/10N", seats:8, price:32999,
    fromCity:"Haridwar", badge:"Guaranteed Departure",
    shortDesc:"An 11-day pilgrimage circuit covering all four sacred Himalayan shrines — Yamunotri, Gangotri, Kedarnath and Badrinath — with comfortable stays and a dedicated tour manager throughout.",
    dateOptions:[
      { d:"12", m:"May", date:"12 May 2027", seats:8 },
      { d:"26", m:"May", date:"26 May 2027", seats:14 },
      { d:"09", m:"Jun", date:"09 Jun 2027", seats:6 },
    ],
    highlights:[
      "10 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Private vehicle for the entire circuit with an experienced driver",
      "Darshan assistance at all four Dhams",
      "Service of an experienced tour manager throughout the yatra",
    ],
    dayWise:[
      { day:1, title:"Arrival in Haridwar — Welcome to the Yatra", desc:"Pick-up on arrival and transfer to the hotel. Evening at leisure to attend the Ganga Aarti at Har Ki Pauri." },
      { day:2, title:"Haridwar to Barkot", desc:"Drive to Barkot via Mussoorie. Check-in and overnight stay." },
      { day:3, title:"Barkot – Yamunotri – Barkot", desc:"Early drive to Janki Chatti, trek/pony to Yamunotri for darshan, return to Barkot by evening." },
      { day:4, title:"Barkot to Uttarkashi", desc:"Drive to Uttarkashi, visit Vishwanath Temple, overnight stay." },
      { day:5, title:"Uttarkashi – Gangotri – Uttarkashi", desc:"Drive to Gangotri for darshan at the source of the Ganga, return to Uttarkashi." },
      { day:6, title:"Uttarkashi to Guptkashi", desc:"Long scenic drive to Guptkashi, overnight stay." },
      { day:7, title:"Guptkashi – Kedarnath", desc:"Drive to Gaurikund, trek/pony/heli to Kedarnath, evening darshan, overnight at Kedarnath." },
      { day:8, title:"Kedarnath to Guptkashi", desc:"Early morning darshan, descend to Gaurikund and drive back to Guptkashi." },
      { day:9, title:"Guptkashi to Badrinath", desc:"Drive to Badrinath via Joshimath, evening darshan at the shrine." },
      { day:10, title:"Badrinath to Rudraprayag", desc:"Morning darshan, drive to Rudraprayag, overnight stay." },
      { day:11, title:"Rudraprayag to Haridwar — Departure", desc:"Drive back to Haridwar and onward departure. Tour ends with wonderful memories." },
    ],
    hotel:{ name:"Hotel Ganga Kinare or similar", stars:3, address:"Near Har Ki Pauri, Haridwar", room:"Standard Room", meals:"Breakfast & Dinner" },
    included:[
      "10 nights' accommodation (3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private AC vehicle for the entire circuit",
      "Toll, parking and driver allowance included",
      "Service of an experienced tour manager",
      "All applicable taxes",
    ],
    exclusions:[
      "Airfare / train fare to and from Haridwar",
      "Personal expenses such as tips, laundry and phone calls",
      "Pony, palki or helicopter charges at Kedarnath/Yamunotri",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
  { id:"fd2", name:"Ladakh Bike Expedition", loc:"Leh · Nubra Valley · Pangong Tso", date:"03 Jun 2027",
    d:"03", m:"Jun", days:"9D/8N", seats:5, price:38999,
    fromCity:"Delhi", badge:"Small Group",
    shortDesc:"A 9-day self-ride motorcycle expedition through Leh, Nubra Valley and Pangong Tso, with acclimatization built in and full mechanical support on the road.",
    dateOptions:[
      { d:"03", m:"Jun", date:"03 Jun 2027", seats:5 },
      { d:"17", m:"Jun", date:"17 Jun 2027", seats:9 },
      { d:"01", m:"Jul", date:"01 Jul 2027", seats:7 },
    ],
    highlights:[
      "Royal Enfield (or similar) bike with fuel and rider insurance",
      "Backup vehicle for luggage and mechanical support",
      "8 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Experienced ride captain and support crew",
    ],
    dayWise:[
      { day:1, title:"Arrival in Leh", desc:"Fly into Leh, transfer to hotel, complete acclimatization rest day." },
      { day:2, title:"Leh Local Sightseeing", desc:"Visit Shanti Stupa, Leh Palace and the Hall of Fame museum. Evening bike briefing." },
      { day:3, title:"Leh to Nubra Valley via Khardung La", desc:"Ride over Khardung La, one of the world's highest motorable passes, into Nubra Valley." },
      { day:4, title:"Nubra Valley Sightseeing", desc:"Visit Diskit Monastery, the sand dunes and enjoy a camel safari at Hunder." },
      { day:5, title:"Nubra Valley to Pangong Tso", desc:"Ride via the Shyok river route to the shores of Pangong Tso, overnight camping." },
      { day:6, title:"Pangong Tso to Leh via Chang La", desc:"Sunrise at the lake, ride back to Leh over Chang La pass." },
      { day:7, title:"Leh – Tso Moriri / Buffer Day", desc:"Optional ride to Tso Moriri, or a buffer day for weather/altitude rest." },
      { day:8, title:"Free Day in Leh", desc:"Bikes handed back, free time for shopping and exploring local markets." },
      { day:9, title:"Departure from Leh", desc:"Transfer to Leh airport for onward departure." },
    ],
    hotel:{ name:"Hotel Ladakh Greens or similar", stars:3, address:"Leh Market Road, Leh", room:"Deluxe Room", meals:"Breakfast & Dinner" },
    included:[
      "8 nights' accommodation (hotel + camp stays)",
      "Motorcycle rental with fuel and rider insurance",
      "Backup support vehicle and mechanic",
      "Daily breakfast and dinner",
      "Inner Line Permits for restricted areas",
      "Experienced ride captain",
    ],
    exclusions:[
      "Airfare to and from Leh",
      "Personal riding gear (helmet included, jacket/boots extra)",
      "Any damage to the motorcycle beyond normal wear",
      "Personal expenses and tips",
      "Travel/medical insurance for high-altitude travel",
    ] },
  { id:"fd3", name:"Kedarnath Yatra", loc:"Gaurikund · Kedarnath", date:"20 May 2027",
    d:"20", m:"May", days:"5D/4N", seats:12, price:16999,
    fromCity:"Haridwar", badge:"Guaranteed Departure",
    shortDesc:"A focused 5-day Kedarnath darshan yatra with comfortable base-camp stays, pony/palki assistance and a smooth Haridwar-to-Haridwar circuit.",
    dateOptions:[
      { d:"20", m:"May", date:"20 May 2027", seats:12 },
      { d:"03", m:"Jun", date:"03 Jun 2027", seats:18 },
      { d:"17", m:"Jun", date:"17 Jun 2027", seats:9 },
    ],
    highlights:[
      "4 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Private vehicle from Haridwar to Guptkashi and back",
      "Pony/palki booking assistance at Gaurikund",
      "Service of an experienced tour manager",
    ],
    dayWise:[
      { day:1, title:"Arrival in Haridwar", desc:"Pick-up on arrival and transfer to the hotel. Evening Ganga Aarti at Har Ki Pauri." },
      { day:2, title:"Haridwar to Guptkashi", desc:"Scenic drive to Guptkashi via Rudraprayag, overnight stay." },
      { day:3, title:"Guptkashi – Gaurikund – Kedarnath", desc:"Drive to Gaurikund, trek/pony/heli to Kedarnath, evening darshan, overnight at Kedarnath." },
      { day:4, title:"Kedarnath to Guptkashi", desc:"Early morning darshan, descend to Gaurikund and drive back to Guptkashi." },
      { day:5, title:"Guptkashi to Haridwar — Departure", desc:"Drive back to Haridwar for onward departure." },
    ],
    hotel:{ name:"GMVN Tourist Rest House or similar", stars:2, address:"Guptkashi, near Kedarnath base route", room:"Standard Room", meals:"Breakfast & Dinner" },
    included:[
      "4 nights' accommodation (2/3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private vehicle from Haridwar to Guptkashi and back",
      "Toll, parking and driver allowance included",
      "Service of an experienced tour manager",
    ],
    exclusions:[
      "Airfare / train fare to and from Haridwar",
      "Pony, palki or helicopter charges at Kedarnath",
      "Personal expenses such as tips and laundry",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
  { id:"fd4", name:"Europe Grand Tour", loc:"Paris · Amsterdam · Rome · Venice", date:"14 Sep 2027",
    d:"14", m:"Sep", days:"12D/11N", seats:6, price:159999,
    fromCity:"Delhi", badge:"Flexi Holiday",
    shortDesc:"A 12-day grand circuit through Paris, Amsterdam, Lucerne, Venice and Rome — Europe's most iconic cities, hotels and photo stops, all in one seamless group tour.",
    dateOptions:[
      { d:"14", m:"Sep", date:"14 Sep 2027", seats:6 },
      { d:"05", m:"Oct", date:"05 Oct 2027", seats:10 },
      { d:"19", m:"Oct", date:"19 Oct 2027", seats:4 },
    ],
    highlights:[
      "11 nights' accommodation in centrally located 3-star hotels",
      "Daily breakfast included",
      "Inter-city travel by train/coach across 5 cities",
      "Seine river cruise and gondola ride in Venice",
      "Service of English-speaking local tour guides",
    ],
    dayWise:[
      { day:1, title:"Arrival in Paris — Welcome to Europe", desc:"Transfer to hotel. Evening Seine river cruise to see Paris lit up at night." },
      { day:2, title:"Paris Sightseeing", desc:"Admire the Eiffel Tower and Louvre Museum (photo stop), stroll down the Champs-Élysées." },
      { day:3, title:"Paris to Amsterdam", desc:"Travel by high-speed train to Amsterdam, check-in and evening at leisure." },
      { day:4, title:"Amsterdam Sightseeing", desc:"Canal cruise through the city and a visit to Dam Square." },
      { day:5, title:"Amsterdam to Cologne", desc:"Drive along the Rhine Valley to Cologne, visit the famous Cologne Cathedral." },
      { day:6, title:"Cologne to Lucerne", desc:"Scenic drive into Switzerland, check-in at Lucerne." },
      { day:7, title:"Lucerne — Mount Titlis Excursion", desc:"Cable car excursion to Mount Titlis for snow-capped alpine views." },
      { day:8, title:"Lucerne to Venice via Milan", desc:"Drive through Milan (photo stop) to Venice." },
      { day:9, title:"Venice Sightseeing", desc:"Gondola ride through the canals and a visit to St. Mark's Square." },
      { day:10, title:"Venice to Rome", desc:"Travel to Rome, check-in and evening at leisure." },
      { day:11, title:"Rome Sightseeing", desc:"Visit the Colosseum and Vatican Museums (photo stop)." },
      { day:12, title:"Departure from Rome — Until We Meet Again", desc:"Transfer to Rome airport for onward departure." },
    ],
    hotel:{ name:"Ibis Styles or similar", stars:3, address:"City-centre hotels across the route", room:"Standard Room", meals:"Breakfast only" },
    included:[
      "11 nights' accommodation (3-star properties or similar)",
      "Daily breakfast",
      "Inter-city travel by train/coach",
      "Seine river cruise and Venice gondola ride",
      "Service of English-speaking local tour guides",
      "All parking fees and highway tolls",
    ],
    exclusions:[
      "International airfare to and from Europe",
      "Schengen visa fees",
      "Lunch and dinner (except where mentioned)",
      "Entry tickets to monuments not listed as included",
      "Travel insurance and personal expenses",
    ] },
  { id:"fd5", name:"Northeast India Circuit", loc:"Shillong · Kaziranga · Tawang", date:"08 Oct 2027",
    d:"08", m:"Oct", days:"8D/7N", seats:10, price:27999,
    fromCity:"Guwahati", badge:"Guaranteed Departure",
    shortDesc:"An 8-day offbeat circuit across Meghalaya, Assam and Arunachal Pradesh — living root bridges, wildlife safaris and high-altitude monasteries.",
    dateOptions:[
      { d:"08", m:"Oct", date:"08 Oct 2027", seats:10 },
      { d:"22", m:"Oct", date:"22 Oct 2027", seats:14 },
      { d:"05", m:"Nov", date:"05 Nov 2027", seats:7 },
    ],
    highlights:[
      "7 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Jeep and elephant safari inside Kaziranga National Park",
      "Living root bridge trek at Cherrapunji",
      "Private vehicle for the entire circuit",
    ],
    dayWise:[
      { day:1, title:"Arrival in Guwahati — Transfer to Shillong", desc:"Pick-up from Guwahati airport, scenic drive to Shillong, overnight stay." },
      { day:2, title:"Shillong Sightseeing", desc:"Visit Umiam Lake and Shillong Peak for panoramic valley views." },
      { day:3, title:"Shillong to Cherrapunji", desc:"Trek to the living root bridges and visit the Nohkalikai waterfalls." },
      { day:4, title:"Cherrapunji to Kaziranga", desc:"Drive to Kaziranga, evening at leisure near the national park." },
      { day:5, title:"Kaziranga National Park Safari", desc:"Jeep and elephant safari to spot the one-horned rhinoceros and other wildlife." },
      { day:6, title:"Kaziranga to Bomdila", desc:"Long scenic drive into Arunachal Pradesh, overnight stay at Bomdila." },
      { day:7, title:"Bomdila to Tawang", desc:"Drive to Tawang, visit the historic Tawang Monastery." },
      { day:8, title:"Tawang to Guwahati — Departure", desc:"Return drive to Guwahati for onward departure." },
    ],
    hotel:{ name:"Hotel Polo Towers or similar", stars:3, address:"Police Bazar, Shillong", room:"Standard Room", meals:"Breakfast & Dinner" },
    included:[
      "7 nights' accommodation (3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private vehicle for the entire circuit",
      "Jeep and elephant safari charges at Kaziranga",
      "Inner Line Permit assistance for Arunachal Pradesh",
      "Toll, parking and driver allowance included",
    ],
    exclusions:[
      "Airfare to and from Guwahati",
      "Camera fees at national parks/monasteries",
      "Personal expenses such as tips and laundry",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
];

/* Shared Terms & Conditions shown on every Fixed Departure detail page. */
const FIXED_TOUR_TERMS = [
  "Minimum 2 travellers are required for a guaranteed departure.",
  "Seats cannot be held without an advance deposit.",
  "A 20% deposit is required to confirm the booking.",
  "100% payment must be completed 15 days prior to departure.",
  "Standard hotel check-in time is 14:00 hrs and check-out is 12:00 hrs.",
  "Early check-in and late check-out are subject to availability and may attract an extra charge.",
  "If a mentioned hotel is unavailable, a similar-category property will be provided.",
  "Itinerary sequence may change due to weather, road conditions or local restrictions, without reducing the number of sightseeing points covered.",
  "Package rates are based on the specified room category — any upgrade will be at an additional cost.",
  "Cancellation and refund policy will be shared at the time of booking confirmation.",
];

const allPackages = [...indiaPackages, ...intlPackages];

/* ---------- Card / list rendering ---------- */
function money(n){ return "₹" + n.toLocaleString("en-IN"); }

function cardSvg(colors){
  const [c1,c2] = colors;
  return `<svg viewBox="0 0 300 170" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${c1.replace('#','')}${c2.replace('#','')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="300" height="170" fill="url(#g${c1.replace('#','')}${c2.replace('#','')})"/>
    <path d="M0 120 L60 90 L110 115 L170 75 L230 110 L300 85 L300 170 L0 170 Z" fill="rgba(0,0,0,0.18)"/>
    <circle cx="245" cy="42" r="20" fill="rgba(255,255,255,0.25)"/>
  </svg>`;
}

/* ---------- Real photo support for every card ----------
   Two-layer fallback so a photo ALWAYS shows, fast:
   1) Pollinations.ai — free AI photo matched to the destination name.
   2) Picsum.photos — free, instant, always-available stock photo used
      automatically (via onerror) if Pollinations is slow/unreachable.
   The seed is derived from the text itself, so the same package/venue
   always gets the same photo instead of a new random one on reload.
   Cards that already get a real photo from the backend (India/
   International packages) simply overwrite the <img src> with their
   own imageUrl — see toFrontendShape() / applyPackageImages() below,
   both still doing exactly what they did before. */
function seedFromText(seedText){
  let seed = 7;
  for (const ch of String(seedText)) seed = (seed * 31 + ch.charCodeAt(0)) % 1000000;
  return seed;
}
function photoUrl(seedText, w, h){
  w = w || 640; h = h || 400;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    seedText + ", travel photography, scenic, vibrant, high quality"
  )}?width=${w}&height=${h}&seed=${seedFromText(seedText)}&nologo=true`;
}
function fallbackPhotoUrl(seedText, w, h){
  w = w || 640; h = h || 400;
  return `https://picsum.photos/seed/${seedFromText(seedText)}/${w}/${h}`;
}
function photoImgHTML(seedText, altText, w, h){
  const primary = photoUrl(seedText, w, h).replace(/'/g, "%27");
  const fallback = fallbackPhotoUrl(seedText, w, h);
  const alt = String(altText || "").replace(/"/g, "&quot;");
  return `<img class="card-photo" src="${primary}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}';">`;
}

let WHATSAPP_NUMBER = "919639343585"; // shown as a "Chat on WhatsApp" button under every package — editable from Admin Dashboard → Settings (see loadSiteContact() below)

/* ---------- Site contact settings (editable from Admin Dashboard → Settings) ----------
   Defaults below match what used to be hardcoded across the site, so
   nothing changes until an admin actually updates them. On load, this
   fetches the current values from the backend (GET /api/settings) and:
   1) swaps WHATSAPP_NUMBER above, so every "Chat on WhatsApp" button/link
      built from here on uses the new number,
   2) updates the footer email/phone links directly (they have fixed ids),
   3) sweeps any wa.me links already rendered before the fetch finished,
      so timing doesn't matter either way.
   Best-effort: if this fails (backend not deployed yet, offline, etc.),
   the page just keeps using the same defaults it always had. */
let SITE_CONTACT = {
  contactEmail: "hello@admiredworld.travel",
  contactPhone: "+91 96393 43585",
  contactPhoneAlt: "+91 78381 91329",
  whatsappNumber: WHATSAPP_NUMBER,
};
function applySiteContactToDOM(){
  const emailEl = document.getElementById("footerEmail");
  if(emailEl){
    emailEl.href = `mailto:${SITE_CONTACT.contactEmail}`;
    emailEl.textContent = SITE_CONTACT.contactEmail;
  }
  const phone1El = document.getElementById("footerPhone1");
  if(phone1El && SITE_CONTACT.contactPhone){
    phone1El.href = `tel:${SITE_CONTACT.contactPhone.replace(/[^0-9+]/g, "")}`;
    phone1El.textContent = SITE_CONTACT.contactPhone;
  }
  const phone2El = document.getElementById("footerPhone2");
  if(phone2El && SITE_CONTACT.contactPhoneAlt){
    phone2El.href = `tel:${SITE_CONTACT.contactPhoneAlt.replace(/[^0-9+]/g, "")}`;
    phone2El.textContent = SITE_CONTACT.contactPhoneAlt;
  }
  // Catch any "Chat on WhatsApp" links already built (per-package buttons,
  // the wedding hero button, the floating button) with the old number.
  document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
    a.href = a.href.replace(/wa\.me\/[0-9]+/, `wa.me/${WHATSAPP_NUMBER}`);
  });
}
async function loadSiteContact(){
  try{
    const res = await fetch(`${API_BASE_URL}/api/settings`);
    const data = await res.json();
    if(data && data.settings){
      SITE_CONTACT = { ...SITE_CONTACT, ...data.settings };
      if(data.settings.whatsappNumber) WHATSAPP_NUMBER = data.settings.whatsappNumber;
    }
  }catch{ /* keep defaults — never blocks the page */ }
  applySiteContactToDOM();
}
loadSiteContact();
const whatsappIconSvg = `<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.2-.2-.2-.5-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.2L2 22l4.9-1.3C8.4 21.5 10.1 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.7 0-3.3-.5-4.6-1.3l-.3-.2-3 .8.8-2.9-.2-.3C3.9 15 3.3 13.5 3.3 12c0-4.8 3.9-8.7 8.7-8.7s8.7 3.9 8.7 8.7-3.9 8.7-8.7 8.7z"/></svg>`;

function whatsappBtnHTML(itemName, extraClass){
  const text = encodeURIComponent(`Hi, I'm interested in the "${itemName}" on AdmireDworld Travel. Please share more details.`);
  return `<a class="pkg-whatsapp${extraClass ? " " + extraClass : ""}" href="https://wa.me/${WHATSAPP_NUMBER}?text=${text}" target="_blank" rel="noopener">${whatsappIconSvg}Chat on WhatsApp</a>`;
}

function packageCardHTML(p, type){
  const img = p.image
    ? `<img class="card-photo" src="${p.image}" alt="${p.name}" loading="lazy">`
    : photoImgHTML(`${p.name}, ${p.loc}`, p.name);
  // `type` ("india" | "international") is passed in by each call site so we
  // can build the real, crawlable /package/... URL here — see pkgDetailPath()
  // further down (hoisted, so it's safe to call from here). "View Full
  // Details" is now a real <a href>, not a <button>: it works with
  // middle-click / cmd-click / "open in new tab", degrades to a normal link
  // if JS hasn't run yet, and is intercepted for a fast SPA-style
  // transition on a plain left-click (see handlePkgCardClick()).
  const detailHref = type ? pkgDetailPath(type, p) : "#";
  return `
  <div class="pkg-card" data-cat="${p.cat}">
    <div class="pkg-media">
      ${img}<span class="pkg-tag">${p.tag}</span>
      <div class="pkg-media-overlay">
        <h3>${p.name}</h3>
        <div class="pkg-media-price">${money(p.price)}<span> · Starting price</span></div>
      </div>
    </div>
    <div class="pkg-body">
      <span class="pkg-loc-pill">${p.loc}</span>
      <p class="pkg-desc">${p.desc}</p>
      <a href="${detailHref}" class="pkg-view-details" data-view-pkg="${p.id}" data-pkg-type="${type || ""}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
        View Full Details
      </a>
      <div class="pkg-meta">
        <div class="pkg-price">${money(p.price)}<span>per person</span></div>
        <button class="pkg-book" data-book="${p.id}">Book now</button>
      </div>
      ${whatsappBtnHTML(p.name, "pkg-whatsapp--block")}
    </div>
  </div>`;
}

function fixedRowHTML(f){
  return `
  <div class="fixed-row">
    <div class="fixed-thumb" data-fd-photo="${f.id}" title="View photos">${photoImgHTML(`${f.name}, ${f.loc}`, f.name, 220, 220)}</div>
    <div class="fixed-date"><span class="d">${f.d}</span><span class="m">${f.m}</span></div>
    <div class="fixed-info">
      <h3>${f.name}</h3>
      <p>${f.loc} · ${f.days}</p>
    </div>
    <div class="fixed-meta">
      <span class="fixed-seats">${f.seats} seats left</span>
      <span class="fixed-price">${money(f.price)}</span>
      <button class="pkg-book" data-view-fixed="${f.id}">View Details</button>
      ${whatsappBtnHTML(f.name)}
    </div>
  </div>`;
}

/* ---------- SEO / AEO: structured data for currently loaded packages ----------
   Purely additive — injects/refreshes a JSON-LD <script> tag in <head> so
   search engines and AI answer engines can read live package names, prices
   and descriptions. Does not touch any existing rendering logic. */
function injectPackageSchema(){
  try{
    const all = [...indiaPackages, ...intlPackages];
    if (!all.length) return;
    const itemListElement = all.slice(0, 30).map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "TouristTrip",
        "name": `${p.name} — AdmireDworld Travel`,
        "description": p.desc || `${p.name} package by AdmireDworld Travel.`,
        "touristType": "Leisure",
        "offers": {
          "@type": "Offer",
          "priceCurrency": "INR",
          "price": String(p.discount || p.price || 0)
        }
      }
    }));
    const schema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "AdmireDworld Travel — Holiday Packages",
      "itemListElement": itemListElement
    };
    let tag = document.getElementById("packageListSchema");
    if (!tag) {
      tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.id = "packageListSchema";
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify(schema);
  }catch(e){ /* schema injection must never block rendering */ }
}

function renderAll(){
  document.getElementById("homeFeatured").innerHTML =
    indiaPackages.slice(0,2).map(p=>packageCardHTML(p,"india")).join("") +
    intlPackages.slice(0,2).map(p=>packageCardHTML(p,"international")).join("");
  document.getElementById("indiaGrid").innerHTML = indiaPackages.map(p=>packageCardHTML(p,"india")).join("");
  document.getElementById("intlGrid").innerHTML = intlPackages.map(p=>packageCardHTML(p,"international")).join("");
  document.getElementById("fixedList").innerHTML = fixedDepartures.map(fixedRowHTML).join("");
  injectPackageSchema();
}
renderAll();

/* ---------- Tab navigation ---------- */
function showTab(tab){
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === tab));
  document.querySelectorAll(".nav-link").forEach(n => n.classList.toggle("active", n.dataset.tab === tab));
  document.getElementById("mainNav").classList.remove("open");
  window.scrollTo({top:0, behavior:"instant" in window ? "instant" : "auto"});
  history.replaceState(null, "", "#" + tab);
}
document.querySelectorAll("[data-tab]").forEach(el=>{
  el.addEventListener("click", (e)=>{
    e.preventDefault();
    if(["india","international","fixed"].includes(el.dataset.tab)) resetGridToFull(el.dataset.tab);
    showTab(el.dataset.tab);
  });
});
document.getElementById("navBurger").addEventListener("click", ()=>{
  document.getElementById("mainNav").classList.toggle("open");
});
if (location.hash.slice(1)) showTab(location.hash.slice(1));

/* ---------- Filter chips ---------- */
document.querySelectorAll(".filter-row").forEach(row=>{
  row.addEventListener("click", (e)=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    row.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    chip.classList.add("active");
    const grid = row.parentElement.querySelector(".card-grid");
    const filter = chip.dataset.filter;
    grid.querySelectorAll(".pkg-card").forEach(card=>{
      card.style.display = (filter === "all" || card.dataset.cat === filter) ? "" : "none";
    });
  });
});

/* ---------- Hero search -> filter by destination + jump to relevant tab ---------- */
function matchesDestination(item, q){
  return item.name.toLowerCase().includes(q) || item.loc.toLowerCase().includes(q);
}

function resetGridToFull(tab){
  if(tab === "india"){
    document.getElementById("indiaGrid").innerHTML = indiaPackages.map(p=>packageCardHTML(p,"india")).join("");
  }else if(tab === "international"){
    document.getElementById("intlGrid").innerHTML = intlPackages.map(p=>packageCardHTML(p,"international")).join("");
  }else if(tab === "fixed"){
    document.getElementById("fixedList").innerHTML = fixedDepartures.map(fixedRowHTML).join("");
  }
  const panel = document.querySelector(`.tab-panel[data-panel="${tab}"]`);
  const chipRow = panel?.querySelector(".filter-row");
  if(chipRow){
    chipRow.querySelectorAll(".chip").forEach(c=>c.classList.toggle("active", c.dataset.filter === "all"));
  }
}

/* ---------- Home page "Packages" search card: mode toggle ---------- */
document.querySelectorAll('input[name="hsMode"]').forEach(radio=>{
  radio.addEventListener("change", ()=>{
    const offline = document.getElementById("hsModeOffline").checked;
    document.getElementById("hsOfflineFields").style.display = offline ? "" : "none";
    document.getElementById("hsSubmitBtn").textContent = offline ? "Send Inquiry" : "Get Instant Quotes";
    document.getElementById("hsMsg").textContent = "";
  });
});

document.getElementById("heroSearch").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msgEl = document.getElementById("hsMsg");
  msgEl.textContent = "";
  const offline = document.getElementById("hsModeOffline").checked;
  const destination = document.getElementById("hsDestination").value.trim();
  const rooms = document.getElementById("hsRooms").value;
  const guests = document.getElementById("hsGuests").value;
  const rating = document.getElementById("hsRating").value;
  const date = document.getElementById("hsDate").value;
  const nights = document.getElementById("hsNights").value;
  const landOnly = document.getElementById("hsLandOnly").checked;

  if(!destination){
    msgEl.textContent = "Please enter a destination.";
    return;
  }

  if(offline){
    // Offline Inquiry: submit the same details as a lead, right from the home page.
    const name = document.getElementById("hsOffName").value.trim();
    const phone = document.getElementById("hsOffPhone").value.trim();
    if(!name || !/^[0-9]{10}$/.test(phone)){
      msgEl.textContent = "Please enter your name and a valid 10-digit phone number.";
      return;
    }
    try{
      await fetch(`${API_BASE_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone,
          message: `Destination: ${destination}. ${rooms} Room(s), ${guests} Guest(s), ${rating === "any" ? "Any" : rating + " Star"} hotel, ${nights} night(s)${date ? ", departing " + date : ""}${landOnly ? ", Land Only" : ""}.`,
          interest: "Home page package enquiry (offline inquiry)",
          source: "other",
        }),
      });
      showToast(`Thanks ${name}! Our team will call you back shortly.`, 6000);
      e.target.reset();
      document.getElementById("hsOfflineFields").style.display = "none";
      document.getElementById("hsSubmitBtn").textContent = "Get Instant Quotes";
    }catch{
      msgEl.textContent = "Something went wrong. Please try again.";
    }
    return;
  }

  // Instant Quotes: hand the same details to the Customize Package builder.
  document.getElementById("cwizDestination").value = destination;
  document.getElementById("cwizRooms").value = rooms;
  document.getElementById("cwizGuests").value = guests;
  document.getElementById("cwizRating").value = rating;
  document.getElementById("cwizDate").value = date;
  document.getElementById("cwizNights").value = nights;
  document.getElementById("cwizLandOnly").checked = landOnly;

  const builderModeRadio = document.getElementById("cwizModeBuilder");
  builderModeRadio.checked = true;
  builderModeRadio.dispatchEvent(new Event("change"));

  showTab("customize");
  await loadCustomizeOptions();
  document.getElementById("cwizSearchBtn").click();
});

/* ================================================================
   LOGIN / OTP FLOW  (talks to the secure backend)
================================================================ */
const state = {
  user: null,            // {name, phone, email}
  token: null,           // session token from backend
  pendingEmail: null,    // email currently going through OTP step
  pendingBooking: null,  // package/fixed id waiting on login
};

const loginOverlay = document.getElementById("loginOverlay");
const bookingOverlay = document.getElementById("bookingOverlay");
const toastEl = document.getElementById("toast");

function openOverlay(el){ el.classList.add("open"); }
function closeOverlay(el){ el.classList.remove("open"); }
document.querySelectorAll("[data-close]").forEach(btn=>{
  btn.addEventListener("click", ()=> closeOverlay(document.getElementById(btn.dataset.close)));
});
[loginOverlay, bookingOverlay].forEach(ov=>{
  ov.addEventListener("click", (e)=>{ if(e.target === ov) closeOverlay(ov); });
});

function showToast(msg, ms=4200){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toastEl.classList.remove("show"), ms);
}

function setLoginStep(stepId){
  document.querySelectorAll(".login-step").forEach(s=>s.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");
}

function resetLoginModal(){
  document.getElementById("loginName").value = "";
  document.getElementById("loginPhone").value = "";
  document.getElementById("loginEmail").value = "";
  document.querySelectorAll(".otp-box").forEach(b=>b.value="");
  document.getElementById("detailsError").textContent = "";
  document.getElementById("otpError").textContent = "";
  setLoginStep("stepDetails");
}

// Restore a previous session (real site, so localStorage is fine here)
(function restoreSession(){
  try{
    const saved = localStorage.getItem("adw_session");
    if(saved){
      const parsed = JSON.parse(saved);
      state.user = parsed.user;
      state.token = parsed.token;
      updateAccountUI();
    }
  }catch{ /* ignore corrupt storage */ }
})();

document.getElementById("accountBtn").addEventListener("click", ()=>{
  if(state.user){
    const wantLogout = confirm(`Logged in as ${state.user.name}. Log out?`);
    if(wantLogout){
      state.user = null;
      state.token = null;
      localStorage.removeItem("adw_session");
      updateAccountUI();
      showToast("Logged out.");
    }
    return;
  }
  resetLoginModal();
  openOverlay(loginOverlay);
});

function updateAccountUI(){
  const label = document.getElementById("accountLabel");
  label.textContent = state.user ? state.user.name.split(" ")[0] : "Log In";
}

async function apiPost(path, body){
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try{ data = await res.json(); }catch{ /* non-JSON error page */ }
  if(!res.ok){
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

document.getElementById("sendOtpBtn").addEventListener("click", async (e)=>{
  const name = document.getElementById("loginName").value.trim();
  const phone = document.getElementById("loginPhone").value.trim();
  const email = document.getElementById("loginEmail").value.trim();
  const errEl = document.getElementById("detailsError");
  const btn = e.currentTarget;

  if(!name){ errEl.textContent = "Please enter your name."; return; }
  if(!/^[0-9]{10}$/.test(phone)){ errEl.textContent = "Enter a valid 10-digit contact number."; return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errEl.textContent = "Enter a valid email id."; return; }
  errEl.textContent = "";

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const data = await apiPost("/api/send-otp", { name, phone, email });
    await sendOtpViaEmailJS(email, name, data.otp);
    state.pendingEmail = email;
    document.getElementById("otpEmailLabel").textContent = email;
    setLoginStep("stepOtp");
    document.querySelector(".otp-box").focus();
    showToast(`OTP sent to ${email}. Check your inbox (and spam folder).`, 6000);
  }catch(err){
    errEl.textContent = err.message;
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

document.getElementById("backToDetailsBtn").addEventListener("click", ()=> setLoginStep("stepDetails"));

document.getElementById("resendOtpBtn").addEventListener("click", async (e)=>{
  const name = document.getElementById("loginName").value.trim();
  const phone = document.getElementById("loginPhone").value.trim();
  const email = state.pendingEmail;
  const btn = e.currentTarget;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const data = await apiPost("/api/send-otp", { name, phone, email });
    await sendOtpViaEmailJS(email, name, data.otp);
    showToast(`New OTP sent to ${email}.`, 6000);
  }catch(err){
    showToast(err.message, 6000);
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// OTP box auto-advance
document.querySelectorAll(".otp-box").forEach((box, idx, arr)=>{
  box.addEventListener("input", ()=>{
    box.value = box.value.replace(/[^0-9]/g,"");
    if(box.value && arr[idx+1]) arr[idx+1].focus();
  });
  box.addEventListener("keydown", (e)=>{
    if(e.key === "Backspace" && !box.value && arr[idx-1]) arr[idx-1].focus();
  });
});

document.getElementById("verifyOtpBtn").addEventListener("click", async (e)=>{
  const entered = [...document.querySelectorAll(".otp-box")].map(b=>b.value).join("");
  const errEl = document.getElementById("otpError");
  const btn = e.currentTarget;
  if(entered.length < 6){ errEl.textContent = "Enter all 6 digits."; return; }
  errEl.textContent = "";

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Verifying...";
  try{
    const data = await apiPost("/api/verify-otp", { email: state.pendingEmail, otp: entered });
    state.user = data.user;
    state.token = data.token;
    localStorage.setItem("adw_session", JSON.stringify({ user: state.user, token: state.token }));

    document.getElementById("successMsg").textContent =
      `Welcome, ${state.user.name}! You're logged in with ${state.user.email}.`;
    setLoginStep("stepSuccess");
    updateAccountUI();
  }catch(err){
    errEl.textContent = err.message;
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

document.getElementById("loginDoneBtn").addEventListener("click", ()=>{
  closeOverlay(loginOverlay);
  if(state.pendingBooking){
    const pb = state.pendingBooking;
    state.pendingBooking = null;
    openBooking(pb.id, pb.isFixed);
  }
});

/* ================================================================
   BOOKING FLOW
================================================================ */
document.addEventListener("click", (e)=>{
  const bookBtn = e.target.closest("[data-book]");
  const fixedBtn = e.target.closest("[data-book-fixed]");
  if(bookBtn) tryBook(bookBtn.dataset.book, false);
  if(fixedBtn) tryBook(fixedBtn.dataset.bookFixed, true);
});

function tryBook(id, isFixed){
  if(!state.user){
    state.pendingBooking = { id, isFixed };
    resetLoginModal();
    openOverlay(loginOverlay);
    return;
  }
  openBooking(id, isFixed);
}

function openBooking(id, isFixed){
  const item = isFixed ? fixedDepartures.find(f=>f.id===id) : allPackages.find(p=>p.id===id);
  if(!item) return;

  // For Fixed Departures, book the exact date the customer selected on the
  // detail page (via the date list or the Check Availability panel), with
  // its own live seat count — not just whichever date happened to load
  // first. Falls back to the item's own date if nothing was selected.
  const fixedDate = isFixed
    ? (fdSelectedForBooking && fdSelectedForBooking.id === id
        ? fdSelectedForBooking
        : { date: item.date, seats: item.seats })
    : null;

  const content = document.getElementById("bookingContent");
  content.innerHTML = `
    <div class="bk-head">
      <div class="bk-media">${cardSvg(item.colors || ["#2B3968","#3D5FA8"])}</div>
      <div>
        <h2>${item.name}</h2>
        <p>${item.loc}</p>
      </div>
    </div>
    <div class="bk-summary">
      Logged in as <strong>${state.user.name}</strong> · ${state.user.phone} · ${state.user.email}
    </div>
    <div class="bk-form-grid">
      <div class="f-field">
        <label for="bkDate">Travel date</label>
        ${isFixed
          ? `<div class="bk-fixed-date" id="bkDate" data-date="${fixedDate.date}">${fixedDate.date} <span class="bk-fixed-seats">(${fixedDate.seats > 0 ? `${fixedDate.seats} seats left` : "Sold out"})</span></div>`
          : `<input type="date" id="bkDate">`}
      </div>
      <div class="f-field">
        <label for="bkTravellers">Travellers</label>
        <select id="bkTravellers">
          <option>1</option><option selected>2</option><option>3</option><option>4</option><option>5+</option>
        </select>
      </div>
    </div>
    <div class="bk-total">
      <span>Total (per person × travellers)</span>
      <strong id="bkTotal">${money(item.price)}</strong>
    </div>
    <button class="btn-primary btn-block" id="confirmBookBtn" ${isFixed && fixedDate.seats <= 0 ? "disabled" : ""}>${isFixed && fixedDate.seats <= 0 ? "Sold out for this date" : "Confirm booking"}</button>
  `;

  const travellersSel = document.getElementById("bkTravellers");
  const totalEl = document.getElementById("bkTotal");
  function recalcTotal(){
    const val = travellersSel.value === "5+" ? 5 : parseInt(travellersSel.value, 10);
    totalEl.textContent = money(item.price * val);
  }
  travellersSel.addEventListener("change", recalcTotal);
  recalcTotal();

  document.getElementById("confirmBookBtn").addEventListener("click", ()=>{
    closeOverlay(bookingOverlay);
    showToast(`Booking request received for ${item.name}. Our team will call ${state.user.phone} to confirm.`, 6000);
  });

  openOverlay(bookingOverlay);
}

/* ================================================================
   CUSTOMIZE PACKAGE — build-your-own itinerary
   (reads/writes /api/customize; same endpoints as before — the browser
   still never sees individual item prices or the admin-set tax rate,
   only the one combined total from POST /api/customize/quote and /enquiry,
   which now also has GST/taxes baked in server-side)

   Flow: STEP 1 is a quote-style search card (destination, rooms &
   guests, hotel rating, departure date, nights). STEP 2 is a builder
   with Hotels / Sightseeing / Transfers / Visa / Itinerary tabs on the
   left and a live-total summary sidebar on the right (Save & Book Now,
   Share, Download Quote PDF).
================================================================ */
let customizeOptions = null; // { destinations, hotels, sightseeing, transfers, visas } — no prices in here

const cwiz = {
  destination: "", rooms: 1, guests: 2, rating: "any", date: "", nights: 4, landOnly: false,
  hotelId: null, sightseeingIds: new Set(), transferIds: new Set(), visaIds: new Set(), total: 0,
  children: [], // [{ age: Number|null }] — informational only, NEVER sent to /quote and NEVER
  // affects cwiz.total: pricing is driven purely by "guests" (adults) + selected
  // hotel/sightseeing/transfers/visa. Saved to the backend only at /enquiry time.
};
const CWIZ_MAX_CHILDREN = 4;

const CWIZ_STARS = { Budget: 3, Standard: 3, Deluxe: 4, Luxury: 5 };

// Visa items are stored per-country on the backend (admin adds them by
// country, since one visa can apply to a destination like "Bali" whose
// country is "Indonesia"). This maps a destination name to the country
// whose visas should show under the Visa tab for it. Domestic Indian
// destinations are intentionally left out — no visa needed for those.
// Add an entry here whenever a new international destination + visa is added.
const CWIZ_DEST_COUNTRY = { Dubai: "UAE", Thailand: "Thailand", Bali: "Indonesia" };

/* ---------- Children (Customize tab only) ----------
   Purely informational: rendered from cwiz.children, capped at
   CWIZ_MAX_CHILDREN, each child is just { age }. Never included in the
   /quote request and never factored into cwiz.total — only sent along
   with the rest of the booking details at /enquiry time (see the
   cwizSaveBtn handler below), so the team has it on file without it
   ever touching the price shown to the customer. */
function cwizChildAgeOptionsHTML(selected){
  const opts = ['<option value="">Age</option>'];
  for(let age = 0; age <= 11; age++){
    opts.push(`<option value="${age}"${Number(selected) === age ? " selected" : ""}>${age} yr${age === 1 ? "" : "s"}</option>`);
  }
  return opts.join("");
}
function renderCwizChildren(){
  const list = document.getElementById("cwizChildrenList");
  const addBtn = document.getElementById("cwizAddChildBtn");
  if(!list || !addBtn) return;
  list.innerHTML = cwiz.children.map((child, idx) => `
    <div class="cwiz-child-row" data-child-idx="${idx}">
      <select class="cwiz-child-label" disabled><option>Child ${idx + 1}</option></select>
      <select class="cwiz-child-age" data-child-age-idx="${idx}">${cwizChildAgeOptionsHTML(child.age)}</select>
      <button type="button" class="cwiz-child-remove" data-child-remove-idx="${idx}" aria-label="Remove child ${idx + 1}">&times;</button>
    </div>`).join("");
  addBtn.disabled = cwiz.children.length >= CWIZ_MAX_CHILDREN;
  addBtn.textContent = cwiz.children.length >= CWIZ_MAX_CHILDREN ? "Max 4 children" : "+ Add Child";
}
document.getElementById("cwizAddChildBtn")?.addEventListener("click", ()=>{
  const msgEl = document.getElementById("cwizChildrenMsg");
  if(msgEl) msgEl.textContent = "";
  if(cwiz.children.length >= CWIZ_MAX_CHILDREN){
    if(msgEl) msgEl.textContent = "You can add up to 4 children.";
    return;
  }
  cwiz.children.push({ age: null });
  renderCwizChildren();
});
document.getElementById("cwizChildrenList")?.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-child-remove-idx]");
  if(!btn) return;
  cwiz.children.splice(parseInt(btn.dataset.childRemoveIdx, 10), 1);
  renderCwizChildren();
});
document.getElementById("cwizChildrenList")?.addEventListener("change", (e)=>{
  const sel = e.target.closest("[data-child-age-idx]");
  if(!sel) return;
  const idx = parseInt(sel.dataset.childAgeIdx, 10);
  if(cwiz.children[idx]) cwiz.children[idx].age = sel.value === "" ? null : parseInt(sel.value, 10);
});
renderCwizChildren();

async function loadCustomizeOptions(){
  if(customizeOptions) return; // already loaded
  try{
    const data = await apiGet("/api/customize/options");
    customizeOptions = data;
    const list = document.getElementById("cwizDestList");
    if(list) list.innerHTML = data.destinations.map(d => `<option value="${d}"></option>`).join("");
    const hsList = document.getElementById("hsDestList");
    if(hsList) hsList.innerHTML = data.destinations.map(d => `<option value="${d}"></option>`).join("");
  }catch(err){
    console.error("customize options load failed:", err);
  }
}
document.querySelectorAll('[data-tab="customize"]').forEach(el=>{
  el.addEventListener("click", ()=>{ loadCustomizeOptions(); });
});
if (location.hash.slice(1) === "customize") loadCustomizeOptions();
if (document.getElementById("hsDestList")) loadCustomizeOptions(); // pre-fill destination suggestions on the home page search card

/* ---------- Mode toggle: Instant Itinerary vs Offline Inquiry ---------- */
document.querySelectorAll('input[name="cwizMode"]').forEach(radio=>{
  radio.addEventListener("change", ()=>{
    const offline = document.getElementById("cwizModeOffline").checked;
    document.getElementById("cwizSearchStep").style.display = offline ? "none" : "";
    document.getElementById("cwizOfflineForm").style.display = offline ? "" : "none";
    document.getElementById("cwizBuilder").style.display = "none";
  });
});

document.getElementById("cwizOfflineForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msgEl = document.getElementById("cwizOfflineMsg");
  msgEl.textContent = "";
  const name = document.getElementById("cwizOffName").value.trim();
  const phone = document.getElementById("cwizOffPhone").value.trim();
  if(!name || !/^[0-9]{10}$/.test(phone)){
    msgEl.textContent = "Please enter your name and a valid 10-digit phone number.";
    return;
  }
  try{
    await fetch(`${API_BASE_URL}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, phone,
        email: document.getElementById("cwizOffEmail").value.trim(),
        message: document.getElementById("cwizOffNotes").value.trim(),
        interest: "Customize Package (offline inquiry)",
        source: "other",
      }),
    });
    showToast(`Thanks ${name}! Our team will call you back shortly.`, 6000);
    e.target.reset();
  }catch{
    msgEl.textContent = "Something went wrong. Please try again.";
  }
});

/* ---------- STEP 1 -> STEP 2: build the itinerary ---------- */
document.getElementById("cwizSearchBtn").addEventListener("click", async ()=>{
  const msgEl = document.getElementById("cwizSearchMsg");
  msgEl.textContent = "";
  await loadCustomizeOptions();

  const typed = document.getElementById("cwizDestination").value.trim();
  const match = customizeOptions && customizeOptions.destinations.find(d => d.toLowerCase() === typed.toLowerCase());
  if(!typed){ msgEl.textContent = "Please enter a destination."; return; }
  if(!match){
    msgEl.textContent = `We don't have packages for "${typed}" yet. Try: ${(customizeOptions ? customizeOptions.destinations.join(", ") : "")}.`;
    return;
  }

  cwiz.destination = match;
  cwiz.rooms = parseInt(document.getElementById("cwizRooms").value, 10) || 1;
  cwiz.guests = Math.max(1, parseInt(document.getElementById("cwizGuests").value, 10) || 1);
  cwiz.rating = document.getElementById("cwizRating").value;
  cwiz.date = document.getElementById("cwizDate").value;
  cwiz.nights = Math.max(1, parseInt(document.getElementById("cwizNights").value, 10) || 1);
  cwiz.landOnly = document.getElementById("cwizLandOnly").checked;
  cwiz.hotelId = null;
  cwiz.sightseeingIds = new Set();
  cwiz.transferIds = new Set();
  cwiz.visaIds = new Set();
  cwiz.children = [];
  renderCwizChildren();

  if(state.user){
    document.getElementById("cwizName").value = state.user.name || "";
    document.getElementById("cwizPhone").value = state.user.phone || "";
    document.getElementById("cwizEmail").value = state.user.email || "";
  }

  renderCwizBuilder();
  document.getElementById("cwizSearchStep").style.display = "none";
  document.getElementById("cwizBuilder").style.display = "flex";
  document.getElementById("cwizBuilder").scrollIntoView({ behavior:"smooth", block:"start" });
});

document.getElementById("cwizEditBtn").addEventListener("click", ()=>{
  document.getElementById("cwizBuilder").style.display = "none";
  document.getElementById("cwizSearchStep").style.display = "";
});

/* ---------- Render the Hotels / Sightseeing / Transfers panels ---------- */
function cwizHotelCardHTML(h){
  const stars = CWIZ_STARS[h.category] || 3;
  return `
  <button type="button" class="cwiz-card" data-cwiz-hotel="${h.id}">
    <div class="cwiz-card-top">
      <strong>${h.name}</strong>
      <span class="cwiz-stars">${"★".repeat(stars)}</span>
    </div>
    <span class="cwiz-card-tag">${h.category}</span>
    ${h.description ? `<p class="cwiz-card-desc">${h.description}</p>` : ""}
    <span class="cwiz-card-select">Select this hotel</span>
  </button>`;
}

function cwizCheckCardHTML(item, groupClass){
  return `
  <label class="cwiz-check-card">
    <input type="checkbox" data-cwiz-${groupClass}="${item.id}">
    <span>
      <strong>${item.name}</strong>
      ${item.description ? `<p class="cwiz-card-desc">${item.description}</p>` : ""}
    </span>
  </label>`;
}

function renderCwizBuilder(){
  const allHotels = customizeOptions.hotels.filter(h => h.destination === cwiz.destination);
  const ratedHotels = cwiz.rating === "any" ? allHotels : allHotels.filter(h => (CWIZ_STARS[h.category] || 3) === Number(cwiz.rating));
  const hotels = ratedHotels.length ? ratedHotels : allHotels;

  const hotelsPanel = document.getElementById("cwizPanelHotels");
  hotelsPanel.innerHTML = hotels.length
    ? (ratedHotels.length ? "" : `<p class="cwiz-hint">No exact ${cwiz.rating}-star match — showing all available hotels for ${cwiz.destination}.</p>`) +
      hotels.map(cwizHotelCardHTML).join("")
    : `<p class="cwiz-hint">Hotel options for ${cwiz.destination} will be added soon — request an offline inquiry instead.</p>`;

  const sightseeing = customizeOptions.sightseeing.filter(s => s.destination === cwiz.destination);
  document.getElementById("cwizPanelSightseeing").innerHTML = sightseeing.length
    ? sightseeing.map(s => cwizCheckCardHTML(s, "sight")).join("")
    : `<p class="cwiz-hint">No optional sightseeing listed for ${cwiz.destination} yet.</p>`;

  const transfers = customizeOptions.transfers.filter(t => t.destination === cwiz.destination);
  document.getElementById("cwizPanelTransfers").innerHTML = transfers.length
    ? transfers.map(t => cwizCheckCardHTML(t, "transfer")).join("")
    : `<p class="cwiz-hint">No pickup/drop options listed for ${cwiz.destination} yet.</p>`;

  const visaCountry = CWIZ_DEST_COUNTRY[cwiz.destination];
  const visas = visaCountry ? customizeOptions.visas.filter(v => v.country === visaCountry) : [];
  document.getElementById("cwizPanelVisa").innerHTML = !visaCountry
    ? `<p class="cwiz-hint">No visa required for ${cwiz.destination}.</p>`
    : visas.length
      ? visas.map(v => cwizCheckCardHTML(v, "visa")).join("")
      : `<p class="cwiz-hint">Visa options for ${cwiz.destination} will be added soon — request an offline inquiry instead.</p>`;

  document.getElementById("cwizSumDest").textContent = cwiz.destination;
  document.getElementById("cwizSumMeta").textContent =
    `${cwiz.date ? cwiz.date + " · " : ""}${cwiz.nights} night${cwiz.nights > 1 ? "s" : ""} · ${cwiz.rooms} Room${cwiz.rooms > 1 ? "s" : ""}, ${cwiz.guests} Guest${cwiz.guests > 1 ? "s" : ""}${cwiz.landOnly ? " · Land only" : ""}`;

  updateCwizItinerary();
  // NOTE: no price calculation here — the customer sees zero cost figures
  // while picking hotel/sightseeing/transfers/visa. The one final total is
  // only fetched when they open the "Review & Price" tab (see below).
}

/* ---------- Tab switching ---------- */
document.getElementById("cwizTabs").addEventListener("click", (e)=>{
  const btn = e.target.closest(".cwiz-tab");
  if(!btn) return;
  document.querySelectorAll(".cwiz-tab").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".cwiz-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`cwizPanel${btn.dataset.cwizTab.charAt(0).toUpperCase()}${btn.dataset.cwizTab.slice(1)}`).classList.add("active");
  if(btn.dataset.cwizTab === "review") renderCwizReview();
});

/* ---------- Selection handlers ----------
   Picking a hotel, ticking sightseeing/transfers/visa only updates local
   state (and the auto-generated itinerary) — none of these trigger a
   price lookup or show any figure. Nothing costs anything on screen until
   the customer opens "Review & Price". */
document.getElementById("cwizPanelHotels").addEventListener("click", (e)=>{
  const card = e.target.closest("[data-cwiz-hotel]");
  if(!card) return;
  document.querySelectorAll("#cwizPanelHotels .cwiz-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  cwiz.hotelId = card.dataset.cwizHotel;
});

document.getElementById("cwizPanelSightseeing").addEventListener("change", (e)=>{
  const box = e.target.closest("[data-cwiz-sight]");
  if(!box) return;
  const id = box.dataset.cwizSight;
  if(box.checked) cwiz.sightseeingIds.add(id); else cwiz.sightseeingIds.delete(id);
  updateCwizItinerary();
});

document.getElementById("cwizPanelTransfers").addEventListener("change", (e)=>{
  const box = e.target.closest("[data-cwiz-transfer]");
  if(!box) return;
  const id = box.dataset.cwizTransfer;
  if(box.checked) cwiz.transferIds.add(id); else cwiz.transferIds.delete(id);
});

document.getElementById("cwizPanelVisa").addEventListener("change", (e)=>{
  const box = e.target.closest("[data-cwiz-visa]");
  if(!box) return;
  const id = box.dataset.cwizVisa;
  if(box.checked) cwiz.visaIds.add(id); else cwiz.visaIds.delete(id);
});

/* ---------- Auto-generated day-by-day itinerary ---------- */
function cwizItineraryDays(){
  const sightseeingNames = customizeOptions.sightseeing
    .filter(s => cwiz.sightseeingIds.has(s.id))
    .map(s => s.name);
  const totalDays = cwiz.nights + 1;
  const days = [];
  let ssIndex = 0;

  for(let d = 1; d <= totalDays; d++){
    if(d === 1){
      days.push({ day:d, title:"Arrival", desc:`Arrive in ${cwiz.destination}${cwiz.transferIds.size ? " and transfer to your hotel." : ". Check in to your hotel at your own convenience."}` });
    }else if(d === totalDays){
      days.push({ day:d, title:"Departure", desc:`Check out and depart from ${cwiz.destination}${cwiz.transferIds.size ? " with a transfer to the airport/station." : "."}` });
    }else if(ssIndex < sightseeingNames.length){
      days.push({ day:d, title:"Sightseeing", desc: sightseeingNames[ssIndex] });
      ssIndex++;
    }else{
      days.push({ day:d, title:"Leisure day", desc:`Free day to explore ${cwiz.destination} at your own pace.` });
    }
  }
  return days;
}

// Shown wherever the itinerary is generated (on-screen Itinerary tab AND the
// downloaded Quote PDF) whenever at least one child (with an age picked) has
// been added — pricing never includes children (see fetchCwizTotal()), so
// this makes that explicit to the customer instead of leaving it silent.
function cwizChildNoteHTML(){
  const hasChild = cwiz.children.some(c => Number.isFinite(c.age));
  if(!hasChild) return "";
  return `<p class="cwiz-child-note"><strong>NOTE: Child cost not included - Please contact us for child pricing</strong></p>`;
}

function updateCwizItinerary(){
  const days = cwizItineraryDays();
  document.getElementById("cwizPanelItinerary").innerHTML = `
    <div class="cwiz-itinerary-note">Editing hotels/sightseeing above updates this itinerary automatically.</div>
    ${cwizChildNoteHTML()}
    ${days.map(d => `
      <div class="cwiz-itin-day">
        <span class="cwiz-itin-daynum">Day ${d.day}</span>
        <div>
          <strong>${d.title}</strong>
          <p>${d.desc}</p>
        </div>
      </div>`).join("")}`;
}

/* ---------- Final total — ONLY fetched/shown on the "Review & Price" tab,
   never while the customer is still picking hotel/sightseeing/transfers/
   visa (see the selection handlers above, which no longer call this). ---------- */

// Pure network call: always fetches a fresh, server-calculated total for
// the customer's current selections and stores it on cwiz.total. Does NOT
// touch the DOM — safe to call even when the Review panel isn't open
// (e.g. right before Share/PDF, which need an up-to-date figure).
async function fetchCwizTotal(){
  try{
    const data = await apiPost("/api/customize/quote", {
      hotelId: cwiz.hotelId,
      sightseeingIds: [...cwiz.sightseeingIds],
      transferIds: [...cwiz.transferIds],
      visaIds: [...cwiz.visaIds],
      travellers: cwiz.guests,
    });
    cwiz.total = data.total;
    return data.total;
  }catch(err){
    console.error("customize quote failed:", err);
    return cwiz.total;
  }
}

// Recap shown on the Review & Price tab: which hotel, which sightseeing/
// transfers/visa were picked, and (once fetched) the one final total.
function cwizReviewHTML(){
  const hotel = customizeOptions.hotels.find(h => h.id === cwiz.hotelId);
  const sightseeingNames = customizeOptions.sightseeing.filter(s => cwiz.sightseeingIds.has(s.id)).map(s => s.name);
  const transferNames = customizeOptions.transfers.filter(t => cwiz.transferIds.has(t.id)).map(t => t.name);
  const visaNames = customizeOptions.visas.filter(v => cwiz.visaIds.has(v.id)).map(v => v.name);
  return `
    <div class="cwiz-itinerary-note">Here's everything you've picked. Change anything on the left and come back — your total updates automatically.</div>
    <div class="cwiz-review-row"><span>Hotel</span><strong>${hotel ? `${hotel.name} (${hotel.category})` : "Not selected yet"}</strong></div>
    <div class="cwiz-review-row"><span>Sightseeing</span><strong>${sightseeingNames.join(", ") || "None selected"}</strong></div>
    <div class="cwiz-review-row"><span>Transfers</span><strong>${transferNames.join(", ") || "None selected"}</strong></div>
    <div class="cwiz-review-row"><span>Visa</span><strong>${visaNames.join(", ") || "Not applicable / none selected"}</strong></div>
    <div class="cwiz-summary-total" style="margin-top:18px;">
      <span>Total Net Price</span>
      <strong id="cwizTotal">${cwiz.hotelId ? "Calculating…" : "—"}</strong>
    </div>
    <div id="cwizDownloadSlot" style="margin-top:14px;"></div>
    <p class="cwiz-summary-note" style="margin-top:10px;">Inclusive of all taxes &amp; fees — no hidden charges.</p>
  `;
}

async function renderCwizReview(){
  const panel = document.getElementById("cwizPanelReview");
  if(!panel) return;
  // The "Download Your PDF" box lives directly under the blue total bar. Detach
  // the same node before the panel is re-rendered so its listeners survive.
  const dlBox = document.querySelector(".customize-download-section");
  if(dlBox) dlBox.remove();
  panel.innerHTML = cwizReviewHTML();
  const dlSlot = document.getElementById("cwizDownloadSlot");
  if(dlBox && dlSlot) dlSlot.appendChild(dlBox);
  if(!cwiz.hotelId) return; // nothing to price yet — hint above already says so
  const total = await fetchCwizTotal();
  const totalEl = document.getElementById("cwizTotal");
  if(totalEl) totalEl.textContent = money(total);
}

/* ---------- Save & Book Now ---------- */
document.getElementById("cwizSaveBtn").addEventListener("click", async ()=>{
  const msgEl = document.getElementById("cwizSaveMsg");
  msgEl.className = "field-error";
  msgEl.textContent = "";

  if(!cwiz.hotelId){ msgEl.textContent = "Please select a hotel first."; return; }
  const name = document.getElementById("cwizName").value.trim();
  const phone = document.getElementById("cwizPhone").value.trim();
  const email = document.getElementById("cwizEmail").value.trim();
  if(!name || !/^[0-9]{10}$/.test(phone) || !email){
    msgEl.textContent = "Please fill in your name, a valid 10-digit phone number and email.";
    return;
  }

  const btn = document.getElementById("cwizSaveBtn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving...";

  try{
    const days = cwizItineraryDays();
    const itinerarySummary = days.map(d => `Day ${d.day} (${d.title}): ${d.desc}`).join(" | ");
    const data = await apiPost("/api/customize/enquiry", {
      destination: cwiz.destination,
      duration: `${cwiz.nights} nights`,
      month: cwiz.date,
      style: cwiz.landOnly ? "Land only" : "",
      travellers: cwiz.guests,
      children: cwiz.children.filter(c => Number.isFinite(c.age)).map(c => ({ age: c.age })),
      notes: `Rooms: ${cwiz.rooms}. Self-built itinerary: ${itinerarySummary}`,
      name, phone, email,
      hotelId: cwiz.hotelId,
      sightseeingIds: [...cwiz.sightseeingIds],
      transferIds: [...cwiz.transferIds],
      visaIds: [...cwiz.visaIds],
    });
    msgEl.className = "field-error aw-form-msg ok";
    msgEl.textContent = `Saved! Estimated total: ${money(data.total)}. Our team will confirm by email shortly.`;
    showToast(`Thanks ${name}! Your itinerary is saved — our team will be in touch shortly.`, 6000);
  }catch(err){
    msgEl.textContent = err.message;
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

/* ---------- Share (WhatsApp / email) ---------- */
function cwizShareText(){
  const hotel = customizeOptions.hotels.find(h => h.id === cwiz.hotelId);
  return `My ${cwiz.nights}N ${cwiz.destination} trip via AdmireDworld Travel` +
    `${hotel ? ` — staying at ${hotel.name}` : ""}. ` +
    `${cwiz.date ? `Departing ${cwiz.date}. ` : ""}Total: ${money(cwiz.total)}.`;
}
document.getElementById("cwizShareWA").addEventListener("click", async ()=>{
  if(!cwiz.hotelId){ showToast("Select a hotel first to generate your itinerary."); return; }
  await fetchCwizTotal(); // fresh total — nothing was kept live while selecting
  window.open(`https://wa.me/?text=${encodeURIComponent(cwizShareText())}`, "_blank");
});
document.getElementById("cwizShareEmail").addEventListener("click", async ()=>{
  if(!cwiz.hotelId){ showToast("Select a hotel first to generate your itinerary."); return; }
  await fetchCwizTotal();
  const subject = `My ${cwiz.destination} itinerary — AdmireDworld Travel`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(cwizShareText())}`;
});

/* ---------- Download Quote PDF (via the browser's print / Save-as-PDF dialog,
   no extra library needed — see .cwiz-print-area / @media print in style.css) ---------- */
/* Clicking "Download Quote PDF" now opens a small popup asking for the customer's
   contact number. On submit the PDF is generated and the lead is saved to the backend. */
function isValidWhatsappNumber(value){
  return /^[0-9]{10}$/.test(String(value || "").trim());
}

function bindWhatsappDownloadValidation(input, button, msgEl){
  if(!input || !button) return;
  const sync = () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 10);
    input.value = digits;
    button.disabled = !isValidWhatsappNumber(digits);
    if(msgEl) msgEl.textContent = digits && digits.length < 10 ? "Enter a valid 10-digit WhatsApp number." : "";
  };
  input.addEventListener("input", sync);
  sync();
}

async function submitPackageDownloadLead({ whatsappNumber, packageId, packageName }){
  const attribution = getReferralAttribution();
  return apiPost("/api/leads/whatsapp-download-lead", {
    whatsappNumber,
    packageId,
    packageName,
    referralCode: attribution.code || "",
    source: "PACKAGE_DOWNLOAD",
  });
}

document.getElementById("cwizPdfBtn").addEventListener("click", async ()=>{
  if(!cwiz.hotelId){ showToast("Select a hotel first to generate your quote PDF."); return; }
  const input = document.getElementById("cwizDownloadWhatsapp");
  const msg = document.getElementById("cwizDownloadMsg");
  const btn = document.getElementById("cwizPdfBtn");
  const whatsappNumber = input.value.trim();
  if(!isValidWhatsappNumber(whatsappNumber)){ msg.textContent = "Enter a valid 10-digit WhatsApp number."; return; }

  btn.disabled = true;
  btn.textContent = "Preparing PDF…";
  msg.textContent = "";
  try{
    const packageName = `Customize Package — ${cwiz.nights}N ${cwiz.destination}`;
    const packageId = `customize-${String(cwiz.destination || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${cwiz.hotelId || "package"}`;
    await submitPackageDownloadLead({ whatsappNumber, packageId, packageName });
    await cwizDownloadQuotePdf("Package Customer", whatsappNumber, "");
  }catch(err){
    msg.textContent = err.message || "Could not save your request. Please try again.";
  }finally{
    btn.textContent = "⇩ Download Now";
    btn.disabled = !isValidWhatsappNumber(input.value.trim());
  }
});

bindWhatsappDownloadValidation(
  document.getElementById("cwizDownloadWhatsapp"),
  document.getElementById("cwizPdfBtn"),
  document.getElementById("cwizDownloadMsg")
);

async function cwizDownloadQuotePdf(pdfName, pdfPhone, pdfEmail){
  await fetchCwizTotal(); // fresh total — nothing was kept live while selecting
  const hotel = customizeOptions.hotels.find(h => h.id === cwiz.hotelId);
  const sightseeingNames = customizeOptions.sightseeing.filter(s => cwiz.sightseeingIds.has(s.id)).map(s => s.name);
  const transferNames = customizeOptions.transfers.filter(t => cwiz.transferIds.has(t.id)).map(t => t.name);
  const visaNames = customizeOptions.visas.filter(v => cwiz.visaIds.has(v.id)).map(v => v.name);
  const days = cwizItineraryDays();

  // Direct PDF file download (jsPDF). If the library could not load for any
  // reason, fall back to the browser's print / Save-as-PDF dialog so the
  // customer still gets their quote.
  try{
    if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error("jsPDF not loaded");
    const clean = (v) => String(v == null ? "" : v).replace(/<[^>]*>/g, "").replace(/\u20B9/g, "Rs. ").replace(/[\u2013\u2014]/g, "-").replace(/[^\x00-\xFF]/g, "");
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 44, maxW = W - M * 2;
    let y = M;
    const need = (h) => { if(y + h > H - M){ doc.addPage(); y = M; } };
    const line = (txt, size, bold, gap) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.splitTextToSize(clean(txt), maxW).forEach(l => { need(size + 4); doc.text(l, M, y); y += size + 4; });
      y += (gap || 0);
    };
    line("AdmireDworld Travel - Trip Quote", 18, true, 6);
    line(`Prepared for: ${pdfName} | ${pdfPhone}`, 11, false, 8);
    line(`${cwiz.nights}N ${cwiz.destination} Itinerary`, 14, true, 2);
    line(`${cwiz.date ? `Departure: ${cwiz.date} | ` : ""}${cwiz.nights} nights | ${cwiz.rooms} Room(s), ${cwiz.guests} Guest(s)${cwiz.landOnly ? " | Land only" : ""}`, 11, false, 10);
    line("Hotel", 12, true);
    line(hotel ? `${hotel.name} (${hotel.category})` : "-", 11, false, 8);
    line("Sightseeing", 12, true);
    line(sightseeingNames.join(", ") || "None selected", 11, false, 8);
    line("Transfers", 12, true);
    line(transferNames.join(", ") || "None selected", 11, false, 8);
    line("Visa", 12, true);
    line(visaNames.join(", ") || "Not applicable / none selected", 11, false, 8);
    line("Day-wise Itinerary", 12, true, 2);
    days.forEach(d => line(`Day ${d.day} - ${d.title}: ${d.desc}`, 11, false, 3));
    y += 8;
    line("Total Net Price", 12, true);
    line(money(cwiz.total), 16, true, 10);
    line("Inclusive of all taxes & fees. AdmireDworld Travel | hello@admiredworld.travel | +91 96393 43585", 9, false, 0);
    doc.save(`Quote-${String(cwiz.destination || "Trip").replace(/[^A-Za-z0-9]+/g, "-")}-${cwiz.nights}N.pdf`);
    showToast("Quote PDF downloaded.");
    return;
  }catch(err){ console.error("direct PDF failed, using print fallback:", err); }

  const pdfEsc = (v) => String(v).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  document.getElementById("cwizPrintArea").innerHTML = `
    <h1>AdmireDworld Travel — Trip Quote</h1>
    <p>Prepared for: <strong>${pdfEsc(pdfName)}</strong> · ${pdfEsc(pdfPhone)}</p>
    <p><strong>${cwiz.nights}N ${cwiz.destination} Itinerary</strong></p>
    <p>${cwiz.date ? `Departure: ${cwiz.date} · ` : ""}${cwiz.nights} nights · ${cwiz.rooms} Room(s), ${cwiz.guests} Guest(s)${cwiz.landOnly ? " · Land only" : ""}</p>
    <h3>Hotel</h3>
    <p>${hotel ? `${hotel.name} (${hotel.category})` : "-"}</p>
    <h3>Sightseeing</h3>
    <p>${sightseeingNames.join(", ") || "None selected"}</p>
    <h3>Transfers</h3>
    <p>${transferNames.join(", ") || "None selected"}</p>
    <h3>Visa</h3>
    <p>${visaNames.join(", ") || "Not applicable / none selected"}</p>
    <h3>Day-wise Itinerary</h3>
    ${cwizChildNoteHTML()}
    <ul>${days.map(d => `<li><strong>Day ${d.day} — ${d.title}:</strong> ${d.desc}</li>`).join("")}</ul>
    <h3>Total Net Price</h3>
    <p class="cwiz-print-total">${money(cwiz.total)}</p>
    <p class="cwiz-print-footer">Inclusive of all taxes &amp; fees. AdmireDworld Travel · hello@admiredworld.travel · +91 96393 43585</p>`;

  document.body.classList.add("cwiz-printing");
  window.print();
  setTimeout(()=> document.body.classList.remove("cwiz-printing"), 500);
}


/* ---------- Admin: manage customize catalog (hotels/sightseeing/transfers/visas) ---------- */
(function initCustomizeAdmin(){
  const box = document.getElementById("customizeAdminBox");
  if(!box) return;
  const params = new URLSearchParams(location.search);
  if(params.get("admin") !== "1") return; // hidden for normal visitors
  box.style.display = "block";

  const TYPE_LABELS = { hotels:"Hotel", sightseeing:"Sightseeing", transfers:"Pickup & Drop", visas:"Visa" };

  function czRowHTML(type, item){
    const tag = type === "hotels" ? `${item.destination} · ${item.category}` :
                type === "visas" ? item.country : item.destination;
    return `
    <div class="pkg-admin-row">
      <div><span class="pa-tag">${tag}</span><br>${item.name} — ${money(item.price)}</div>
      <button data-del-cz="${item.id}" data-cz-type="${type}">Delete</button>
    </div>`;
  }

  async function loadAdminCatalog(){
    const adminKey = document.getElementById("customizeAdminKey").value;
    const msgEl = document.getElementById("customizeAdminMsg");
    const listsEl = document.getElementById("customizeAdminLists");
    msgEl.textContent = "";
    try{
      const res = await fetch(`${API_BASE_URL}/api/customize/admin/all?adminKey=${encodeURIComponent(adminKey)}`);
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Could not load items.");

      listsEl.innerHTML = ["hotels","sightseeing","transfers","visas"].map(type => `
        <h4 style="margin-top:18px;">${TYPE_LABELS[type]}</h4>
        ${data[type].map(item => czRowHTML(type, item)).join("") || `<p class="cp-empty">No items yet.</p>`}
      `).join("");
    }catch(err){
      msgEl.textContent = err.message;
    }
  }

  document.getElementById("customizeAdminLoadBtn").addEventListener("click", loadAdminCatalog);

  document.getElementById("customizeAdminLists").addEventListener("click", async (e)=>{
    const delBtn = e.target.closest("[data-del-cz]");
    if(!delBtn) return;
    const adminKey = document.getElementById("customizeAdminKey").value;
    try{
      await fetch(`${API_BASE_URL}/api/customize/${delBtn.dataset.czType}/${delBtn.dataset.delCz}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey }),
      });
      loadAdminCatalog();
    }catch(err){
      document.getElementById("customizeAdminMsg").textContent = "Could not delete item.";
    }
  });

  const czType = document.getElementById("czNewType");
  function updateNewItemFields(){
    const isHotel = czType.value === "hotels";
    const isVisa = czType.value === "visas";
    document.getElementById("czNewCatWrap").style.display = isHotel ? "" : "none";
    document.getElementById("czNewDestLabel").textContent = isVisa ? "Country" : "Destination";
    document.getElementById("czNewDest").placeholder = isVisa ? "e.g. UAE" : "e.g. Goa";
  }
  czType.addEventListener("change", updateNewItemFields);
  updateNewItemFields();

  document.getElementById("customizeAdminAddBtn").addEventListener("click", async ()=>{
    const adminKey = document.getElementById("customizeAdminKey").value;
    const type = czType.value;
    const destVal = document.getElementById("czNewDest").value.trim();
    const msgEl = document.getElementById("customizeAdminAddMsg");
    msgEl.textContent = "";

    const body = {
      adminKey,
      name: document.getElementById("czNewName").value.trim(),
      price: document.getElementById("czNewPrice").value,
      description: document.getElementById("czNewDesc").value.trim(),
    };
    if(type === "visas") body.country = destVal; else body.destination = destVal;
    if(type === "hotels") body.category = document.getElementById("czNewCat").value.trim();

    try{
      const res = await fetch(`${API_BASE_URL}/api/customize/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Could not add item.");
      document.getElementById("czNewDest").value = "";
      document.getElementById("czNewCat").value = "";
      document.getElementById("czNewName").value = "";
      document.getElementById("czNewPrice").value = "";
      document.getElementById("czNewDesc").value = "";
      loadAdminCatalog();
      customizeOptions = null; // force a fresh /options fetch next time the tab opens
    }catch(err){
      msgEl.textContent = err.message;
    }
  });
})();

/* ================================================================
   AI DAILY BLOG  (new feature — reads from /api/blog on the backend)
   Doesn't touch anything above; purely additive.
================================================================ */
function blogDateLabel(dateStr){
  try{
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });
  }catch{ return dateStr; }
}

function excerpt(text, n=220){
  if(!text) return "";
  return text.length > n ? text.slice(0, n).trim() + "…" : text;
}

function blogFeaturedHTML(post){
  const link = post.slug ? blogDetailPath(post) : null;
  return `
  <div class="blog-featured">
    <div class="bf-media" style="background-image:url('${post.imageUrl}')"></div>
    <div class="bf-body">
      <span class="bf-date">${blogDateLabel(post.date)} · Today's story</span>
      <h3>${post.title}</h3>
      <div class="bf-content">${post.content}</div>
      ${link ? `<a class="bf-read-link" href="${link}" data-blog-slug="${post.slug}">Read full post &rarr;</a>` : ""}
    </div>
  </div>`;
}

function blogCardHTML(post){
  const link = post.slug ? blogDetailPath(post) : null;
  return `
  <div class="blog-card">
    <div class="bc-media" style="background-image:url('${post.imageUrl}')"></div>
    <div class="bc-body">
      <span class="bc-date">${blogDateLabel(post.date)}</span>
      <h4>${post.title}</h4>
      <p>${excerpt(post.content, 110)}</p>
      ${link ? `<a class="bc-read-link" href="${link}" data-blog-slug="${post.slug}">Read full post &rarr;</a>` : ""}
    </div>
  </div>`;
}

async function loadBlog(){
  const latestWrap = document.getElementById("blogLatestWrap");
  const listWrap = document.getElementById("blogList");
  if(!latestWrap || !listWrap) return; // blog panel not on this page

  latestWrap.innerHTML = `<p>Loading today's story...</p>`;
  try{
    const latestData = await apiGet("/api/blog/latest");
    if(latestData.post && latestData.post.slug) blogDetailStore[latestData.post.slug] = latestData.post; // cache for "Read full post"
    latestWrap.innerHTML = blogFeaturedHTML(latestData.post);
  }catch(err){
    latestWrap.innerHTML = `<p class="field-error">Could not load today's post right now.</p>`;
  }

  try{
    const listData = await apiGet("/api/blog/list");
    (listData.posts || []).forEach(p => { if(p.slug) blogDetailStore[p.slug] = p; }); // cache for "Read full post"
    const rest = listData.posts.filter(p => !latestWrap.innerHTML.includes(p.title) || true).slice(1);
    listWrap.innerHTML = rest.map(blogCardHTML).join("") || `<p>More stories coming soon.</p>`;
  }catch(err){
    listWrap.innerHTML = `<p class="field-error">Could not load recent posts.</p>`;
  }

  tryOpenBlogFromCurrentUrl(); // in case the page was loaded/deep-linked directly at /blog/<slug>
}

async function apiGet(path){
  const res = await fetch(`${API_BASE_URL}${path}`);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// Load blog when the Blog tab is opened (works whether it's the first tab or not)
document.querySelectorAll('[data-tab="blog"]').forEach(el=>{
  el.addEventListener("click", ()=>{ loadBlog(); });
});
if (location.hash.slice(1) === "blog" || parseBlogDetailPath(location.pathname)) loadBlog();

/* ---------- Admin: queue tomorrow's topic (only visible with ?admin=1) ---------- */
(function initBlogAdmin(){
  const box = document.getElementById("blogAdminBox");
  if(!box) return;
  const params = new URLSearchParams(location.search);
  if(params.get("admin") !== "1") return; // hidden for normal visitors

  box.style.display = "block";
  document.getElementById("blogAdminSaveBtn").addEventListener("click", async ()=>{
    const adminKey = document.getElementById("blogAdminKey").value;
    const topic = document.getElementById("blogAdminTopic").value.trim();
    const msgEl = document.getElementById("blogAdminMsg");
    msgEl.textContent = "";
    if(!topic){ msgEl.textContent = "Please enter a topic."; return; }
    try{
      const data = await apiPost("/api/blog/set-topic", { topic, adminKey });
      msgEl.style.color = "var(--teal)";
      msgEl.textContent = `Saved. Tomorrow's post will be about: "${data.queuedTopic}"`;
    }catch(err){
      msgEl.style.color = "";
      msgEl.textContent = err.message;
    }
  });
})();

/* ================================================================
   BLOG DETAIL PAGE ("Read full post") — a real full page, not a
   popup, reusing the exact full-page pattern built for the Package
   Detail Page below (own SEO-friendly URL, own <title>/meta
   description, pushed via history.pushState, sharable/bookmarkable).
   -------------------------------------------------------------------
   FIX: "Read full post" used to link to a static file
   (blog/<slug>.html) that nothing in this project ever generates —
   see blog.js's comments about a "generate-blog-pages.js" build step
   that was never actually added — so every click 404'd. This gives
   each post a real client-side route instead (/blog/<slug>), served
   by the same "?p=" 404.html bounce + vercel.json/_redirects rewrite
   already used for /package/... deep links, and reuses the post data
   loadBlog() already fetches — no backend change or build step
   required. Purely additive; doesn't change loadBlog()'s fetch logic
   beyond caching each post it already received.
================================================================ */
const blogDetailStore = {}; // slug -> full post object, filled by loadBlog() as posts load
const blogDetailOverlay = document.getElementById("blogDetailOverlay");
let currentBlogDetail = null;
let blogDetailUrlPushed = false;

function blogDetailPath(post){
  return `/blog/${post.slug}`;
}
function parseBlogDetailPath(pathname){
  const m = /^\/blog\/([a-z0-9-]+)$/.exec(pathname || "");
  return m ? m[1] : null;
}

function blogDetailHTML(post){
  return `
    ${post.imageUrl ? `<img class="blog-detail-hero-img" src="${post.imageUrl}" alt="${post.title}">` : ""}
    <span class="blog-detail-date">${blogDateLabel(post.date)} &middot; Travel Stories</span>
    <h2>${post.title}</h2>
    <div class="pkg-detail-card">
      <div class="blog-detail-article">${post.content || ""}</div>
      ${post.researchSourceUrl ? `<p style="margin-top:18px;font-size:0.78rem;color:var(--ink-soft);">Source: <a href="${post.researchSourceUrl}" target="_blank" rel="noopener">${post.researchSourceUrl}</a></p>` : ""}
    </div>
    <div class="pkg-detail-card aw-blog-cta" id="blogDetailCta">
      <div class="aw-blog-cta-text">
        <h4>Liked this idea? Let's plan it for you.</h4>
        <p>Tell us your name and number — we'll call you back with a custom itinerary and price.</p>
      </div>
      <form class="aw-blog-cta-form" id="blogDetailCtaForm">
        <input type="text" id="blogDetailCtaName" placeholder="Your name" required>
        <input type="tel" id="blogDetailCtaPhone" placeholder="10-digit number" maxlength="10" required>
        <button type="submit">Get callback</button>
      </form>
      <p class="aw-form-msg" id="blogDetailCtaMsg" style="width:100%;"></p>
    </div>
  `;
}

function openBlogDetail(post, fromUrl){
  if(!post) return;
  currentBlogDetail = post;
  document.getElementById("blogDetailContent").innerHTML = blogDetailHTML(post);
  openOverlay(blogDetailOverlay);
  const modalEl = blogDetailOverlay.querySelector(".modal");
  if(modalEl) modalEl.scrollTop = 0;

  const path = blogDetailPath(post);
  setPageSEO(post.metaTitle || `${post.title} | AdmireDworld Travel Blog`, post.metaDescription || excerpt(post.content, 160), path);
  if(!fromUrl){
    history.pushState({ blogDetail: true, path }, "", path);
    blogDetailUrlPushed = true;
  }

  const ctaForm = document.getElementById("blogDetailCtaForm");
  if(ctaForm){
    ctaForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const name = document.getElementById("blogDetailCtaName").value.trim();
      const phone = document.getElementById("blogDetailCtaPhone").value.trim();
      const msgEl = document.getElementById("blogDetailCtaMsg");
      msgEl.className = "aw-form-msg";
      if(!name || !/^[0-9]{10}$/.test(phone)){
        msgEl.textContent = "Please enter your name and a valid 10-digit phone number.";
        return;
      }
      try{
        await apiPost("/api/leads", { name, phone, source: "blog_cta", interest: post.title, page: path });
        msgEl.className = "aw-form-msg ok";
        msgEl.textContent = "Thanks! Our team will call you back shortly.";
        ctaForm.reset();
      }catch(err){
        msgEl.textContent = err.message;
      }
    });
  }
}

// Restores the default title/meta/canonical and, if WE were the ones who
// pushed the /blog/... URL, takes the browser back off it — mirrors
// closePkgDetailPage() below.
function closeBlogDetailPage(fromPopstate){
  closeOverlay(blogDetailOverlay);
  resetPageSEO();
  currentBlogDetail = null;
  if(blogDetailUrlPushed && !fromPopstate){
    blogDetailUrlPushed = false;
    history.back();
  }else{
    blogDetailUrlPushed = false;
  }
}

// Deep-link support: if the page loaded directly on a /blog/<slug> URL
// (shared link, bookmark, search result), open that post as soon as
// loadBlog() has fetched today's post + the recent list.
function tryOpenBlogFromCurrentUrl(){
  const slug = parseBlogDetailPath(location.pathname);
  if(!slug || currentBlogDetail) return;
  const post = blogDetailStore[slug];
  if(post){
    openBlogDetail(post, true);
    return;
  }
  // Shared/bookmarked link to a post older than the recent-list cache (or
  // the backend was unreachable) — a friendly fallback instead of a dead end.
  document.getElementById("blogDetailContent").innerHTML = `
    <div class="pkg-detail-card" style="text-align:center;">
      <h2>This story isn't available right now</h2>
      <p class="modal-sub">It may have moved, or is older than our recent stories list.</p>
      <a class="btn-primary" href="/#blog">Browse recent stories</a>
    </div>`;
  openOverlay(blogDetailOverlay);
  history.replaceState(null, "", "/#blog");
}

document.getElementById("blogLatestWrap").addEventListener("click", handleBlogReadClick);
document.getElementById("blogList").addEventListener("click", handleBlogReadClick);
function handleBlogReadClick(e){
  const link = e.target.closest("a.bf-read-link, a.bc-read-link");
  if(!link) return;
  if(e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // let the browser handle it
  const post = blogDetailStore[link.dataset.blogSlug];
  if(!post) return; // fall through to the normal href as a safety net
  e.preventDefault();
  openBlogDetail(post);
}

document.getElementById("blogDetailBackLink").addEventListener("click", (e)=>{
  e.preventDefault();
  closeBlogDetailPage();
});

window.addEventListener("popstate", ()=>{
  const slug = parseBlogDetailPath(location.pathname);
  if(slug){
    const post = blogDetailStore[slug];
    if(post) openBlogDetail(post, true);
  }else if(currentBlogDetail){
    blogDetailUrlPushed = false;
    closeBlogDetailPage(true);
  }
});

/* ================================================================
   INDIA PACKAGES — now backend-driven (reads/writes /api/packages)
   Doesn't edit indiaPackages/allPackages/renderAll/packageCardHTML —
   it just refills the existing arrays with backend data and calls
   the existing renderAll() again, so nothing above is touched.
================================================================ */
const pkgDetailStore = {}; // id -> full backend package (day-wise, inclusions, etc.)
const pkgDetailOverlay = document.getElementById("pkgDetailOverlay");

function toFrontendShape(p){
  return {
    id: p.id, name: p.name, loc: p.loc, tag: p.tag, cat: p.cat,
    desc: p.desc, price: p.discountPrice || p.price,
    colors: ["#2B3968", "#3D5FA8"], // fallback card gradient if no image
    image: p.imageUrl || null,
  };
}

async function loadIndiaPackagesFromBackend(){
  try{
    const data = await apiGet("/api/packages/india");
    const packages = data.packages || [];

    packages.forEach(p => pkgDetailStore[p.id] = p);

    // Refill the existing arrays in place, then reuse the existing renderAll()
    indiaPackages.splice(0, indiaPackages.length, ...packages.map(toFrontendShape));
    allPackages.splice(0, allPackages.length, ...indiaPackages, ...intlPackages);
    renderAll();
    // Re-apply active India filter chip, if any
    const activeChip = document.querySelector('#tab-india .chip.active');
    if(activeChip) activeChip.click();
    tryOpenPkgFromCurrentUrl("india");
    tryOpenReferralInitialPackage("india");
  }catch(err){
    console.error("Could not load India packages from backend:", err);
  }
}
loadIndiaPackagesFromBackend();

/* ---------- Package image support (pkg-media uses image when backend gives one) ---------- */
// packageCardHTML() (defined earlier) already renders a photo for every
// card; this just swaps in the backend's own real photo afterwards for
// cards that have one, without touching packageCardHTML itself.
function applyPackageImages(){
  document.querySelectorAll(".pkg-card").forEach(card=>{
    const id = card.querySelector("[data-book]")?.dataset.book;
    const full = pkgDetailStore[id];
    if(full && full.imageUrl){
      const img = card.querySelector(".pkg-media img");
      if(img) img.src = full.imageUrl;
    }
  });
}
const _origRenderAll = renderAll;
renderAll = function(){ _origRenderAll(); applyPackageImages(); };

/* ================================================================
   PACKAGE DETAIL PAGE (destination / day-wise / hotel name & category /
   inclusions / exclusions / Book Now query form) + SEO-friendly URL
   -------------------------------------------------------------------
   NEW/UPGRADED — purely additive on top of the existing pkgDetailStore /
   openPkgDetail wiring above. "View Details" on an India or International
   package now opens a proper full-page-style detail view (own <title>,
   meta description and a real, shareable /package/... URL pushed via
   history.pushState — see PACKAGE-DETAIL-PAGE-UPDATE.md) instead of just
   a small popup, and "Book Now" inside it opens a quick name+phone query
   form (POST /api/leads) instead of the OTP login/booking flow — the
   card-level "Book now" buttons elsewhere on the site are untouched.
================================================================ */
const DEFAULT_PAGE_TITLE = document.getElementById("pageTitleTag")?.textContent || document.title;
const DEFAULT_META_DESC = document.getElementById("metaDescriptionTag")?.getAttribute("content") || "";
const DEFAULT_CANONICAL = document.getElementById("canonicalTag")?.getAttribute("href") || "https://www.tourpackagewala.in/";
const SITE_ORIGIN = "https://www.tourpackagewala.in";

function slugify(str){
  return String(str||"").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "package";
}

// e.g. "/package/india/kashmir-valley-escape--in1". Double-dash before the
// id keeps parsing unambiguous even though both slugs and some ids (like
// "auto-1737091234") contain single hyphens.
function pkgDetailPath(type, p){
  return `/package/${type}/${slugify(p.name)}--${p.id}`;
}
function parsePkgDetailPath(pathname){
  const m = /^\/package\/(india|international)\/([a-z0-9-]+)$/.exec(pathname || "");
  if(!m) return null;
  const [, type, rest] = m;
  const sepIdx = rest.lastIndexOf("--");
  const id = sepIdx === -1 ? rest : rest.slice(sepIdx + 2);
  if(!id) return null;
  return { type, endpoint: type === "india" ? "india" : "international", id };
}

// Tracks the package currently open on the full detail page, so the "Book
// Now" query form knows which package/type the enquiry is for.
let currentPkgDetail = null;
let pkgDetailUrlPushed = false; // true once we've changed the URL for the open detail page

function pkgSeoTitle(p, typeLabel){
  return `${p.name} — ${p.tag || ""} ${typeLabel} Package | AdmireDworld Travel`.replace(/\s+/g, " ").trim();
}
function pkgSeoDescription(p){
  const hotelBit = p.hotelName ? `Stay at ${p.hotelName}` : `${p.hotelCategory || "Quality"} hotel`;
  return `${p.desc ? p.desc + " " : ""}${p.tag || ""} itinerary for ${p.loc} — day-wise plan, ${hotelBit}, inclusions & exclusions. Book with AdmireDworld Travel.`.replace(/\s+/g, " ").trim();
}

function setPageSEO(title, description, path){
  const titleTag = document.getElementById("pageTitleTag");
  const descTag = document.getElementById("metaDescriptionTag");
  const canonicalTag = document.getElementById("canonicalTag");
  if(titleTag) titleTag.textContent = title;
  document.title = title;
  if(descTag) descTag.setAttribute("content", description);
  if(canonicalTag) canonicalTag.setAttribute("href", path ? `${SITE_ORIGIN}${path}` : DEFAULT_CANONICAL);
}
function resetPageSEO(){
  setPageSEO(DEFAULT_PAGE_TITLE, DEFAULT_META_DESC, null);
  // Also clears any package-specific FAQ schema left over from a previously
  // open package detail page — see pkgFaqSchemaJSON()/#pkgFaqSchemaTag below.
  const faqSchemaTag = document.getElementById("pkgFaqSchemaTag");
  if(faqSchemaTag) faqSchemaTag.textContent = "null";
}

/* ================================================================
   PACKAGE-PAGE FAQ (AEO) — dynamic, per-package questions + answers
   -------------------------------------------------------------------
   NEW/ADDITIVE — does not change pkgDetailHTML() or any existing
   package-detail markup above. Generates a small, honest FAQ (what's
   included, duration, places covered, price, best time to visit,
   hotel, transport, honeymoon-suitability) purely from THIS package's
   own data (p.tag/loc/price/inclusions/exclusions/hotelCategory/cat
   etc.) — never invented facts. Every answer below either comes
   straight from the package record or is phrased as general,
   non-destination-specific seasonal guidance with a caveat to confirm
   exact dates with the travel team.

   Mirrored (kept in sync on purpose) in middleware.js's
   buildPkgFaqData()/buildPkgFaqHTML()/buildPkgFaqSchema() — that file
   pre-renders the SAME questions/answers into the raw HTML served to
   crawlers/bots that don't run JavaScript, so the FAQ is crawlable
   without waiting on this script. If you change the wording or add a
   question here, mirror it there too.
================================================================ */
function escapeHtml(str){
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Strips stray markdown (## headings, **bold**, *italic*) that sometimes
// ends up in a package/fixed-departure's day-wise title or description when
// it was pasted in from an AI tool — so it never shows up as literal ## or
// ** on the live site, even for older entries saved before the admin-side
// itinerary parser started cleaning this automatically.
function mdClean(str){
  return String(str || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
}

// General (non-destination-specific) seasonal guidance by package category —
// broad, widely-true travel knowledge, not a claim about any one place's
// exact climate, and always paired with a caveat to confirm with the team.
const PKG_FAQ_BEST_TIME_BY_CAT = {
  hills: (d) => `Hill destinations like ${d} are generally most pleasant between March–June and September–November; the monsoon months (July–August) can bring heavy rain and landslide risk in mountain areas.`,
  offbeat: (d) => `${d} is generally best visited between October and April, avoiding the monsoon months (June–September).`,
  heritage: (d) => `${d} is generally best visited between October and March, avoiding the peak summer heat (April–June).`,
  beach: (d) => `Beach destinations like ${d} are usually best visited between October and March, when the weather is cooler and drier; the monsoon (June–September) is best avoided.`,
  city: (d) => `${d} is largely a year-round destination; many travellers prefer the cooler months for outdoor sightseeing.`,
  scenic: (d) => `${d} is popular in summer (May–September) for greenery and outdoor activities, and in winter (December–February) for snow and winter-sport itineraries.`,
  honeymoon: (d) => `${d} is generally driest and most pleasant from November to April.`,
};

// Builds the FAQ question/answer pairs for ONE package, using only that
// package's own data. Shared shape between the visible HTML and the
// FAQPage JSON-LD below, so what's marked up always matches what's shown.
function pkgFaqData(p){
  const name = p.name || "This package";
  const places = String(p.loc || "").split("·").map(s => s.trim()).filter(Boolean);
  const destLabel = places[0] || String(p.destination || "").split(",")[0].trim() || name;
  const placesText = places.length ? places.join(", ") : (p.destination || destLabel);

  const durMatch = /(\d+)\s*D\s*\/?\s*(\d+)\s*N/i.exec(p.tag || "");
  const durationText = durMatch ? `${durMatch[1]} days and ${durMatch[2]} nights` : (p.tag || "a few days");

  const hasDiscount = p.discountPrice && p.discountPrice < p.price;
  const priceNow = hasDiscount ? p.discountPrice : p.price;
  const priceText = priceNow
    ? `${money(priceNow)} per person${hasDiscount ? ` (discounted from ${money(p.price)})` : ""}`
    : "available on request — contact our travel team for a quote";

  const inclusions = Array.isArray(p.inclusions) ? p.inclusions : [];
  const inclusionsText = inclusions.length
    ? inclusions.join(", ")
    : "hotel stay, breakfast and transfers as per the itinerary";

  const hasHotelInInclusions = inclusions.some(i => /hotel|stay|houseboat|resort|villa/i.test(i));
  const hotelBit = p.hotelName
    ? `at ${p.hotelName} (${p.hotelCategory || "quality"} category)`
    : `in a ${p.hotelCategory || "3-star"} category hotel`;
  const hotelAnswer = (hasHotelInInclusions || p.hotelCategory || p.hotelName)
    ? `Yes, accommodation is included, ${hotelBit}, for the full duration of the trip. The exact hotel/houseboat may vary based on availability at the time of travel.`
    : `Please check with our travel team — accommodation details for this package are confirmed at the time of booking.`;

  const hasTransferInInclusions = inclusions.some(i => /transfer|cab|transport|pickup|drop/i.test(i));
  const transportAnswer = hasTransferInInclusions
    ? `Yes, airport/station transfers and sightseeing transport by private cab are included, as listed in this package's inclusions.`
    : `Local transfers are not listed in this package's inclusions — please confirm transport arrangements with our travel team before booking.`;

  const isHoneymoon = p.cat === "honeymoon"
    || /honeymoon/i.test(p.tag || "")
    || /honeymoon|romantic/i.test(p.desc || "")
    || /honeymoon/i.test(p.name || "");
  const honeymoonAnswer = isHoneymoon
    ? `Yes, ${name} is designed as a honeymoon-friendly itinerary, with a pace and set of experiences well suited to couples. Let our team know it's a honeymoon trip and we'll arrange romantic touches like a candlelight dinner or room upgrade where available.`
    : `${name} is a general holiday itinerary rather than a dedicated honeymoon package, but it can be customized for couples — mention it's a honeymoon trip while enquiring and we'll suggest romantic add-ons and room upgrades where available.`;

  const bestTimeFn = PKG_FAQ_BEST_TIME_BY_CAT[p.cat];
  const bestTimeAnswer = (bestTimeFn ? bestTimeFn(destLabel) : `The best time to visit ${destLabel} varies by season.`)
    + ` Speak to our travel team for a month-wise recommendation based on your exact travel dates.`;

  return [
    { q: `What is included in the ${name} package?`, a: `This package includes: ${inclusionsText}.` },
    { q: `How many days do I need for the ${destLabel} trip?`, a: `${name} is a ${durationText} itinerary${places.length ? ` covering ${placesText}` : ""}.` },
    { q: `Which places are covered in the ${name} package?`, a: places.length ? `This package covers ${placesText}.` : `This package covers ${p.destination || destLabel}.` },
    { q: `What is the price of the ${name} package?`, a: `The ${name} package is priced at ${priceText}. Final pricing may vary based on travel dates, number of travellers and any customization.` },
    { q: `What is the best time to visit ${destLabel}?`, a: bestTimeAnswer },
    { q: `Is hotel accommodation included in this package?`, a: hotelAnswer },
    { q: `Is transportation included in this package?`, a: transportAnswer },
    { q: `Is the ${name} package suitable for a honeymoon?`, a: honeymoonAnswer },
  ];
}

// Plain, always-visible <h2>/<h3>/<p> markup — never an accordion, so the
// full question + answer text sits in the normal DOM for any crawler,
// including ones (many AI bots) that never execute JavaScript at all.
function pkgFaqHTML(p){
  const faqs = pkgFaqData(p);
  return `
    <section class="pkg-faq-section" aria-labelledby="pkgFaqHeading">
      <h2 id="pkgFaqHeading">Frequently Asked Questions</h2>
      ${faqs.map(f => `
        <div class="pkg-faq-item">
          <h3>${escapeHtml(f.q)}</h3>
          <p>${escapeHtml(f.a)}</p>
        </div>`).join("")}
    </section>
  `;
}

// Same questions/answers as pkgFaqHTML() above, as FAQPage JSON-LD — kept
// in lockstep with the visible section so the markup never claims content
// that isn't actually on the page (see #pkgFaqSchemaTag in index.html).
function pkgFaqSchemaJSON(p){
  const faqs = pkgFaqData(p);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  });
}

function pkgDetailHTML(p){
  const hasDiscount = p.discountPrice && p.discountPrice < p.price;
  return `
    <div class="pkg-detail-hero">
      <div class="pkg-detail-head">
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}">` : photoImgHTML(`${p.name}, ${p.loc}`, p.name, 280, 200)}
        <div>
          <h1>${p.name}${p.tag ? ` – ${p.tag}` : ""}</h1>
          <p class="pkg-loc">${p.loc}</p>
          <div class="pkg-detail-chips">
            <span class="pkg-detail-chip">${p.tag}</span>
            <span class="pkg-detail-chip">🏨 Hotel category: ${p.hotelCategory || "3-star"}</span>
            ${p.hotelName ? `<span class="pkg-detail-chip">🏩 ${p.hotelName}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="pkg-detail-price">
        ${hasDiscount ? `<span class="old">${money(p.price)}</span>` : ""}
        <span class="new">${money(hasDiscount ? p.discountPrice : p.price)}</span>
        <span class="pkg-detail-price-unit">per person</span>
      </div>
    </div>
    <div class="pkg-detail-card">
    <div class="package-download-section" style="margin-top:0;margin-bottom:20px;" data-package-download="${p.id}">
      <h3>Download Your Custom Package</h3>
      <input type="tel" class="pkg-download-whatsapp" maxlength="10" inputmode="numeric" autocomplete="tel" placeholder="Enter Your WhatsApp Number" aria-label="WhatsApp Number">
      <button type="button" class="btn-primary btn-block pkg-download-btn" disabled>Download Now</button>
      <p class="package-download-msg" aria-live="polite"></p>
    </div>
    <p>${p.desc || ""}</p>
    <h3>Day-wise itinerary</h3>
    ${(p.dayWise && p.dayWise.length) ? `
      ${p.dayWise.map(d=>`
        <div class="pkg-day-row">
          <span class="pd-num">Day ${d.day}</span>
          <div><strong>${mdClean(d.title)}</strong><p style="margin:2px 0 0;">${mdClean(d.desc) || ""}</p></div>
        </div>`).join("")}
    ` : `<p style="color:var(--ink-soft);">Detailed day-wise plan will be shared once your dates are confirmed.</p>`}
    <div class="pkg-inc-exc">
      <div><h4>Inclusions</h4><ul>${(p.inclusions||[]).map(i=>`<li>${i}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div><h4>Exclusions</h4><ul>${(p.exclusions||[]).map(i=>`<li>${i}</li>`).join("") || "<li>—</li>"}</ul></div>
    </div>
    <button class="btn-primary btn-block" style="margin-top:20px;" data-pkg-enquire="${p.id}">Book Now</button>
    ${whatsappBtnHTML(p.name, "pkg-whatsapp--block")}
    </div>
  `;
}

/* ================================================================
   RELATED (SAME-DESTINATION) PACKAGES — internal linking
   -------------------------------------------------------------------
   NEW/ADDITIVE — does not change pkgDetailHTML() or any existing
   package-detail markup above; its output is appended after it in
   openPkgDetail() below. Shows real, already-loaded packages for the
   same destination on a package's own detail page — e.g. "Related
   Kashmir Tour Packages" on a Kashmir package page. Every link is
   built from an actual package already in pkgDetailStore (populated
   live from the backend by loadIndiaPackagesFromBackend()) via the
   same pkgDetailPath() used for real "View Details" links elsewhere,
   so nothing here is a guessed or invented URL, and any Kashmir
   package added later through the admin panel is picked up
   automatically the next time this runs — no hardcoded id/name list.

   Currently scoped to Kashmir (isKashmirPackage()) since that's the
   destination asked for, but getRelatedPackages()/relatedPackagesHTML()
   are written generically off the destination/loc/name fields so this
   can be extended to group other destinations later without touching
   openPkgDetail() or the rendering call site.

   Mirrored (kept in sync on purpose) in middleware.js's
   isKashmirPackage()/buildRelatedPackagesHTML() — that file fetches
   the same India packages list server-side so this section is present
   in the raw HTML served to crawlers/bots that don't run JavaScript.
   If you change the matching rule or markup here, mirror it there too.
================================================================ */
function isKashmirPackage(p){
  const hay = `${p.name || ""} ${p.destination || ""} ${p.loc || ""}`.toLowerCase();
  return hay.includes("kashmir");
}

// Descriptive anchor text per SEO rules — the package's own real name,
// used as-is. No suffix is ever appended (that previously caused
// duplicate wording like "4 Days Kashmir Package Tour Package"), so the
// anchor text always matches the package's actual title exactly.
function relatedAnchorText(p){
  return p.name || "Kashmir Tour Package";
}

// Other LIVE India packages that share a destination grouping with
// `current` — right now that only means "both are Kashmir packages"
// (see isKashmirPackage above). Reads from indiaPackages/pkgDetailStore,
// which are only ever populated from the backend, never hardcoded.
function getRelatedPackages(current){
  if(!isKashmirPackage(current)) return [];
  return indiaPackages
    .map(basic => pkgDetailStore[basic.id] || basic)
    .filter(p => p.id !== current.id && isKashmirPackage(p));
}

function relatedPackagesHTML(current){
  const related = getRelatedPackages(current);
  if(!related.length) return ""; // nothing to link to yet — section simply doesn't render
  return `
    <section class="pkg-related-section" aria-labelledby="pkgRelatedHeading">
      <h2 id="pkgRelatedHeading">Related Kashmir Tour Packages</h2>
      <div class="pkg-related-grid">
        ${related.map(p => `
          <a class="pkg-related-link" href="${pkgDetailPath("india", p)}" data-related-pkg="${p.id}">
            <span class="pkg-related-name">${relatedAnchorText(p)}</span>
            <span class="pkg-related-loc">${p.loc || p.destination || ""}</span>
          </a>`).join("")}
      </div>
    </section>
  `;
}

// Shared by both India and International grids: opens the full detail page
// for a given package id, fetching it fresh from the backend if it isn't
// already cached in pkgDetailStore (e.g. it was just added, or the initial
// list load hasn't finished yet) — so day-wise itinerary / hotel /
// inclusions always show. `fromUrl` is true only when we're opening this
// because the page itself was loaded/deep-linked at a /package/... URL
// (so we must NOT push a second history entry for it).
async function openPkgDetail(id, endpoint, fromUrl){
  let full = pkgDetailStore[id];
  if(!full){
    try{
      const data = await apiGet(`/api/packages/${endpoint}/${id}`);
      full = data.package;
      if(full) pkgDetailStore[id] = full;
    }catch(err){
      console.error("Could not load package details:", err);
    }
  }
  if(!full){
    // Backend didn't have it (not deployed yet / offline) — still open the
    // page with whatever basic info is already on screen, instead of the
    // button silently doing nothing.
    const basic = [...indiaPackages, ...intlPackages].find(p => p.id === id);
    if(basic) full = { ...basic, dayWise: [], inclusions: [], exclusions: [], hotelCategory: "", hotelName: "" };
  }
  if(!full){ showToast("Could not load package details. Please try again."); return; }

  const type = endpoint === "india" ? "india" : "international";
  const typeLabel = type === "india" ? "India" : "International";
  currentPkgDetail = { type, endpoint, pkg: full };

  // Related-destination packages (see relatedPackagesHTML() above) and the
  // FAQ section (see pkgFaqHTML/pkgFaqSchemaJSON above) are appended after
  // the existing detail markup — purely additive, pkgDetailHTML() itself
  // is untouched.
  document.getElementById("pkgDetailContent").innerHTML = pkgDetailHTML(full) + relatedPackagesHTML(full) + pkgFaqHTML(full);
  openOverlay(pkgDetailOverlay);
  const modalEl = pkgDetailOverlay.querySelector(".modal");
  if(modalEl) modalEl.scrollTop = 0;

  const path = pkgDetailPath(type, full);
  setPageSEO(pkgSeoTitle(full, typeLabel), pkgSeoDescription(full), path);
  const faqSchemaTag = document.getElementById("pkgFaqSchemaTag");
  if(faqSchemaTag) faqSchemaTag.textContent = pkgFaqSchemaJSON(full);
  if(!fromUrl){
    history.pushState({ pkgDetail: true, path }, "", path);
    pkgDetailUrlPushed = true;
  }

  const downloadSection = document.querySelector(`[data-package-download="${CSS.escape(String(full.id))}"]`);
  if(downloadSection){
    const input = downloadSection.querySelector(".pkg-download-whatsapp");
    const btn = downloadSection.querySelector(".pkg-download-btn");
    const msg = downloadSection.querySelector(".package-download-msg");
    bindWhatsappDownloadValidation(input, btn, msg);
    btn.addEventListener("click", async ()=>{
      const whatsappNumber = input.value.trim();
      if(!isValidWhatsappNumber(whatsappNumber)) return;
      btn.disabled = true;
      btn.textContent = "Preparing PDF…";
      msg.textContent = "";
      try{
        await submitPackageDownloadLead({
          whatsappNumber,
          packageId: String(full.id),
          packageName: full.name || "Travel Package",
        });
        await downloadPackagePdf(full, whatsappNumber);
        msg.textContent = "PDF downloaded successfully.";
      }catch(err){
        msg.textContent = err.message || "Could not download the package PDF.";
      }finally{
        btn.textContent = "Download Now";
        btn.disabled = !isValidWhatsappNumber(input.value.trim());
      }
    });
  }
}

// Generates the package PDF only after the download lead has been saved.
async function downloadPackagePdf(pkg, whatsappNumber){
  if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error("PDF service is unavailable. Please try again.");
  const clean = (v) => String(v == null ? "" : v).replace(/<[^>]*>/g, "").replace(/\u20B9/g, "Rs. ").replace(/[\u2013\u2014]/g, "-").replace(/[^\x00-\xFF]/g, "");
  const doc = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 44, maxW = W - M * 2;
  let y = M;
  const need = h => { if(y + h > H - M){ doc.addPage(); y = M; } };
  const line = (txt, size=11, bold=false, gap=3) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.splitTextToSize(clean(txt), maxW).forEach(l => { need(size+4); doc.text(l, M, y); y += size+4; });
    y += gap;
  };
  line("AdmireDworld Travel - Package Details", 18, true, 8);
  line(`Package: ${pkg.name || "-"}`, 14, true, 3);
  line(`WhatsApp: ${whatsappNumber}`, 10, false, 8);
  if(pkg.loc) line(`Destination: ${pkg.loc}`, 11, false, 3);
  if(pkg.hotelCategory) line(`Hotel Category: ${pkg.hotelCategory}`, 11, false, 3);
  if(pkg.hotelName) line(`Hotel: ${pkg.hotelName}`, 11, false, 8);
  if(pkg.desc) line(pkg.desc, 11, false, 8);
  if(pkg.dayWise && pkg.dayWise.length){
    line("Day-wise Itinerary", 13, true, 3);
    pkg.dayWise.forEach(d => line(`Day ${d.day} - ${d.title}: ${d.desc}`, 10.5, false, 3));
  }
  if(pkg.inclusions && pkg.inclusions.length){
    line("Inclusions", 12, true, 2);
    pkg.inclusions.forEach(i => line(`• ${i}`, 10.5, false, 2));
  }
  if(pkg.exclusions && pkg.exclusions.length){
    line("Exclusions", 12, true, 2);
    pkg.exclusions.forEach(i => line(`• ${i}`, 10.5, false, 2));
  }
  const price = pkg.discountPrice && pkg.discountPrice < pkg.price ? pkg.discountPrice : pkg.price;
  if(price != null) line(`Package Price: ${money(price)} per person`, 13, true, 8);
  line("AdmireDworld Travel | hello@admiredworld.travel | +91 96393 43585", 9, false, 0);
  const filename = `Package-${String(pkg.name || "Travel").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g,"")}.pdf`;
  doc.save(filename);
}

// Restores the default title/meta/canonical and, if WE were the ones who
// pushed the /package/... URL, takes the browser back off it — leaves the
// URL alone if the page was opened directly at that URL (e.g. shared link)
// or via the back/forward buttons, since popstate already handles those.
function closePkgDetailPage(fromPopstate){
  closeOverlay(pkgDetailOverlay);
  resetPageSEO();
  currentPkgDetail = null;
  if(pkgDetailUrlPushed && !fromPopstate){
    pkgDetailUrlPushed = false;
    history.back();
  }else{
    pkgDetailUrlPushed = false;
  }
}

// Shared by the India grid, International grid and Home "Featured" section:
// the whole card still opens the detail page on click (existing behaviour),
// but now "View Full Details" is a real <a href="/package/..."> — so a
// plain left-click is intercepted for a fast, in-place SPA transition
// (openPkgDetail + pushState), while ctrl/cmd/shift-click and middle-click
// fall through to normal browser behaviour (open in new tab, etc.).
function handlePkgCardClick(e, endpointFor){
  if(e.target.closest("[data-book]")) return; // let the existing booking flow handle this
  const link = e.target.closest("a.pkg-view-details");
  if(link && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return; // let the browser handle it
  const card = e.target.closest(".pkg-card");
  if(!card) return;
  const id = card.querySelector("[data-book]")?.dataset.book;
  if(!id) return;
  if(link) e.preventDefault();
  const endpoint = typeof endpointFor === "function" ? endpointFor(id) : endpointFor;
  openPkgDetail(id, endpoint);
}

document.getElementById("indiaGrid").addEventListener("click", (e)=> handlePkgCardClick(e, "india"));

// Real page now, not a popup: closing means going "back" via the topbar's
// "← Back to packages" link, not clicking outside a backdrop.
document.getElementById("pkgDetailBackLink").addEventListener("click", (e)=>{
  e.preventDefault();
  closePkgDetailPage();
});

// Browser Back/Forward: if we're leaving a /package/... URL we pushed, just
// close the page instead of trying to push again (avoids a redundant entry).
window.addEventListener("popstate", ()=>{
  const parsed = parsePkgDetailPath(location.pathname);
  if(parsed){
    openPkgDetail(parsed.id, parsed.endpoint, true);
  }else if(currentPkgDetail){
    pkgDetailUrlPushed = false;
    closePkgDetailPage(true);
  }
});

/* ---------- "Book Now" query form (name + phone, no login required) ---------- */
function pkgEnquireFormHTML(pkg){
  const prefillName = state?.user?.name || "";
  const prefillPhone = state?.user?.phone || "";
  return `
    <h2>Enquire about this package</h2>
    <p class="modal-sub">Share your name and contact number — our travel team will call you back about <strong>${pkg.name}</strong>.</p>
    <div class="f-field">
      <label for="pkgEnqName">Full name</label>
      <input type="text" id="pkgEnqName" placeholder="Your name" value="${prefillName}">
    </div>
    <div class="f-field">
      <label for="pkgEnqPhone">Contact number</label>
      <input type="tel" id="pkgEnqPhone" placeholder="10-digit mobile number" value="${prefillPhone}" maxlength="10">
    </div>
    <div class="f-field">
      <label for="pkgEnqMsg">Message (optional)</label>
      <textarea id="pkgEnqMsg" rows="3" placeholder="Preferred travel month, number of travellers, etc."></textarea>
    </div>
    <p id="pkgEnqError" style="color:var(--coral-deep); font-size:0.85rem; min-height:1.1em;"></p>
    <button class="btn-primary btn-block" id="pkgEnqSubmitBtn">Submit</button>
  `;
}

function openPkgEnquireForm(pkg){
  document.getElementById("pkgEnquireContent").innerHTML = pkgEnquireFormHTML(pkg);
  openOverlay(pkgEnquireOverlay);

  document.getElementById("pkgEnqSubmitBtn").addEventListener("click", async ()=>{
    const errEl = document.getElementById("pkgEnqError");
    const name = document.getElementById("pkgEnqName").value.trim();
    const phone = document.getElementById("pkgEnqPhone").value.trim();
    const message = document.getElementById("pkgEnqMsg").value.trim();
    errEl.textContent = "";

    if(!name){ errEl.textContent = "Please enter your name."; return; }
    if(!/^[0-9]{10}$/.test(phone)){ errEl.textContent = "Please enter a valid 10-digit contact number."; return; }

    const btn = document.getElementById("pkgEnqSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try{
      // referralCode / initialPackage (if any) are attached automatically by
      // the apiPost wrapper below — finalPackage is always this exact
      // package, i.e. whatever the customer actually chose to enquire about.
      await apiPost("/api/leads", {
        name, phone, message,
        interest: pkg.name,
        finalPackage: pkg.name,
        source: "package_enquiry",
        page: location.pathname,
      });
      closeOverlay(pkgEnquireOverlay);
      showToast(`Thanks ${name}! Our team will call you on ${phone} shortly about ${pkg.name}.`, 6000);
    }catch(err){
      errEl.textContent = err.message || "Could not submit right now. Please try again.";
      btn.disabled = false;
      btn.textContent = "Submit";
    }
  });
}

const pkgEnquireOverlay = document.getElementById("pkgEnquireOverlay");
pkgEnquireOverlay.addEventListener("click", (e)=>{ if(e.target === pkgEnquireOverlay) closeOverlay(pkgEnquireOverlay); });

document.getElementById("pkgDetailContent").addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-pkg-enquire]");
  if(btn && currentPkgDetail){ openPkgEnquireForm(currentPkgDetail.pkg); return; }

  // "Related Kashmir Tour Packages" card — a real /package/india/... <a
  // href> (works even if JS hasn't run yet), intercepted here only to
  // swap the detail page in-place via the existing SPA flow instead of a
  // full reload.
  const relatedLink = e.target.closest("[data-related-pkg]");
  if(relatedLink){
    e.preventDefault();
    openPkgDetail(relatedLink.dataset.relatedPkg, "india", false);
  }
});

// Deep-link support: if the page loaded directly on a /package/india/... or
// /package/international/... URL (shared link, bookmark, search result),
// open that package's detail page as soon as its list has loaded.
function tryOpenPkgFromCurrentUrl(expectedType){
  const parsed = parsePkgDetailPath(location.pathname);
  if(parsed && parsed.type === expectedType && !currentPkgDetail){
    openPkgDetail(parsed.id, parsed.endpoint, true);
  }
}

/* ---------- Admin: add / edit / delete India packages (only visible with ?admin=1) ---------- */
(function initPkgAdmin(){
  const box = document.getElementById("pkgAdminBox");
  if(!box) return;
  const params = new URLSearchParams(location.search);
  if(params.get("admin") !== "1") return;
  box.style.display = "block";

  function parseDayWise(text){
    return text.split("\n").map(l=>l.trim()).filter(Boolean).map((line, i)=>{
      const [title, ...rest] = line.split("|");
      return { day: i+1, title: (title||"").trim(), desc: rest.join("|").trim() };
    });
  }
  function parseList(text){
    return text.split(",").map(s=>s.trim()).filter(Boolean);
  }

  async function refreshAdminList(){
    const listEl = document.getElementById("pkgAdminList");
    try{
      const data = await apiGet("/api/packages/india");
      listEl.innerHTML = (data.packages||[]).map(p=>`
        <div class="pkg-admin-row">
          <div><span class="pa-tag">${p.source}</span> — ${p.name} (${p.loc})</div>
          <button data-del-pkg="${p.id}">Delete</button>
        </div>`).join("") || "<p>No packages yet.</p>";
    }catch{ listEl.innerHTML = "<p>Could not load packages.</p>"; }
  }
  refreshAdminList();

  document.getElementById("pkgAdminList").addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-del-pkg]");
    if(!btn) return;
    const adminKey = document.getElementById("pkgAdminKey").value;
    try{
      await fetch(`${API_BASE_URL}/api/packages/india/${btn.dataset.delPkg}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey }),
      });
      refreshAdminList();
      loadIndiaPackagesFromBackend();
    }catch(err){ showToast("Could not delete package."); }
  });

  document.getElementById("pkgAdminSaveBtn").addEventListener("click", async ()=>{
    const msgEl = document.getElementById("pkgAdminMsg");
    msgEl.textContent = "";
    const body = {
      adminKey: document.getElementById("pkgAdminKey").value,
      name: document.getElementById("pkgName").value.trim(),
      loc: document.getElementById("pkgLoc").value.trim(),
      destination: document.getElementById("pkgDestination").value.trim(),
      tag: document.getElementById("pkgTag").value.trim(),
      cat: document.getElementById("pkgCat").value,
      hotelCategory: document.getElementById("pkgHotel").value.trim(),
      price: document.getElementById("pkgPrice").value,
      discountPrice: document.getElementById("pkgDiscount").value,
      desc: document.getElementById("pkgDesc").value.trim(),
      dayWise: parseDayWise(document.getElementById("pkgDayWise").value),
      inclusions: parseList(document.getElementById("pkgInclusions").value),
      exclusions: parseList(document.getElementById("pkgExclusions").value),
    };
    if(!body.name || !body.loc){ msgEl.textContent = "Name and route are required."; return; }
    try{
      await apiPost("/api/packages/india", body);
      msgEl.style.color = "var(--teal)";
      msgEl.textContent = "Package added.";
      refreshAdminList();
      loadIndiaPackagesFromBackend();
    }catch(err){
      msgEl.style.color = "";
      msgEl.textContent = err.message;
    }
  });
})();

/* ================================================================
   INTERNATIONAL PACKAGES — same pattern as India above (backend-
   driven, weekly AI auto-add, admin CRUD). Reuses pkgDetailStore,
   toFrontendShape, pkgDetailHTML, applyPackageImages, renderAll —
   nothing above (including the India block) is modified.
================================================================ */
async function loadIntlPackagesFromBackend(){
  try{
    const data = await apiGet("/api/packages/international");
    const packages = data.packages || [];

    packages.forEach(p => pkgDetailStore[p.id] = p);

    intlPackages.splice(0, intlPackages.length, ...packages.map(toFrontendShape));
    allPackages.splice(0, allPackages.length, ...indiaPackages, ...intlPackages);
    renderAll();
    const activeChip = document.querySelector('#tab-international .chip.active');
    if(activeChip) activeChip.click();
    tryOpenPkgFromCurrentUrl("international");
    tryOpenReferralInitialPackage("international");
  }catch(err){
    console.error("Could not load International packages from backend:", err);
  }
}
loadIntlPackagesFromBackend();

/* ================================================================
   FIXED DEPARTURES — now backend-driven (reads /api/fixed), so
   "seats left" is a real, live number instead of a fixed value that
   never changes. Doesn't edit fixedRowHTML, renderAll, tryBook, or
   openBooking — it just refills the existing fixedDepartures array
   with backend data (same shape it already had) and calls the
   existing renderAll() again, same pattern as the India/International
   packages loaders above.
================================================================ */
async function loadFixedDeparturesFromBackend(){
  try{
    const data = await apiGet("/api/fixed");
    const departures = data.departures || [];
    if(!departures.length) return; // keep the fallback list if the backend has nothing yet
    fixedDepartures.splice(0, fixedDepartures.length, ...departures);
    renderAll();
  }catch(err){
    console.error("Could not load Fixed Departures from backend:", err);
  }
}
loadFixedDeparturesFromBackend();

document.getElementById("intlGrid").addEventListener("click", (e)=> handlePkgCardClick(e, "international"));

// FIX: the Home page's "Featured Packages" section (#homeFeatured) renders the
// exact same cards (2 India + 2 International) via packageCardHTML(), but was
// missing its own "View Full Details" click handler — only #indiaGrid and
// #intlGrid had one, so the button did nothing when clicked from the Home page.
// This mirrors the same logic as those two, just picks the right endpoint
// (india/international) depending on which array the card's id belongs to.
document.getElementById("homeFeatured")?.addEventListener("click", (e)=>
  handlePkgCardClick(e, (id)=> indiaPackages.some(p => p.id === id) ? "india" : "international")
);

/* ---------- Admin: add / edit / delete International packages (only visible with ?admin=1) ---------- */
(function initIntlAdmin(){
  const box = document.getElementById("intlAdminBox");
  if(!box) return;
  const params = new URLSearchParams(location.search);
  if(params.get("admin") !== "1") return;
  box.style.display = "block";

  function parseDayWise(text){
    return text.split("\n").map(l=>l.trim()).filter(Boolean).map((line, i)=>{
      const [title, ...rest] = line.split("|");
      return { day: i+1, title: (title||"").trim(), desc: rest.join("|").trim() };
    });
  }
  function parseList(text){
    return text.split(",").map(s=>s.trim()).filter(Boolean);
  }

  async function refreshAdminList(){
    const listEl = document.getElementById("intlAdminList");
    try{
      const data = await apiGet("/api/packages/international");
      listEl.innerHTML = (data.packages||[]).map(p=>`
        <div class="pkg-admin-row">
          <div><span class="pa-tag">${p.source}</span> — ${p.name} (${p.loc})</div>
          <button data-del-intl="${p.id}">Delete</button>
        </div>`).join("") || "<p>No packages yet.</p>";
    }catch{ listEl.innerHTML = "<p>Could not load packages.</p>"; }
  }
  refreshAdminList();

  document.getElementById("intlAdminList").addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-del-intl]");
    if(!btn) return;
    const adminKey = document.getElementById("intlAdminKey").value;
    try{
      await fetch(`${API_BASE_URL}/api/packages/international/${btn.dataset.delIntl}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey }),
      });
      refreshAdminList();
      loadIntlPackagesFromBackend();
    }catch(err){ showToast("Could not delete package."); }
  });

  document.getElementById("intlAdminSaveBtn").addEventListener("click", async ()=>{
    const msgEl = document.getElementById("intlAdminMsg");
    msgEl.textContent = "";
    const body = {
      adminKey: document.getElementById("intlAdminKey").value,
      name: document.getElementById("intlName").value.trim(),
      loc: document.getElementById("intlLoc").value.trim(),
      destination: document.getElementById("intlDestination").value.trim(),
      tag: document.getElementById("intlTag").value.trim(),
      cat: document.getElementById("intlCat").value,
      hotelCategory: document.getElementById("intlHotel").value.trim(),
      price: document.getElementById("intlPrice").value,
      discountPrice: document.getElementById("intlDiscount").value,
      desc: document.getElementById("intlDesc").value.trim(),
      dayWise: parseDayWise(document.getElementById("intlDayWise").value),
      inclusions: parseList(document.getElementById("intlInclusions").value),
      exclusions: parseList(document.getElementById("intlExclusions").value),
    };
    if(!body.name || !body.loc){ msgEl.textContent = "Name and route are required."; return; }
    try{
      await apiPost("/api/packages/international", body);
      msgEl.style.color = "var(--teal)";
      msgEl.textContent = "Package added.";
      refreshAdminList();
      loadIntlPackagesFromBackend();
    }catch(err){
      msgEl.style.color = "";
      msgEl.textContent = err.message;
    }
  });
})();

/* ================================================================
   DESTINATION WEDDING  (new feature — reads/writes /api/wedding)
   Purely additive; doesn't touch anything above.
================================================================ */
const weddingVenueStore = {}; // id -> venue

/* Tier badge (e.g. "5★ LUXURY") derived from the existing hotelCategory
   field — no extra backend field needed just for this label. */
function weddingBadgeHTML(v){
  const cat = (v.hotelCategory || "").toLowerCase();
  let stars = 3;
  if(cat.includes("5")) stars = 5;
  else if(cat.includes("4")) stars = 4;
  const tier = stars >= 5 ? "LUXURY" : stars === 4 ? "PREMIUM" : "COMFORT";
  return `${stars}★ ${tier}`;
}
function weddingStarsHTML(rating){
  const r = Math.round(Number(rating) || 0);
  return "★".repeat(Math.max(0, Math.min(5, r))) + "☆".repeat(5 - Math.max(0, Math.min(5, r)));
}

function weddingCardHTML(v, idx){
  const img = v.imageUrl
    ? `<img class="card-photo" src="${v.imageUrl}" alt="${v.name}" loading="lazy">`
    : photoImgHTML(`${v.name}, ${v.destination}, luxury wedding resort, fairy lights, floral mandap`, v.name);
  // Facility details (additive) — old/legacy venue records may not have
  // these fields, so each row only renders when the value is present.
  const facilityRows = [
    v.guestRange ? `<div class="wc-fact"><span>👥</span> Capacity: ${v.guestRange}</div>` : "",
    v.startingPriceLabel || v.startingPrice ? `<div class="wc-fact"><span>₹</span> Approx. cost: ${v.startingPriceLabel || money(v.startingPrice || 0)}</div>` : "",
    v.lawnArea ? `<div class="wc-fact"><span>🌳</span> Lawn: ${v.lawnArea}</div>` : "",
  ].filter(Boolean).join("");
  return `
  <div class="wedding-card" data-wedding-id="${v.id}">
    <div class="wc-media">${img}<span class="wc-tag">${weddingBadgeHTML(v)}</span></div>
    <div class="wc-body">
      <h3>${v.name}</h3>
      <div class="wc-dest">📍 ${v.destination}</div>
      ${v.rating ? `<div class="wc-rating"><span class="wc-stars">${weddingStarsHTML(v.rating)}</span> ${Number(v.rating).toFixed(1)} (${v.reviewCount || 0} Reviews)</div>` : ""}
      ${facilityRows ? `<div class="wc-facts">${facilityRows}</div>` : ""}
      <div class="wc-meta">
        <button class="pkg-book" data-enquire-venue="${v.id}">View Details →</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Hero venue slider: auto-rotating hotel highlights ----------
   Purely additive on top of the existing hero photo/gradient (set up by
   setupWeddingHero below). Once venues load, this cycles the hero photo
   + a small info card through each venue's name/destination/rating/
   price. If venues haven't loaded yet, or there are none, the slider
   just stays hidden and the plain hero photo/gradient still works
   exactly as before — nothing else about the hero changes. */
let wedHeroSliderTimer = null;
function weddingHeroSlideMetaHTML(v){
  const bits = [];
  if(v.guestRange) bits.push(`👥 ${v.guestRange}`);
  if(v.startingPriceLabel || v.startingPrice) bits.push(`₹ ${v.startingPriceLabel || money(v.startingPrice || 0)}`);
  if(v.rating) bits.push(`★ ${Number(v.rating).toFixed(1)}`);
  return bits.map(b => `<span>${b}</span>`).join("");
}
function showWeddingHeroSlide(slides, i){
  const v = slides[i];
  if(!v) return;
  const hero = document.getElementById("wedHero");
  const bgUrl = v.imageUrl || photoUrl(`${v.name}, ${v.destination}, luxury wedding resort, fairy lights, floral mandap`, 1600, 900);
  if(hero) hero.style.backgroundImage = `linear-gradient(120deg, rgba(15,30,20,0.82), rgba(15,30,20,0.55) 55%, rgba(15,30,20,0.85)), url('${bgUrl.replace(/'/g, "%27")}')`;
  const imgEl = document.getElementById("wedHeroSlideImg");
  if(imgEl){
    const thumbUrl = v.imageUrl || photoUrl(`${v.name}, ${v.destination}, luxury wedding resort`, 200, 200);
    imgEl.style.backgroundImage = `url('${thumbUrl.replace(/'/g, "%27")}')`;
  }
  const setText = (id, text) => { const el = document.getElementById(id); if(el) el.textContent = text; };
  setText("wedHeroSlideTag", weddingBadgeHTML(v));
  setText("wedHeroSlideName", v.name);
  setText("wedHeroSlideDest", `📍 ${v.destination}`);
  const metaEl = document.getElementById("wedHeroSlideMeta");
  if(metaEl) metaEl.innerHTML = weddingHeroSlideMetaHTML(v);
  document.querySelectorAll("#wedHeroDots .wed-hero-dot").forEach((d, di) => d.classList.toggle("active", di === i));
}
function startWeddingHeroSlider(venues){
  const wrap = document.getElementById("wedHeroSlider");
  const dotsWrap = document.getElementById("wedHeroDots");
  if(!wrap || !dotsWrap) return;
  const slides = (venues || []).slice(0, 6);
  if(wedHeroSliderTimer){ clearInterval(wedHeroSliderTimer); wedHeroSliderTimer = null; }
  if(!slides.length){ wrap.hidden = true; return; }
  wrap.hidden = false;
  dotsWrap.innerHTML = slides.map((_, i) => `<button type="button" class="wed-hero-dot" data-slide="${i}" aria-label="Show venue ${i + 1}"></button>`).join("");
  let current = 0;
  showWeddingHeroSlide(slides, current);
  function goTo(i){
    current = ((i % slides.length) + slides.length) % slides.length;
    showWeddingHeroSlide(slides, current);
  }
  function restartTimer(){
    if(wedHeroSliderTimer) clearInterval(wedHeroSliderTimer);
    wedHeroSliderTimer = setInterval(() => goTo(current + 1), 4500);
  }
  dotsWrap.querySelectorAll("[data-slide]").forEach(btn => {
    btn.addEventListener("click", () => { goTo(Number(btn.dataset.slide)); restartTimer(); });
  });
  restartTimer();
}

async function loadWeddingVenues(){
  const grid = document.getElementById("weddingGrid");
  if(!grid) return;
  try{
    const data = await apiGet("/api/wedding/venues");
    const venues = data.venues || [];
    venues.forEach(v => weddingVenueStore[v.id] = v);
    grid.innerHTML = venues.map(weddingCardHTML).join("") || "<p>Venues coming soon.</p>";
    startWeddingHeroSlider(venues);

    const sel = document.getElementById("wVenue");
    if(sel){
      const extra = venues.map(v => `<option value="${v.id}">${v.name} — ${v.destination}</option>`).join("");
      sel.innerHTML = `<option value="">No preference / suggest options</option>${extra}`;
    }
  }catch(err){
    grid.innerHTML = "<p class=\"field-error\">Could not load venues right now.</p>";
  }
}
document.querySelectorAll('[data-tab="wedding"]').forEach(el=>{
  el.addEventListener("click", ()=>{ loadWeddingVenues(); });
});
if (location.hash.slice(1) === "wedding") loadWeddingVenues();

/* ---------- Hero: background photo + WhatsApp link + Explore button ----------
   Uses the same photo helper every other card already uses, so no new
   image asset is needed and nothing breaks if the photo host is slow
   (CSS gradient underneath always shows first). */
(function setupWeddingHero(){
  const hero = document.getElementById("wedHero");
  if(hero){
    const url = photoUrl("luxury destination wedding, floral mandap, fairy lights, forest resort lawn at dusk", 1600, 900);
    hero.style.backgroundImage = `linear-gradient(120deg, rgba(15,30,20,0.82), rgba(15,30,20,0.55) 55%, rgba(15,30,20,0.85)), url('${url}')`;
  }
  const waBtn = document.getElementById("wedWhatsappBtn");
  if(waBtn){
    const text = encodeURIComponent("Hi, I'm interested in planning a destination wedding with AdmireDworld Travel. Please share more details.");
    waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
  }
  document.getElementById("wedExploreBtn")?.addEventListener("click", ()=>{
    document.getElementById("weddingVenuesAnchor")?.scrollIntoView({ behavior:"smooth", block:"start" });
  });
})();

document.getElementById("weddingGrid")?.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-enquire-venue]");
  if(!btn) return;
  const sel = document.getElementById("wVenue");
  if(sel) sel.value = btn.dataset.enquireVenue;
  document.getElementById("weddingForm")?.scrollIntoView({ behavior:"smooth", block:"start" });
});

/* ---------- Quick "Get Quote for Wedding" sidebar form ----------
   Purely a fast capture UI: it prefills the same fields into the full
   enquiry form below (#weddingForm) and scrolls to it, so there's still
   only one enquiry submission path / one backend contract to keep in
   sync (POST /api/wedding/enquiry via the full form's own handler). */
document.getElementById("weddingQuickForm")?.addEventListener("submit", (e)=>{
  e.preventDefault();
  const name = document.getElementById("wqName").value.trim();
  const date = document.getElementById("wqDate").value;
  const guests = document.getElementById("wqGuests").value;
  const phone = document.getElementById("wqPhone").value.trim();

  if(name) document.getElementById("wName").value = name;
  if(date) document.getElementById("wMonth").value = date;
  if(phone) document.getElementById("wPhone").value = phone;
  if(guests){
    const n = parseInt(guests, 10);
    const guestSel = document.getElementById("wGuests");
    if(guestSel && n){
      if(n < 50) guestSel.value = "Under 50";
      else if(n < 150) guestSel.value = "50 – 150";
      else if(n < 300) guestSel.value = "150 – 300";
      else guestSel.value = "300+";
    }
  }

  document.getElementById("weddingForm")?.scrollIntoView({ behavior:"smooth", block:"start" });
  showToast("Details captured! Just add the couple's names, email and any other info to send your enquiry.", 6000);
  document.getElementById("wCoupleNames")?.focus();
});

document.getElementById("weddingForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msgEl = document.getElementById("weddingFormMsg");
  msgEl.textContent = "";

  // Convenience: prefill from a logged-in session if the person hasn't typed their own details yet.
  const nameEl = document.getElementById("wName");
  const phoneEl = document.getElementById("wPhone");
  const emailEl = document.getElementById("wEmail");
  if(state.user){
    if(!nameEl.value.trim()) nameEl.value = state.user.name;
    if(!phoneEl.value.trim()) phoneEl.value = state.user.phone;
    if(!emailEl.value.trim()) emailEl.value = state.user.email;
  }

  const venueId = document.getElementById("wVenue").value;
  const venue = weddingVenueStore[venueId];
  const functionTypes = Array.from(
    document.querySelectorAll('#wFunctionTypes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  const body = {
    coupleNames: document.getElementById("wCoupleNames").value.trim(),
    venueId: venueId || null,
    venueName: venue ? venue.name : null,
    hotelName: document.getElementById("wHotelName").value.trim(),
    functionTypes,
    weddingMonth: document.getElementById("wMonth").value,
    guestCount: document.getElementById("wGuests").value,
    budget: document.getElementById("wBudget").value,
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    email: emailEl.value.trim(),
    notes: document.getElementById("wNotes").value.trim(),
  };

  if(!body.coupleNames || !body.name || !/^[0-9]{10}$/.test(body.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)){
    msgEl.textContent = "Please fill in the couple's names and a valid contact number and email.";
    return;
  }

  try{
    await apiPost("/api/wedding/enquiry", body);
    showToast(`Thanks! Our wedding planning team will reach out to ${body.name} within 24 hours.`, 6000);
    e.target.reset();
    if(typeof gtag === "function"){
      gtag("event", "wedding_enquiry", {
        venue_name: body.venueName || "unspecified",
        wedding_month: body.weddingMonth || "",
        guest_count: body.guestCount || "",
        function_types: body.functionTypes.join(",") || "unspecified",
      });
    }
  }catch(err){
    msgEl.textContent = err.message;
  }
});

/* ================================================================
   REFER & EARN  (new feature — reads/writes /api/refer)
   Purely additive; doesn't touch anything above. Hooks into the
   existing login flow the same way applyPackageImages hooked into
   renderAll: by wrapping the existing apiPost function rather than
   editing the OTP handlers directly.
================================================================ */
const REF_STORAGE_KEY = "adw_pending_ref_code"; // one-time: consumed by /api/refer/apply right after OTP verify (signup welcome bonus)

// UPDATED (referral flow):
// -------------------------------------------------------------
// - A referral link no longer jumps straight to the "Refer & Earn" tab.
//   It used to end in "#refer", and the site's generic hash router
//   (`if (location.hash.slice(1)) showTab(...)`) opened that tab
//   automatically on load. The link below is now just the plain
//   homepage URL (+ optional package), so a referred visitor lands on
//   normal packages like anyone else.
// - A referral link can optionally carry a package ("&pkg=ID&type=TYPE").
//   That package is captured here and auto-opened (see
//   tryOpenReferralInitialPackage below) so it's the one initially shown
//   — but the visitor can still browse and pick any other package.
// - REFERRAL_ATTR_* keys are separate from REF_STORAGE_KEY above and are
//   NOT cleared after OTP verification — they persist across login so an
//   enquiry/lead submitted anytime later (before or after login) still
//   carries the original referral code + initial package. REF_STORAGE_KEY
//   keeps its existing one-time behaviour untouched (signup welcome bonus).
const REFERRAL_ATTR_CODE_KEY = "adw_referral_code";
const REFERRAL_ATTR_PKG_ID_KEY = "adw_referral_initial_pkg_id";
const REFERRAL_ATTR_PKG_TYPE_KEY = "adw_referral_initial_pkg_type";
const REFERRAL_ATTR_PKG_NAME_KEY = "adw_referral_initial_pkg_name";

(function captureReferralFromUrl(){
  const params = new URLSearchParams(location.search);
  const ref = params.get("ref");
  if(!ref) return;
  const cleanRef = ref.trim().toUpperCase();
  localStorage.setItem(REF_STORAGE_KEY, cleanRef);
  localStorage.setItem(REFERRAL_ATTR_CODE_KEY, cleanRef);

  const pkgId = (params.get("pkg") || "").trim();
  const pkgType = (params.get("type") || "").trim();
  if(pkgId && (pkgType === "india" || pkgType === "international")){
    localStorage.setItem(REFERRAL_ATTR_PKG_ID_KEY, pkgId);
    localStorage.setItem(REFERRAL_ATTR_PKG_TYPE_KEY, pkgType);
  }
})();

// Builds a referrer's shareable link. `pkg`, if given, is { id, type } —
// attaches an "initially shown" package to the link without forcing it:
// whoever opens the link can still browse and pick a different package.
function referralLinkFor(code, pkg){
  const base = `${location.origin}${location.pathname}?ref=${code}`;
  if(pkg && pkg.id && pkg.type){
    return `${base}&pkg=${encodeURIComponent(pkg.id)}&type=${encodeURIComponent(pkg.type)}`;
  }
  return base;
}

// Reads whatever referral attribution this browser currently has (persists
// across login/OTP — see REFERRAL_ATTR_* keys above). Used to tag any
// enquiry/lead the customer submits with Referral Code / Initial Package,
// so attribution is never lost just because they logged in first.
function getReferralAttribution(){
  const code = localStorage.getItem(REFERRAL_ATTR_CODE_KEY) || "";
  if(!code) return { code: "", initialPkgId: "", initialPkgType: "", initialPkgName: "" };
  const initialPkgId = localStorage.getItem(REFERRAL_ATTR_PKG_ID_KEY) || "";
  const initialPkgType = localStorage.getItem(REFERRAL_ATTR_PKG_TYPE_KEY) || "";
  let initialPkgName = localStorage.getItem(REFERRAL_ATTR_PKG_NAME_KEY) || "";
  if(initialPkgId && pkgDetailStore[initialPkgId] && pkgDetailStore[initialPkgId].name){
    initialPkgName = pkgDetailStore[initialPkgId].name;
  }
  return { code, initialPkgId, initialPkgType, initialPkgName };
}

// If the referral link that brought this visitor here included a package
// (?pkg=ID&type=TYPE), open that package's detail page once it's available
// — shown initially, but the visitor remains free to close it and browse/
// pick any other package normally. Called once per package list load
// (mirrors tryOpenPkgFromCurrentUrl's existing pattern), guarded so it only
// ever auto-opens once per page load.
let referralInitialPkgOpened = false;
async function tryOpenReferralInitialPackage(expectedType){
  if(referralInitialPkgOpened || currentPkgDetail) return;
  const params = new URLSearchParams(location.search);
  const pkgId = (params.get("pkg") || "").trim();
  const pkgType = (params.get("type") || "").trim();
  if(!pkgId || pkgType !== expectedType) return;
  referralInitialPkgOpened = true;
  await openPkgDetail(pkgId, pkgType === "india" ? "india" : "international");
  if(currentPkgDetail && currentPkgDetail.pkg && currentPkgDetail.pkg.name){
    localStorage.setItem(REFERRAL_ATTR_PKG_NAME_KEY, currentPkgDetail.pkg.name);
  }
}

function referEarningRowHTML(e){
  return `
  <div class="my-booking-card">
    <div class="my-booking-info">
      <h4>${e.itemName || "Referred booking"}</h4>
      <div class="my-booking-grid">
        <div><span>Booking ID</span><strong>${e.bookingId}</strong></div>
        <div><span>Destination</span><strong>${e.destination || e.itemName || "-"}</strong></div>
        <div><span>Business Amount</span><strong>${money(e.amount)}</strong></div>
        <div><span>Your Commission</span><strong>${e.commissionPercent}% · ${money(e.rewardAmount)}</strong></div>
      </div>
      <p>Credited on ${new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
    </div>
  </div>`;
}

// One enquiry/lead that came in through this referral partner's link —
// shows the package the link initially pointed to vs. what the customer
// actually enquired about, and whether admin has verified it yet.
function referLeadRowHTML(l){
  return `
  <div class="my-booking-card">
    <div class="my-booking-info">
      <h4>${escapeHtml(l.name || "Enquiry")}</h4>
      <div class="my-booking-grid">
        <div><span>Contact</span><strong>${escapeHtml(l.phone || l.email || "-")}</strong></div>
        <div><span>Initial Package</span><strong>${escapeHtml(l.initialPackage || "General enquiry")}</strong></div>
        <div><span>Final Package</span><strong>${escapeHtml(l.finalPackage || "-")}</strong></div>
        <div><span>Status</span><strong>${l.referralVerified ? "Verified by admin ✅" : "Pending admin verification"}</strong></div>
      </div>
      <p>Enquired on ${new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
    </div>
  </div>`;
}

// Referral partner access (code/link/commission %/earnings) is fully
// admin-controlled now — opening this tab no longer creates any request
// by itself. A visitor must fill out the application form (name, social
// profile, followers, content category, audience location, phone, and
// why they want to promote us); only THEN does a "pending" request get
// created. The affiliate link is generated only once an admin approves
// it from the dashboard (Pending -> Approved -> Affiliate Active).
const REFER_ANON_EMAIL_KEY = "adw_referapp_email";

async function loadReferUI(){
  const loggedOutBox = document.getElementById("referLoggedOut");
  const loggedInBox = document.getElementById("referLoggedIn");
  const earningsBox = document.getElementById("referEarningsBox");
  const applyBox = document.getElementById("referApplyBox");
  const pendingNote = document.getElementById("referPendingNote");
  const revokedNote = document.getElementById("referRevokedNote");
  const approvedBox = document.getElementById("referApprovedBox");
  const approvedAnonNote = document.getElementById("referApprovedAnonNote");
  if(!loggedOutBox || !loggedInBox) return;

  // The application form itself no longer requires logging in first —
  // it's shown directly so any visitor can fill it out. Logging in is
  // only needed afterwards, to view the live referral link/earnings
  // once an admin has approved the application.
  loggedInBox.style.display = "block";
  loggedOutBox.style.display = state.user && state.token ? "none" : "block";

  function showStatus(which){
    applyBox.style.display = which === "apply" ? "block" : "none";
    pendingNote.style.display = which === "pending" ? "block" : "none";
    revokedNote.style.display = which === "revoked" ? "block" : "none";
    approvedBox.style.display = which === "approved" ? "block" : "none";
    if(approvedAnonNote) approvedAnonNote.style.display = which === "approved-anon" ? "block" : "none";
    if(earningsBox) earningsBox.style.display = which === "approved" ? "block" : "none";
    const referLeadsBoxEl = document.getElementById("referLeadsBox");
    if(referLeadsBoxEl && which !== "approved") referLeadsBoxEl.style.display = "none";
  }

  // Not logged in: check status by email (public, no login needed) —
  // only if this browser has already submitted an application before.
  // Otherwise just show the empty application form.
  if(!state.user || !state.token){
    const savedEmail = localStorage.getItem(REFER_ANON_EMAIL_KEY);
    if(!savedEmail){
      showStatus("apply");
      return;
    }
    try{
      const data = await apiPost("/api/refer/my-code", { email: savedEmail });
      if(data.approved) showStatus("approved-anon");
      else if(data.status === "revoked") showStatus("revoked");
      else showStatus("pending");
    }catch{
      showStatus("apply");
    }
    return;
  }

  try{
    // Just reads current status — does NOT create or touch any request.
    const res = await fetch(`${API_BASE_URL}/api/refer/my-earnings`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || "Could not load your referral status.");

    if(!data.requested){
      // Never applied yet -> show the application form. Prefill name/email from account.
      showStatus("apply");
      const nameField = document.getElementById("raName");
      if(nameField && !nameField.value) nameField.value = state.user.name || "";
      const emailField = document.getElementById("raEmail");
      if(emailField && !emailField.value) emailField.value = state.user.email || "";
      return;
    }

    if(data.approved){
      showStatus("approved");

      document.getElementById("referCodeText").textContent = data.code;
      document.getElementById("referCountStat").textContent = data.referredCount;
      document.getElementById("referEarnedStat").textContent = money(data.rewardEarned);
      document.getElementById("referCommissionStat").textContent = `${data.commissionPercent}%`;

      // Optional: attach a specific package to the shared link so whoever
      // opens it initially sees that package (they can still pick any
      // other one). Purely a link-generation convenience — populated from
      // the same package lists already loaded on the page.
      const pkgSelect = document.getElementById("referPkgSelect");
      if(pkgSelect && !pkgSelect.dataset.filled){
        const options = ['<option value="">General link (no package selected)</option>']
          .concat(indiaPackages.map(p => `<option value="india::${p.id}">${escapeHtml(p.name)} (India)</option>`))
          .concat(intlPackages.map(p => `<option value="international::${p.id}">${escapeHtml(p.name)} (International)</option>`));
        pkgSelect.innerHTML = options.join("");
        pkgSelect.dataset.filled = "1";
      }

      const copyBtn = document.getElementById("referCopyBtn");
      function refreshReferLink(){
        let pkgArg = null;
        if(pkgSelect && pkgSelect.value){
          const [type, id] = pkgSelect.value.split("::");
          pkgArg = { type, id };
        }
        const link = referralLinkFor(data.code, pkgArg);
        const waText = encodeURIComponent(`Book your next trip on AdmireDworld Travel — use my referral link and we both get travel credit: ${link}`);
        document.getElementById("referWhatsapp").href = `https://wa.me/?text=${waText}`;
        copyBtn.onclick = async ()=>{
          try{
            await navigator.clipboard.writeText(link);
            showToast("Referral link copied!");
          }catch{
            showToast(link, 8000);
          }
        };
      }
      if(pkgSelect) pkgSelect.onchange = refreshReferLink;
      refreshReferLink();

      if(earningsBox){
        const listEl = document.getElementById("referEarningsList");
        const emptyEl = document.getElementById("referEarningsEmpty");
        const earnings = data.earnings || [];
        listEl.innerHTML = earnings.map(referEarningRowHTML).join("");
        emptyEl.style.display = earnings.length ? "none" : "block";
      }

      // Every enquiry/lead captured through this partner's referral link,
      // regardless of whether it has turned into a confirmed booking yet —
      // shows up here automatically as soon as the customer submits it.
      // "Verified" reflects the admin's sign-off (see admin dashboard).
      const referLeadsBox = document.getElementById("referLeadsBox");
      if(referLeadsBox){
        try{
          const leadsRes = await fetch(`${API_BASE_URL}/api/leads/mine`, {
            headers: { Authorization: `Bearer ${state.token}` },
          });
          const leadsData = await leadsRes.json().catch(()=>({}));
          if(leadsRes.ok){
            const rows = leadsData.leads || [];
            const listEl = document.getElementById("referLeadsList");
            const emptyEl = document.getElementById("referLeadsEmpty");
            if(listEl) listEl.innerHTML = rows.map(referLeadRowHTML).join("");
            if(emptyEl) emptyEl.style.display = rows.length ? "none" : "block";
            referLeadsBox.style.display = "block";
          }
        }catch{ /* best-effort — don't block the rest of the tab if this fails */ }
      }
    } else if(data.status === "revoked"){
      showStatus("revoked");
    } else {
      showStatus("pending");
    }
  }catch(err){
    showStatus("apply");
    showToast(err.message, 5000);
  }
}
document.querySelectorAll('[data-tab="refer"]').forEach(el=>{
  el.addEventListener("click", ()=>{ loadReferUI(); });
});
if (location.hash.slice(1) === "refer") loadReferUI();

document.getElementById("referLoginBtn")?.addEventListener("click", ()=>{
  resetLoginModal();
  openOverlay(loginOverlay);
});
document.getElementById("referApprovedAnonLoginBtn")?.addEventListener("click", ()=>{
  resetLoginModal();
  openOverlay(loginOverlay);
});

// Submitting the application form: creates a "pending" request only.
// The affiliate link is NOT generated here — only once an admin approves
// it from the Admin Dashboard.
document.getElementById("referApplyForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  // Works whether or not the visitor is logged in: logged-in users' email
  // comes from their account (field is prefilled); a not-logged-in visitor
  // types their own email into the form — the backend endpoint has always
  // accepted this without requiring a login token.
  const emailFieldVal = document.getElementById("raEmail")?.value.trim();
  const email = (state.user && state.token) ? state.user.email : emailFieldVal;
  const payload = {
    email,
    name: document.getElementById("raName").value.trim(),
    phone: document.getElementById("raPhone").value.trim(),
    socialProfile: document.getElementById("raSocial").value.trim(),
    followers: document.getElementById("raFollowers").value.trim(),
    contentCategory: document.getElementById("raCategory").value.trim(),
    audienceLocation: document.getElementById("raLocation").value.trim(),
    reason: document.getElementById("raReason").value.trim(),
  };
  if(!email){
    showToast("Please enter your email.");
    return;
  }
  if(!payload.name || !payload.socialProfile || !payload.reason){
    showToast("Please fill in your name, Instagram/YouTube profile, and why you want to promote us.");
    return;
  }
  try{
    await apiPost("/api/refer/apply-partner", payload);
    if(!(state.user && state.token)){
      localStorage.setItem(REFER_ANON_EMAIL_KEY, email);
    }
    showToast("Application submitted! Our team will review it shortly.", 6000);
    loadReferUI();
  }catch(err){
    showToast(err.message);
  }
});

// "Apply again" after a revoke — just re-opens the same form.
document.getElementById("referReapplyBtn")?.addEventListener("click", ()=>{
  document.getElementById("referApplyBox").style.display = "block";
  document.getElementById("referRevokedNote").style.display = "none";
  const emailField = document.getElementById("raEmail");
  if(emailField && !(state.user && state.token)){
    emailField.value = localStorage.getItem(REFER_ANON_EMAIL_KEY) || "";
  }
});

// Apply a stored referral code once, right after a successful OTP verification.
async function applyPendingReferral(user){
  const code = localStorage.getItem(REF_STORAGE_KEY);
  if(!code || !user) return;
  try{
    const data = await apiPost("/api/refer/apply", { code, refereeEmail: user.email, refereeName: user.name });
    localStorage.removeItem(REF_STORAGE_KEY);
    showToast(`Welcome bonus applied! You've got ₹${data.welcomeBonus} travel credit.`, 6000);
  }catch{
    // Own code, already redeemed, or invalid — clear it quietly so we don't retry forever.
    localStorage.removeItem(REF_STORAGE_KEY);
  }
}

/* ---------- UNIVERSAL REFER & EARN (all package types) ----------
   Referral rewards are paid only when a BOOKING record is confirmed by an
   admin (see /api/bookings/admin/confirm -> creditReferralForBooking). Fixed
   Departures and the card-level "Book now" already create that booking
   record. But the "Book Now" button on a Website (India / International)
   package's detail page only files an enquiry (lead) — it never created a
   booking record, so a referrer earned nothing on those packages.
   Fix (additive — original enquiry form/flow untouched): when a LOGGED-IN
   customer successfully submits that enquiry, we also save a booking record
   for the same package so the referral benefit works exactly like it does
   on Fixed Departures. No package-type check anywhere. */
const REFER_ENQ_BOOKED_KEY = "adw_ref_enq_booked"; // guards against double-crediting repeat enquiries
function referEnquiryBookedBefore(email, pkgId){
  try{
    const list = JSON.parse(localStorage.getItem(REFER_ENQ_BOOKED_KEY) || "[]");
    return list.includes(`${email}::${pkgId}`);
  }catch{ return false; }
}
function referMarkEnquiryBooked(email, pkgId){
  try{
    const list = JSON.parse(localStorage.getItem(REFER_ENQ_BOOKED_KEY) || "[]");
    list.push(`${email}::${pkgId}`);
    localStorage.setItem(REFER_ENQ_BOOKED_KEY, JSON.stringify(list.slice(-200)));
  }catch{ /* storage unavailable — fine, backend still de-dupes per booking id */ }
}
async function recordBookingForPackageEnquiry(leadBody){
  try{
    if(!leadBody || leadBody.source !== "package_enquiry") return;
    if(typeof state === "undefined" || !state.user || !state.user.email) return; // referral needs an account
    const pkg = currentPkgDetail && currentPkgDetail.pkg;
    if(!pkg || pkg.name !== leadBody.finalPackage) return;
    const email = String(state.user.email).trim().toLowerCase();
    if(referEnquiryBookedBefore(email, pkg.id)) return;
    const unitPrice = Number(pkg.discountPrice || pkg.price) || 0;
    await apiPost("/api/bookings", {
      itemId: pkg.id,
      itemName: pkg.name,
      destination: pkg.destination || pkg.loc || "",
      isFixed: false,
      amount: unitPrice, // per-person starting price × 1 traveller (enquiry form has no traveller count)
      travellers: 1,
      user: { name: state.user.name, phone: state.user.phone, email: state.user.email },
    });
    referMarkEnquiryBooked(email, pkg.id);
    if(typeof loadMyBookings === "function") loadMyBookings();
  }catch(err){
    console.error("refer: could not record booking for package enquiry:", err);
  }
}

const _origApiPost = apiPost;
apiPost = async function(path, body){
  // Auto-tag any lead/enquiry with this browser's referral attribution
  // (if any) — Referral Code + Initial Package — without every call site
  // having to know about it. Never overrides a value the caller already
  // set explicitly.
  let outBody = body;
  if(path === "/api/leads" && body){
    const attribution = getReferralAttribution();
    if(attribution.code){
      outBody = {
        ...body,
        referralCode: body.referralCode || attribution.code,
        initialPackage: body.initialPackage || attribution.initialPkgName || "",
      };
    }
  }
  const data = await _origApiPost(path, outBody);
  if(path === "/api/leads" && body && body.source === "package_enquiry"){
    recordBookingForPackageEnquiry(body); // fire-and-forget; never blocks/breaks the enquiry
  }
  if(path === "/api/verify-otp" && data && data.user){
    applyPendingReferral(data.user);
    loadReferUI();
  }
  return data;
};

/* ================================================================
   BOOKINGS -> REFERRAL REWARD TRIGGER  (new feature — /api/bookings)
   Purely additive: wraps the existing openBooking() the same way
   INDIA PACKAGES wrapped renderAll() and REFER & EARN wrapped
   apiPost() above — the original booking UI/behaviour (the toast,
   etc.) is untouched; this just also saves the booking to the
   backend so an admin can later confirm it and trigger a referral
   reward + email.
================================================================ */
const _origOpenBooking = openBooking;
openBooking = function(id, isFixed){
  _origOpenBooking(id, isFixed);

  const item = isFixed ? fixedDepartures.find(f=>f.id===id) : allPackages.find(p=>p.id===id);
  const travellersSel = document.getElementById("bkTravellers");
  const confirmBtn = document.getElementById("confirmBookBtn");
  if(!item || !travellersSel || !confirmBtn || !state.user) return;

  confirmBtn.addEventListener("click", ()=>{
    const val = travellersSel.value === "5+" ? 5 : parseInt(travellersSel.value, 10);
    const amount = item.price * val;
    const travelDate = isFixed
      ? (fdSelectedForBooking && fdSelectedForBooking.id === id ? fdSelectedForBooking.date : item.date)
      : undefined;
    apiPost("/api/bookings", {
      itemId: id,
      itemName: item.name,
      destination: item.destination || item.loc || "",
      isFixed: !!isFixed,
      travelDate,
      amount,
      travellers: val,
      tripDuration: item.days || item.duration || "",
      user: { name: state.user.name, phone: state.user.phone, email: state.user.email },
    }).then(()=>{
      loadMyBookings(); // refresh "My Bookings" if it's already loaded
      if(isFixed) loadFixedDeparturesFromBackend(); // reflect the seat that was just taken
      // GA4 conversion event — lets Analytics show how many booking requests
      // actually come in, not just pageviews. Booking still shows as
      // requested to the customer even if this fails (see catch below).
      if(typeof gtag === "function"){
        gtag("event", "booking_request", {
          item_id: id,
          item_name: item.name,
          is_fixed_departure: !!isFixed,
          value: amount,
          currency: "INR",
          travellers: val,
        });
      }
    }).catch(()=>{ /* booking still shows as requested to the customer either way */ });
  });
};

/* ================================================================
   MY BOOKINGS (customer-facing)  (new feature — reads /api/bookings/mine)
   Purely additive; doesn't touch anything above. Shows the SAME
   booking history no matter which device/browser you log in from,
   because it's fetched fresh from the backend (keyed to your account
   via the login token) every time this tab opens — nothing here is
   read from localStorage.
================================================================ */
function myBookingRowHTML(b){
  const statusClass = b.status === "confirmed" ? "confirmed" : "pending";
  const rewardLine = b.referralReward
    ? `<div class="my-booking-reward">Your referrer earned ${money(b.referralReward.rewardAmount)} thanks to this booking.</div>`
    : "";
  const travelDateLabel = b.travelDate
    ? new Date(b.travelDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "To be confirmed";
  // Voucher can only be issued once the team has confirmed the booking (payment verified).
  const voucherBtn = b.status === "confirmed"
    ? `<button class="btn-voucher" data-download-voucher="${b.id}">Download voucher</button>`
    : `<span class="voucher-pending-note">Voucher available after confirmation</span>`;
  return `
  <div class="my-booking-card">
    <div class="my-booking-info">
      <h4>${b.itemName}</h4>
      <div class="my-booking-grid">
        <div><span>Lead Pax Name</span><strong>${b.user?.name || "-"}</strong></div>
        <div><span>Destination</span><strong>${b.destination || b.itemName}</strong></div>
        <div><span>Travel Date</span><strong>${travelDateLabel}</strong></div>
        <div><span>Booking Status</span><strong class="ba-status ${statusClass}">${b.status}</strong></div>
        <div><span>Total Amount</span><strong>${money(b.amount)}</strong></div>
        <div><span>Booking ID</span><strong>${b.id}</strong></div>
      </div>
      <p>${b.travellers} traveller(s) · Booked on ${new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
      ${rewardLine}
    </div>
    <div class="my-booking-actions">
      ${voucherBtn}
    </div>
  </div>`;
}

/* ---------- My Bookings upgrade: payment summary + custom voucher (additive) ----------
   Wraps myBookingRowHTML() (original untouched) so every booking — ONLINE or
   OFFLINE — keeps its existing card, and bookings that track payments (offline
   bookings added by the admin) also get a Payment Summary card. Offline and
   online bookings arrive in the same /api/bookings/mine list, so both show up
   after a normal email-OTP login. */
const _origMyBookingRowHTML = myBookingRowHTML;
myBookingRowHTML = function(b){
  let html = _origMyBookingRowHTML(b);

  // Admin-uploaded custom voucher can be downloaded even before confirmation.
  if(b.voucherType === "CUSTOM" && b.status !== "confirmed"){
    html = html.replace(/<span class="voucher-pending-note">[^<]*<\/span>/,
      `<button class="btn-voucher" data-download-voucher="${b.id}">Download voucher</button>`);
  }

  const src = b.bookingSource === "OFFLINE" ? "Offline booking" : "Online booking";
  let extra = `<div class="mb-source-tag">${src}</div>`;

  // Trip details: No. of Pax + Trip Duration (Destination / Travel Date are already in the card above).
  extra += `
    <div class="my-booking-grid mb-trip-grid">
      <div><span>No. of Pax</span><strong>${b.travellers || 1}</strong></div>
      <div><span>Trip Duration</span><strong>${b.tripDuration ? String(b.tripDuration).replace(/</g,"&lt;") : "To be confirmed"}</strong></div>
    </div>`;

  if(b.payment){
    const p = b.payment;
    const cls = p.status === "PAID" ? "paid" : p.status === "PARTIAL" ? "partial" : "pending";
    let dueHTML = "";
    if(p.balance > 0){
      const dueTxt = b.balanceDueDate
        ? new Date(b.balanceDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "To be confirmed";
      const overdue = b.balanceDueDate && new Date(b.balanceDueDate + "T23:59:59") < new Date();
      dueHTML = `<div><span>Balance Payment Deadline</span><strong class="${overdue ? "pay-overdue" : ""}">${dueTxt}${overdue ? " (overdue)" : ""}</strong></div>`;
    }
    const waText = encodeURIComponent(`Hi, I'd like to pay the balance ${money(p.balance)} for booking ${b.id} (${b.itemName}).`);
    const payBtn = p.balance > 0
      ? `<a class="btn-pay-balance" href="https://wa.me/${WHATSAPP_NUMBER}?text=${waText}" target="_blank" rel="noopener">Pay Balance</a>`
      : "";
    extra += `
      <div class="pay-summary-card">
        <div class="pay-summary-head"><strong>Payment Summary</strong><span class="pay-status ${cls}">${p.status}</span></div>
        <div class="pay-summary-grid">
          <div><span>Total Payment</span><strong>${money(p.total)}</strong></div>
          <div><span>Advance Payment</span><strong>${money(p.advance || 0)}</strong></div>
          ${p.paid > (p.advance || 0) ? `<div><span>Total Paid</span><strong>${money(p.paid)}</strong></div>` : ""}
          <div><span>Balance Payment</span><strong>${money(p.balance)}</strong></div>
          ${dueHTML}
        </div>
        ${payBtn}
      </div>`;
  }

  const idx = html.indexOf('<div class="my-booking-actions">');
  if(idx === -1) return html;
  const infoClose = html.lastIndexOf("</div>", idx);
  return html.slice(0, infoClose) + extra + html.slice(infoClose);
};

async function loadMyBookings(){
  const loggedOutBox = document.getElementById("myBookingsLoggedOut");
  const loggedInBox = document.getElementById("myBookingsLoggedIn");
  if(!loggedOutBox || !loggedInBox) return;

  if(!state.user || !state.token){
    loggedOutBox.style.display = "block";
    loggedInBox.style.display = "none";
    return;
  }
  loggedOutBox.style.display = "none";
  loggedInBox.style.display = "block";

  const listEl = document.getElementById("myBookingsList");
  const emptyEl = document.getElementById("myBookingsEmpty");
  const msgEl = document.getElementById("myBookingsMsg");
  const customerIdBox = document.getElementById("myBookingsCustomerIdBox");
  const customerIdEl = document.getElementById("myBookingsCustomerId");
  msgEl.textContent = "";

  try{
    const res = await fetch(`${API_BASE_URL}/api/bookings/mine`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || "Could not load your bookings.");

    if(data.customerId && customerIdBox && customerIdEl){
      customerIdEl.textContent = data.customerId;
      customerIdBox.style.display = "flex";
    }

    const bookings = data.bookings || [];
    listEl.innerHTML = bookings.map(myBookingRowHTML).join("");
    emptyEl.style.display = bookings.length ? "none" : "block";
  }catch(err){
    listEl.innerHTML = "";
    emptyEl.style.display = "none";
    msgEl.textContent = err.message;
  }
}

// Download voucher: fetches the PDF with the same auth token used for /mine,
// so it only ever works for the logged-in customer's own booking.
document.getElementById("myBookingsList")?.addEventListener("click", async (e)=>{
  const btn = e.target.closest("[data-download-voucher]");
  if(!btn || !state.token) return;
  const bookingId = btn.dataset.downloadVoucher;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing...";
  try{
    const res = await fetch(`${API_BASE_URL}/api/bookings/voucher/${bookingId}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || "Could not download voucher.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AdmireDworld-Voucher-${bookingId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(err){
    document.getElementById("myBookingsMsg").textContent = err.message;
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});
document.querySelectorAll('[data-tab="mybookings"]').forEach(el=>{
  el.addEventListener("click", ()=>{ loadMyBookings(); });
});
if (location.hash.slice(1) === "mybookings") loadMyBookings();

document.getElementById("myBookingsLoginBtn")?.addEventListener("click", ()=>{
  resetLoginModal();
  openOverlay(loginOverlay);
});

// Refresh the list right after a successful login too, in case the tab is already open.
const _origApiPostForMyBookings = apiPost;
apiPost = async function(path, body){
  const data = await _origApiPostForMyBookings(path, body);
  if(path === "/api/verify-otp" && data && data.user){
    loadMyBookings();
  }
  return data;
};

/* ---------- Admin: manage bookings, confirm to trigger referral reward (only visible with ?admin=1) ---------- */
(function initBookingsAdmin(){
  const box = document.getElementById("bookingsAdminBox");
  if(!box) return;
  const params = new URLSearchParams(location.search);
  if(params.get("admin") !== "1") return;
  box.style.display = "block";

  let currentBookings = []; // kept in memory so "Download all bookings" can export exactly what's on screen

  function bookingRowHTML(b){
    const statusClass = b.status === "confirmed" ? "confirmed" : "pending";
    const rewardLine = b.referralReward
      ? `<div class="ba-reward">Referrer ${b.referralReward.referrerEmail} credited ${money(b.referralReward.rewardAmount)} (${b.referralReward.referralPercent}%)</div>`
      : "";
    return `
    <div class="booking-admin-row">
      <div class="ba-info">
        <strong>${b.itemName}</strong> · ${b.travellers} traveller(s) · ${money(b.amount)}<br>
        ${b.user.name} · ${b.user.phone} · ${b.user.email}
        ${rewardLine}
      </div>
      <span class="ba-status ${statusClass}">${b.status}</span>
      ${b.status !== "confirmed" ? `<button class="pkg-book" data-confirm-booking="${b.id}">Mark confirmed</button>` : ""}
    </div>`;
  }

  async function refreshBookings(){
    const listEl = document.getElementById("bookingsAdminList");
    const msgEl = document.getElementById("bookingsAdminMsg");
    const adminKey = document.getElementById("bookingsAdminKey").value;
    msgEl.textContent = "";
    try{
      const res = await fetch(`${API_BASE_URL}/api/bookings/admin/all?adminKey=${encodeURIComponent(adminKey)}`);
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Could not load bookings.");
      currentBookings = data.bookings || [];
      listEl.innerHTML = currentBookings.map(bookingRowHTML).join("") || "<p>No bookings yet.</p>";
    }catch(err){
      msgEl.textContent = err.message;
      listEl.innerHTML = "";
    }
  }

  document.getElementById("bookingsRefreshBtn").addEventListener("click", refreshBookings);

  // Admin: download EVERY customer's bookings as one CSV file — each
  // customer only ever sees their own bookings (My Bookings tab), this
  // export is admin-only and requires the same admin key used above.
  function csvEscape(val){
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  document.getElementById("bookingsExportBtn").addEventListener("click", async ()=>{
    const msgEl = document.getElementById("bookingsAdminMsg");
    msgEl.textContent = "";
    if(!currentBookings.length){
      await refreshBookings(); // auto-load first if the list hasn't been fetched yet
    }
    if(!currentBookings.length){
      msgEl.textContent = "No bookings to export yet.";
      return;
    }
    const headers = ["Booking ID","Item","Fixed departure","Amount","Travellers","Status","Customer name","Phone","Email","Booked at","Confirmed at","Referrer email","Referral reward"];
    const rows = currentBookings.map(b => [
      b.id, b.itemName, b.isFixed ? "Yes" : "No", b.amount, b.travellers, b.status,
      b.user?.name, b.user?.phone, b.user?.email, b.createdAt, b.confirmedAt || "",
      b.referralReward?.referrerEmail || "", b.referralReward?.rewardAmount || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admiredworld-bookings-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("bookingsAdminList").addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-confirm-booking]");
    if(!btn) return;
    const adminKey = document.getElementById("bookingsAdminKey").value;
    btn.disabled = true;
    btn.textContent = "Confirming...";
    try{
      const res = await fetch(`${API_BASE_URL}/api/bookings/admin/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, bookingId: btn.dataset.confirmBooking }),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Could not confirm booking.");
      refreshBookings();
    }catch(err){
      document.getElementById("bookingsAdminMsg").textContent = err.message;
      btn.disabled = false;
      btn.textContent = "Mark confirmed";
    }
  });
})();

/* ================================================================
   FIXED DEPARTURE — full detail page (gallery, price box, book-trip
   form, trip highlights, similar departures, itinerary/flights/hotels
   tabs, inclusions, exclusions, terms & conditions).
   NEW FEATURE — purely additive. Does not edit fixedDepartures' original
   fields, fixedRowHTML, renderAll, tryBook, or openBooking. Reuses the
   existing "Reserve seat" flow via the same data-book-fixed attribute
   the document-level click listener already handles.
================================================================ */
const fixedDetailOverlay = document.getElementById("fixedDetailOverlay");
const fixedDetailContentEl = document.getElementById("fixedDetailContent");

function fdNights(daysStr){
  const m = /\/(\d+)N/i.exec(daysStr || "");
  return m ? m[1] : "";
}

function fdGallerySeeds(f){
  return [
    `${f.name}, ${f.loc}, landmark`,
    `${f.name}, ${f.loc}, landscape`,
    `${f.name}, ${f.loc}, culture`,
    `${f.name}, ${f.loc}, sunset`,
    `${f.name}, ${f.loc}, aerial view`,
  ];
}

function fdDateOptionsOf(f){
  return (f.dateOptions && f.dateOptions.length) ? f.dateOptions : [{ d:f.d, m:f.m, date:f.date, seats:f.seats }];
}

function fdDetailHTML(f){
  const seeds = fdGallerySeeds(f);
  const nights = fdNights(f.days);
  const mainCity = (f.loc || "").split(" · ")[0];

  const gallery = `
    <div class="fd-gallery">
      <div class="fd-gallery-main">${photoImgHTML(seeds[0], f.name, 800, 520)}</div>
      <div class="fd-gallery-thumbs">
        ${photoImgHTML(seeds[1], f.name, 220, 140)}
        ${photoImgHTML(seeds[2], f.name, 220, 140)}
        ${photoImgHTML(seeds[3], f.name, 220, 140)}
        <div class="fd-gallery-viewall">
          ${photoImgHTML(seeds[4], f.name, 220, 140)}
          <span class="fd-viewall-label">View all</span>
        </div>
      </div>
    </div>`;

  const dateOptionsHTML = fdDateOptionsOf(f).map((opt, i) => `
    <div class="fd-date-option${i === 0 ? " active" : ""}" data-fd-date-toggle
      data-fd-date="${opt.date}" data-fd-d="${opt.d}" data-fd-m="${opt.m}" data-fd-seats="${opt.seats}">
      <span class="fd-date-radio"></span>
      <div class="fd-date-option-date"><span class="d">${opt.d}</span><span class="m">${opt.m}</span></div>
      <div class="fd-date-option-info">${opt.date}<br><span class="fd-date-option-seats">${opt.seats > 0 ? `${opt.seats} seats left` : "Sold out"}</span></div>
      <div class="fd-date-option-price">${money(f.price)}<span>per person</span></div>
    </div>`).join("");

  const highlightsHTML = (f.highlights || []).map(h => `<li>${h}</li>`).join("");

  const similarHTML = fixedDepartures.filter(x => x.id !== f.id).slice(0, 4).map(x => `
    <div class="fd-similar-card" data-fd-similar="${x.id}">
      ${photoImgHTML(`${x.name}, ${x.loc}`, x.name, 220, 150)}
      <div class="fd-similar-body">
        <strong>${x.name}</strong>
        <span>${x.days} · from ${money(x.price)}</span>
      </div>
    </div>`).join("");

  const dayRowsHTML = (f.dayWise || []).map((d, i) => `
    <div class="fd-day-row">
      <button class="fd-day-head" data-fd-day-toggle="${i}" type="button">
        <span class="fd-day-badge">Day<br>${d.day}</span>
        <span class="fd-day-title">${mdClean(d.title)}</span>
        <span class="fd-day-chevron">›</span>
      </button>
      <div class="fd-day-body" data-fd-day-body="${i}" style="display:none;">
        <p>${mdClean(d.desc) || ""}</p>
      </div>
    </div>`).join("");

  const hotel = f.hotel || {};
  const stars = "★".repeat(hotel.stars || 3);

  const includedHTML = (f.included || []).map(i => `<li>${i}</li>`).join("");
  const exclusionsHTML = (f.exclusions || []).map(i => `<li>${i}</li>`).join("");
  const termsHTML = FIXED_TOUR_TERMS.map(t => `<li>${t}</li>`).join("");

  return `
    <div class="fd-detail">
      <h2>${f.name}${f.badge ? ` — ${f.badge}` : ""}</h2>
      <p class="fd-detail-desc">${f.shortDesc || ""}</p>
      <div class="fd-badges">
        <span class="fd-chip">${mainCity}${nights ? ` · ${nights}N` : ""}</span>
        ${f.badge ? `<span class="fd-chip fd-chip--accent">${f.badge}</span>` : ""}
      </div>

      ${gallery}

      <div class="fd-detail-grid">
        <div class="fd-detail-main">
          <div class="fd-date-picker">
            <h4>Choose your departure date</h4>
            <div class="fd-date-options">${dateOptionsHTML}</div>
            <button class="fd-check-avail-btn" data-fd-check-avail="${f.id}" type="button">↻ Check Availability</button>
            <div class="fd-availability-panel" id="fdAvailabilityPanel" style="display:none;"></div>
          </div>
          <div class="fd-highlights">
            <h4>★ Trip Highlights</h4>
            <ul>${highlightsHTML}</ul>
          </div>
        </div>

        <div class="fd-detail-side">
          <div class="fd-price-box">
            <div class="fd-price">${money(f.price)}</div>
            <div class="fd-price-sub">per person</div>
          </div>
          <div class="fd-book-box">
            <h4>Book your trip</h4>
            <div class="fd-book-field">
              <label>Leaving From</label>
              <div class="fd-book-value">${f.fromCity || "—"}</div>
            </div>
            <div class="fd-book-field">
              <label>Departure Date</label>
              <div class="fd-book-value" id="fdBookDateValue">${f.date} · ${f.seats > 0 ? `${f.seats} seats left` : "Sold out"}</div>
            </div>
            <button class="btn-primary btn-block" data-book-fixed="${f.id}">Reserve seat</button>
            ${whatsappBtnHTML(f.name, "pkg-whatsapp--block")}
          </div>
        </div>
      </div>

      ${similarHTML ? `
      <div class="fd-similar">
        <h4>Similar Fixed Departures</h4>
        <div class="fd-similar-scroll">${similarHTML}</div>
      </div>` : ""}

      <div class="fd-tabs">
        <button class="active" data-fd-tab="itinerary" type="button">Itinerary</button>
        <button data-fd-tab="flights" type="button">Flights</button>
        <button data-fd-tab="hotels" type="button">Hotels</button>
      </div>

      <div class="fd-tab-panel" data-fd-panel="itinerary">
        <div class="fd-panel-head">
          <h4>Itinerary</h4>
          <button class="fd-expand-all" data-fd-expand-all type="button">Expand All</button>
        </div>
        ${dayRowsHTML}
      </div>

      <div class="fd-tab-panel" data-fd-panel="flights" style="display:none;">
        <h4>Flights</h4>
        <p class="fd-flight-route">${f.fromCity || "—"} to ${mainCity}</p>
        <p class="fd-muted">No Flight Included</p>
      </div>

      <div class="fd-tab-panel" data-fd-panel="hotels" style="display:none;">
        <h4>Hotels</h4>
        <div class="fd-hotel-card">
          ${photoImgHTML(`${hotel.name || f.name}, ${f.loc}`, hotel.name || f.name, 220, 160)}
          <div class="fd-hotel-info">
            <strong>${hotel.name || "Hotel or similar"}</strong> <span class="fd-hotel-stars">${stars}</span>
            <p class="fd-hotel-address">${hotel.address || ""}</p>
            <div class="fd-hotel-room"><strong>Room:</strong> ${hotel.room || "Standard Room"}<br><strong>Meals:</strong> ${hotel.meals || "Breakfast included"}</div>
          </div>
        </div>
      </div>

      <div class="fd-included">
        <h4>Included in Price</h4>
        <ul>${includedHTML}</ul>
      </div>
      <div class="fd-exclusions">
        <h4>Exclusions</h4>
        <ul>${exclusionsHTML}</ul>
      </div>
      <div class="fd-terms">
        <h4>Terms and Conditions</h4>
        <ul>${termsHTML}</ul>
      </div>
    </div>`;
}

// Tracks which departure date is currently selected on the detail page
// that's open right now, so "Reserve seat" books the date the customer
// actually picked (via the date list OR the Check Availability panel)
// instead of always defaulting to the first/oldest date.
let fdSelectedForBooking = null;

function fdSetSelectedDate(fixedId, opt){
  fdSelectedForBooking = { id: fixedId, date: opt.date, d: opt.d, m: opt.m, seats: Number(opt.seats) || 0 };
  const valueEl = document.getElementById("fdBookDateValue");
  if(valueEl){
    valueEl.textContent = `${opt.date} · ${fdSelectedForBooking.seats > 0 ? `${fdSelectedForBooking.seats} seats left` : "Sold out"}`;
  }
}

function openFixedDetail(id){
  const f = fixedDepartures.find(x => x.id === id);
  if(!f) return;
  fixedDetailContentEl.innerHTML = fdDetailHTML(f);
  const firstOpt = fdDateOptionsOf(f)[0];
  if(firstOpt) fdSetSelectedDate(f.id, firstOpt);
  openOverlay(fixedDetailOverlay);
  const modalEl = fixedDetailOverlay.querySelector(".modal");
  if(modalEl) modalEl.scrollTop = 0;
}

// Clicking the thumbnail photo on a fixed-departure row opens the photo
// lightbox (see PHOTO LIGHTBOX block below) instead of the full detail
// page. Clicking anywhere else on the row (including the "View Details"
// button — but not the WhatsApp button) opens the full detail page —
// fixedRowHTML/renderAll otherwise untouched.
document.getElementById("fixedList").addEventListener("click", (e)=>{
  const photo = e.target.closest("[data-fd-photo]");
  if(photo){ openPhotoLightbox(photo.dataset.fdPhoto); return; }
  if(e.target.closest(".pkg-whatsapp")) return;
  const row = e.target.closest(".fixed-row");
  if(!row) return;
  const rows = Array.from(document.querySelectorAll("#fixedList .fixed-row"));
  const f = fixedDepartures[rows.indexOf(row)];
  if(f) openFixedDetail(f.id);
});

/* ================================================================
   FIXED DEPARTURE — photo lightbox (view full-size images)
   NEW FEATURE — purely additive. Does not edit fdDetailHTML,
   openFixedDetail, the booking flow, or the "Reserve seat" button
   INSIDE the detail page (data-book-fixed) — that still opens the
   same booking form as before, unchanged.
================================================================ */
const photoLightboxOverlay = document.getElementById("photoLightboxOverlay");
const photoLightboxContentEl = document.getElementById("photoLightboxContent");
let plImages = [];
let plIndex = 0;

function plRenderActiveThumb(){
  photoLightboxContentEl.querySelectorAll(".pl-thumb").forEach((t,i)=> t.classList.toggle("active", i === plIndex));
  const main = photoLightboxContentEl.querySelector(".pl-main img");
  if(main) main.src = plImages[plIndex];
}

function openPhotoLightbox(fixedId){
  const f = fixedDepartures.find(x => x.id === fixedId);
  if(!f) return;
  plImages = fdGallerySeeds(f).map(seed => photoUrl(seed, 1000, 640));
  plIndex = 0;

  photoLightboxContentEl.innerHTML = `
    <h3 class="pl-title">${f.name}</h3>
    <div class="pl-main"><img src="${plImages[0]}" alt="${f.name}"></div>
    <div class="pl-thumbs">
      ${plImages.map((src, i) => `<div class="pl-thumb${i === 0 ? " active" : ""}" data-pl-thumb="${i}"><img src="${src}" alt="${f.name}"></div>`).join("")}
    </div>`;

  openOverlay(photoLightboxOverlay);
}

photoLightboxOverlay.addEventListener("click", (e)=>{ if(e.target === photoLightboxOverlay) closeOverlay(photoLightboxOverlay); });

photoLightboxContentEl.addEventListener("click", (e)=>{
  const thumb = e.target.closest("[data-pl-thumb]");
  if(!thumb) return;
  plIndex = Number(thumb.dataset.plThumb);
  plRenderActiveThumb();
});

fixedDetailOverlay.addEventListener("click", (e)=>{ if(e.target === fixedDetailOverlay) closeOverlay(fixedDetailOverlay); });

// Delegated interactions inside the detail page: tabs, itinerary
// accordion, expand-all, date selection, and jumping to a similar tour.
fixedDetailContentEl.addEventListener("click", (e)=>{
  const tabBtn = e.target.closest("[data-fd-tab]");
  if(tabBtn){
    fixedDetailContentEl.querySelectorAll("[data-fd-tab]").forEach(b => b.classList.toggle("active", b === tabBtn));
    fixedDetailContentEl.querySelectorAll("[data-fd-panel]").forEach(p => {
      p.style.display = (p.dataset.fdPanel === tabBtn.dataset.fdTab) ? "" : "none";
    });
    return;
  }

  const dayToggle = e.target.closest("[data-fd-day-toggle]");
  if(dayToggle){
    const body = fixedDetailContentEl.querySelector(`[data-fd-day-body="${dayToggle.dataset.fdDayToggle}"]`);
    if(!body) return;
    const willOpen = body.style.display === "none";
    body.style.display = willOpen ? "" : "none";
    dayToggle.classList.toggle("open", willOpen);
    return;
  }

  const expandBtn = e.target.closest("[data-fd-expand-all]");
  if(expandBtn){
    const shouldExpand = expandBtn.textContent.trim() === "Expand All";
    fixedDetailContentEl.querySelectorAll("[data-fd-day-body]").forEach(b => { b.style.display = shouldExpand ? "" : "none"; });
    fixedDetailContentEl.querySelectorAll("[data-fd-day-toggle]").forEach(h => h.classList.toggle("open", shouldExpand));
    expandBtn.textContent = shouldExpand ? "Collapse All" : "Expand All";
    return;
  }

  const dateOpt = e.target.closest("[data-fd-date-toggle]");
  if(dateOpt){
    fixedDetailContentEl.querySelectorAll(".fd-date-option").forEach(d => d.classList.toggle("active", d === dateOpt));
    const currentId = fdSelectedForBooking ? fdSelectedForBooking.id : null;
    if(currentId){
      fdSetSelectedDate(currentId, {
        date: dateOpt.dataset.fdDate, d: dateOpt.dataset.fdD, m: dateOpt.dataset.fdM, seats: dateOpt.dataset.fdSeats,
      });
    }
    return;
  }

  const checkAvailBtn = e.target.closest("[data-fd-check-avail]");
  if(checkAvailBtn){
    loadFixedAvailability(checkAvailBtn.dataset.fdCheckAvail);
    return;
  }

  const availOpt = e.target.closest("[data-fd-avail-pick]");
  if(availOpt){
    const currentId = fdSelectedForBooking ? fdSelectedForBooking.id : availOpt.dataset.fdAvailId;
    fdSetSelectedDate(currentId, {
      date: availOpt.dataset.fdDate, d: availOpt.dataset.fdD, m: availOpt.dataset.fdM, seats: availOpt.dataset.fdSeats,
    });
    // Reflect the pick in the "Choose your departure date" list above too,
    // if that exact date happens to be one of the options shown there.
    fixedDetailContentEl.querySelectorAll(".fd-date-option").forEach(d => {
      d.classList.toggle("active", d.dataset.fdDate === availOpt.dataset.fdDate);
    });
    fixedDetailContentEl.querySelectorAll("[data-fd-avail-pick]").forEach(d => {
      d.classList.toggle("active", d === availOpt);
    });
    return;
  }

  const simBtn = e.target.closest("[data-fd-similar]");
  if(simBtn){
    openFixedDetail(simBtn.dataset.fdSimilar);
    return;
  }
});

/* ---------- Check Availability panel (live from the backend) ----------
   Fetches the freshest seat counts for this departure — in case they've
   changed since the page was loaded — and shows them grouped by month,
   so a customer can see "is Y May available? what about next month?"
   at a glance, and pick straight from here. */
async function loadFixedAvailability(fixedId){
  const panel = document.getElementById("fdAvailabilityPanel");
  if(!panel) return;
  panel.style.display = "block";
  panel.innerHTML = `<p class="fd-avail-loading">Checking live availability…</p>`;
  try{
    const data = await apiGet(`/api/fixed/${fixedId}/availability`);
    const byMonth = data.byMonth || {};
    const months = Object.keys(byMonth);
    if(!months.length){
      panel.innerHTML = `<p class="fd-avail-empty">No departure dates are currently scheduled. Please check back soon.</p>`;
      return;
    }
    panel.innerHTML = `
      <h4 class="fd-avail-title">Availability by month</h4>
      ${months.map(month => `
        <div class="fd-avail-month">
          <div class="fd-avail-month-label">${month}</div>
          <div class="fd-avail-rows">
            ${byMonth[month].map(opt => `
              <button type="button" class="fd-avail-row${Number(opt.seats) <= 0 ? " sold-out" : ""}"
                data-fd-avail-pick data-fd-avail-id="${fixedId}"
                data-fd-date="${opt.date}" data-fd-d="${opt.d}" data-fd-m="${opt.m}" data-fd-seats="${opt.seats}"
                ${Number(opt.seats) <= 0 ? "disabled" : ""}>
                <span class="fd-avail-date">${opt.date}</span>
                <span class="fd-avail-seats">${Number(opt.seats) > 0 ? `${opt.seats} slots available` : "Sold out"}</span>
              </button>`).join("")}
          </div>
        </div>`).join("")}
    `;
  }catch(err){
    panel.innerHTML = `<p class="fd-avail-empty">Could not check availability right now. Please try again.</p>`;
  }
}

/* ================================================================
   LEADS & CONVERSIONS SYSTEM  (new feature — reads/writes /api/leads
   on the backend)
   NEW FEATURE — purely additive. Does not edit, call, or depend on
   any function above; everything it needs (API_BASE_URL, apiPost)
   is only read, never modified. All UI here (WhatsApp button, sticky
   bar, popup, blog CTA, newsletter box, admin leads panel) is built
   and inserted with JS, so index.html/style.css markup didn't need
   any manual edits for this to work.
================================================================ */
(function AdmireWorldLeadsSystem(){

  // WhatsApp number: uses the shared WHATSAPP_NUMBER above (editable from
  // Admin Dashboard → Settings), not a separate hardcoded value.
  // Optional: if you later add Google Analytics 4 / Meta Pixel to the site
  // (via their own snippet in <head>), every conversion below is already
  // pushed to window.dataLayer (GA4) and window.fbq (Meta Pixel) automatically —
  // nothing else to wire up on this end.

  /* ---------- 1. Traffic attribution: capture UTM / campaign params ---------- */
  function captureAttribution(){
    const params = new URLSearchParams(location.search);
    const keys = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];
    const found = {};
    let any = false;
    keys.forEach(k=>{
      const v = params.get(k);
      if(v){ found[k] = v; any = true; }
    });

    // First-touch: only set once, so the ORIGINAL source that brought this
    // visitor in is preserved even if they come back later via a bookmark.
    if(any && !localStorage.getItem("aw_utm_first")){
      localStorage.setItem("aw_utm_first", JSON.stringify({ ...found, landing_page: location.pathname, referrer: document.referrer || "", capturedAt: new Date().toISOString() }));
    }
    // Last-touch: always refreshed, useful for "what brought them back this time".
    if(any){
      localStorage.setItem("aw_utm_last", JSON.stringify({ ...found, landing_page: location.pathname, referrer: document.referrer || "", capturedAt: new Date().toISOString() }));
    }
  }
  captureAttribution();

  function getAttribution(){
    try{
      const first = JSON.parse(localStorage.getItem("aw_utm_first") || "{}");
      const last = JSON.parse(localStorage.getItem("aw_utm_last") || "{}");
      const chosen = Object.keys(last).length ? last : first;
      return {
        utm_source: chosen.utm_source || "",
        utm_medium: chosen.utm_medium || "",
        utm_campaign: chosen.utm_campaign || "",
        utm_term: chosen.utm_term || "",
        utm_content: chosen.utm_content || "",
        landing_page: first.landing_page || location.pathname,
        referrer: first.referrer || document.referrer || "",
      };
    }catch{ return {}; }
  }

  /* ---------- 2. Conversion event tracking (GA4 dataLayer + Meta Pixel, safe no-ops if not installed) ---------- */
  function trackEvent(name, params){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
    // Also send as a real GA4 event via gtag() — the raw dataLayer.push above
    // only reaches GA4 if a GTM container is added later; gtag() is what's
    // actually wired up in index.html/policies.html right now.
    if(typeof gtag === "function"){
      gtag("event", name, params || {});
    }
    if(typeof window.fbq === "function"){
      window.fbq("trackCustom", name, params || {});
    }
  }

  /* ---------- 3. Lead submission helper (shared by every form below) ---------- */
  async function submitLead(payload){
    const body = { ...payload, ...getAttribution(), page: location.hash || location.pathname };
    const res = await fetch(`${API_BASE_URL}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try{ data = await res.json(); }catch{}
    if(!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    trackEvent("lead_submit", { source: payload.source, interest: payload.interest || "" });
    return data;
  }

  /* ---------- 4. WhatsApp floating button ---------- */
  function initWhatsAppButton(){
    const a = document.createElement("a");
    a.className = "aw-whatsapp-btn";
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Chat on WhatsApp");
    const msg = encodeURIComponent("Hi AdmireDworld Travel! I'd like help planning a trip.");
    a.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
    a.innerHTML = `<svg viewBox="0 0 32 32" fill="#fff"><path d="M16 3C9 3 3.3 8.7 3.3 15.7c0 2.5.7 4.9 1.9 6.9L3 29l6.6-2.1c1.9 1 4.1 1.6 6.4 1.6 7 0 12.7-5.7 12.7-12.7C28.7 8.7 23 3 16 3zm0 23.1c-2 0-4-.5-5.7-1.6l-.4-.2-4 1.3 1.3-3.9-.3-.4a10.4 10.4 0 0 1-1.6-5.6C5.3 9.8 10.1 5 16 5s10.7 4.8 10.7 10.7S21.9 26.1 16 26.1zm5.9-8c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1.1-1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-2-1.8-2.3-.2-.3 0-.5.1-.6.1-.1.3-.4.5-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z"/></svg>`;
    document.body.appendChild(a);

    a.addEventListener("click", ()=>{
      trackEvent("whatsapp_click", { page: location.hash || location.pathname });
      // Best-effort background lead capture too, so a WhatsApp click still
      // shows up in the leads dashboard even if the customer never fills a form.
      fetch(`${API_BASE_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "WhatsApp click", source: "whatsapp_click", ...getAttribution(), page: location.hash || location.pathname }),
      }).catch(()=>{});
    });
  }

  /* ---------- 5. Lead popup modal (shared markup, reused by exit-intent / timed / sticky bar) ---------- */
  let popupShownThisSession = false;

  function buildPopup(){
    const overlay = document.createElement("div");
    overlay.className = "aw-modal-overlay";
    overlay.id = "awLeadOverlay";
    overlay.innerHTML = `
      <div class="aw-modal">
        <button class="aw-modal-close" id="awLeadClose">&times;</button>
        <div id="awLeadFormWrap">
          <h3>Get a free custom quote</h3>
          <p class="aw-modal-sub">Share a few details and our travel team will call you back with an itinerary and price — no obligation.</p>
          <div class="aw-field">
            <label for="awLeadName">Full name</label>
            <input type="text" id="awLeadName" placeholder="Your name">
          </div>
          <div class="aw-field">
            <label for="awLeadPhone">Phone number</label>
            <input type="tel" id="awLeadPhone" placeholder="10-digit mobile number" maxlength="10">
          </div>
          <div class="aw-field">
            <label for="awLeadInterest">What are you planning?</label>
            <select id="awLeadInterest">
              <option value="India Package">India Package</option>
              <option value="International Package">International Package</option>
              <option value="Fixed Departure">Fixed Departure</option>
              <option value="Customized Trip">Customized Trip</option>
              <option value="Destination Wedding">Destination Wedding</option>
            </select>
          </div>
          <p class="aw-form-msg" id="awLeadMsg"></p>
          <button class="aw-btn-primary" id="awLeadSubmit">Request callback</button>
        </div>
        <div class="aw-modal-success" id="awLeadSuccess" style="display:none;">
          <div class="aw-check">&#10003;</div>
          <h3>Thanks — you're on our list!</h3>
          <p class="aw-modal-sub">Our team will reach out shortly. Meanwhile, feel free to keep browsing packages.</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = ()=> overlay.classList.remove("open");
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });
    document.getElementById("awLeadClose").addEventListener("click", close);

    document.getElementById("awLeadSubmit").addEventListener("click", async ()=>{
      const name = document.getElementById("awLeadName").value.trim();
      const phone = document.getElementById("awLeadPhone").value.trim();
      const interest = document.getElementById("awLeadInterest").value;
      const msgEl = document.getElementById("awLeadMsg");
      msgEl.className = "aw-form-msg";
      if(!name || !/^[0-9]{10}$/.test(phone)){
        msgEl.textContent = "Please enter your name and a valid 10-digit phone number.";
        return;
      }
      try{
        await submitLead({ name, phone, interest, source: overlay.dataset.source || "exit_popup" });
        document.getElementById("awLeadFormWrap").style.display = "none";
        document.getElementById("awLeadSuccess").style.display = "block";
        trackEvent("popup_conversion", { interest });
      }catch(err){
        msgEl.textContent = err.message;
      }
    });

    return overlay;
  }

  function openPopup(source){
    let overlay = document.getElementById("awLeadOverlay");
    if(!overlay) overlay = buildPopup();
    overlay.dataset.source = source;
    overlay.classList.add("open");
    trackEvent("popup_shown", { source });
  }

  /* ---------- 6. Exit-intent (desktop) + timed fallback (mobile) popup trigger ---------- */
  function initPopupTriggers(){
    if(sessionStorage.getItem("aw_popup_seen")) return;

    const trigger = (source)=>{
      if(popupShownThisSession) return;
      popupShownThisSession = true;
      sessionStorage.setItem("aw_popup_seen", "1");
      openPopup(source);
    };

    // Desktop: mouse leaves toward the top of the viewport (classic exit-intent).
    document.addEventListener("mouseout", (e)=>{
      if(!e.relatedTarget && e.clientY <= 0){
        trigger("exit_popup");
      }
    });

    // Mobile / fallback: no mouse leave event exists, so use a time + scroll
    // signal instead — someone who has scrolled and stayed 25s is engaged.
    let scrolledEnough = false;
    window.addEventListener("scroll", ()=>{
      const scrollPct = (window.scrollY / (document.body.scrollHeight - window.innerHeight || 1)) * 100;
      if(scrollPct > 40) scrolledEnough = true;
    }, { passive:true });

    setTimeout(()=>{
      if(scrolledEnough) trigger("timed_popup");
    }, 25000);
  }

  /* ---------- 7. Sticky "Get a free quote" bar ---------- */
  function initStickyBar(){
    if(sessionStorage.getItem("aw_bar_dismissed")) return;
    const bar = document.createElement("div");
    bar.className = "aw-sticky-bar";
    bar.id = "awStickyBar";
    bar.innerHTML = `
      <span>Planning a trip? Get a free custom quote in minutes.</span>
      <button class="aw-cta" id="awStickyCta">Get quote</button>
      <button class="aw-close" id="awStickyClose" aria-label="Dismiss">&times;</button>`;
    document.body.appendChild(bar);

    window.addEventListener("scroll", ()=>{
      if(window.scrollY > 700) bar.classList.add("show");
    }, { passive:true });

    document.getElementById("awStickyCta").addEventListener("click", ()=> openPopup("sticky_bar"));
    document.getElementById("awStickyClose").addEventListener("click", ()=>{
      bar.classList.remove("show");
      sessionStorage.setItem("aw_bar_dismissed", "1");
    });
  }

  /* ---------- 8. Blog inline lead CTA (waits for the AI blog post to load, then injects once) ---------- */
  function initBlogCTA(){
    const wrap = document.getElementById("blogLatestWrap");
    if(!wrap) return;

    const injectCTA = ()=>{
      if(document.getElementById("awBlogCta")) return; // already injected
      if(!wrap.querySelector(".blog-featured")) return; // post hasn't loaded yet

      const cta = document.createElement("div");
      cta.className = "aw-blog-cta";
      cta.id = "awBlogCta";
      cta.innerHTML = `
        <div class="aw-blog-cta-text">
          <h4>Liked this idea? Let's plan it for you.</h4>
          <p>Tell us your name and number — we'll call you back with a custom itinerary and price.</p>
        </div>
        <form class="aw-blog-cta-form" id="awBlogCtaForm">
          <input type="text" id="awBlogCtaName" placeholder="Your name" required>
          <input type="tel" id="awBlogCtaPhone" placeholder="10-digit number" maxlength="10" required>
          <button type="submit">Get callback</button>
        </form>
        <p class="aw-form-msg" id="awBlogCtaMsg" style="width:100%;"></p>`;
      wrap.appendChild(cta);

      document.getElementById("awBlogCtaForm").addEventListener("submit", async (e)=>{
        e.preventDefault();
        const name = document.getElementById("awBlogCtaName").value.trim();
        const phone = document.getElementById("awBlogCtaPhone").value.trim();
        const msgEl = document.getElementById("awBlogCtaMsg");
        msgEl.className = "aw-form-msg";
        if(!name || !/^[0-9]{10}$/.test(phone)){
          msgEl.textContent = "Please enter your name and a valid 10-digit phone number.";
          return;
        }
        try{
          await submitLead({ name, phone, source: "blog_cta", interest: "Blog reader" });
          msgEl.className = "aw-form-msg ok";
          msgEl.textContent = "Thanks! Our team will call you back shortly.";
          document.getElementById("awBlogCtaForm").reset();
        }catch(err){
          msgEl.textContent = err.message;
        }
      });
    };

    // The AI blog post loads asynchronously (see loadBlog() above, untouched
    // here) — a MutationObserver waits for it instead of guessing a delay.
    const observer = new MutationObserver(injectCTA);
    observer.observe(wrap, { childList:true, subtree:true });
    injectCTA(); // in case it's already loaded
  }

  /* ---------- 9. Newsletter box (injected into the footer) ---------- */
  function initNewsletter(){
    const footerCols = document.querySelector(".footer-cols");
    if(!footerCols || !footerCols.parentElement) return;

    const box = document.createElement("div");
    box.className = "aw-newsletter";
    box.innerHTML = `
      <h4>Get travel deals in your inbox</h4>
      <p>Fresh packages, fixed-departure alerts and offers — no spam.</p>
      <form class="aw-newsletter-form" id="awNewsletterForm">
        <input type="email" id="awNewsletterEmail" placeholder="you@example.com" required>
        <button type="submit">Subscribe</button>
      </form>
      <p class="aw-newsletter-msg" id="awNewsletterMsg"></p>`;
    footerCols.parentElement.insertBefore(box, footerCols);

    document.getElementById("awNewsletterForm").addEventListener("submit", async (e)=>{
      e.preventDefault();
      const email = document.getElementById("awNewsletterEmail").value.trim();
      const msgEl = document.getElementById("awNewsletterMsg");
      try{
        await submitLead({ name: "Newsletter subscriber", email, source: "newsletter" });
        msgEl.textContent = "Subscribed! Watch your inbox for upcoming deals.";
        document.getElementById("awNewsletterForm").reset();
      }catch(err){
        msgEl.textContent = err.message;
      }
    });
  }

  /* ---------- 10. Admin: Leads dashboard (only visible with ?admin=1) ---------- */
  function initLeadsAdmin(){
    const params = new URLSearchParams(location.search);
    if(params.get("admin") !== "1") return;

    const toggle = document.createElement("button");
    toggle.className = "aw-admin-toggle";
    toggle.textContent = "Leads dashboard";
    document.body.appendChild(toggle);

    const panel = document.createElement("div");
    panel.className = "aw-admin-panel";
    panel.innerHTML = `
      <div class="aw-admin-panel-inner">
        <button class="aw-modal-close" id="awAdminClose">&times;</button>
        <h3 style="font-family:var(--serif); margin:0 0 4px;">Leads dashboard</h3>
        <p class="aw-modal-sub">Every enquiry captured from the popup, blog, newsletter and WhatsApp button.</p>
        <div class="aw-field" style="max-width:280px;">
          <label for="awAdminKeyInput">Admin key</label>
          <input type="password" id="awAdminKeyInput" placeholder="Admin key">
        </div>
        <button class="aw-btn-primary" style="width:auto; padding:10px 20px;" id="awAdminLoadBtn">Load leads</button>
        <p class="aw-form-msg" id="awAdminMsg"></p>
        <div class="aw-admin-stats" id="awAdminStats"></div>
        <div style="overflow-x:auto;">
          <table class="aw-leads-table" id="awLeadsTable" style="display:none;">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Interest</th><th>Source</th><th>Campaign</th><th>Date</th><th>Status</th></tr></thead>
            <tbody id="awLeadsTbody"></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(panel);

    toggle.addEventListener("click", ()=> panel.classList.add("open"));
    document.getElementById("awAdminClose").addEventListener("click", ()=> panel.classList.remove("open"));
    panel.addEventListener("click", (e)=>{ if(e.target === panel) panel.classList.remove("open"); });

    async function loadLeads(){
      const adminKey = document.getElementById("awAdminKeyInput").value;
      const msgEl = document.getElementById("awAdminMsg");
      msgEl.textContent = "Loading...";
      try{
        const res = await fetch(`${API_BASE_URL}/api/leads/admin/all?adminKey=${encodeURIComponent(adminKey)}`);
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || "Could not load leads.");
        msgEl.textContent = "";

        const statsEl = document.getElementById("awAdminStats");
        const sourceEntries = Object.entries(data.bySource || {});
        statsEl.innerHTML =
          `<div class="aw-admin-stat"><strong>${data.total}</strong>Total leads</div>` +
          sourceEntries.map(([k,v])=>`<div class="aw-admin-stat"><strong>${v}</strong>${k.replace(/_/g," ")}</div>`).join("");

        const tbody = document.getElementById("awLeadsTbody");
        tbody.innerHTML = data.leads.map(l => `
          <tr>
            <td>${l.name || "-"}</td>
            <td>${l.phone || "-"}</td>
            <td>${l.email || "-"}</td>
            <td>${l.interest || "-"}</td>
            <td>${l.source}</td>
            <td>${l.utm && l.utm.source ? `${l.utm.source} / ${l.utm.medium || "-"}` : "direct"}</td>
            <td>${new Date(l.createdAt).toLocaleDateString("en-IN")}</td>
            <td>
              <select data-lead-id="${l.id}" class="aw-status-select">
                ${["new","contacted","converted","closed"].map(s => `<option value="${s}" ${s===l.status?"selected":""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>`).join("");

        tbody.querySelectorAll(".aw-status-select").forEach(sel=>{
          sel.addEventListener("change", async ()=>{
            try{
              await fetch(`${API_BASE_URL}/api/leads/admin/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adminKey, leadId: sel.dataset.leadId, status: sel.value }),
              });
            }catch{}
          });
        });

        document.getElementById("awLeadsTable").style.display = "table";
      }catch(err){
        msgEl.textContent = err.message;
      }
    }
    document.getElementById("awAdminLoadBtn").addEventListener("click", loadLeads);
  }

  /* ---------- Boot everything once the page is ready ---------- */
  function bootAll(){
    initWhatsAppButton();
    initPopupTriggers();
    initStickyBar();
    initBlogCTA();
    initNewsletter();
    initLeadsAdmin();
    trackEvent("page_view", { page: location.hash || location.pathname, ...getAttribution() });
  }
  // This script tag sits right before </body>, so the DOM is already parsed
  // by the time it runs — but guard with DOMContentLoaded too in case it's
  // ever moved into <head> or loaded with `defer`.
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootAll);
  } else {
    bootAll();
  }

})();

/* ============ Hero destination slider (added — does not modify any code above) ============ */
(function(){
  const slides = document.querySelectorAll("#heroSlides .hero-slide");
  const dots = document.querySelectorAll("#heroDots button");
  if(!slides.length) return;

  let idx = 0;
  let timer = null;

  function show(i){
    idx = (i + slides.length) % slides.length;
    slides.forEach((s,n)=> s.classList.toggle("active", n === idx));
    dots.forEach((d,n)=> d.classList.toggle("active", n === idx));
  }

  function startAutoplay(){
    clearInterval(timer);
    timer = setInterval(()=> show(idx + 1), 4500);
  }

  dots.forEach((d, n)=>{
    d.addEventListener("click", ()=>{
      show(n);
      startAutoplay(); // restart the timer so it doesn't jump right after a manual click
    });
  });

  startAutoplay();
})();

/* ============ Holiday nav dropdown (India + International Packages) ============
   Purely additive — does not modify any code above. Wraps the existing
   showTab() so the "Holiday" nav item highlights correctly when either
   the India or International Packages tab is open, and adds click-to-open/
   close behaviour for the dropdown itself. */
(function(){
  const navItem = document.getElementById("holidayNavItem");
  const toggle = document.getElementById("holidayToggle");
  if(!navItem || !toggle) return;

  function setHolidayActive(tab){
    const isHolidayTab = tab === "india" || tab === "international";
    toggle.classList.toggle("active", isHolidayTab);
    navItem.querySelectorAll(".nav-dropdown-link").forEach(link=>{
      link.classList.toggle("active", link.dataset.tab === tab);
    });
  }

  // Wrap the existing showTab (defined earlier in this file) without changing it.
  if(typeof window.showTab === "function"){
    const originalShowTab = window.showTab;
    window.showTab = function(tab){
      originalShowTab(tab);
      setHolidayActive(tab);
    };
  }

  // Reflect correct highlight state on initial load (e.g. #india / #international in the URL).
  const startingPanel = document.querySelector(".tab-panel.active");
  if(startingPanel) setHolidayActive(startingPanel.dataset.panel);

  toggle.addEventListener("click", (e)=>{
    e.stopPropagation();
    navItem.classList.toggle("open");
    toggle.setAttribute("aria-expanded", navItem.classList.contains("open") ? "true" : "false");
  });

  navItem.querySelectorAll(".nav-dropdown-link").forEach(link=>{
    link.addEventListener("click", ()=>{
      navItem.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (e)=>{
    if(!navItem.contains(e.target)) navItem.classList.remove("open");
  });
})();
/* ================================================================
   REAL GOOGLE REVIEWS (new feature — reads GET /api/reviews)
   Purely additive — does not touch any code above. Follows the same
   pattern as initNewsletter()/initWhatsAppButton() inside
   AdmireWorldLeadsSystem: builds its own markup with JS and inserts
   it into the page, so no manual HTML/CSS edits were needed.
   Injects a "What our travellers say" section right above the
   footer (same spot the newsletter box uses), showing the overall
   business rating + up to 5 real reviews from /api/reviews.
   Falls back to a small hardcoded set if the API fails/unreachable,
   so the section is never empty.
================================================================ */
(function AdmireWorldReviewsSection(){

  // Fallback shown only if /api/reviews fails or backend isn't reachable —
  // keeps the section from ever looking broken/empty.
  const FALLBACK_REVIEWS = {
    business: { name: "AdmireDworld Travel", rating: 4.9, totalReviews: 216 },
    reviews: [
      { author: "Krishan Pal Singh", rating: 5, text: "Great service and well-planned itinerary. Highly recommend for a hassle-free trip." },
      { author: "Maneesh Joshi", rating: 5, text: "Very professional team, handled everything smoothly from start to finish." },
      { author: "Bhuwan Arya", rating: 5, text: "Good experience overall, hotels and transport were exactly as promised." },
      { author: "Shubham", rating: 5, text: "Smooth booking process and quick responses. Will book again." },
      { author: "Pankaj Singh", rating: 5, text: "Trip was well organized and the team was very helpful throughout." },
    ],
  };

  function starsHTML(rating){
    const r = Math.round(Number(rating) || 0);
    return "★".repeat(Math.max(0, Math.min(5, r))) + "☆".repeat(5 - Math.max(0, Math.min(5, r)));
  }

  function reviewCardHTML(r){
    const initial = (r.author || "?").trim().charAt(0).toUpperCase();
    return `
    <div class="aw-review-card">
      <div class="aw-review-top">
        <div class="aw-review-avatar">${initial}</div>
        <div>
          <strong>${r.author || "Google user"}</strong>
          <div class="aw-review-stars">${starsHTML(r.rating)}</div>
        </div>
      </div>
      <p class="aw-review-text">${r.text || ""}</p>
    </div>`;
  }

  function sectionHTML(data){
  const biz = data.business || {};
  const reviews = (data.reviews || []).slice(0, 10);
  const cards = reviews.map(reviewCardHTML).join('');
  return `
    <div class="aw-reviews-head">
      <h4>What our travellers say</h4>
      <div class="aw-reviews-summary">
        <span class="aw-reviews-rating">${(biz.rating||0).toFixed?biz.rating.toFixed(1):biz.rating}</span>
        <span class="aw-review-stars">${starsHTML(biz.rating)}</span>
        <span class="aw-reviews-count">${biz.totalReviews||0} Google reviews</span>
      </div>
    </div>
    <div style="overflow:hidden">
      <div class="aw-reviews-track" style="display:flex;gap:20px;width:max-content;animation:aw-scroll 40s linear infinite">
        ${cards}${cards}
      </div>
    </div>
  `;
}

  function injectSection(data){
  const old = document.getElementById('aw-reviews-section');
  if(old) old.remove();
  const box = document.createElement('section');
  box.id = 'aw-reviews-section';
  box.className = 'aw-reviews-section';
  box.style.cssText = 'background:#f8f9ff;padding:60px 20px;display:block;width:100%;';
  box.innerHTML = sectionHTML(data);
  const faq = document.getElementById('siteFAQ') || document.querySelector('#faq');
  if(faq && faq.parentNode){
    faq.parentNode.insertBefore(box, faq);
  } else {
    const footer = document.querySelector('footer');
    if(footer && footer.parentNode){
      footer.parentNode.insertBefore(box, footer);
    } else {
      document.body.appendChild(box);
    }
  }
}

  

  async function loadReviews(){
    try{
      const res = await fetch(`${API_BASE_URL}/api/reviews`);
      const data = await res.json();
      if(!res.ok || data.ok === false) throw new Error(data.error || "Could not load reviews.");
      injectSection(data);
    }catch(err){
      console.error("Could not load reviews, showing fallback:", err);
      injectSection(FALLBACK_REVIEWS);
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", loadReviews);
  }else{
    loadReviews();
  }
})();

/* ================================================================
   SITE-WIDE DESTINATION SEARCH (header search box)
   -------------------------------------------------------------------
   Purely additive: does not touch indiaPackages / intlPackages /
   allPackages / renderAll / packageCardHTML / showTab / any existing
   form (hero "Get Instant Quotes" search stays exactly as it was).
   Typing a destination (e.g. "Kashmir") and hitting Enter searches
   across ALL India + International ready-made packages by name,
   route/location and description, and shows every match in a new
   "Search Results" tab using the same package card UI as the rest
   of the site.
================================================================ */
(function initSiteSearch(){
  const form = document.getElementById("siteSearchForm");
  const input = document.getElementById("siteSearchInput");
  const grid = document.getElementById("searchGrid");
  const noResults = document.getElementById("searchNoResults");
  const titleEl = document.getElementById("searchResultsTitle");
  const subEl = document.getElementById("searchResultsSub");
  const goCustomizeBtn = document.getElementById("searchGoCustomizeBtn");
  if(!form || !input || !grid) return;

  function normalize(str){
    return (str || "").toString().toLowerCase();
  }

  function matchesQuery(p, q){
    return normalize(p.name).includes(q) ||
           normalize(p.loc).includes(q) ||
           normalize(p.desc).includes(q) ||
           normalize(p.cat).includes(q);
  }

  function runSiteSearch(rawQuery){
    const q = normalize(rawQuery).trim();
    if(!q) return;

    // allPackages is kept live (india + international) by the existing
    // loadIndiaPackagesFromBackend()/loadIntlPackagesFromBackend() code.
    const matches = allPackages.filter(p => matchesQuery(p, q));

    titleEl.textContent = matches.length
      ? `Packages for "${rawQuery.trim()}"`
      : `No packages found for "${rawQuery.trim()}"`;
    subEl.textContent = matches.length
      ? `${matches.length} package${matches.length > 1 ? "s" : ""} found.`
      : "";

    if(matches.length){
      grid.style.display = "";
      noResults.style.display = "none";
      grid.innerHTML = matches
        .map(p => packageCardHTML(p, indiaPackages.some(ip => ip.id === p.id) ? "india" : "international"))
        .join("");
    }else{
      grid.style.display = "none";
      grid.innerHTML = "";
      noResults.style.display = "";
    }

    showTab("search");
  }

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    runSiteSearch(input.value);
  });

  // Same card behaviour (View Full Details / Book now) as #homeFeatured,
  // which also mixes India + International cards in one grid.
  grid.addEventListener("click", (e)=>
    handlePkgCardClick(e, (id)=> indiaPackages.some(p => p.id === id) ? "india" : "international")
  );

  goCustomizeBtn?.addEventListener("click", ()=>{
    document.getElementById("cwizDestination").value = input.value.trim();
    showTab("customize");
  });
})();


/* ================================================================
   IN-PAGE DESTINATION SEARCH BARS (above the package grids)
   -------------------------------------------------------------------
   Purely additive. The search bars placed above the packages on Home
   ("Popular right now"), India Packages, International Packages and
   the Search Results tab all reuse the EXISTING header search
   (initSiteSearch above) — they just copy the typed destination into
   the header search box and submit it, so results, cards, "no results"
   message and "Get a Custom Quote" behave exactly the same everywhere.
   Nothing above (packages, filters, header search, hero search) is
   modified.
================================================================ */
(function initPackageSearchBars(){
  const siteForm  = document.getElementById("siteSearchForm");
  const siteInput = document.getElementById("siteSearchInput");
  const forms     = document.querySelectorAll(".pkg-search-form");
  const list      = document.getElementById("pkgSearchList");
  if(!siteForm || !siteInput || !forms.length) return;

  // Only the bar on the Search Results tab mirrors the current query, so the
  // Home / India / International bars always open clean.
  function syncInputs(value){
    const i = document.querySelector("#tab-search .pkg-search-input");
    if(i) i.value = value;
  }

  // Destination suggestions (package names + each place in the route),
  // rebuilt on focus so they always reflect the latest backend packages.
  function refreshSuggestions(){
    if(!list) return;
    const seen = new Set();
    const out = [];
    allPackages.forEach(p => {
      [p.name].concat((p.loc || "").split(/[·,|\/]/)).forEach(t => {
        const v = (t || "").trim();
        const k = v.toLowerCase();
        if(v && !seen.has(k)){ seen.add(k); out.push(v); }
      });
    });
    list.innerHTML = out.map(v => `<option value="${v.replace(/"/g, "&quot;")}"></option>`).join("");
  }

  forms.forEach(f => {
    const input = f.querySelector(".pkg-search-input");
    if(!input) return;

    input.addEventListener("focus", refreshSuggestions);

    f.addEventListener("submit", (e)=>{
      e.preventDefault();
      const q = input.value.trim();
      if(!q){ input.focus(); return; }
      siteInput.value = q;
      syncInputs(q);
      if(typeof siteForm.requestSubmit === "function"){
        siteForm.requestSubmit();
      }else{
        siteForm.dispatchEvent(new Event("submit", { cancelable:true, bubbles:true }));
      }
    });
  });

  // Keep the Search Results bar showing the searched text (also when the header search is used).
  siteForm.addEventListener("submit", ()=> syncInputs(siteInput.value.trim()));
})();

/* ================================================================
   REFRESH FIX — keep the currently opened package detail page on refresh.
   If the browser is already on /package/india/... or /package/international/...
   do not fall back to the Home tab; restore that exact package directly.
   No package data, styling, or other navigation logic is changed.
================================================================ */
(function restorePackageOnRefresh(){
  const parsed = parsePkgDetailPath(location.pathname);
  if(parsed && !currentPkgDetail){
    openPkgDetail(parsed.id, parsed.endpoint, true);
  }
})();


/* ================================================================
   DESTINATION SUB-TABS (India + International) — ADDITIVE ONLY.
   Filters the already-rendered package cards by destination keyword
   (matched on package name / route / destination / description).
   Nothing is deleted or re-fetched; existing chips, search, backend
   loaders and admin boxes are untouched. A MutationObserver re-applies
   the active sub-tab whenever the existing code re-renders a grid.
================================================================ */
(function initDestinationSubTabs(){
  const KEYWORDS = {
    india: {
      kerala:    ["kerala","alleppey","alappuzha","munnar","kumarakom","kochi","cochin","thekkady","wayanad","varkala","kovalam","backwater","thiruvananthapuram","trivandrum"],
      kashmir:   ["kashmir","srinagar","gulmarg","pahalgam","sonamarg","sonmarg","dal lake"],
      himachal:  ["himachal","manali","shimla","kasol","dharamshala","mcleod","dalhousie","spiti","kullu","kufri","khajjiar","kinnaur","chail"],
      goa:       ["goa"],
      rajasthan: ["rajasthan","jaipur","udaipur","jodhpur","jaisalmer","pushkar","bikaner","ranthambore","mount abu","chittorgarh","ajmer"],
      andaman:   ["andaman","port blair","havelock","neil island","swaraj dweep","nicobar"]
    },
    international: {
      dubai:     ["dubai","abu dhabi","sharjah","uae"],
      bali:      ["bali","ubud","seminyak","nusa penida","kuta","canggu"],
      thailand:  ["thailand","bangkok","phuket","krabi","pattaya","chiang mai","koh samui"],
      singapore: ["singapore","sentosa","marina bay"],
      maldives:  ["maldives","male atoll","maldive"]
    }
  };
  const CFG = {
    india:         { rowId:"indiaSubTabs", gridId:"indiaGrid", list:()=>indiaPackages },
    international: { rowId:"intlSubTabs",  gridId:"intlGrid",  list:()=>intlPackages }
  };
  const state = { india:"all", international:"all" };

  function haystack(p){
    const full = (typeof pkgDetailStore !== "undefined" && pkgDetailStore[p.id]) || {};
    return [p.name, p.loc, p.desc, full.destination, full.name, full.loc]
      .filter(Boolean).join(" ").replace(/&amp;/g," & ").toLowerCase();
  }
  function matches(p, kind, sub){
    if(sub === "all") return true;
    const words = (KEYWORDS[kind] || {})[sub] || [];
    const hay = haystack(p);
    return words.some(w => hay.includes(w));
  }
  /* ---- Auto tabs: any package whose destination has no tab yet gets one ----
     (e.g. Nainital). Static tabs above stay exactly as they are. */
  const ALIASES = {
    nainital: ["nainital","naini","jim corbett","corbett","ramnagar","bhimtal","sattal","mukteshwar","ranikhet","almora","kausani","kainchi"]
  };
  const dynLabels = { india:{}, international:{} };
  function deriveLabel(p){
    const full = (typeof pkgDetailStore !== "undefined" && pkgDetailStore[p.id]) || {};
    const src = full.destination || p.destination || p.loc || p.name || "";
    let first = String(src).replace(/&amp;/g," & ").split(/[,·&→>\/()—–|]|\band\b/i)[0]
      .replace(/tour packages?.*$/i,"").replace(/\s+/g," ").trim();
    if(first.length < 2) return "";
    return first.replace(/\b\w/g, ch => ch.toUpperCase());
  }
  function syncDynamicTabs(kind){
    const c = CFG[kind];
    const rowEl = document.getElementById(c.rowId);
    if(!rowEl) return;
    const staticSubs = new Set([...rowEl.querySelectorAll(".subtab:not(.dyn-sub)")].map(b => b.dataset.sub));
    const wanted = {};
    c.list().forEach(p => {
      // already covered by a static tab? then no new tab needed
      for(const sub of staticSubs){
        if(sub !== "all" && matches(p, kind, sub)) return;
      }
      const label = deriveLabel(p);
      if(!label) return;
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      if(!key || staticSubs.has(key)) return;
      wanted[key] = label;
    });
    // add / keep tabs
    Object.keys(wanted).forEach(key => {
      dynLabels[kind][key] = wanted[key];
      KEYWORDS[kind][key] = ALIASES[key] || [wanted[key].toLowerCase()];
      if(!rowEl.querySelector('.subtab[data-sub="' + key + '"]')){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "subtab dyn-sub" + (state[kind] === key ? " active" : "");
        b.dataset.sub = key;
        b.textContent = wanted[key];
        rowEl.appendChild(b);
      }
    });
    // remove auto tabs that no longer have any package
    rowEl.querySelectorAll(".dyn-sub").forEach(b => {
      if(!wanted[b.dataset.sub]){
        if(state[kind] === b.dataset.sub){
          state[kind] = "all";
          rowEl.querySelectorAll(".subtab").forEach(x => x.classList.toggle("active", x.dataset.sub === "all"));
        }
        b.remove();
      }
    });
  }
  function apply(kind){
    const c = CFG[kind];
    const grid = document.getElementById(c.gridId);
    if(!grid) return;
    syncDynamicTabs(kind);
    const sub = state[kind];
    const byId = {};
    c.list().forEach(p => byId[p.id] = p);
    let shown = 0;
    grid.querySelectorAll(".pkg-card").forEach(card => {
      const id = card.querySelector("[data-view-pkg]")?.dataset.viewPkg;
      const p = byId[id];
      const ok = !p || matches(p, kind, sub);
      card.classList.toggle("sub-hidden", !ok);
      if(ok) shown++;
    });
    let empty = grid.querySelector(".sub-empty");
    if(sub !== "all" && shown === 0){
      if(!empty){
        empty = document.createElement("p");
        empty.className = "sub-empty";
        grid.appendChild(empty);
      }
      empty.textContent = "No packages for " + (dynLabels[kind][sub] || (sub.charAt(0).toUpperCase() + sub.slice(1))) + " yet — check back soon or tap All.";
    }else if(empty){
      empty.remove();
    }
  }
  function setActive(kind, sub){
    state[kind] = sub;
    document.querySelectorAll("#" + CFG[kind].rowId + " .subtab")
      .forEach(b => b.classList.toggle("active", b.dataset.sub === sub));
    apply(kind);
  }

  Object.keys(CFG).forEach(kind => {
    const c = CFG[kind];
    const rowEl = document.getElementById(c.rowId);
    const grid = document.getElementById(c.gridId);
    if(!rowEl || !grid) return;
    rowEl.addEventListener("click", e => {
      const b = e.target.closest(".subtab");
      if(b) setActive(kind, b.dataset.sub);
    });
    // Re-apply after any re-render of the grid (backend load, chip click, nav reset).
    let busy = false;
    new MutationObserver(() => {
      if(busy) return; busy = true;
      apply(kind);
      busy = false;
    }).observe(grid, { childList:true });
  });

  // Coming in through the main nav / dropdown / quick-nav starts fresh on "All".
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-tab]");
    if(!el) return;
    const t = el.dataset.tab;
    if(CFG[t]) setActive(t, "all");
  }, true);
})();
