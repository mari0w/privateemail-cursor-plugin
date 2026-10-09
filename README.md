# Private Email (Cursor plugin)

Connect [Namecheap Private Email](https://www.namecheap.com/hosting/email/) to Cursor / Grok Bot over IMAP + SMTP (`mail.privateemail.com`).

## What you get

MCP tools:

| Tool | Purpose |
| --- | --- |
| `account_info` | Show host / masked user (no password) |
| `list_folders` | List mailboxes |
| `list_messages` | Recent messages in a folder |
| `search_messages` | Text search |
| `get_message` | Full body + attachment metadata |
| `send_email` | Send via SMTP |
| `reply_email` | Reply / reply-all with threading |
| `mark_message` | Seen / flagged |

Plus a `private-email` skill that tells the agent to prefer these tools for Private Email.

## Install (local test)

1. Copy this folder to `~/.cursor/plugins/local/privateemail`
2. Reload Cursor
3. Open **Customize → Plugins → Private Email → Configure** and set:
   - `PRIVATEEMAIL_USER` — full address
   - `PRIVATEEMAIL_PASS` — **mailbox** password (not Namecheap account login)
   - optional `PRIVATEEMAIL_FROM`
4. Ask the agent: “List my Private Email inbox”

## Marketplace

1. Push this repo public on GitHub
2. Submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)
3. After review, install from the Cursor marketplace and fill the same variables

## Defaults

| Setting | Value |
| --- | --- |
| Host | `mail.privateemail.com` |
| IMAP | 993 TLS |
| SMTP | 465 TLS |

Override with env `PRIVATEEMAIL_HOST`, `PRIVATEEMAIL_IMAP_PORT`, `PRIVATEEMAIL_SMTP_PORT` if needed.

## Develop

MCP source: `server/index.js`. First run installs deps via `scripts/run-mcp.sh`.

```bash
cd server && npm install
```

## Security

- Secrets stay in plugin Configure / MCP env — never commit them.
- Prefer app-style mailbox passwords; rotate if exposed.
