function envValue(value) {
  const trimmed = value?.trim() || "";
  return trimmed && !/^\$\{[^}]*\}$/.test(trimmed) ? value : "";
}

export function loadAccounts(env) {
  const accounts = [];
  for (let number = 1; number <= 5; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    const user = (envValue(env[`PRIVATEEMAIL_USER${suffix}`]) ||
      (number === 1 ? envValue(env.EMAIL_USER) : "")).trim();
    if (number !== 1 && !user) continue;
    const pass = envValue(env[`PRIVATEEMAIL_PASS${suffix}`]) ||
      (number === 1 ? envValue(env.EMAIL_PASS) : "");
    const from = envValue(env[`PRIVATEEMAIL_FROM${suffix}`]).trim() || user;
    accounts.push({ number, user, pass, from, default: number === 1 });
  }
  return accounts;
}

export function selectAccount(accounts, account) {
  const selected = account === undefined
    ? accounts.find((entry) => entry.default)
    : accounts.find((entry) => entry.user &&
      entry.user.toLowerCase() === account.trim().toLowerCase());
  if (!selected) {
    const addresses = accounts.map((entry) => entry.user).filter(Boolean);
    throw new Error(`Unknown account. Login addresses: ${addresses.join(", ") || "none"}.`);
  }
  return selected;
}

export function requireCreds(account) {
  if (account.user && account.pass) return;
  if (account.default) {
    throw new Error(
      "Missing PRIVATEEMAIL_USER / PRIVATEEMAIL_PASS. Set them in the plugin configure / MCP env."
    );
  }
  throw new Error(`Missing PRIVATEEMAIL_PASS_${account.number}. Set it in the plugin configure / MCP env.`);
}

export function toAccountList(accounts) {
  return accounts.filter((account) => account.user).map((account) => ({
    user: account.user,
    from: account.from,
    default: account.default,
    configured: Boolean(account.user && account.pass),
  }));
}

function bareAddress(address) {
  return (address?.match(/<([^<>]+)>/)?.[1] || address || "").trim().toLowerCase();
}

export function replyRecipients({ from, to = [], cc = [] }, account, replyAll) {
  if (!replyAll) return { to: from, cc: undefined };
  const self = new Set([bareAddress(account.user), bareAddress(account.from)]);
  const seen = new Set();
  const unique = (addresses, keepSender = false) => addresses.filter((address, index) => {
    const key = bareAddress(address);
    if (!key || seen.has(key) || (self.has(key) && !(keepSender && index === 0))) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const replyTo = unique([from, ...to], true).join(", ");
  const replyCc = unique(cc).join(", ");
  return { to: replyTo, cc: replyCc || undefined };
}
