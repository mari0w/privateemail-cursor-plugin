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
- Default account credentials come from `PRIVATEEMAIL_USER` and `PRIVATEEMAIL_PASS`.
- Extra account credentials use the `_2` to `_5` suffixes.
- Each account has an optional From address in `PRIVATEEMAIL_FROM` with the same suffix.

## Workflow

1. Call `list_accounts` when more than one account may exist.
2. Pass `account` with the login address to select a non-default account. Omit `account` for the default account.
3. Call `account_info` once for the selected account to confirm it is configured. Passwords are never returned.
4. Use `list_folders` before `list_messages` or `search_messages`. Use these tools before `get_message`.
5. For replies, use `reply_email` with the message UID. This sets the threading headers.
6. Never paste the mailbox password into chat. If authentication fails, ask the user to update plugin Configure values.
7. Use the applicable plugins for Gmail and Outlook accounts.

## Safety

- Sending mail is consequential: confirm recipients and subject with the user before `send_email` / `reply_email` unless they already gave exact content and said to send.
- Prefer drafts in chat when the user asked to "write" or "draft" rather than "send".
