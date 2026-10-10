# Private Email (Cursor plugin)

Connect [Namecheap Private Email](https://www.namecheap.com/hosting/email/) to Cursor or Grok Bot.
The server uses IMAP and SMTP at `mail.privateemail.com`.

## What you get

MCP tools:

| Tool | Purpose |
| --- | --- |
| `list_accounts` | Show each account login address and From address |
| `account_info` | Show host and masked account addresses |
| `list_folders` | List mailboxes |
| `list_messages` | List recent messages in a folder |
| `search_messages` | Search messages by text |
| `get_message` | Get the full message body and attachment data |
| `send_email` | Send via SMTP |
| `reply_email` | Reply to a message with threading headers |
| `mark_message` | Set seen and flagged states |

All mail tools and `account_info` take an optional `account` parameter.
The `private-email` skill tells the agent to use these tools for Private Email.

For reply-all, original CC recipients stay in CC.
To contains the original sender and original To recipients.
Your login address and From address are removed.
If you are the original sender, your address can stay in To.
Duplicate addresses are removed.

## Install (local test)

1. Copy this folder to `~/.cursor/plugins/local/privateemail`.
2. Reload Cursor.
3. Open **Customize → Plugins → Private Email → Configure** and set:
   - `PRIVATEEMAIL_USER`: full login address.
   - `PRIVATEEMAIL_PASS`: mailbox password.
   - `PRIVATEEMAIL_FROM`: optional From address.
4. Ask the agent: “List my Private Email inbox”.

Use the mailbox password for `PRIVATEEMAIL_PASS`.
The Namecheap account password does not give access to the mailbox.

## Multiple accounts

Account 1 is the default account.
It uses the existing `PRIVATEEMAIL_USER`, `PRIVATEEMAIL_PASS`, and `PRIVATEEMAIL_FROM` variables.
`EMAIL_USER` and `EMAIL_PASS` remain fallback variables for the default account.

Accounts 2 to 5 use the `_2` to `_5` suffixes.
For each extra account, set `PRIVATEEMAIL_USER_2` and `PRIVATEEMAIL_PASS_2`, with the applicable suffix.
`PRIVATEEMAIL_FROM_2` is optional, with the same suffix.
Each From address defaults to that account's login address.
The maximum is 5 accounts.
Gaps are allowed.
For example, you can set account 3 without account 2.

An empty value is not set.
A whole variable value such as `${PRIVATEEMAIL_FROM_2}` is also not set.
An extra account with no login address is skipped.
An extra account with no password returns an error when a mail tool uses it.

Set `account` to the full login address to select an account.
The match ignores case and outer spaces.
Omit `account` to use the default account.
An unknown `account` returns an error.
It does not select the default account.
Call `list_accounts` to see the accounts.
The result includes `user`, `from`, `default`, and `configured`.
`configured` is true when both the login address and password are set.
Passwords are never returned.

## Marketplace

1. Publish this repository on GitHub.
2. Submit it at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).
3. After review, install from the Cursor marketplace.
4. Set the same variables.

## Defaults

| Setting | Value |
| --- | --- |
| Host | `mail.privateemail.com` |
| IMAP | 993 TLS |
| SMTP | 465 TLS |

To change these settings, set `PRIVATEEMAIL_HOST`, `PRIVATEEMAIL_IMAP_PORT`, or `PRIVATEEMAIL_SMTP_PORT`.

## Develop

The MCP source is `server/index.js`.
The account functions are in `server/accounts.js`.
The first run installs dependencies through `scripts/run-mcp.sh`.

Install dependencies from the repository root:

```bash
cd server && npm install
```

Run the tests from the repository root:

```bash
cd server && npm test
```

## Security

- Keep passwords in plugin Configure or MCP environment variables.
- Never commit passwords.
- Use a mailbox password for each account.
- Change a password if it is exposed.
