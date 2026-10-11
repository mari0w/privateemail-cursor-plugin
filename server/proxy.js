import httpProxyClient from "nodemailer/lib/smtp-connection/http-proxy-client.js";

// Nodemailer's CONNECT timeout is separate from its SMTP connection timeout.
httpProxyClient.timeout = 5_000;

let useDirect = false;

export function normalizeProxyUrl(value) {
  const url = value?.trim();
  if (!url) return undefined;
  return url.includes("://") ? url : `http://${url}`;
}

export function resolveProxyUrl(env = process.env) {
  for (const key of [
    "SAND_EGRESS_TUNNEL_PROXY_ADDR",
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "ALL_PROXY",
    "all_proxy",
  ]) {
    const url = normalizeProxyUrl(env[key]);
    if (url) return url;
  }
  return undefined;
}
export async function connectWithFallback(connect, proxy, isConnectionError) {
  if (!proxy || useDirect) return connect(undefined);
  try {
    return await connect(proxy);
  } catch (error) {
    if (!isConnectionError(error)) throw error;
  }
  const connection = await connect(undefined);
  useDirect = true;
  return connection;
}

export async function connectImap(createClient, options, proxy) {
  let beforeGreeting = false;
  return connectWithFallback(async (proxy) => {
    const client = createClient({
      ...options,
      proxy,
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      beforeGreeting = !client.greetingReceived;
      client.close();
      throw error;
    }
  }, proxy, (error) => beforeGreeting && !error.authenticationFailed);
}

export async function sendSmtp(createTransport, options, message, proxy) {
  const transport = await connectWithFallback(async (proxy) => {
    const transport = createTransport({
      ...options,
      proxy,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
    });
    try {
      await transport.verify();
      return transport;
    } catch (error) {
      transport.close();
      throw error;
    }
  }, proxy, (error) => error.code !== "EAUTH" && (
    !error.command || error.command === "CONN"
  ));
  try {
    // Retry only verification, which sends no mail data.
    return await transport.sendMail(message);
  } finally {
    transport.close();
  }
}
