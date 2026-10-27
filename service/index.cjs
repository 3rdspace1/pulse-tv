/*
 * Pulse Sport TV local helper (TizenBrew serviceFile). Runs ON the TV, never on our server.
 * The page can't read the user's IPTV provider directly (CORS, http from a sandboxed page, redirects AVPlay won't follow),
 * so this tiny server on 127.0.0.1 fetches it for the page:
 *   GET /health       -> "ok"
 *   GET /get?u=URL    -> the provider's API reply (JSON / M3U), with CORS opened for the page
 *   GET /play?u=URL   -> the live stream, redirects resolved, for players that choke on them
 * Conservative CommonJS so it runs on whatever Node the TizenBrew service runtime has.
 */
"use strict";
var http = require("http"), https = require("https"), parse = require("url").parse;
var PORT = 8931, UA = "PulseSport/0.1 (SmartTV; Tizen)";

function upstream(u, hops, onRes, onErr) {
  var o = parse(u), lib = o.protocol === "https:" ? https : http;
  if (!/^https?:$/.test(o.protocol || "")) return onErr(new Error("bad url"));
  var req = lib.get({ hostname: o.hostname, port: o.port, path: o.path, headers: { "User-Agent": UA, "Accept": "*/*" }, rejectUnauthorized: false }, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) {
      res.resume();
      return upstream(require("url").resolve(u, res.headers.location), hops + 1, onRes, onErr);
    }
    onRes(res);
  });
  req.setTimeout(30000, function () { req.abort(); onErr(new Error("timeout")); });
  req.on("error", onErr);
  return req;
}

http.createServer(function (req, res) {
  var q = parse(req.url, true), cors = { "Access-Control-Allow-Origin": "*" };
  if (q.pathname === "/health") { res.writeHead(200, cors); return res.end("ok"); }
  var u = q.query && q.query.u;
  if ((q.pathname !== "/get" && q.pathname !== "/play") || !u) { res.writeHead(404, cors); return res.end(); }
  var done = false;
  var up = upstream(u, 0, function (r) {
    var h = { "Access-Control-Allow-Origin": "*", "Content-Type": r.headers["content-type"] || "application/octet-stream", "Cache-Control": "no-store" };
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  }, function () { if (!done && !res.headersSent) { res.writeHead(502, cors); res.end(); } done = true; });
  req.on("close", function () { done = true; try { up && up.abort(); } catch (e) {} });
}).listen(PORT, "127.0.0.1");
