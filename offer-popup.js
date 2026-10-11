/* ===========================================================
   AdmireDworld Travel — Festival Offer Popup
   -----------------------------------------------------------
   NEW, fully self-contained file. It injects its own CSS + HTML, so
   script.js and style.css are NOT touched.

   What it does: on the HOME page only, ~3 seconds after the page opens,
   shows the offer image that the admin switched ON in
   Admin Dashboard -> "Festival Offers". If nothing is ON, nothing shows.

   Tweaks (constants below):
     - SHOW_DELAY_MS   : delay before the popup appears (default 3000)
     - SHOW_ONCE_PER_SESSION : true  -> a visitor sees a given offer once per
                                        browser session (closing it and
                                        refreshing won't nag them again)
                               false -> shows on every home page load
   Testing: open the site with  ?showoffer=1  to force it to appear even if
   you've already closed it in this session, e.g.  https://yoursite.com/?showoffer=1
=========================================================== */
(function () {
  "use strict";

  var SHOW_DELAY_MS = 3000;
  var SHOW_ONCE_PER_SESSION = true;
  var FALLBACK_API = "https://tourpackagewala-backend.onrender.com";

  // Reuse the site's API_BASE_URL (declared in script.js) when available.
  var API = FALLBACK_API;
  try { if (typeof API_BASE_URL === "string" && API_BASE_URL) API = API_BASE_URL; } catch (e) {}

  function isHomePage() {
    var path = location.pathname.replace(/\/+$/, "");
    var onIndex = path === "" || path === "/index.html";
    var hash = location.hash.replace("#", "");
    return onIndex && (hash === "" || hash === "home");
  }

  function seenKey(o) { return "aw_offer_seen_" + o.id + "_v" + o.version; }
  function alreadySeen(o) {
    try { return sessionStorage.getItem(seenKey(o)) === "1"; } catch (e) { return false; }
  }
  function markSeen(o) {
    try { sessionStorage.setItem(seenKey(o), "1"); } catch (e) {}
  }
  function forced() { return /[?&]showoffer=1\b/.test(location.search); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectCss() {
    if (document.getElementById("awOfferCss")) return;
    var css =
      ".aw-offer-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
      "padding:16px;background:rgba(10,20,30,.62);opacity:0;transition:opacity .25s ease;}" +
      ".aw-offer-overlay.show{opacity:1;}" +
      ".aw-offer-box{position:relative;width:min(92vw,480px);max-height:92vh;background:#fff;border-radius:16px;" +
      "overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);transform:translateY(14px) scale(.97);" +
      "transition:transform .25s ease;display:flex;flex-direction:column;}" +
      ".aw-offer-overlay.show .aw-offer-box{transform:none;}" +
      ".aw-offer-img{display:block;width:100%;height:auto;max-height:calc(92vh - 56px);object-fit:contain;background:#f4f4f4;}" +
      ".aw-offer-title{margin:0;padding:12px 16px;font:700 15px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#12263a;text-align:center;background:#fff;}" +
      ".aw-offer-close{position:absolute;top:8px;right:8px;width:34px;height:34px;border:0;border-radius:50%;" +
      "background:rgba(0,0,0,.6);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:flex;" +
      "align-items:center;justify-content:center;padding:0;}" +
      ".aw-offer-close:hover{background:rgba(0,0,0,.85);}" +
      "@media (prefers-reduced-motion:reduce){.aw-offer-overlay,.aw-offer-box{transition:none;}}";
    var st = document.createElement("style");
    st.id = "awOfferCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function showPopup(offer, imgEl) {
    if (document.getElementById("awOfferOverlay")) return;
    injectCss();

    var overlay = document.createElement("div");
    overlay.className = "aw-offer-overlay";
    overlay.id = "awOfferOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", offer.title);
    overlay.innerHTML =
      '<div class="aw-offer-box">' +
      '<button type="button" class="aw-offer-close" aria-label="Close offer">&times;</button>' +
      '<div class="aw-offer-imgwrap"></div>' +
      '<p class="aw-offer-title">' + esc(offer.title) + "</p>" +
      "</div>";
    overlay.querySelector(".aw-offer-imgwrap").appendChild(imgEl);

    var prevOverflow = document.body.style.overflow;
    function close() {
      overlay.classList.remove("show");
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 260);
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".aw-offer-close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    markSeen(offer);
    requestAnimationFrame(function () { requestAnimationFrame(function () { overlay.classList.add("show"); }); });
    try { overlay.querySelector(".aw-offer-close").focus(); } catch (e) {}
  }

  function run() {
    if (!isHomePage()) return;

    var startedAt = Date.now();
    fetch(API + "/api/offers/active", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var offer = data && data.offer;
        if (!offer || !offer.imagePath) return;
        if (SHOW_ONCE_PER_SESSION && !forced() && alreadySeen(offer)) return;

        // Preload the image so the popup never opens as an empty box.
        var img = new Image();
        img.className = "aw-offer-img";
        img.alt = offer.title;
        img.decoding = "async";
        img.onload = function () {
          // Wait out whatever is left of the 3 seconds (counted from page load).
          var wait = Math.max(0, SHOW_DELAY_MS - (Date.now() - startedAt));
          setTimeout(function () {
            // Visitor may have moved to another tab/page meanwhile — then skip.
            if (!isHomePage()) return;
            showPopup(offer, img);
          }, wait);
        };
        img.onerror = function () { /* image failed — show nothing rather than a broken box */ };
        img.src = API + offer.imagePath;
      })
      .catch(function () { /* backend asleep/offline — the site works exactly as before */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
