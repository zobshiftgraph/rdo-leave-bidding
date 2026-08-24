# RDO & Leave Bidding

Web app for bidding **Regular Days Off** in seniority order, then bidding **annual leave** for January 1–December 31 of the next year. Built for **GitHub + Cloudflare Workers** (D1 database).

## What it does

1. **Admin setup** — create the first admin account on first launch.
2. **Seniority roster** — paste a roster (numbered list, TSV, or CSV). That order is the bid order for RDOs and leave.
3. **Logins** — each person gets a username and temporary password. They are prompted to change it. When it is their turn they get an in-app notification (and email if you add a Resend API key).
4. **RDO bidding** — people pick from RDO lines (for example Sat/Sun) or pick weekdays with a cap per day.
5. **Leave bidding** — after RDOs, the same seniority order is used for leave. Leave always covers **Jan 1–Dec 31 of the leave year**.
6. **Slot parameters** — set a default number of leave slots per day, then override with date ranges (for example more slots in summer).
7. **Calendar** — everyone can see remaining leave on each day.

## Run locally

1. Install [Node.js](https://nodejs.org/) 20+.
2. Double-click `start.bat`, or:

```bash
npm install
copy .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npm run dev
```

Open http://localhost:5173 and create the admin account.

## GitHub

Create a GitHub repository and push this folder:

```bash
git add .
git commit -m "Initial RDO and leave bidding app"
git branch -M main
git remote add origin https://github.com/YOUR_USER/rdo-leave-bidding.git
git push -u origin main
```

## Cloudflare

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Create a D1 database named `rdo-leave-bidding`:

```bash
npx wrangler login
npx wrangler d1 create rdo-leave-bidding
```

Paste the printed `database_id` into `wrangler.jsonc` (replace `local-dev-placeholder`).

3. Apply production migrations:

```bash
npx wrangler d1 migrations apply DB --remote
```

4. Set secrets (Workers → your worker → Settings → Variables):

```bash
npx wrangler secret put SESSION_SECRET
# optional email notifications
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put APP_URL
```

5. **Connect GitHub for deploys** (Workers & Pages → Create → Import a repository), or deploy from this folder:

```bash
npm run deploy
```

Build settings if Cloudflare asks: framework **Vite / none**, build command `npm run build`, deploy command is handled by Wrangler because this is a Worker with assets.

### Phone alerts (browser notifications)

Free. After login, tap **Turn on alerts**. Each person must do this on their own phone.

iPhone: Share → **Add to Home Screen**, open the app from the icon, then turn on alerts.

### Optional turn emails and texts

In-app notifications always work after someone logs in. To also email or text people when it is their turn:

1. Add their email and/or phone on the **Users** page.
2. For email: create a [Resend](https://resend.com) API key and set `RESEND_API_KEY`, `APP_URL`, and `MAIL_FROM`.
3. For texts: create a [Twilio](https://www.twilio.com) account and phone number, then in Cloudflare go to the Worker → **Settings** → **Variables and Secrets** and add:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER` (your Twilio number, like `+15551234567`)
   - `APP_URL` (your workers.dev link, so the text can include it)


## Typical bid flow

1. Paste seniority roster → download the login CSV and hand out usernames/passwords.
2. Bid setup → leave year (defaults to next year), RDO lines, leave slots / date ranges.
3. Start RDO bidding. #1 on the roster is notified.
4. When the last RDO is in, leave bidding starts automatically (or start it from Bid setup).
5. People use **Leave bid** to pick days and **Calendar** to watch remaining slots.
