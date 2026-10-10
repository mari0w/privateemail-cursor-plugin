import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProxyUrl, resolveProxyUrl } from "../proxy.js";

test("The sandbox proxy has priority over all standard proxy variables", () => {
  assert.equal(resolveProxyUrl({
    SAND_EGRESS_TUNNEL_PROXY_ADDR: "127.0.0.1:8791",
    HTTPS_PROXY: "http://https.example.com:8080",
    https_proxy: "http://lowercase-https.example.com:8080",
    HTTP_PROXY: "http://http.example.com:8080",
    http_proxy: "http://lowercase-http.example.com:8080",
    ALL_PROXY: "http://all.example.com:8080",
    all_proxy: "http://lowercase-all.example.com:8080",
  }), "http://127.0.0.1:8791");
});

test("Standard proxy variables use HTTPS, HTTP, then ALL priority", () => {
  const env = {
    HTTPS_PROXY: "http://https.example.com:8080",
    HTTP_PROXY: "http://http.example.com:8080",
    ALL_PROXY: "http://all.example.com:8080",
  };
  assert.equal(resolveProxyUrl(env), env.HTTPS_PROXY);
  delete env.HTTPS_PROXY;
  assert.equal(resolveProxyUrl(env), env.HTTP_PROXY);
  delete env.HTTP_PROXY;
  assert.equal(resolveProxyUrl(env), env.ALL_PROXY);
});

test("Each lowercase proxy variable works", () => {
  for (const key of ["https_proxy", "http_proxy", "all_proxy"]) {
    assert.equal(resolveProxyUrl({ [key]: "127.0.0.1:8791" }), "http://127.0.0.1:8791");
  }
});

test("Each uppercase proxy variable has priority over its lowercase form", () => {
  for (const key of ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"]) {
    assert.equal(resolveProxyUrl({
      [key]: "http://uppercase.example.com:8080",
      [key.toLowerCase()]: "http://lowercase.example.com:8080",
    }), "http://uppercase.example.com:8080");
  }
});

test("Lowercase proxy variables keep HTTPS, HTTP, then ALL priority", () => {
  assert.equal(resolveProxyUrl({
    https_proxy: "http://https.example.com:8080",
    HTTP_PROXY: "http://http.example.com:8080",
    ALL_PROXY: "http://all.example.com:8080",
  }), "http://https.example.com:8080");
  assert.equal(resolveProxyUrl({
    http_proxy: "http://http.example.com:8080",
    ALL_PROXY: "http://all.example.com:8080",
  }), "http://http.example.com:8080");
});

test("A proxy address without a scheme gets the HTTP scheme", () => {
  assert.equal(normalizeProxyUrl("127.0.0.1:8791"), "http://127.0.0.1:8791");
  assert.equal(normalizeProxyUrl("  proxy.example.com:8080  "), "http://proxy.example.com:8080");
});

test("A proxy URL with a scheme keeps its value and loses outer spaces", () => {
  for (const url of [
    "http://127.0.0.1:8791",
    "https://proxy.example.com:8080",
    "socks5://user:pass@proxy.example.com:1080",
  ]) {
    assert.equal(normalizeProxyUrl(`  ${url}  `), url);
  }
});

test("Unset and blank proxy values permit a direct connection", () => {
  for (const value of [undefined, null, "", "  \t\n  "]) {
    assert.equal(normalizeProxyUrl(value), undefined);
    assert.equal(resolveProxyUrl({
      SAND_EGRESS_TUNNEL_PROXY_ADDR: value,
      HTTPS_PROXY: value,
      https_proxy: value,
      HTTP_PROXY: value,
      http_proxy: value,
      ALL_PROXY: value,
      all_proxy: value,
    }), undefined);
  }
  assert.equal(resolveProxyUrl({}), undefined);
});

test("Blank proxy variables fall through to the next variable", () => {
  assert.equal(resolveProxyUrl({
    SAND_EGRESS_TUNNEL_PROXY_ADDR: "  ",
    HTTPS_PROXY: "",
    https_proxy: " \t ",
    HTTP_PROXY: "  http://http.example.com:8080  ",
  }), "http://http.example.com:8080");
  for (const key of ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"]) {
    assert.equal(resolveProxyUrl({
      [key]: "  ",
      [key.toLowerCase()]: "http://lowercase.example.com:8080",
    }), "http://lowercase.example.com:8080");
  }
});
