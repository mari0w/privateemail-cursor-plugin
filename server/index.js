#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { loadAccounts, selectAccount, requireCreds, toAccountList, replyRecipients } from "./accounts.js";

const HOST = process.env.PRIVATEEMAIL_HOST || "mail.privateemail.com";
const IMAP_PORT = Number(process.env.PRIVATEEMAIL_IMAP_PORT || 993);
const SMTP_PORT = Number(process.env.PRIVATEEMAIL_SMTP_PORT || 465);
const ACCOUNTS = loadAccounts(process.env);

async function withImap(account, fn) {
  requireCreds(account);
  const client = new ImapFlow({
    host: HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors.
    }
  }
}

function smtpTransport(account) {
  requireCreds(account);
  return nodemailer.createTransport({
    host: HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: account.user, pass: account.pass },
  });
}

function textResult(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

const server = new McpServer({
  name: "privateemail",
  version: "1.1.0",
});

server.tool(
  "list_accounts",
  "List account login addresses and From addresses. Never return passwords.",
  {},
  async () => textResult({ accounts: toAccountList(ACCOUNTS) })
);

server.tool(
  "account_info",
  "Show configured Private Email account host/ports/user (never the password).",
  { account: z.string().optional().describe("Login address. Omit for the default account.") },
  async ({ account }) => {
    const selected = selectAccount(ACCOUNTS, account);
    return textResult({
      host: HOST,
      imapPort: IMAP_PORT,
      smtpPort: SMTP_PORT,
      user: selected.user ? selected.user.replace(/(^.).*(@.*$)/, "$1***$2") : null,
      from: selected.from ? selected.from.replace(/(^.).*(@.*$)/, "$1***$2") : null,
      configured: Boolean(selected.user && selected.pass),
    });
  }
);

server.tool(
  "list_folders",
  "List IMAP mailboxes/folders for the Private Email account.",
  { account: z.string().optional().describe("Login address. Omit for the default account.") },
  async ({ account }) => {
    const folders = await withImap(selectAccount(ACCOUNTS, account), async (client) => {
      const list = await client.list();
      return list.map((box) => ({
        path: box.path,
        name: box.name,
        specialUse: box.specialUse || null,
        subscribed: box.subscribed,
      }));
    });
    return textResult({ folders });
  }
);

server.tool(
  "list_messages",
  "List recent messages in a folder (newest first).",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    folder: z.string().default("INBOX").describe("IMAP folder path"),
    limit: z.number().int().min(1).max(100).default(20),
    unreadOnly: z.boolean().default(false),
  },
  async ({ account, folder, limit, unreadOnly }) => {
    const messages = await withImap(selectAccount(ACCOUNTS, account), async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const query = unreadOnly ? { seen: false } : { all: true };
        const uids = await client.search(query, { uid: true });
        const slice = uids.slice(-limit).reverse();
        const out = [];
        for (const uid of slice) {
          const msg = await client.fetchOne(
            uid,
            { envelope: true, flags: true, uid: true },
            { uid: true }
          );
          if (!msg) continue;
          out.push({
            uid: msg.uid,
            subject: msg.envelope?.subject || "",
            from: (msg.envelope?.from || [])
              .map((a) => a.address || a.name)
              .join(", "),
            to: (msg.envelope?.to || [])
              .map((a) => a.address || a.name)
              .join(", "),
            date: msg.envelope?.date || null,
            flags: [...(msg.flags || [])],
          });
        }
        return out;
      } finally {
        lock.release();
      }
    });
    return textResult({ folder, count: messages.length, messages });
  }
);

server.tool(
  "search_messages",
  "Search messages by text in a folder (subject/from/body depending on server support).",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    folder: z.string().default("INBOX"),
    query: z.string().describe("Search text"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ account, folder, query, limit }) => {
    const messages = await withImap(selectAccount(ACCOUNTS, account), async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const uids = await client.search({ text: query }, { uid: true });
        const slice = uids.slice(-limit).reverse();
        const out = [];
        for (const uid of slice) {
          const msg = await client.fetchOne(
            uid,
            { envelope: true, flags: true, uid: true },
            { uid: true }
          );
          if (!msg) continue;
          out.push({
            uid: msg.uid,
            subject: msg.envelope?.subject || "",
            from: (msg.envelope?.from || [])
              .map((a) => a.address || a.name)
              .join(", "),
            date: msg.envelope?.date || null,
            flags: [...(msg.flags || [])],
          });
        }
        return out;
      } finally {
        lock.release();
      }
    });
    return textResult({ folder, query, count: messages.length, messages });
  }
);

server.tool(
  "get_message",
  "Fetch full message content by UID.",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    folder: z.string().default("INBOX"),
    uid: z.number().int().describe("IMAP UID"),
    markSeen: z.boolean().default(false),
  },
  async ({ account, folder, uid, markSeen }) => {
    const result = await withImap(selectAccount(ACCOUNTS, account), async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const downloaded = await client.download(uid, undefined, { uid: true });
        const parsed = await simpleParser(downloaded.content);
        if (markSeen) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        }
        return {
          uid,
          subject: parsed.subject || "",
          from: parsed.from?.text || "",
          to: parsed.to?.text || "",
          cc: parsed.cc?.text || "",
          date: parsed.date || null,
          text: parsed.text || "",
          html: parsed.html || null,
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        };
      } finally {
        lock.release();
      }
    });
    return textResult(result);
  }
);

server.tool(
  "send_email",
  "Send an email via Private Email SMTP.",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    to: z.string().describe("Recipient email(s), comma-separated"),
    subject: z.string(),
    text: z.string().optional(),
    html: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    replyTo: z.string().optional(),
  },
  async ({ account, to, subject, text, html, cc, bcc, replyTo }) => {
    const selected = selectAccount(ACCOUNTS, account);
    if (!text && !html) {
      throw new Error("Provide text and/or html body");
    }
    const transport = smtpTransport(selected);
    const info = await transport.sendMail({
      from: selected.from,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      replyTo,
    });
    return textResult({
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
  }
);

server.tool(
  "reply_email",
  "Reply to a message by UID (sets In-Reply-To / References when available).",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    folder: z.string().default("INBOX"),
    uid: z.number().int(),
    text: z.string().optional(),
    html: z.string().optional(),
    replyAll: z.boolean().default(false),
  },
  async ({ account, folder, uid, text, html, replyAll }) => {
    const selected = selectAccount(ACCOUNTS, account);
    if (!text && !html) {
      throw new Error("Provide text and/or html body");
    }
    const meta = await withImap(selected, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const downloaded = await client.download(uid, undefined, { uid: true });
        const parsed = await simpleParser(downloaded.content);
        return {
          messageId: parsed.messageId,
          references: parsed.references,
          subject: parsed.subject || "",
          from: parsed.from?.value?.[0]?.address || parsed.from?.text,
          to: parsed.to?.value?.map((a) => a.address).filter(Boolean) || [],
          cc: parsed.cc?.value?.map((a) => a.address).filter(Boolean) || [],
        };
      } finally {
        lock.release();
      }
    });

    const subject = meta.subject?.toLowerCase().startsWith("re:")
      ? meta.subject
      : `Re: ${meta.subject || ""}`;

    const { to, cc } = replyRecipients(meta, selected, replyAll);

    const references = [
      ...(Array.isArray(meta.references) ? meta.references : meta.references ? [meta.references] : []),
      meta.messageId,
    ]
      .filter(Boolean)
      .join(" ");

    const transport = smtpTransport(selected);
    const info = await transport.sendMail({
      from: selected.from,
      to,
      cc,
      subject,
      text,
      html,
      inReplyTo: meta.messageId,
      references,
    });
    return textResult({
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      repliedToUid: uid,
    });
  }
);

server.tool(
  "mark_message",
  "Mark a message seen/unseen or flagged/unflagged.",
  {
    account: z.string().optional().describe("Login address. Omit for the default account."),
    folder: z.string().default("INBOX"),
    uid: z.number().int(),
    seen: z.boolean().optional(),
    flagged: z.boolean().optional(),
  },
  async ({ account, folder, uid, seen, flagged }) => {
    await withImap(selectAccount(ACCOUNTS, account), async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (seen === true) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        if (seen === false) await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
        if (flagged === true) await client.messageFlagsAdd(uid, ["\\Flagged"], { uid: true });
        if (flagged === false) await client.messageFlagsRemove(uid, ["\\Flagged"], { uid: true });
      } finally {
        lock.release();
      }
    });
    return textResult({ ok: true, uid, seen, flagged });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
