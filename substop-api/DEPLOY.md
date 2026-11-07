# Deploy `substop-api`

The Worker name is `substop-api`. After deploy it is served at:

https://substop-api.knoel99-morcik.workers.dev

Account id `46f626d52e6a1fa511c2cfa40cc2b602` is already set in `wrangler.jsonc`. D1 database name: `substop-db`. Binding: `DB`.

`database_id` in `wrangler.jsonc` is the placeholder `00000000-0000-0000-0000-000000000000`. Replace it before any remote command. Do not commit `AGENTMAIL_API_KEY` or `.dev.vars`.

Run these from `substop-api/` with a Cloudflare API token that can edit this account’s Workers and D1. `npx wrangler login` works too. This repo does not deploy itself.

## 1. Install

```bash
cd substop-api
npm install
```

## 2. Create the D1 database

```bash
npx wrangler d1 create substop-db
```

Copy the `database_id` UUID from the output into `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.

## 3. Apply migrations on the remote database

```bash
npx wrangler d1 migrations apply substop-db --remote
```

Wrangler asks you to confirm. Answer yes. This runs `migrations/0001_init.sql` (users, sessions, rate limits).

## 4. Deploy the Worker

```bash
npx wrangler deploy
```

## 5. Store the AgentMail key

Registration and login work without this. Email is sent only when the secret is set. The inbox is `substop.customerservice@agentmail.to`.

```bash
npx wrangler secret put AGENTMAIL_API_KEY
```

The command prompts for the value. Paste the key at the prompt. Do not pass it as an argument, do not write it into `wrangler.jsonc`, and do not commit it.

`wrangler secret put` publishes a new Worker version with the secret attached.

## Local check

```bash
npx wrangler d1 migrations apply substop-db --local
npx wrangler dev --local --port 8787
```

Optional email locally: copy `.dev.vars.example` to `.dev.vars` and set `AGENTMAIL_API_KEY` there. That file is gitignored. If the variable is missing, the Worker logs `AGENTMAIL_API_KEY unset, skipping email` and still completes register and login.

The site at `http://127.0.0.1` or `http://localhost` calls this local Worker. https://xxnoelw.github.io and https://substop.net call https://substop-api.knoel99-morcik.workers.dev.
