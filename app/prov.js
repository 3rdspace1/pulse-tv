// Pulse Sport TV: the user's own IPTV provider (Xtream login) on top of the guide. Runs only inside the TizenBrew app,
// where the local helper (service/index.cjs) can reach the provider. Logins stay on this TV; nothing goes to our server.
(function () {
  var SVC = "http://127.0.0.1:8931", BASE = window.PULSE_BASE || "", P, S, on = false;
  var XT = null, CH = null, loading = false, err = "", list = [], idx = 0, ovT = 0, retried = false;
  // Same folder rules as the server's folder map (worker/src/groups.js), so sport folders are kept and the rest dropped.
  var SPORT = /ppv|event|ufc|f1|moto|football|fifa|euroleague|dazn|bein|olympic|nba|nfl|nhl|mlb|rugby|boxing|sport|espn|ncaa|\bmls\b|milb|\bahl\b|peacock|paramount|\btsn\b|sportsnet|\bsn\b|tnt|golf|tennis|cricket|racing|nascar|indycar|wwe|aew|\bpga\b|league|darts|snooker|hockey|basket|baseball|soccer|game ?pass|\bfs1\b|\bfs2\b|\bbtn\b|\bsec\b|\bacc\b|kayo|optus|supersport|viaplay|eleven|arena ?sport|fight|wrestl|nrl|afl|super ?rugby|calcio|futbol|deporte|desporto/i;
  var NONE = /movie|cinema|film|kids|child|cartoon|music|news|doc|relig|islam|christ|quran|adult|xxx|18\+|radio|\bvod\b|series|24\/7|shopping|novela|anime|cooking|lifestyle|reality|comedy|drama/i;
  var BLANK = /^\s*$|no event|event only|^\s*-+\s*$|off ?air|not started/i;
  var SP = [[/nrl|rugby league|state of origin/i, "LEAGUE"], [/rugby/i, "RUGBY"], [/nfl|ncaaf|college football|redzone/i, "AMFOOTBALL"],
    [/nba|wnba|basket|euroleague|nbl/i, "BASKETBALL"], [/nhl|hockey|ahl/i, "HOCKEY"], [/mlb|baseball|milb/i, "BASEBALL"],
    [/ufc|boxing|ppv|fight|mma|box office/i, "FIGHTING"], [/wwe|aew|wrestl/i, "WRESTLING"], [/f1|formula|motogp|moto|nascar|indycar|racing|speedway|supercars/i, "MOTORSPORT"],
    [/cricket|willow|ipl|t20/i, "CRICKET"], [/tennis|atp|wta/i, "TENNIS"], [/golf|pga/i, "GOLF"], [/darts|snooker|pool/i, "CUE"],
    [/football|soccer|premier|epl|la ?liga|serie a|bundesliga|ligue|uefa|champions|mls|spfl|efl|fa cup|dazn|bein|calcio|futbol/i, "FOOTBALL"]];
  var STOP = { fc: 1, cf: 1, afc: 1, sc: 1, ac: 1, cd: 1, united: 1, city: 1, real: 1, club: 1, the: 1, de: 1, cricket: 1, women: 1, rugby: 1, new: 1, san: 1, los: 1, las: 1, state: 1, team: 1, national: 1, county: 1, athletic: 1, sporting: 1 };

  function enc(s) { return encodeURIComponent(s) }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
  function sportOf(t) { for (var i = 0; i < SP.length; i++) if (SP[i][0].test(t)) return SP[i][1]; return "OTHER" }
  function clean(n) { return String(n || "").replace(/^[A-Z]{2,4}(-[A-Z]{2,3})?\s*[|:]\s*/, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim() }
  function evOf(n) { var m = /\[([^\]]+)\]/.exec(n) || /[:|]\s*([^:|]*\s(?:vs?\.?|@)\s[^:|]*)$/i.exec(n); var e = m ? m[1].replace(/\b(hevc|fhd|uhd|hd|4k|sd)\b/gi, "").trim() : ""; return BLANK.test(e) ? "" : e }
  function get(url, cb, bad) {
    var x = new XMLHttpRequest(); x.open("GET", SVC + "/get?u=" + enc(url)); x.timeout = 90000;
    x.onload = function () { if (x.status !== 200) return bad && bad(); var j; try { j = JSON.parse(x.responseText) } catch (e) { return bad && bad() } cb(j) };
    x.onerror = x.ontimeout = function () { bad && bad() }; x.send();
  }
  function api(xt, a, cb, bad) { get(xt.s + "/player_api.php?username=" + enc(xt.u) + "&password=" + enc(xt.p) + (a ? "&action=" + a : ""), cb, bad) }
  function streamUrl(c, viaHelper) {
    var u = XT.s + "/live/" + enc(XT.u) + "/" + enc(XT.p) + "/" + c.id + (window.webapis && webapis.avplay ? ".ts" : ".m3u8");
    return viaHelper ? SVC + "/play?u=" + enc(u) : u;
  }

  // ---- channels ----
  function load() {
    if (!XT || loading) return; loading = true; err = "";
    api(XT, "get_live_categories", function (cats) {
      var keep = {};
      (cats || []).forEach(function (c) { var n = c.category_name || ""; if (SPORT.test(n) && !(NONE.test(n) && !SPORT.test(n))) keep[c.category_id] = n });
      api(XT, "get_live_streams", function (ss) {
        CH = []; (ss || []).forEach(function (s) {
          var f = keep[s.category_id]; if (!f || !s.stream_id) return;
          var name = String(s.name || ""), ev = evOf(name), sp = sportOf(name + " " + f);
          CH.push({ ch: 1, id: s.stream_id, raw: name, name: clean(name) || name, ev: ev, folder: f, sport: sp, img: "/lib/" + sp + "/" + (hash(name) % 8) + ".jpg" });
        });
        loading = false; refresh();
      }, function () { loading = false; err = "Couldn't load your channels. Check the provider details."; refresh() });
    }, function () { loading = false; err = "Couldn't reach your provider."; refresh() });
  }
  function refresh() { if (P && (S.tab === "chan" || S.zone === "detail")) { if (S.tab === "chan") P.build() } }

  function rows() {
    if (!XT) return [["Your provider", [{ ch: 1, add: 1, name: "Add your provider", ev: "Sign in with the Xtream details from your IPTV provider", sport: "OTHER", img: "/lib/OTHER/1.jpg", folder: "Set up" }]]];
    if (!CH) { if (!loading && !err) load(); return [["Your provider", [{ ch: 1, wait: !err, add: !!err, name: err ? "Provider settings" : "Loading your channels", ev: err || "This takes a few seconds the first time", sport: "OTHER", img: "/lib/OTHER/2.jpg", folder: XT.s.replace(/^https?:\/\//, "") }]]] }
    var out = [], live = CH.filter(function (c) { return c.ev });
    if (live.length) out.push(["Events on now", live.slice(0, 40)]);
    var by = {}, order = [];
    CH.forEach(function (c) { if (!by[c.folder]) { by[c.folder] = []; order.push(c.folder) } by[c.folder].push(c) });
    order.slice(0, 24).forEach(function (f) { out.push([f, by[f].slice(0, 60)]) });
    out.push(["Provider", [{ ch: 1, add: 1, name: "Provider settings", ev: CH.length + " sport channels from " + XT.s.replace(/^https?:\/\//, ""), sport: "OTHER", img: "/lib/OTHER/3.jpg", folder: "Settings" }]]);
    return out;
  }

  function card(c) {
    var d = P.el("div", "card ch"), col = P.COL[c.sport] || P.COL.OTHER;
    d.innerHTML = '<img loading="lazy" alt="" src="' + P.esc(BASE + c.img) + '"><div class="sh"></div><div class="tint" style="background:linear-gradient(160deg,' + col + '55 0%,transparent 55%)"></div>' +
      '<div class="lg"><i class="sdot" style="background:' + col + '"></i>' + P.esc(c.folder) + '</div>' +
      '<div class="tx"><h3 class="d">' + P.esc(c.ev || c.name) + '</h3><div class="m">' + (c.ev ? '<span class="st live"><b></b>ON</span>' : '') + '<span>' + P.esc(c.ev ? c.name : (c.add || c.wait ? "" : "Channel")) + '</span></div></div>';
    return d;
  }
  var heroImg = null;
  function hero(c) {
    var a = document.getElementById("heroart"), im = new Image(), col = P.COL[c.sport] || P.COL.OTHER; im.alt = ""; S.want = c.img;
    im.onload = function () { if (S.want !== c.img) return; a.appendChild(im); setTimeout(function () { im.className = "on" }, 30); var o = heroImg; heroImg = im; if (o) setTimeout(function () { o.remove() }, 1300) };
    im.src = BASE + c.img;
    document.getElementById("hero").innerHTML = '<div class="eyebrow"><i class="sdot" style="background:' + col + '"></i>' + P.esc(c.folder) + '</div><h1 class="d">' + P.esc(c.ev || c.name) + '</h1>' +
      '<div class="meta"><span>' + P.esc(c.add ? "Press OK to set up" : c.wait ? "One moment" : c.name + "  ·  OK to watch") + '</span></div>';
  }

  // ---- games -> provider channels ----
  // A team is named by its nickname (last word) or any long word: "Columbus Blue Jackets" -> columbus, jackets (never "blue").
  function words(team) { var w = String(team || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (x) { return x.length >= 3 && !STOP[x] }); return w.filter(function (x, i) { return x.length >= 5 || i === w.length - 1 }) }
  function hit(ws, txt) { for (var i = 0; i < ws.length; i++) if (new RegExp("\\b" + ws[i] + "\\b").test(txt)) return true; return false }
  function matches(g) {
    if (!CH) return [];
    var h = words(g.home), a = words(g.away), out = [];
    if (!h.length && !a.length) return [];
    CH.forEach(function (c) {
      var t = (c.ev + " " + c.raw).toLowerCase(), hh = hit(h, t), aa = hit(a, t);
      if (hh && aa) out.push([2, c]); else if ((hh || aa) && c.ev) out.push([1, c]);
    });
    out.sort(function (x, y) { return y[0] - x[0] });
    return out.slice(0, 8).map(function (x) { return x[1] });
  }
  var lastMatches = [];
  function watch(g) {
    if (!on || !XT) return "";
    if (!CH) { load(); return "" }
    lastMatches = matches(g); if (!lastMatches.length) return '<div class="wh d">On your provider</div><div class="hint">No channel listed for this game yet. Check the Channels tab closer to start.</div>';
    setTimeout(function () { var t = document.querySelectorAll("#detail .tile"); for (var i = 0; i < t.length; i++) t[i].classList.remove("f"); if (t[0]) t[0].classList.add("f"); S.di = 0 }, 0);
    return '<div class="wh d">Watch now</div><div class="svcs">' + lastMatches.map(function (c, i) {
      return '<div class="tile pv" data-i="' + i + '"><b>' + P.esc(c.name) + '</b><span><i class="gdot"></i>On your provider</span></div>'
    }).join("") + '</div>';
  }

  // ---- player ----
  var box, vid, ov, av = null;
  function ui() {
    if (box) return;
    var st = document.createElement("style");
    st.textContent = '#pv{position:absolute;inset:0;z-index:50;background:#000;display:none}#pv.open{display:block}#pv video,#pv object{position:absolute;inset:0;width:100%;height:100%}' +
      '#pvo{position:absolute;left:0;right:0;bottom:0;padding:60px 120px 70px;background:linear-gradient(0deg,rgba(0,0,0,.85),transparent);transition:opacity .4s}#pvo.hide{opacity:0}' +
      '#pvo .n{font:600 30px/1 Inter,sans-serif;color:#9aa3b8;margin-bottom:14px;letter-spacing:.04em;text-transform:uppercase}#pvo h2{font-size:64px;margin:0}#pvo .k{margin-top:18px;font-size:24px;color:#9aa3b8}' +
      '#pvs{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px;border-radius:50%;border:5px solid rgba(255,255,255,.15);border-top-color:#ff3b5c;animation:pvr 1s linear infinite}#pvs.hide{display:none}@keyframes pvr{to{transform:rotate(360deg)}}' +
      '#pvm{position:absolute;left:0;right:0;top:46%;text-align:center;font-size:34px;color:#fff;display:none}' +
      '.card.ch .tint{position:absolute;inset:0}' +
      '#lg{position:absolute;inset:0;z-index:40;display:none;padding:120px 140px;background:radial-gradient(120% 90% at 85% 0%,#1a1f35 0%,#06070b 60%)}#lg.open{display:block}#lg h1{font-size:96px;margin:0 0 8px}' +
      '#lg label{display:block;font-size:26px;color:#9aa3b8;margin:34px 0 12px}#lg input{width:1100px;font:500 38px Inter,sans-serif;color:#fff;background:rgba(255,255,255,.06);border:3px solid transparent;border-radius:14px;padding:20px 26px;outline:0}' +
      '#lg .f{border-color:#fff!important;background:rgba(255,255,255,.12)!important}#lg .row2{display:flex;gap:24px;margin-top:48px}#lg .b{font:600 32px Inter,sans-serif;padding:20px 44px;border-radius:14px;background:rgba(255,255,255,.08);border:3px solid transparent}' +
      '#lg .b.go{background:#ff3b5c}#lg .msg{margin-top:28px;font-size:28px;color:#ffb3c0;min-height:34px}#lg .hint{font-size:26px;color:#9aa3b8}';
    document.head.appendChild(st);
    box = document.createElement("div"); box.id = "pv";
    av = window.webapis && webapis.avplay && typeof webapis.avplay.open === "function" ? webapis.avplay : null;
    box.innerHTML = (av ? '<object id="pvobj" type="application/avplayer"></object>' : '<video id="pvv" autoplay></video>') + '<div id="pvs"></div><div id="pvm"></div><div id="pvo"><div class="n"></div><h2 class="d"></h2><div class="k">▲ ▼ change channel  ·  Back to the guide</div></div>';
    document.body.appendChild(box); vid = document.getElementById("pvv"); ov = document.getElementById("pvo");
    if (vid) { vid.addEventListener("playing", function () { spin(false) }); vid.addEventListener("error", failed) }
  }
  function spin(b) { document.getElementById("pvs").className = b ? "" : "hide" }
  function msg(t) { var m = document.getElementById("pvm"); m.textContent = t || ""; m.style.display = t ? "block" : "none" }
  function overlay() { ov.className = ""; clearTimeout(ovT); ovT = setTimeout(function () { ov.className = "hide" }, 4000) }
  function stop() { try { if (av) { av.stop(); av.close() } else if (vid) { vid.pause(); vid.removeAttribute("src"); vid.load() } } catch (e) {} }
  function failed() { if (!retried) { retried = true; start(true) } else { spin(false); msg("This channel isn't playing right now. Try another with ▲ ▼") } }
  function start(viaHelper) {
    var c = list[idx], u = streamUrl(c, viaHelper); stop(); spin(true); msg("");
    ov.querySelector(".n").textContent = c.folder; ov.querySelector("h2").textContent = c.ev || c.name; overlay();
    if (av) {
      try {
        av.open(u); av.setDisplayRect(0, 0, 1920, 1080);
        av.setListener({ onbufferingstart: function () { spin(true) }, onbufferingcomplete: function () { spin(false) }, onerror: failed, onstreamcompleted: failed });
        av.prepareAsync(function () { av.play(); spin(false) }, failed);
      } catch (e) { failed() }
    } else { vid.src = u; var p = vid.play(); if (p && p.catch) p.catch(function () {}) }
  }
  function play(c, lst) {
    if (c.add) return login(); if (c.wait) return;
    ui(); list = lst && lst.length ? lst : [c]; idx = Math.max(0, list.indexOf(c)); retried = false;
    S.prevZone = S.zone; S.zone = "player"; box.className = "open"; start(false);
  }
  function zap(d) { idx = (idx + d + list.length) % list.length; retried = false; start(false) }
  function closePlayer() { stop(); box.className = ""; S.zone = S.prevZone || "rows"; P.focus() }

  // ---- provider login (Xtream) ----
  var lg, li = 0;
  function login() {
    ui();
    if (!lg) { lg = document.createElement("div"); lg.id = "lg"; document.body.appendChild(lg) }
    var x = XT || { s: "", u: "", p: "" };
    lg.innerHTML = '<h1 class="d">Your provider</h1><div class="hint">Enter the Xtream login your IPTV provider gave you. It stays on this TV.</div>' +
      '<label>Server address</label><input id="xs" placeholder="http://example.com:8080" value="' + P.esc(x.s) + '">' +
      '<label>Username</label><input id="xu" value="' + P.esc(x.u) + '"><label>Password</label><input id="xp" type="password" value="' + P.esc(x.p) + '">' +
      '<div class="row2"><div class="b go">Connect</div>' + (XT ? '<div class="b rm">Remove provider</div>' : '') + '<div class="b cx">Cancel</div></div><div class="msg"></div>';
    lg.className = "open"; S.prevZone = S.zone === "player" ? "rows" : S.zone; S.zone = "login"; li = 0; lf();
  }
  function items() { return lg.querySelectorAll("input,.b") }
  function lf() { var it = items(); for (var i = 0; i < it.length; i++) it[i].classList.remove("f"); it[li].classList.add("f") }
  function closeLogin() { lg.className = ""; S.zone = "nav"; P.build() }
  function connect() {
    var s = document.getElementById("xs").value.trim().replace(/\/+$/, ""), u = document.getElementById("xu").value.trim(), p = document.getElementById("xp").value;
    if (s && !/^https?:\/\//i.test(s)) s = "http://" + s;
    var m = lg.querySelector(".msg"); if (!s || !u || !p) { m.textContent = "Fill in all three."; return }
    m.textContent = "Checking…";
    api({ s: s, u: u, p: p }, "", function (j) {
      if (!j || !j.user_info || String(j.user_info.auth) !== "1") { m.textContent = "That login didn't work. Check the details."; return }
      XT = { s: s, u: u, p: p }; P.ls("xt", XT); CH = null; err = ""; S.tab = "chan"; closeLogin();
    }, function () { m.textContent = "Couldn't reach that server. Check the address and port." });
  }

  // ---- remote ----
  function key(e) {
    var k = e.keyCode, BACK = k === 10009 || k === 27 || k === 461, OK = k === 13;
    if (S.zone === "player") {
      if (BACK) closePlayer(); else if (k === 38 || k === 427) zap(-1); else if (k === 40 || k === 428) zap(1); else overlay();
      e.preventDefault(); return true;
    }
    if (S.zone === "login") {
      var it = items(), a = document.activeElement;
      if (a && a.tagName === "INPUT") {
        if (OK || k === 65376 || k === 65385 || BACK) { a.blur(); if (BACK) e.preventDefault() }
        return true; // let the TV keyboard type
      }
      if (BACK) { closeLogin(); e.preventDefault(); return true }
      if (k === 38 || k === 37) li = Math.max(0, li - 1); if (k === 40 || k === 39) li = Math.min(it.length - 1, li + 1);
      if (OK) { var x = it[li]; if (x.tagName === "INPUT") x.focus(); else if (x.classList.contains("go")) connect(); else if (x.classList.contains("rm")) { XT = null; CH = null; P.ls("xt", null); closeLogin() } else closeLogin() }
      lf(); e.preventDefault(); return true;
    }
    if (S.zone === "detail" && OK) {
      var f = document.querySelector("#detail .tile.f");
      if (f && f.classList.contains("pv")) { document.getElementById("detail").classList.remove("open"); S.zone = "rows"; play(lastMatches[+f.dataset.i], lastMatches); e.preventDefault(); return true }
    }
    return false;
  }

  window.PulseHooks = {
    tabs: function (t) { if (on) t.splice(2, 0, ["chan", "Channels"]) },
    rows: function (tab) { return on && tab === "chan" ? rows() : null },
    card: card, hero: hero, watch: watch, key: key,
    play: function (c) { var r = S.rows[S.ri]; play(c, r ? r[1].filter(function (x) { return !x.add && !x.wait }) : null) },
    ready: function (p) {
      P = p; S = p.S; XT = p.ls("xt") || null;
      var x = new XMLHttpRequest(); x.open("GET", SVC + "/health"); x.timeout = 4000;
      x.onload = function () { if (x.status === 200) { on = true; if (XT) load(); if (S.data) P.build() } };
      x.send();
    }
  };
})();
