# Poko Social

A simple content planner for a small social media team. You plan and write posts here, and someone publishes them by hand on each platform. There are no platform API connections.

Everything runs on the Cloudflare free plan as one Worker: API and UI on the Worker, all data in D1, and a nightly cleanup job.

## How it works

- **Topics** are the kinds of post the team makes, such as Feature Promotion, Giveaway or Daily Update. Every member sees all topics in the sidebar, with how many posts in each are still open. Each topic has a short description and a **template**: the starter text a new post in that topic begins with. A new database starts with the team's 16 topics; admins add, edit, reorder and delete them. Deleting one keeps its posts, with no topic.
- **A post** is built in this order: a topic, a title, the accounts it goes to, a default time, then one **version** per account, and optional notes for the team. Comments are on the post.
- **Each version** is what goes out on one account (e.g. Acme on X). It has its own text (starting from the topic's template), media links (each with an optional label, such as a Drive or Dropbox link), who writes it (**Content by**, the creator unless changed), who makes the media (**Media by**), who posts it (**Posted by**, the account's manager unless changed), its time (blank means the post's time), its status and the link to the live post. On the post page the versions are a slider: a chip per account, with arrows (or a swipe) to step through them. The copy button in the text box copies a version's text, ready to paste into the platform. **Copy to all versions** puts one version's text on every other version. **Apply to all** next to Content by and Media by gives every version the same person, and next to Media it adds this version's links to every other version (keeping links they already have). Removing an account whose version has work in it asks first.
- **Statuses** are per version: **Not ready**, **Working** and **Completed**. A version's status saves straight away. The post's status follows its versions: Completed when all are, Working once any has started, otherwise Not ready.
- **Media is links only.** Files aren't uploaded to the app.
- **Views:**
  - **Day** shows everything planned for a day: today when you open it, any other day with the arrows or the date picker.
  - **My work** shows your open versions, each under its post, in four tabs: **All**, **Content**, **Media** and **Post**.
  - **Topics** each list their posts, split into Open and Completed.
  - Every view is a table with the columns Status, Date, Title, Topic, Content, Media and Post. Click **Status** or **Date** to sort by it (not ready first, or soonest first), and again to reverse; each page remembers the choice. Each post is followed by its versions as indented rows, sorted the same way (fold them with the arrow). Change a version's status straight from the table; click a version to open the post at it. The sidebar shows how many posts are open today (next to Day) and in each topic, and how many open versions you have in My work.
- **Accounts** are brands or people, such as Acme. Each has a profile link per platform. The handle shown around the app is worked out from the link. Each platform profile has one **manager**, picked by an admin. When you add an account to a post, its version is posted by that manager, until you pick someone else.
- **People** sign in with Google. Only someone an admin has added on the **People** page, with the Google email they use, gets in. Switching someone to inactive stops them signing in. Deleting them also takes them off open posts and the accounts they manage, keeps their name on finished posts, and frees their email to be added again.
  - **Members** do the content work.
  - **Admins** do everything members do, plus manage people, accounts, topics and platforms.

### Security

- **Sign-in:** Google sign-in (OpenID Connect with PKCE, a one-time state and nonce). The Worker checks Google's signature on the ID token, that it was issued to this app, and that the email is verified, then matches the email to an active profile. Every API call except signing in needs a session.
- **Sessions:** a sign-in lasts 30 days in a signed, HTTP-only cookie. Deactivating a person, or changing their role or email, signs out all their sessions.
- **Local development:** a dev sign-in lets you be anyone without Google, but only when `DEV_LOGIN` is set and only on `localhost`.
- **Headers:** every response carries a content security policy and the standard browser hardening headers.
- **Edit conflicts:** if two people edit the same post, the second save is refused with a "reload" prompt instead of silently overwriting.

## Local development

```bash
npm install
npm install-scripts approve esbuild workerd && npm rebuild esbuild workerd
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

A new local database has no people yet, so add yourself as an admin:

```bash
npx wrangler d1 execute poko_social --local --command "INSERT INTO profiles (name, email, role, created_at) VALUES ('Your Name', 'you@example.com', 'admin', unixepoch() * 1000)"
```

Open http://localhost:5173 and use **Local development: sign in as** to sign in as anyone. To try the real Google sign-in locally too, add `http://localhost:5173/api/auth/google/callback` to the Google client's redirect URIs and put the client ID and secret in `.dev.vars`.

To try things on throwaway data without touching your local database, point the dev server at another folder:

```bash
npx wrangler d1 migrations apply poko_social --local --persist-to .wrangler/scratch
npx wrangler d1 execute poko_social --local --persist-to .wrangler/scratch --file=scripts/seed.sql
SP_STATE_DIR=.wrangler/scratch npm run dev
```

### Checks

```bash
npm run check
```

That runs the linter (oxlint), the type checker and the tests. Tests run inside the real Workers runtime against a fresh database built from `migrations/`, and one of them checks that `scripts/seed.sql` sets up a working database. CI runs the same checks plus a build on every push (`.github/workflows/ci.yml`).

## Deploy to Cloudflare (free plan)

The app is deployed at https://poko-social.amrn.workers.dev. To set it up from scratch on another account:

1. Log in and create the database.
   ```bash
   npx wrangler login
   npx wrangler d1 create poko_social
   ```
   Paste the printed id into `database_id` in `wrangler.jsonc`. Leave `preview_database_id` as it is: it's the id your local development database lives under, kept apart from production.
2. Create the tables and the starting data (platforms and topics).
   ```bash
   npm run db:migrate:remote
   npm run db:seed:remote
   ```
3. Deploy. Note the `*.workers.dev` URL it prints.
   ```bash
   npm run deploy
   ```
4. Set the session secret: any long random string, only needed once.
   ```bash
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
   ```
5. Create the Google sign-in client (free; no billing needed) at [console.cloud.google.com](https://console.cloud.google.com):
   - Create a project, then open **Google Auth Platform**.
   - **Branding:** app name and support email. **Audience:** External, then **Publish app** so any Google account you add can sign in. It only asks for name and email, so Google doesn't need to review it.
   - **Clients → Create client → Web application**, with the authorized redirect URI `https://<your-worker>.workers.dev/api/auth/google/callback`.
   - Put the client ID in `GOOGLE_CLIENT_ID` in `wrangler.jsonc`, set the secret, and deploy again:
     ```bash
     npx wrangler secret put GOOGLE_CLIENT_SECRET
     npm run deploy
     ```
6. Add the first admin with their Google email. They add everyone else on the **People** page.
   ```bash
   npx wrangler d1 execute poko_social --remote --command "INSERT INTO profiles (name, email, role, created_at) VALUES ('Amar', 'amar@poko.video', 'admin', unixepoch() * 1000)"
   ```

Later schema changes go in a new file in `migrations/`; apply it with `npm run db:migrate:remote` before deploying the code that needs it.

## Backups and housekeeping

- **Restore:** D1's built-in **Time Travel** can put the database back to how it was at any minute in the last 7 days (30 days on Workers Paid). It's always on and free.
  ```bash
  npx wrangler d1 time-travel restore poko_social --timestamp=2026-10-19T09:30:00Z
  ```
- **Copy:** take a full SQL copy whenever you want one, for example before a big change:
  ```bash
  npx wrangler d1 export poko_social --remote --output=poko-backup.sql
  ```
- **Cleanup:** every night at 02:00 UTC the Worker removes posts deleted more than 30 days ago and drops change-log entries older than 90 days.

## Free plan headroom

| Resource | Free limit | Notes |
|---|---|---|
| Worker CPU | 10 ms per request | Signing in checks one Google token; everything else is a few database queries |
| Worker requests | 100,000 / day | A few thousand for 10 people |
| D1 reads | 5 million rows / day | Lists read one status (and topic) through an index, capped at 300 posts |
| D1 storage | 5 GB | Under 50 MB of text per year |

## Icons

Platform logos are Font Awesome Free brand icons ([CC BY 4.0](https://fontawesome.com/license/free)) via [react-icons](https://react-icons.github.io/react-icons/). Interface icons are [Lucide](https://lucide.dev) (ISC). Custom platforms without a known logo get a coloured letter badge.

## Project layout

```
shared/          rules, links and API types (used by both the Worker and the app)
worker/          Hono API: auth, admin, topics, posts and the nightly cleanup
migrations/      D1 schema (0001_init.sql is all of it); once deployed, never edit an applied migration, add a new one
scripts/         starting data (seed.sql) and a build helper
web/src/         React app on shadcn/ui (pages/, components/; components/ui/ is shadcn)
test/            tests that run in the Workers runtime
```
