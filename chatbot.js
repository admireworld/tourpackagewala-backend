/* ===========================================================
   TourPackageWala — Lead Chatbot
   -----------------------------------------------------------
   NEW, fully self-contained file. It injects its own CSS + HTML, so
   script.js, style.css and every existing feature are NOT touched.

   What it does
   ------------
   1. As soon as the website opens, the chatbot opens by itself.
   2. It asks, one by one:  Destination  ->  Name  ->  Contact number.
   3. The moment the contact number is entered, the lead is saved to the
      backend (POST /api/leads, source "chatbot") — no login needed — so it
      shows up in Admin -> Leads right away.
   4. It then runs the website's own destination search, so the customer
      sees ALL packages of that destination on the website (Search Results
      tab). Nothing is created / edited / deleted on the packages.

   Tweaks (constants below):
     - OPEN_DELAY_MS   : delay before the chatbot opens by itself
     - AUTO_OPEN       : false -> only the launcher button shows, no auto-open
   Testing: open the site with  ?chatbot=1  to force it to auto-open even if
   it was closed / completed earlier in this browser session.
=========================================================== */
(function () {
  "use strict";

  var OPEN_DELAY_MS = 3000;
  var AUTO_OPEN = true;
  var FALLBACK_API = "https://tourpackagewala-backend.onrender.com";
  var KEY_CLOSED = "tpw_chatbot_closed";
  var KEY_LEAD = "tpw_chatbot_lead"; // {name, phone} once a lead was saved this session

  /* ---------- skip on admin screens ---------- */
  if (/admin/i.test(location.pathname) || /[?&]admin=1\b/.test(location.search)) return;

  /* ---------- helpers ---------- */
  function api() {
    try { if (typeof API_BASE_URL === "string" && API_BASE_URL) return API_BASE_URL; } catch (e) {}
    return FALLBACK_API;
  }
  function ss(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }
  function forced() { return /[?&]chatbot=1\b/.test(location.search); }
  function titleCase(s) {
    return String(s || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }
  function cleanPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }
  function readAttribution() {
    var out = {};
    try {
      var first = JSON.parse(localStorage.getItem("aw_utm_first") || "{}");
      var last = JSON.parse(localStorage.getItem("aw_utm_last") || "{}");
      var c = Object.keys(first).length ? first : last;
      out = {
        utm_source: c.utm_source || "", utm_medium: c.utm_medium || "", utm_campaign: c.utm_campaign || "",
        utm_term: c.utm_term || "", utm_content: c.utm_content || "",
        landing_page: c.landing_page || "", referrer: c.referrer || ""
      };
    } catch (e) {}
    return out;
  }
  function readReferral() {
    try {
      if (typeof getReferralAttribution === "function") {
        var r = getReferralAttribution() || {};
        return { code: r.code || "", initialPackage: r.initialPkgName || "" };
      }
    } catch (e) {}
    return { code: "", initialPackage: "" };
  }
  // Same matching rule the website's own search uses (name / loc / desc / cat).
  function countMatches(q) {
    q = String(q || "").toLowerCase().trim();
    if (!q) return 0;
    try {
      return allPackages.filter(function (p) {
        return String(p.name || "").toLowerCase().indexOf(q) > -1 ||
               String(p.loc || "").toLowerCase().indexOf(q) > -1 ||
               String(p.desc || "").toLowerCase().indexOf(q) > -1 ||
               String(p.cat || "").toLowerCase().indexOf(q) > -1;
      }).length;
    } catch (e) { return -1; } // unknown
  }
  // Runs the website's existing header search -> opens the Search Results tab.
  function showPackagesOnWebsite(destination) {
    try { if (typeof currentPkgDetail !== "undefined" && currentPkgDetail && typeof closePkgDetailPage === "function") closePkgDetailPage(); } catch (e) {}
    var form = document.getElementById("siteSearchForm");
    var input = document.getElementById("siteSearchInput");
    if (!form || !input) return false;
    input.value = destination;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    return true;
  }
  function whatsappHref(destination) {
    var num = "";
    try { if (typeof WHATSAPP_NUMBER === "string") num = WHATSAPP_NUMBER; } catch (e) {}
    if (!num) return "";
    var msg = encodeURIComponent("Hi! I'm interested in a " + destination + " trip. Please share details.");
    return "https://wa.me/" + num + "?text=" + msg;
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById("tpwcbCss")) return;
    var css =
      ".tpwcb-launch{position:fixed;right:20px;bottom:96px;z-index:100000;display:flex;align-items:center;gap:8px;" +
      "padding:12px 16px 12px 14px;border:0;border-radius:999px;cursor:pointer;color:#fff;font:600 14px/1 Inter,system-ui,sans-serif;" +
      "background:linear-gradient(135deg,#2B3968,#3D5FA8);box-shadow:0 8px 24px rgba(43,57,104,.38);transition:transform .15s ease;}" +
      ".tpwcb-launch:hover{transform:translateY(-2px);}" +
      ".tpwcb-launch svg{width:22px;height:22px;flex:none;}" +
      ".tpwcb-dot{position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#E3A23E;border:2px solid #fff;}" +
      ".tpwcb-launch.tpwcb-hidden{display:none;}" +
      ".tpwcb-panel{position:fixed;right:20px;bottom:20px;z-index:100000;width:372px;max-width:calc(100vw - 24px);" +
      "height:560px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;" +
      "box-shadow:0 18px 60px rgba(10,20,30,.38);font-family:Inter,system-ui,sans-serif;opacity:0;transform:translateY(16px) scale(.97);" +
      "pointer-events:none;transition:opacity .22s ease,transform .22s ease;}" +
      ".tpwcb-panel.tpwcb-open{opacity:1;transform:none;pointer-events:auto;}" +
      ".tpwcb-head{display:flex;align-items:center;gap:10px;padding:14px 14px;color:#fff;background:linear-gradient(135deg,#2B3968,#3D5FA8);}" +
      ".tpwcb-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;}" +
      ".tpwcb-title{flex:1;min-width:0;}" +
      ".tpwcb-title b{display:block;font-size:15px;line-height:1.2;}" +
      ".tpwcb-title span{font-size:12px;opacity:.85;}" +
      ".tpwcb-x{border:0;background:rgba(255,255,255,.16);color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer;}" +
      ".tpwcb-x:hover{background:rgba(255,255,255,.28);}" +
      ".tpwcb-body{flex:1;overflow-y:auto;padding:14px;background:#F5F7FB;display:flex;flex-direction:column;gap:10px;}" +
      ".tpwcb-msg{max-width:84%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word;white-space:pre-wrap;}" +
      ".tpwcb-bot{align-self:flex-start;background:#fff;color:#1d2433;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.08);}" +
      ".tpwcb-user{align-self:flex-end;background:#2B3968;color:#fff;border-bottom-right-radius:4px;}" +
      ".tpwcb-typing{align-self:flex-start;background:#fff;border-radius:14px;border-bottom-left-radius:4px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;gap:4px;}" +
      ".tpwcb-typing i{width:7px;height:7px;border-radius:50%;background:#9aa6c4;animation:tpwcbB 1s infinite ease-in-out;}" +
      ".tpwcb-typing i:nth-child(2){animation-delay:.15s}.tpwcb-typing i:nth-child(3){animation-delay:.3s}" +
      "@keyframes tpwcbB{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}" +
      ".tpwcb-chips{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:96%;}" +
      ".tpwcb-chip{border:1px solid #3D5FA8;background:#fff;color:#2B3968;border-radius:999px;padding:7px 12px;font:600 13px/1 Inter,system-ui,sans-serif;cursor:pointer;}" +
      ".tpwcb-chip:hover{background:#3D5FA8;color:#fff;}" +
      ".tpwcb-actions{display:flex;flex-direction:column;gap:8px;align-self:stretch;}" +
      ".tpwcb-btn{display:block;text-align:center;text-decoration:none;border:0;border-radius:10px;padding:11px 14px;font:600 14px/1.2 Inter,system-ui,sans-serif;cursor:pointer;}" +
      ".tpwcb-btn-pri{background:#E3A23E;color:#1d2433;}" +
      ".tpwcb-btn-sec{background:#25D366;color:#fff;}" +
      ".tpwcb-btn-ter{background:#fff;color:#2B3968;border:1px solid #cfd7ea;}" +
      ".tpwcb-foot{padding:10px 12px;background:#fff;border-top:1px solid #e6eaf3;}" +
      ".tpwcb-form{display:flex;gap:8px;}" +
      ".tpwcb-input{flex:1;min-width:0;border:1px solid #cfd7ea;border-radius:10px;padding:11px 12px;font:400 14px/1.2 Inter,system-ui,sans-serif;outline:none;color:#1d2433;}" +
      ".tpwcb-input:focus{border-color:#3D5FA8;box-shadow:0 0 0 3px rgba(61,95,168,.16);}" +
      ".tpwcb-send{border:0;border-radius:10px;padding:0 16px;background:#2B3968;color:#fff;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;}" +
      ".tpwcb-send:disabled{opacity:.55;cursor:not-allowed;}" +
      ".tpwcb-err{color:#c0392b;font-size:12px;margin:6px 2px 0;min-height:0;}" +
      "@media (max-width:520px){" +
      ".tpwcb-panel{right:12px;left:12px;bottom:12px;width:auto;max-width:none;height:min(600px,calc(100vh - 24px));}" +
      ".tpwcb-launch{right:14px;bottom:92px;}}";
    var st = document.createElement("style");
    st.id = "tpwcbCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- UI ---------- */
  var launch, panel, body, foot, form, input, sendBtn, errEl;
  var step = "destination"; // destination -> name -> phone -> done
  var state = { destination: "", name: "", phone: "" };
  var started = false;
  var busy = false;

  function build() {
    injectCss();

    launch = document.createElement("button");
    launch.type = "button";
    launch.className = "tpwcb-launch tpwcb-hidden";
    launch.setAttribute("aria-label", "Open trip planning chat");
    launch.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      "Plan your trip" + '<span class="tpwcb-dot"></span>';
    launch.addEventListener("click", openPanel);

    panel = document.createElement("div");
    panel.className = "tpwcb-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "TourPackageWala trip assistant");
    panel.innerHTML =
      '<div class="tpwcb-head">' +
      '<div class="tpwcb-avatar">&#9992;&#65039;</div>' +
      '<div class="tpwcb-title"><b>TourPackageWala</b><span>Trip assistant &middot; replies instantly</span></div>' +
      '<button type="button" class="tpwcb-x" aria-label="Close chat">&times;</button></div>' +
      '<div class="tpwcb-body" aria-live="polite"></div>' +
      '<div class="tpwcb-foot"><form class="tpwcb-form" novalidate>' +
      '<input class="tpwcb-input" type="text" autocomplete="off" maxlength="60">' +
      '<button class="tpwcb-send" type="submit">Send</button></form>' +
      '<div class="tpwcb-err"></div></div>';

    document.body.appendChild(launch);
    document.body.appendChild(panel);

    body = panel.querySelector(".tpwcb-body");
    foot = panel.querySelector(".tpwcb-foot");
    form = panel.querySelector(".tpwcb-form");
    input = panel.querySelector(".tpwcb-input");
    sendBtn = panel.querySelector(".tpwcb-send");
    errEl = panel.querySelector(".tpwcb-err");

    panel.querySelector(".tpwcb-x").addEventListener("click", function () {
      ss(KEY_CLOSED, "1");
      closePanel();
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); onSubmit(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("tpwcb-open")) { ss(KEY_CLOSED, "1"); closePanel(); }
    });
  }

  function openPanel() {
    panel.classList.add("tpwcb-open");
    launch.classList.add("tpwcb-hidden");
    if (!started) { started = true; begin(); }
    setTimeout(function () { if (!foot.hidden) input.focus({ preventScroll: true }); }, 250);
  }
  function closePanel() {
    panel.classList.remove("tpwcb-open");
    launch.classList.remove("tpwcb-hidden");
  }

  function scrollDown() { body.scrollTop = body.scrollHeight; }
  function addMsg(text, who) {
    var d = document.createElement("div");
    d.className = "tpwcb-msg " + (who === "user" ? "tpwcb-user" : "tpwcb-bot");
    d.textContent = text;
    body.appendChild(d);
    scrollDown();
    return d;
  }
  function botSay(text, delay) {
    return new Promise(function (resolve) {
      var t = document.createElement("div");
      t.className = "tpwcb-typing";
      t.innerHTML = "<i></i><i></i><i></i>";
      body.appendChild(t);
      scrollDown();
      setTimeout(function () {
        t.remove();
        addMsg(text, "bot");
        resolve();
      }, delay == null ? 550 : delay);
    });
  }
  function clearChips() {
    var old = body.querySelectorAll(".tpwcb-chips,.tpwcb-actions");
    for (var i = 0; i < old.length; i++) old[i].remove();
  }
  function setError(msg) { errEl.textContent = msg || ""; }
  function setInput(placeholder, type, inputmode, maxlen) {
    input.value = "";
    input.placeholder = placeholder;
    input.type = type || "text";
    input.setAttribute("inputmode", inputmode || "text");
    input.maxLength = maxlen || 60;
    foot.hidden = false;
    setError("");
    setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
  }

  /* ---------- conversation flow ---------- */
  var POPULAR = ["Kashmir", "Goa", "Kerala", "Himachal", "Rajasthan", "Bali", "Dubai", "Thailand", "Maldives"];

  function askDestination(isRepeat) {
    step = "destination";
    var p = botSay(isRepeat ? "Which destination would you like to explore next? 🌍" : "Hello! 👋 I'm the TourPackageWala trip assistant.\n\nWhere would you like to travel? Type a destination or pick one below 👇");
    return p.then(function () {
      var wrap = document.createElement("div");
      wrap.className = "tpwcb-chips";
      POPULAR.forEach(function (d) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tpwcb-chip";
        b.textContent = d;
        b.addEventListener("click", function () { if (!busy && step === "destination") handleDestination(d); });
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
      scrollDown();
      setInput("Type destination e.g. Kashmir, Goa, Bali", "text", "text", 60);
    });
  }

  function begin() {
    var saved = null;
    try { saved = JSON.parse(ss(KEY_LEAD) || "null"); } catch (e) {}
    if (saved && saved.name && saved.phone) {
      state.name = saved.name;
      state.phone = saved.phone;
      botSay("Welcome back, " + saved.name + "! 😊", 300).then(function () { askDestination(true); });
    } else {
      askDestination(false);
    }
  }

  function handleDestination(raw) {
    var dest = titleCase(raw);
    if (dest.length < 2) { setError("Please enter a destination."); return; }
    clearChips();
    addMsg(dest, "user");
    state.destination = dest;
    setError("");
    if (state.name && state.phone) { saveLeadAndShow(); return; }
    step = "name";
    botSay("Great choice — " + dest + " is wonderful! ✨\n\nMay I have your name?").then(function () {
      setInput("Your name", "text", "text", 40);
    });
  }

  function handleName(raw) {
    var name = titleCase(raw);
    if (name.length < 2 || !/[a-z\u0900-\u097F]/i.test(name)) { setError("Please enter your name."); return; }
    addMsg(name, "user");
    state.name = name;
    setError("");
    step = "phone";
    botSay("Thanks " + name.split(" ")[0] + "! 🙏\nPlease share your 10-digit contact number — our team will call you with the best price.").then(function () {
      setInput("10-digit mobile number", "tel", "numeric", 14);
    });
  }

  function handlePhone(raw) {
    var phone = cleanPhone(raw);
    if (!/^[0-9]{10}$/.test(phone)) { setError("Please enter a valid 10-digit mobile number."); return; }
    addMsg(phone, "user");
    state.phone = phone;
    setError("");
    saveLeadAndShow();
  }

  function onSubmit() {
    if (busy) return;
    var v = input.value.trim();
    if (!v) return;
    if (step === "destination") handleDestination(v);
    else if (step === "name") handleName(v);
    else if (step === "phone") handlePhone(v);
  }

  function postLead() {
    var ref = readReferral();
    var body = Object.assign({
      name: state.name,
      phone: state.phone,
      interest: "Chatbot enquiry — " + state.destination,
      message: "Website chatbot lead. Destination: " + state.destination + ".",
      source: "chatbot",
      page: "chatbot",
      referralCode: ref.code,
      initialPackage: ref.initialPackage
    }, readAttribution());
    return fetch(api() + "/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        return data;
      });
    });
  }

  function saveLeadAndShow() {
    busy = true;
    sendBtn.disabled = true;
    foot.hidden = true;
    var typing = document.createElement("div");
    typing.className = "tpwcb-typing";
    typing.innerHTML = "<i></i><i></i><i></i>";
    body.appendChild(typing);
    scrollDown();

    postLead().then(function () {
      typing.remove();
      ss(KEY_LEAD, JSON.stringify({ name: state.name, phone: state.phone }));
      try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: "lead_submit", source: "chatbot", interest: state.destination });
        if (typeof gtag === "function") gtag("event", "lead_submit", { source: "chatbot", interest: state.destination });
      } catch (e) {}
      finish();
    }).catch(function (err) {
      typing.remove();
      busy = false;
      sendBtn.disabled = false;
      // Lead could not be saved — let the customer retry the number step.
      step = "phone";
      addMsg("Sorry, something went wrong: " + err.message + "\nPlease try again.", "bot");
      setInput("10-digit mobile number", "tel", "numeric", 14);
      state.phone = "";
      ss(KEY_LEAD, null);
    });
  }

  function finish() {
    var dest = state.destination;
    var first = state.name.split(" ")[0];
    var shown = showPackagesOnWebsite(dest);
    var n = countMatches(dest);
    step = "done";

    var line;
    if (n > 0) line = "Thank you " + first + "! ✅ We've received your details.\n\nWe're showing " + n + " " + dest + " package" + (n > 1 ? "s" : "") + " on the website 👉 Our team will call you shortly.";
    else if (n === 0) line = "Thank you " + first + "! ✅ We've received your details.\n\nWe don't have a ready-made " + dest + " package listed right now, but our team will create a custom package and call you.";
    else line = "Thank you " + first + "! ✅ We've received your details. We're showing " + dest + " packages on the website. Our team will call you shortly.";

    botSay(line, 500).then(function () {
      var acts = document.createElement("div");
      acts.className = "tpwcb-actions";

      if (shown) {
        var view = document.createElement("button");
        view.type = "button";
        view.className = "tpwcb-btn tpwcb-btn-pri";
        view.textContent = "📦 View " + dest + " packages";
        view.addEventListener("click", function () { closePanel(); window.scrollTo({ top: 0, behavior: "smooth" }); });
        acts.appendChild(view);
      }
      var wa = whatsappHref(dest);
      if (wa) {
        var a = document.createElement("a");
        a.className = "tpwcb-btn tpwcb-btn-sec";
        a.href = wa; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "💬 Chat on WhatsApp";
        acts.appendChild(a);
      }
      var again = document.createElement("button");
      again.type = "button";
      again.className = "tpwcb-btn tpwcb-btn-ter";
      again.textContent = "🔍 Explore another destination";
      again.addEventListener("click", function () {
        clearChips(); busy = false; sendBtn.disabled = false; askDestination(true);
      });
      acts.appendChild(again);
      body.appendChild(acts);
      scrollDown();

      busy = false;
      sendBtn.disabled = false;
      // On phones the chat covers the page — tuck it away so the packages are visible.
      if (shown && window.innerWidth <= 520) {
        setTimeout(function () { closePanel(); }, 2200);
      }
    });
  }

  /* ---------- boot ---------- */
  function init() {
    build();
    var leadDone = !!ss(KEY_LEAD);
    var closed = ss(KEY_CLOSED) === "1";
    launch.classList.remove("tpwcb-hidden"); // visible until the panel opens
    if (forced()) { setTimeout(openPanel, 400); return; }
    if (AUTO_OPEN && !closed && !leadDone) setTimeout(openPanel, OPEN_DELAY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
