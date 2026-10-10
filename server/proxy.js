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
