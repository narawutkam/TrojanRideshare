# Trojan Rideshare: handoff

Last updated 2026-11-15. This file is for whoever picks the project up next. It covers what exists, how to run it, how it works, what is unfinished, and the traps to avoid. The product contract lives in [README.md](README.md) and the decision log in [docs/decisions.md](docs/decisions.md); read both after this.

## What it is

A mobile-first web app for USC students to split one Uber across several drop-offs in Los Angeles. A rider searches a destination and sees only the trips whose route that stop fits, with their own ride time and estimated share of the fare. The trip creator is the Booker who pays Uber; riders pay them back.

Status: a working demo in mock mode. Live mode (real database, real USC sign-in) is not built.

## Where things live

| Thing | Location |
| --- | --- |
| Team repo | https://github.com/davsxu/HackSC-KKND |
| Open pull request | https://github.com/davsxu/HackSC-KKND/pull/2 (`feature/routing-pricing-ui` into `main`): routing, fare split, restyle |
| Personal copy | https://github.com/narawutkam/TrojanRideshare (private), `main` has everything through commit `90eeb9d` |
| Older personal copy | https://github.com/narawutkam/usc-rideshare-hacksc (behind; can be ignored) |
| Local branches | `feature/accounts` is created but empty. Nothing is built on it yet. |
| Legacy prototype | `prototype/` is the first HTML/JS version. It is superseded and kept for reference only. |

Git remotes on the original Mac: `origin` (older copy), `team` (team repo), `trojan` (personal copy).

## Run it

Needs Node 26 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with a demo account (the password is not checked):

- Tommy Trojan, `ttrojan@usc.edu`
- Hannah Kim, `hkim@usc.edu`

Other commands: `npm run lint`, `npm run typecheck`, `npm test` (78 tests), `npm run build`.

Demo data lives in memory. Restarting the server resets it, and the "Reset demo data" link on the sign-in page does the same. Test two people at once with a normal window and a private window.

## Configuration

Copy `.env.example` to `.env.local` (git-ignored). All settings are validated in `src/config/env.ts`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MODE` | `mock` | `mock` runs the seeded demo. `live` is not wired and fails on purpose. |
| `TRIP_CAPACITY` | 4 in mock | Riders per trip including the Booker. Required in live mode. |
| `AGREEMENT_VERSION` | `mock-terms-v1` | Billing agreement version riders must accept. |
| `LEAVE_CUTOFF_MINUTES` | 60 | Riders cannot leave this close to departure. |
| `ATTENDANCE_REPORTING` | `on` | No-show reports (they never issue strikes). |
| `ROUTE_MAX_DETOUR_MINUTES` | 10 | Most extra minutes any rider's ride may run past a direct ride. |
| `UBER_PRICE_PER_MILE` | 2.50 | Placeholder price per road mile for fare estimates. |
| `UBER_STOP_FEE` | 1.00 | Placeholder fee per extra stop. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | empty | Redis for shared demo data on serverless hosting (Vercel's Redis integration sets these). Blank means process memory. `UPSTASH_REDIS_REST_*` also works. |
| `DEMO_DATA_TTL_HOURS` | 6 | Hours before shared demo data is reseeded. |
| `GOOGLE_MAPS_API_KEY` | empty | Optional. Turns on Google Places search and Google Routes drive times. Server-only; never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | empty | Optional. Draws the trip route on a Google map. Must be a second, browser-restricted key (HTTP referrers = your site, Maps JavaScript API only) because visitors can see it. Empty shows a simple route diagram. The server key stays server-only. |

Without a Google key, place search uses a seeded catalog of about 35 LA places and drive times use a distance and time-of-day model, so everything still works.

To use a key: in Google Cloud, enable Places API (New) and Routes API, restrict the key to those two, set a daily quota on each (budget alerts do not stop spending), and put the key in `.env.local`. Never paste it into chat, commits or screenshots.

## How it works

```
Browser screens (src/features, src/components)
  -> typed client (src/lib/client/api.ts)
  -> route handlers (src/app/api/**)  : session, same-origin check, rate limit, zod validation
  -> services (src/lib/services/**)   : all business rules
  -> adapters (maps, travel time)     : mock or Google
  -> shared in-memory store (src/lib/mock/**)
```

Rules worth knowing:

- Every API reply uses one envelope: `{ success, data }` or `{ success: false, error: { code, message } }`. Types are in `src/types/index.ts`.
- The signed-in user always comes from the session cookie, never from the request body.
- Screens never call `fetch` directly; they use `src/lib/client/api.ts`.
- Services are the only place with business rules. In mock mode they run against one shared in-memory store; a live version must keep the same guarantees with database transactions.

### Key files

| Path | What it does |
| --- | --- |
| `src/lib/services/trip-service.ts` | Create, join, leave, cancel, search, fit check, route and price per trip |
| `src/lib/routing/planner.ts` | Route planner (stop order and detour limit) |
| `src/lib/routing/travel-time.ts` | Drive times and miles: mock model, Google Routes, fallback, cache |
| `src/lib/pricing/settlement.ts` | Fare split, a TypeScript port of the team's Python `calculate_settlement` |
| `src/lib/pricing/trip-pricing.ts` | Turns a planned route into route miles and runs the settlement |
| `src/lib/regions/regions.ts` | 24 hand-drawn LA ride regions and point-in-polygon lookup |
| `src/lib/mock/fixtures.ts` | The single seed-data factory (used by the app and tests) |
| `src/lib/maps/adapter.ts` | Place search: mock catalog or Google Places |
| `supabase/migrations/0001_init.sql` | Proposed schema (not applied anywhere) |
| `src/components/RouteTimeline.tsx`, `TripCard.tsx`, `ui.tsx`, `AppShell.tsx` | The shared UI |

## The three core techniques

1. **Detour-limited route search** (`planner.ts`). Each rider has a direct ride time. The planner tries every order of the stops and keeps the shortest total drive in which every rider's planned ride is within `ROUTE_MAX_DETOUR_MINUTES` of their own direct time. No stop is fixed last; whoever ends up last is the final destination. A new rider is admitted only if everyone already aboard stays within the limit. With at most 4 riders that is at most 24 orders, so the search is exact. Each extra stop adds 1 minute.
2. **Segment-based fare split** (`settlement.ts`). Each stretch of the route costs `miles x price per mile` and is split equally among the riders on board. Stop fees and empty stretches are split by distance. Money uses exact BigInt fractions and whole cents allocated by largest remainder, so fares always sum to the total. It was cross-checked against the original Python on shared cases (`tests/settlement.test.ts`). The function accepts Uber's real total (`actualUberTotal`) but nothing in the app supplies one yet.
3. **Traffic-aware drive times** (`travel-time.ts`). Google Routes with traffic awareness for the trip's departure time; one request returns minutes and miles. Results are cached for 10 minutes. If Google is unreachable the app falls back to a model: `km x 1.35 / 40 km/h x 60 x traffic factor`, where the factor follows weekday and weekend curves.

Joining is async because it waits for drive times. `joinTrip` looks the times up, then re-validates and writes in one synchronous step, and retries up to 3 times if the roster changed in between, so two people cannot take the last seat.

## Data model notes

- Every rider has their own drop-off: `TripParticipant.destinationLocationId`. The creator's is the trip destination.
- Each trip stores a `routeMatrix` (drive minutes and road miles between the pickup and each rider's stop). The planned route and prices are recomputed from it on every read, so leaving a trip never needs a new lookup.
- The Supabase migration does **not** have these two additions yet: `trip_participants.destination_location_id` and the stored route data. Add a migration before live mode.

## API

Auth (mock only): `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
Reference data: `GET /api/regions`, `GET /api/locations/search?q=`, `GET /api/locations/pickups`, `GET /api/terms`.
Trips: `GET /api/trips` (with `destinationLocationId` it returns only trips the stop fits), `POST /api/trips`, `GET` and `PATCH /api/trips/:id`, `POST /api/trips/:id/join`, `POST /api/trips/:id/leave`, `GET /api/trips/:id/fit?destinationLocationId=`.
Chat and honor system: `GET` and `POST /api/trips/:id/messages`, `POST /api/trips/:id/attendance-reports`.
Demo: `POST /api/demo/reset`.

Error codes include `ROUTE_DETOUR_EXCEEDED`, `ACTIVE_TRIP_EXISTS`, `LEAVE_WINDOW_CLOSED`, `TRIP_FULL` and `AGREEMENT_REQUIRED`.

## Rules the app enforces

A rider can be in several upcoming trips as long as no two depart within an hour of each other (a trip and its return are never counted against each other). Riders cannot leave within an hour of departure. A destination must be inside one of the 24 regions (on return legs, a campus drop-off). Trips hold at most 4 riders. Only the Booker can cancel or file no-show reports. Chat is limited to current members.

## Decisions that still need an owner

All are logged in `docs/decisions.md`; these are the ones most likely to change behavior.

- **Booker rule.** The team's Python picks the rider with the longest trip as Booker. The app keeps the trip creator as Booker (D-008) and passes that into the settlement, so reimbursements go to the creator. Decide which is right.
- **Rates.** `UBER_PRICE_PER_MILE` and `UBER_STOP_FEE` are placeholders (D-011).
- **Detour limit and rider cap.** 10 minutes and 4 riders are working values (D-010). Check the real number of stops Uber allows on one ride before raising the cap.
- **Region rule.** A destination must be inside a region (D-004). With routing in place, the detour limit alone might be enough; this was kept because it was asked for earlier.
- **Capacity.** The product spec mentions both 4 and 6; the demo uses 4 (D-001).

## Not done

- Live mode: Supabase persistence, row-level security applied, and the migration above. `getServices()` throws in live mode on purpose.
- Real USC single sign-on. The demo sign-in only accepts the preset accounts and a typed email that matches one.
- Account creation and account setup pages. A branch name exists (`feature/accounts`) but no code does.
- Notifications. The "you'll be notified when riders join" message is text only (D-007).
- Real Uber total as an input to the fare split.
- Chat is a 3-second poll in mock mode; a live version should use Supabase Realtime behind the same adapter in `useChatSubscription.ts`.
- Demo data and the rate limiter. On Vercel the demo data is shared through a Redis snapshot (last write wins, reseeded every 6 hours), and the rate limiter is still per server. Neither is production grade; the real fix is the Supabase work above.
- `docs/integration-log.md` has no entry yet for the routing, pricing and restyle work (the pull request description has the details).

## Traps

- **Do not run `npm run build` while `npm run dev` is running.** They share the `.next` folder and the dev server will fail with `Cannot find module './268.js'`. Stop dev, delete `.next`, restart.
- **Stale TypeScript cache.** After changing `tsconfig.json`, delete `tsconfig.tsbuildinfo` or `npm run typecheck` may report old errors.
- **Node on the original Mac** is in `/usr/local/bin`, which is not on the default `PATH`: `export PATH="/usr/local/bin:$PATH"`.
- **Demo data after code changes.** The in-memory store survives hot reloads. If the data shape changed, use "Reset demo data" or restart.
- **Phone testing.** Another device can open `http://<mac address>:3000` only on the same Wi-Fi, and campus Wi-Fi often blocks device-to-device traffic. A phone hotspot works. The address changes with the network.
- **The sign-in page stays a labeled demo.** It is styled like the USC sign-in but must not be made to look like the real thing or to collect real credentials.
- **Seeded trips refresh once.** When a Google key is set, seeded trips replace their mock estimates with Google numbers after the first request, so the first screen can briefly show mock times.
- **Check a deployment with `/api/health`.** It shows yes or no for the Google key and shared data, and the account menu has a status panel with a **Test Google** button that returns Google's own error message. A key kept only in `.env.local` never reaches Vercel; it must be added under Environment Variables and the project redeployed. Troubleshooting is in [docs/deploy-vercel.md](docs/deploy-vercel.md).
- **Vercel needs Redis.** Without it, trips and joins can vanish between requests because each serverless server has its own memory. Every API handler goes through `withDemoStore` in `src/lib/services/index.ts`; new handlers must use `handle()` from `src/lib/api/http.ts`, and a handler that only reads should pass `{ readOnly: true }`. Anything that changes the data must not, or the change is not saved. Setup steps are in [docs/deploy-vercel.md](docs/deploy-vercel.md).

## Suggested next steps

1. Review and merge pull request #2.
2. Settle the Booker rule and the real rates.
3. Build account creation and setup (demo only until real USC sign-in exists).
4. Add the Supabase migration for per-rider destinations and route data, then wire live mode.
5. Feed Uber's real final total into the fare split after a ride.
6. Add notifications for rider joins.
