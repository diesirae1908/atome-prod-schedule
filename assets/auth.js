/**
 * Shared Supabase Auth gate for prod-schedule pages that talk to Supabase
 * (index.html, kanban.html, outputs.html, headpaper/index.html).
 *
 * Include AFTER the supabase-js CDN <script> tag and BEFORE any inline
 * script that reads window.AtomeAuth, as early in <head> as possible so the
 * blocking overlay appears before any protected content is usable:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="assets/auth.js"></script>   (or "../assets/auth.js" from a subfolder)
 *
 * Page scripts should:
 *   1. `await window.AtomeAuth.ready;` before the first Supabase call.
 *   2. Use `window.AtomeAuth.getAccessToken()` as the Authorization Bearer
 *      token for /rest/v1/<table> calls (keep the apikey header as the
 *      existing publishable key — Supabase still needs it to identify the
 *      project). Edge Function calls (/functions/v1/...) are unaffected and
 *      can keep using the publishable key.
 *
 * There is intentionally no sign-up UI anywhere in this file — accounts are
 * provisioned out-of-band (Supabase dashboard / admin API), never self-serve.
 */
(function () {
  "use strict";

  var SUPA_URL = "https://ktbbmtyesrprvxrseiph.supabase.co";
  var SUPA_ANON_KEY = "sb_publishable_1vfCHnng8kWfUGFtOt9Dmw_Rzkn8M62";

  // Hide the page behind a solid curtain the instant this script runs, before
  // we even know whether a session exists — avoids any flash of protected
  // content. Removed once auth resolves (existing session or fresh login).
  var curtainStyle = document.createElement("style");
  curtainStyle.id = "atomeAuthCurtainStyle";
  curtainStyle.textContent =
    "html.atome-auth-pending body > *:not(#atomeAuthOverlay) { visibility: hidden !important; }";
  (document.head || document.documentElement).appendChild(curtainStyle);
  document.documentElement.classList.add("atome-auth-pending");

  if (!window.supabase || !window.supabase.createClient) {
    // Fail closed: if supabase-js didn't load (CDN blocked, offline, etc.)
    // leave the curtain up rather than silently exposing the page.
    console.error("[AtomeAuth] supabase-js failed to load from CDN.");
    document.addEventListener("DOMContentLoaded", function () {
      var el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;" +
        "justify-content:center;background:#1e1b4b;color:#fff;font:14px -apple-system,sans-serif;" +
        "text-align:center;padding:20px;visibility:visible;";
      el.textContent =
        "Could not load the sign-in library (offline or CDN blocked). Reload the page once you're back online.";
      document.body.appendChild(el);
    });
    return;
  }

  var client = window.supabase.createClient(SUPA_URL, SUPA_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "atome-prod-schedule-auth",
    },
  });

  var currentSession = null;
  var resolveReady;
  var ready = new Promise(function (res) {
    resolveReady = res;
  });
  var overlay = null;

  function removeCurtain() {
    document.documentElement.classList.remove("atome-auth-pending");
  }

  function buildOverlay() {
    var el = document.createElement("div");
    el.id = "atomeAuthOverlay";
    el.style.visibility = "visible";
    el.innerHTML =
      "<style>" +
      "#atomeAuthOverlay{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;" +
      'justify-content:center;background:#1e1b4b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;visibility:visible;}' +
      "#atomeAuthOverlay .box{background:#fff;border-radius:14px;padding:36px 32px;width:320px;max-width:90vw;" +
      "box-shadow:0 10px 40px rgba(0,0,0,.35);}" +
      "#atomeAuthOverlay h1{font-size:19px;font-weight:800;color:#1e1b4b;margin:0 0 4px;display:flex;align-items:center;gap:8px;}" +
      "#atomeAuthOverlay p.sub{font-size:12px;color:#6b7280;margin:0 0 20px;}" +
      "#atomeAuthOverlay label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;}" +
      "#atomeAuthOverlay input{width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;" +
      "margin-bottom:14px;box-sizing:border-box;font-family:inherit;}" +
      "#atomeAuthOverlay input:focus{outline:none;border-color:#4338ca;}" +
      "#atomeAuthOverlay button{width:100%;padding:10px;border:none;border-radius:8px;background:#4338ca;color:#fff;" +
      "font-size:14px;font-weight:700;cursor:pointer;transition:background .15s;font-family:inherit;}" +
      "#atomeAuthOverlay button:hover{background:#3730a3;}" +
      "#atomeAuthOverlay button:disabled{opacity:.6;cursor:default;}" +
      "#atomeAuthOverlay .err{color:#dc2626;font-size:12px;margin:-6px 0 12px;min-height:14px;}" +
      "</style>" +
      '<div class="box">' +
      "<h1>🥖 Atome Bakery</h1>" +
      '<p class="sub">Sign in to open the production schedule.</p>' +
      '<form id="atomeAuthForm" autocomplete="on">' +
      "<label>Email</label>" +
      '<input type="email" id="atomeAuthEmail" autocomplete="username" required />' +
      "<label>Password</label>" +
      '<input type="password" id="atomeAuthPassword" autocomplete="current-password" required />' +
      '<div class="err" id="atomeAuthErr"></div>' +
      '<button type="submit" id="atomeAuthSubmit">Sign in</button>' +
      "</form>" +
      "</div>";
    return el;
  }

  function showOverlay() {
    if (overlay) return;
    overlay = buildOverlay();
    (document.body || document.documentElement).appendChild(overlay);

    var form = overlay.querySelector("#atomeAuthForm");
    var errEl = overlay.querySelector("#atomeAuthErr");
    var btn = overlay.querySelector("#atomeAuthSubmit");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = overlay.querySelector("#atomeAuthEmail").value.trim();
      var password = overlay.querySelector("#atomeAuthPassword").value;
      errEl.textContent = "";
      btn.disabled = true;
      btn.textContent = "Signing in…";
      client.auth
        .signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) {
            errEl.textContent = res.error.message || "Sign-in failed.";
            btn.disabled = false;
            btn.textContent = "Sign in";
            return;
          }
          currentSession = res.data.session;
          hideOverlay();
          removeCurtain();
          resolveReady(currentSession);
        })
        .catch(function (e) {
          errEl.textContent = (e && e.message) || "Sign-in failed.";
          btn.disabled = false;
          btn.textContent = "Sign in";
        });
    });
  }

  function hideOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function injectSignOutBadge() {
    if (document.getElementById("atomeAuthBadge")) return;
    var badge = document.createElement("div");
    badge.id = "atomeAuthBadge";
    var email = (currentSession && currentSession.user && currentSession.user.email) || "";
    badge.style.cssText =
      "position:fixed;bottom:10px;right:10px;z-index:99998;display:flex;align-items:center;gap:8px;" +
      "background:rgba(30,27,75,.92);color:#c7d2fe;padding:6px 10px;border-radius:999px;" +
      'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      "box-shadow:0 2px 10px rgba(0,0,0,.25);";
    badge.innerHTML =
      '<span style="opacity:.85;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      (email || "Signed in") +
      "</span>" +
      '<button id="atomeAuthSignOut" style="background:#4338ca;color:#fff;border:none;border-radius:999px;' +
      'padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">Sign out</button>';
    document.body.appendChild(badge);
    badge.querySelector("#atomeAuthSignOut").addEventListener("click", function () {
      if (!confirm("Sign out of Atome Bakery tools on this device?")) return;
      client.auth.signOut().then(function () {
        window.location.reload();
      });
    });
  }

  client.auth.onAuthStateChange(function (_event, session) {
    currentSession = session;
  });

  function onAuthed(session) {
    currentSession = session;
    hideOverlay();
    removeCurtain();
    var afterBodyReady = document.body
      ? Promise.resolve()
      : new Promise(function (res) {
          document.addEventListener("DOMContentLoaded", res, { once: true });
        });
    afterBodyReady.then(injectSignOutBadge);
    resolveReady(session);
  }

  function init() {
    client.auth
      .getSession()
      .then(function (res) {
        var session = res.data && res.data.session;
        if (session) {
          onAuthed(session);
        } else {
          showOverlay();
        }
      })
      .catch(function () {
        showOverlay();
      });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  window.AtomeAuth = {
    client: client,
    ready: ready,
    getAccessToken: function () {
      return currentSession ? currentSession.access_token : null;
    },
    getUserEmail: function () {
      return (currentSession && currentSession.user && currentSession.user.email) || null;
    },
    signOut: function () {
      return client.auth.signOut().then(function () {
        window.location.reload();
      });
    },
  };
})();
