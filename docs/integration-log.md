# Integration log

Cross-feature handoffs and shared contract changes (README §6).

## 2026-11-14 · Scaffold, contracts and mock vertical slice

**Scope.** Integration baseline: Next.js 15 App Router + React 19 + TypeScript + Tailwind 4, zod 3 validation and vitest 3. Node is pinned in `.nvmrc`; dependencies are exact in `package.json` and `package-lock.json`.

**Shared paths added.**
- `src/types/` canonical DTOs, API envelope and error codes (README §3, §5).
- `src/config/env.ts` validated settings (`APP_MODE`, `TRIP_CAPACITY`, `AGREEMENT_VERSION`, `LEAVE_CUTOFF_MINUTES`, `ATTENDANCE_REPORTING`).
- `src/lib/validation/` request schemas.
- `src/lib/services/` `TripService`, `LocationService`, `MessageService`, `AttendanceService`, plus `AppError` and the HTTP status map.
- `src/lib/mock/` the single fixture factory and shared in-memory store with reset.
- `src/lib/maps/` provider boundary. Mock adapter searches the seeded catalog; Google Places (New) adapter is used when `GOOGLE_MAPS_API_KEY` is set.
- `src/lib/regions/` region polygons and lookup (D-004).
- `src/lib/api/http.ts` envelope, error mapping, same-origin check for writes, in-process rate limits.
- `src/lib/client/` typed browser client and hooks. Screens never call `fetch` directly.
- `src/components/` AppShell, TripCard, LocationSearch, buttons, labels, dialogs, loading/empty/error states.
- `supabase/migrations/0001_init.sql` proposed schema and RLS (not applied anywhere yet).

**Contract additions (README updated in the same change).**
| Change | Why | Consumers |
| --- | --- | --- |
| `GET /api/locations/pickups` → `Location[]` | The UI needs the campus pickup catalog IDs (README §5 “Use the campus pickup catalog”). | trip-creation |
| `GET /api/terms` → `AgreementTerms { version, text, leaveCutoffMinutes }` | Join must send the active version; text comes from server config (README §7). | trip-signup, trip-creation |
| `POST /api/auth/login`, `POST /api/auth/logout` (mock only) | Labeled demo sign-in for the two seeded identities. Live uses the auth provider. | auth |
| `POST /api/demo/reset` (mock only) | Demo reset action (README §7). | auth (login screen) |
| Error codes `ACTIVE_TRIP_EXISTS`, `LEAVE_WINDOW_CLOSED` (409) | D-002, D-003. | trip-signup, trip-creation |

**Feature slices delivered (mock mode).** auth (`/login`, route guard), trip-discovery (`/trips`), trip-creation (`/create`), trip-signup (`/trips/[id]`, `/my-trips`), party-chat (in trip detail; polling subscription adapter with refetch on reconnect), attendance (pending no-show report for Bookers after departure).

**Known limitations.**
- Live mode is not wired: `getServices()` returns `PROVIDER_UNAVAILABLE` when `APP_MODE=live`. Next step is a Supabase data layer behind the same service methods, using a row lock on the trip for join/leave/cancel.
- Chat realtime is polling (3 s) in mock mode; swap `useChatSubscription` to Supabase Realtime in live.
- Rate limits are per server process.
- No owners are assigned yet (README §6 ownership table).

**Verification.** `npm run lint`, `npm run typecheck`, `npm test` (service and envelope tests covering the README §8 scenarios that apply to mock mode), `npm run build`, then the README §7 demo path in two browser sessions.
