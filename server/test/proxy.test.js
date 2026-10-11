import test from "node:test";
import assert from "node:assert/strict";
import httpProxyClient from "nodemailer/lib/smtp-connection/http-proxy-client.js";
import { normalizeProxyUrl, resolveProxyUrl } from "../proxy.js";

let moduleId = 0;
const freshProxy = () => import(`../proxy.js?test=${moduleId++}`);
const proxyUrl = "http://127.0.0.1:8791";
const failure = (properties) => Object.assign(new Error("Connection failed"), properties);

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

test("IMAP proxy timeout falls back and remembers direct connections", async () => {
  const { connectImap } = await freshProxy();
  const attempts = [];
  const closed = [];
  const createClient = (options) => {
    assert.equal(options.connectionTimeout, 10_000);
    assert.equal(options.greetingTimeout, 5_000);
    attempts.push(options.proxy);
    return {
      async connect() {
        if (options.proxy) throw failure({ code: "CONNECT_TIMEOUT" });
      },
      close() { closed.push(options.proxy); },
    };
  };
  await connectImap(createClient, {}, proxyUrl);
  await connectImap(createClient, {}, proxyUrl);
  assert.deepEqual(attempts, [proxyUrl, undefined, undefined]);
  assert.deepEqual(closed, [proxyUrl]);
});

test("IMAP connection refusal and greeting timeout permit direct fallback", async () => {
  for (const code of ["ECONNREFUSED", "GREETING_TIMEOUT"]) {
    const { connectImap } = await freshProxy();
    const attempts = [];
    await connectImap((options) => ({
      async connect() {
        attempts.push(options.proxy);
        if (options.proxy) throw failure({ code });
      },
      close() {},
    }), {}, proxyUrl);
    assert.deepEqual(attempts, [proxyUrl, undefined]);
  }
});

test("IMAP authentication failure through the proxy does not fall back", async () => {
  const { connectImap } = await freshProxy();
  const error = failure({ authenticationFailed: true, serverResponseCode: "AUTHENTICATIONFAILED" });
  const attempts = [];
  await assert.rejects(connectImap((options) => ({
    async connect() {
      attempts.push(options.proxy);
      throw error;
    },
    close() {},
  }), {}, proxyUrl), (caught) => caught === error);
  assert.deepEqual(attempts, [proxyUrl]);
});

test("IMAP errors after the greeting do not fall back", async () => {
  const { connectImap } = await freshProxy();
  const error = failure({ code: "ECONNRESET" });
  const attempts = [];
  await assert.rejects(connectImap((options) => ({
    greetingReceived: true,
    async connect() {
      attempts.push(options.proxy);
      throw error;
    },
    close() {},
  }), {}, proxyUrl), (caught) => caught === error);
  assert.deepEqual(attempts, [proxyUrl]);
});

test("SMTP proxy timeout falls back before sending and remembers direct connections", async () => {
  for (const command of [undefined, "CONN"]) {
    const { sendSmtp } = await freshProxy();
    const attempts = [];
    const sends = [];
    const closed = [];
    const message = { text: "Mock message" };
    const createTransport = (options) => {
      assert.equal(options.connectionTimeout, 5_000);
      assert.equal(options.greetingTimeout, 5_000);
      attempts.push(options.proxy);
      return {
        async verify() {
          if (options.proxy) throw failure({ code: "ETIMEDOUT", command });
        },
        async sendMail(received) {
          assert.equal(received, message);
          sends.push(options.proxy);
          return "sent";
        },
        close() { closed.push(options.proxy); },
      };
    };
    assert.equal(await sendSmtp(createTransport, {}, message, proxyUrl), "sent");
    assert.equal(await sendSmtp(createTransport, {}, message, proxyUrl), "sent");
    assert.deepEqual(attempts, [proxyUrl, undefined, undefined]);
    assert.deepEqual(sends, [undefined, undefined]);
    assert.deepEqual(closed, [proxyUrl, undefined, undefined]);
  }
});

test("SMTP authentication failure through the proxy does not fall back or send", async () => {
  const { sendSmtp } = await freshProxy();
  const error = failure({ code: "EAUTH", command: "AUTH PLAIN" });
  const attempts = [];
  let closed = 0;
  await assert.rejects(sendSmtp((options) => ({
    async verify() {
      attempts.push(options.proxy);
      throw error;
    },
    async sendMail() { assert.fail("Authentication failure must not send"); },
    close() { closed++; },
  }), {}, {}, proxyUrl), (caught) => caught === error);
  assert.deepEqual(attempts, [proxyUrl]);
  assert.equal(closed, 1);
});

test("SMTP errors after verification never retry, including socket errors marked CONN", async () => {
  for (const properties of [
    { code: "EMESSAGE", command: "DATA" },
    { code: "ESOCKET", command: "CONN" },
    { code: "EAUTH", command: "AUTH PLAIN" },
  ]) {
    const { sendSmtp } = await freshProxy();
    const error = failure(properties);
    const attempts = [];
    let sends = 0;
    let closed = 0;
    await assert.rejects(sendSmtp((options) => ({
      async verify() { attempts.push(options.proxy); },
      async sendMail() {
        sends++;
        throw error;
      },
      close() { closed++; },
    }), {}, {}, proxyUrl), (caught) => caught === error);
    assert.deepEqual(attempts, [proxyUrl]);
    assert.equal(sends, 1);
    assert.equal(closed, 1);
  }
});

test("No proxy uses direct connections only", async () => {
  const { connectImap, sendSmtp } = await freshProxy();
  const attempts = [];
  await connectImap((options) => ({
    async connect() { attempts.push(options.proxy); },
  }), {}, undefined);
  await sendSmtp((options) => ({
    async verify() { attempts.push(options.proxy); },
    async sendMail() { return "sent"; },
    close() {},
  }), {}, {}, undefined);
  assert.deepEqual(attempts, [undefined, undefined]);
});

test("A failed direct attempt does not remember direct mode", async () => {
  const { connectWithFallback } = await freshProxy();
  const attempts = [];
  const error = failure({ code: "ECONNREFUSED" });
  const connect = async (proxy) => {
    attempts.push(proxy);
    throw error;
  };
  for (let call = 0; call < 2; call++) {
    await assert.rejects(connectWithFallback(connect, proxyUrl, () => true), (caught) => caught === error);
  }
  assert.deepEqual(attempts, [proxyUrl, undefined, proxyUrl, undefined]);
});

test("A successful proxy connection keeps using the proxy", async () => {
  const { connectWithFallback } = await freshProxy();
  const attempts = [];
  const connect = async (proxy) => { attempts.push(proxy); return "connected"; };
  await connectWithFallback(connect, proxyUrl, () => true);
  await connectWithFallback(connect, proxyUrl, () => true);
  assert.deepEqual(attempts, [proxyUrl, proxyUrl]);
});

test("Nodemailer's separate proxy CONNECT timeout is short", () => {
  assert.equal(httpProxyClient.timeout, 5_000);
});
