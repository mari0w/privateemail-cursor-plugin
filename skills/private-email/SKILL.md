---
name: private-email
description: >-
  Use Namecheap Private Email over IMAP/SMTP. Read when the user asks to check
  Private Email, mail.privateemail.com, Namecheap mailbox, or send/search mail
  on that account. Prefer the privateemail MCP tools over the browser.
---

# Private Email

## Defaults

- Host: `mail.privateemail.com`
- IMAP: 993 (TLS)
- SMTP: 465 (TLS)
- Credentials come from plugin variables `PRIVATEEMAIL_USER` / `PRIVATEEMAIL_PASS`

## Workflow

1. Call `account_info` once to confirm the connector is configured (password is never returned).
2. Prefer `list_folders` then `list_messages` or `search_messages` before `get_message`.
3. For replies, use `reply_email` with the message UID so threading headers are set.
4. Never paste the mailbox password into chat. If auth fails, ask the user to update plugin Configure values.
5. Do not use this connector for Gmail/Outlook OAuth inboxes; those have their own plugins.

## Safety

- Sending mail is consequential: confirm recipients and subject with the user before `send_email` / `reply_email` unless they already gave exact content and said to send.
- Prefer drafts in chat when the user asked to "write" or "draft" rather than "send".
