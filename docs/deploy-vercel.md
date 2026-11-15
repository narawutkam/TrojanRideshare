# Deploying to Vercel

This puts the **demo** online (mock mode with simulated sign-in). It is not a production deployment: there is no real database and no real USC sign-in.

## Why it needs Redis

Vercel runs the app as many short-lived servers, each with its own memory. The demo keeps its trips, joins and messages in memory, so without a shared place to keep them a trip created on one server would be missing on the next request.

The app solves this with a shared snapshot of the demo data in Redis (Upstash). At the start of each API request it loads the snapshot, and at the end it saves it if anything changed. Requests inside one server run one at a time. Across servers the last write wins, which is fine for a demo with a few people and not safe for real data.

If no Redis is configured, the app still deploys and runs, but data can disappear or differ between requests. Local development does not need Redis.

## Steps

1. **Push the code to GitHub** (any of the repos). The project files must be at the root of the repository.
2. **Create the project.** On https://vercel.com/new import the repository. Vercel detects Next.js. Leave the build and output settings as they are (Node 22 is set in `package.json`).
3. **Add Redis before the first deploy.** In the project, open **Storage**, choose **Create Database**, pick **Upstash Redis** from the Marketplace, and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project's environment variables automatically. Choose a region close to your Vercel functions (for LA users, a US West region).
4. **Add environment variables** (Project, Settings, Environment Variables). All are optional:
   - `GOOGLE_MAPS_API_KEY`: turns on Google place search and traffic-aware drive times. Create it as a Production and Preview variable, never with a `NEXT_PUBLIC_` prefix, and keep the Google-side restrictions and daily quotas described in `HANDOFF.md`. Without it the app uses its built-in catalog and estimates.
   - `UBER_PRICE_PER_MILE`, `UBER_STOP_FEE`, `ROUTE_MAX_DETOUR_MINUTES`, `TRIP_CAPACITY`: only to change the defaults (see `.env.example`).
   - `DEMO_DATA_TTL_HOURS`: how long shared data lives before it is reseeded. Default 6.
5. **Deploy.** Open the deployment URL on a phone. Sign in as Tommy Trojan or Hannah Kim.

## After deploying

- The sign-in page has a **Reset demo data** link. It resets the data for everyone.
- Demo data is reseeded automatically after `DEMO_DATA_TTL_HOURS` (6 by default). Seeded trips are dated from the moment of seeding, so without this they would all be in the past after a day. Anything people created disappears at the same time.
- The first request after a reseed can be slower when a Google key is set, because the seeded trips refresh their drive times once.

## Things to check

- **Access.** A production URL is public. Anyone with the link can sign in as a demo user, because the password is not checked. Preview deployments are protected by default. To limit a production demo, use **Settings, Deployment Protection** in Vercel. If a Google key is set, anyone using the demo uses your Google quota.
- **Redis usage.** Each open party chat polls every 3 seconds, and each poll can read Redis. Check your Upstash plan's command limit if chats are left open.
- **Region.** Functions run in one region by default. If it feels slow, set the region under **Settings, Functions** and keep Redis in the same area.
- **Fonts.** The build downloads Source Sans from Google Fonts, so it needs normal internet access.

## Troubleshooting

The deployed site can tell you what it is connected to. Open the account menu (your initials, top right) and read **Status**. The same information is at `https://<your-domain>/api/health`, which shows yes or no for each setting and never a key.

**Place search only finds a few places, or drive times look like round estimates.** Google is not connected. The status reads "built-in list and estimates". Fix:
1. In Vercel, open the project that serves your domain (check the name in the dashboard, since a repo can have more than one project).
2. Settings, Environment Variables: add `GOOGLE_MAPS_API_KEY`. Enable **Production** and **Preview**. Do not add a `NEXT_PUBLIC_` prefix.
3. **Redeploy.** A new variable only applies to new deployments (Deployments, the latest one, Redeploy).

**The status says Google, but search still looks wrong.** Tap **Test Google** in the account menu. It makes one call to each Google API and shows Google's own answer:
- `PERMISSION_DENIED ... has not been used ... or it is disabled`: enable Places API (New) and Routes API in Google Cloud for the key's project.
- `PERMISSION_DENIED ... billing`: attach a billing account to that Google Cloud project.
- `API_KEY_INVALID` or `REQUEST_DENIED ... key not valid`: the key was pasted wrongly (extra space, a quote, a missing character). Paste it again.
- `API_KEY_HTTP_REFERRER_BLOCKED` or an IP error: remove the website or IP restriction. The key is used from the server, so it must not be limited to websites.
- `RESOURCE_EXHAUSTED`: the daily quota you set is used up.
While Google fails, search quietly falls back to the built-in places, so nothing shows an error.

**Every `/api/...` call returns 404.** That site is not this project's code. Check which repository and branch the Vercel project builds, and confirm the repository root contains `src/app/api`.

**Trips, joins or searched places disappear, or differ between taps.** Shared demo data is not configured. The strip at the top says shared storage is not set up, and the status reads "this server only". This is because Vercel answers parallel requests from separate servers that do not share memory. Add the Upstash Redis integration (step 3 above) and redeploy.

**I created the database but the variables are missing.** Creating a database does not always connect it to the project. In Vercel open the project, then **Storage**, open the database, and choose **Connect Project**, picking this project for Production and Preview. Afterwards **Settings, Environment Variables** should list `KV_REST_API_URL` and `KV_REST_API_TOKEN`. If you set a prefix while connecting, they appear as for example `STORAGE_KV_REST_API_URL`, which the app also accepts. Redeploy after connecting.

## Not covered

Real USC sign-in, a real database (Supabase) and notifications are still open. See `HANDOFF.md`.
