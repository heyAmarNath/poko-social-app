# Social Pipeline

Internal content planner for social media teams. You write and schedule posts here, and a manager publishes them by hand on each platform. There are no platform API connections.

Everything runs on the Cloudflare free plan as one Worker: API and UI on the Worker, data in D1, media in R2, and a nightly backup cron.

## Features

- **Profiles with 4-digit PINs** behind Cloudflare Access login. There are two kinds of profile:
  - **Admin** only administers: people, accounts, assignments, platforms and backups. Admins never see or edit content.
  - **Member** does all content work: write, add media, review, schedule and mark posted.
- **Accounts** are a brand or person, with their handle on every platform filled in from one form.
- **Platforms** are editable: show or hide, character limit, colour, and extra fields such as Subreddit for Reddit or Channel for Discord. Hidden platforms disappear from account forms, filters and the post editor.
- **Posts** have one main text plus optional custom text per account. Each account on a post has its own time, manager and status.
- **Status flow**: not ready, working, waiting for review, changes requested, scheduled, posted, cancelled. The server enforces valid moves.
- **Media**: file uploads up to 95 MB with drag-drop or paste, plus links for large files on Drive or Dropbox.
- **Views**: Day with a date picker, Board with drag-and-drop, and My work. The sidebar flags overdue posts and posts without a manager.
- **Assignments**: a matrix that sets which member posts, writes and makes media for each account. It auto-fills new posts.
- Comments, change history, duplicate post, copy and media due dates, and live post URL after posting.

## Local development

```bash
npm install
npm install-scripts approve esbuild workerd && npm rebuild esbuild workerd
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open http://localhost:5173 and pick **Admin** with PIN **0000**. Add at least one member under **People**, then sign in as that member to create posts.

`DEV_BYPASS_EMAIL` in `.dev.vars` skips Cloudflare Access. It only works on localhost.

## Deploy to Cloudflare (free plan)

1. Log in and create the database and bucket.
   ```bash
   npx wrangler login
   npx wrangler d1 create social_pipeline
   npx wrangler r2 bucket create social-pipeline-media
   ```
   Paste the printed `database_id` into `wrangler.jsonc`.
2. Set the session secret. Use any long random string.
   ```bash
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
   ```
3. Create the tables and seed data.
   ```bash
   npm run db:migrate:remote
   npm run db:seed:remote
   ```
4. Deploy. Note the `*.workers.dev` URL it prints.
   ```bash
   npm run deploy
   ```
5. Put Cloudflare Access in front. The app refuses requests until this is done.
   - In the dashboard, open the Worker, go to **Settings → Domains & Routes**, and enable **Cloudflare Access** on the workers.dev route. Alternatively, create a self-hosted application under **Zero Trust → Access → Applications** for your custom domain.
   - Add a policy that allows your team's emails, or your Google Workspace domain. The free plan covers up to 50 users.
   - Copy the application's **Audience (AUD) tag** and your team domain, such as `yourteam.cloudflareaccess.com`.
   - Put both into `vars` in `wrangler.jsonc` and run `npm run deploy` again.
6. Sign in as **Admin / 0000** and change the PIN at once from the profile menu. Then add members, accounts and assignments.

## Backups

A JSON snapshot of every table goes to `backups/YYYY-MM-DD.json` in the R2 bucket every night at 02:00 UTC. The last 30 days are kept. Admins can also run one from **Admin → Backup**.

## Free plan headroom

| Resource | Free limit | Typical use for 10 people |
|---|---|---|
| Worker requests | 100,000 / day | A few thousand |
| D1 storage | 5 GB | Under 50 MB of text per year |
| D1 reads | 5 million rows / day | Tiny |
| R2 storage | 10 GB | The main limit: put big videos in as links |
| Upload size | 100 MB per request | Capped at 95 MB in the app |

## Project layout

```
shared/rules.ts     statuses, transitions, role permissions (used by API and UI)
worker/             Hono API, Access + PIN auth, R2 media, backup cron
migrations/         D1 schema
scripts/seed.sql    platforms and the first admin
web/src/            React app on shadcn/ui (pages/, components/, components/ui/ is shadcn)
```
