# HackSC USC Rideshare

**Technical Specification and Agent Integration Contract**  
**Version 0.1 · Proposed for team review**

HackSC is a mobile-first app for USC students coordinating shared Uber rides in Los Angeles. A student creates a trip, other students discover and join it, and the party coordinates in chat. The Booker creates the listing and arranges and pays for the Uber on the day of the trip. The proposed MVP records agreement acceptance and leaves booking and payment with the Booker.

**Start here.** Assign an integration owner and feature owners. Review the open decisions before implementing shared infrastructure. Use the same contracts and mock data on every feature branch. Give each agent this README, the root AGENTS.md, and the section for its assigned feature.

**Status legend.** **PRD** marks product requirements and design direction. **Proposed** marks implementation choices for review. **Open** marks an unresolved decision. Approved changes go into the decision log and the shared contracts together.

- [Product requirements](#1-product-requirements)
- [Architecture and setup](#2-architecture-and-setup)
- [Shared types](#3-shared-types)
- [Database and mutations](#4-database-and-mutations)
- [API and service contracts](#5-api-and-service-contracts)
- [Ownership and GitHub](#6-ownership-and-github)
- [Security and demo](#7-security-and-demo)
- [Acceptance tests and open decisions](#8-acceptance-tests-and-open-decisions)

## 1 Product requirements

| ID | PRD requirement | Source |
| --- | --- | --- |
| R01 | Provide USC login on the home page for a USC student rideshare service in LA. | pp. 2, 4 |
| R02 | Create trips by selecting pickup and destination via Google Maps. Group locations into regions and allow region filters. Seed Village, Everybody’s Kitchen and Webb as pickup options. | pp. 2, 14 |
| R03 | List trips with region and time filters. Search a specific destination, resolve its region and rank relevant trips by distance. | p. 2 |
| R04 | Allow single and party signups. Page 2 specifies six people and creating another listing when signups exceed six. Page 4 says four people and describes a check mark when everyone agrees to ride with fewer. Capacity, overflow and readiness are open. | pp. 2, 4 |
| R05 | Acknowledge the billing agreement, including the cancellation fee, as part of signup. | p. 2 |
| R06 | Allow the creator to attach a return trip as an optional recommendation. Participants can sign up for it separately. | p. 2 |
| R07 | Give party members a chat to coordinate trip details and changes. | p. 2 |
| R08 | The Booker creates the listing, books the Uber on departure day and pays for it. Other riders are added to the ride. The PRD does not specify the mechanism. | pp. 2–3 |
| R09 | Apply a strike for a no-show and a temporary ban after three strikes. Reporting, review and ban duration need decisions before enforcement. | p. 2 |
| R10 | Use USC color direction, a minimalist, functional layout and minimally rounded shapes. Ratings appear as an extra. | pp. 2, 13 |

### Proposed scope for the first integrated demo

Use Home/Login, Find Trips, Create Trip, Trip Detail and Signup, My Trips, and Party Chat. Show the Booker’s role and terms acknowledgement. Use a seeded attendance report demonstration if the honor-system policy is pending. Prioritize the create, discover, join and chat journey, then connect the linked return and any approved party behavior.

**Sources.** Product evidence comes from *PRD HackSC (2).pdf*, using PDF page numbers. The proposed architecture, naming and ownership build on the earlier AGENTS.md draft from *Mock Up Apps and Demoing*. Detailed request bodies, database constraints, mock behavior and acceptance checks below are proposed contract additions.

## 2 Architecture and setup

**Proposed.** Use Next.js App Router, React, TypeScript and Tailwind CSS for the web app. Use Next.js route handlers and shared services for server logic. Supabase supplies PostgreSQL, Auth and Realtime. GitHub hosts the code, npm manages dependencies and Vercel hosts previews and the demo. Google Maps is the PRD’s mapping provider and sits behind the location service. The integration owner pins the Node and dependency versions in the scaffold and commits the lockfile.

Browser screens call a typed client for the routes in §5. Route handlers validate input and resolve the authenticated actor, then call services. Services coordinate database transactions or call the Maps adapter. The browser uses a single authorized subscription adapter for chat and refetches the persisted history on reconnect. Mock and live adapters share public types, errors, validation and ordering.

| Path | Responsibility |
| --- | --- |
| `src/app/` | Routes and page composition. Proposed routes include `/login`, `/trips`, `/trips/[id]`, `/create`, `/my-trips`, and `/api/*`. |
| `src/features/` | Feature UI and local state, within the assigned boundaries in §6. |
| `src/components/` | Shared controls, layout and loading, empty and error states. |
| `src/types/`, `src/lib/validation/` | Public DTOs, API payloads, response types and validation. |
| `src/lib/services/`, `src/lib/supabase/`, `src/lib/maps/` | Shared operations, persistence and provider adapters. |
| `src/config/`, `supabase/migrations/`, `tests/` | Validated settings, versioned schema, fixtures and integration tests. |

### Local startup after scaffolding

1. Install the pinned Node version, run `npm ci` and copy `.env.example` to `.env.local`. Use `APP_MODE=mock` and `TRIP_CAPACITY=4` for the proposed seeded demo fixture. Run `npm run dev`.
2. For live mode, use `APP_MODE=live` and an approved `TRIP_CAPACITY`. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `GOOGLE_MAPS_API_KEY`. Apply migrations to the designated development project and enable the approved authentication flow.
3. The scaffold should expose `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. The README defines the expected scripts and setup. The integration owner verifies them when the scaffold lands.

### Shared interface design

Use rectangular controls, clear type and consistent spacing. Start with proposed cardinal `#990000`, gold `#FFCC00` and neutral surfaces. Reuse shared form controls, TripCard, navigation, status labels and dialogs. Support keyboard and touch use, visible focus, labeled form errors and loading, empty, success and retry states. Pair color with text for status and render times in the Los Angeles timezone for the demo.

## 3 Shared types

**Proposed.** Publish canonical TypeScript types from `src/types/`. UUID values cross the wire as strings. Use camelCase in DTOs, snake_case in PostgreSQL, and map them in one data layer. Use `Id = string` and `UtcTime = string`. Timestamps use ISO 8601 UTC with a `Z` suffix. A Booker has a confirmed membership and counts toward occupancy. A Party is the trip’s group of confirmed participants.

| Type | Fields |
| --- | --- |
| `User` | `id: Id`, `email: string`, `displayName: string`, `verifiedUSC: boolean`, `createdAt: UtcTime`. Private self view. |
| `ParticipantSummary` | `userId: Id`, `displayName: string`. Member roster view. |
| `Region` | `id: Id`, `name: string`. |
| `Location` | `id: Id`, `name: string`, `address: string`, `latitude: number`, `longitude: number`, `regionId: Id or null`, `googlePlaceId: string or null`. |
| `Trip` | `id`, `bookerId`, `pickupLocationId`, `destinationLocationId` as Ids, `departureTime: UtcTime`, `maxParticipants: number`, `participantCount: number`, `status: TripStatus`, `returnTripId: Id or null`, `createdAt: UtcTime`. |
| `TripParticipant` | `id`, `tripId`, `userId` as Ids, `status: ParticipantStatus`, `joinedAt: UtcTime`, `agreementAcceptedAt: UtcTime or null`, `agreementVersion: string or null`. Internal membership record. |
| `TripView` | `trip: Trip`, `pickup: Location`, `destination: Location`, `viewerMembership: ParticipantStatus or null`, `roster: ParticipantSummary[] or null`. Roster is null for nonmembers. |
| `ChatMessage` | `id`, `tripId`, `senderId` as Ids, `content: string`, `createdAt: UtcTime`. |
| `AttendanceReport` | `id`, `tripId`, `reporterId`, `subjectId` as Ids, `reason: "no_show"`, `status: "pending" or "dismissed" or "upheld"`, `createdAt: UtcTime`. |
| `AgreementTerms` | `version: string`, `text: string`, `leaveCutoffMinutes: number`. Active terms and signup policy from server config. **Proposed** (integration log 2026-11-14). |

### Status and visibility

- `TripStatus` is `open`, `full`, `in_progress`, `completed` or `cancelled`. Persist the lifecycle states and derive `full` when an open trip has reached its capacity. Compute `participantCount` from confirmed memberships and seats remaining as the nonnegative difference.
- `ParticipantStatus` is `confirmed`, `cancelled` or `no_show`. Proposed MVP records a pending report without changing membership. No-show adjudication and lifecycle advancement wait for the policies in §8.
- Discovery returns `TripView` with the roster rules above. Chat access requires current confirmed membership and a noncancelled trip. Email, agreement history and report contents stay outside discovery and roster payloads.

## 4 Database and mutations

**Proposed.** Use PostgreSQL UUID primary keys and `timestamptz` for time fields. Apply foreign keys and RLS through versioned migrations. Public DTOs in §3 define the application fields. Add server-only columns in migrations where the implementation requires them.

| Table | Keys and invariants |
| --- | --- |
| `profiles` | `id` references Auth user. Verification fields are server-managed. |
| `regions` · `locations` | Optional region FK on locations. Unique non-null `google_place_id`. Validate coordinate ranges. |
| `trips` | Booker profile and two location FKs. Positive per-trip capacity. Nullable unique self-FK for the return link. Reject self-links and cycles. |
| `trip_participants` | Trip and user FKs, unique pair `(trip_id, user_id)`. Rejoin updates the cancelled row and captures new terms acceptance. Index `(trip_id, status)` for counts. |
| `messages` | Trip and sender FKs. Index `(trip_id, created_at, id)` for paging. Require current membership on read and write. |
| `attendance_reports` | Trip, reporter and subject FKs. Unique trip, reporter and subject for a no-show report. Review status defaults to pending. |

Index discoverable trips by departure time and destination location, and locations by region. Store the resolved capacity on each new trip. Require a positive integer capacity at startup and use the team-approved value in live deployments. Use the demo fixture value only in a labeled mock environment. A team decision is required for the live limit and for changing capacity on trips already created.

### Transaction boundaries and repeat calls

- **Create.** Set Booker from the session and insert the trip and Booker membership in one transaction. If a return departure is requested, create the linked trip in that transaction with reversed endpoints, a later departure and its own Booker membership. Each leg has its own seats and join action.
- **Join.** Lock the target trip row. Reject cancelled, started or past trips. If the actor is already confirmed, return the current trip view after the access check. Otherwise validate current terms, count confirmed members, reject full trips, and insert or reactivate membership before committing. Competing join requests for the last seat yield one winner.
- **Trips at least an hour apart (Proposed, D-002).** Join and create reject a rider who is already confirmed in another upcoming, non-cancelled trip departing within 60 minutes, with `ACTIVE_TRIP_EXISTS`. Trips further apart are allowed. The linked return leg of a trip is never counted against it.
- **Leave and cancel.** Use the same trip lock. A confirmed non-Booker can leave before departure, until `LEAVE_CUTOFF_MINUTES` before it (Proposed, D-003; `LEAVE_WINDOW_CLOSED` after that). An already-cancelled membership is a successful repeat. A Booker cancels the trip through the cancel route. Repeating a cancellation returns the cancelled view. For the proposed MVP, each leg is cancelled separately. Cancelled trips leave discovery and chat access closes.
- **Create and send retries.** Disable duplicate submissions while requests are pending. If the result is unknown, reload My Trips or chat before submitting again. Server idempotency keys remain an optional follow-up for these two operations.

### Capacity conflict

**Open.** The PRD gives six on p. 2 and four on p. 4. Until the team decides, tests exercise both values and the mock uses four occupants including the Booker. Proposed single-rider behavior returns `TRIP_FULL` and offers a prefilled create-trip action. Automatic overflow and named-party signup need an approved allocation and consent rule before live activation.

## 5 API and service contracts

**Proposed.** Every route requires an eligible session. Login and logout go through the authentication provider. On writes, derive the actor from the session. Use `{ success: true, data }` for success and add `meta: { nextCursor }` on collections. Use `{ success: false, error: { code, message } }` for errors. Cursor values are opaque and scoped to the active query.

| Route | Input | Success |
| --- | --- | --- |
| `GET /api/auth/me` | Session cookie | 200 User |
| `GET /api/trips` | Optional `destinationLocationId`, `regionId`, `from`, `to`, `scope`, `cursor` | 200 TripView[] |
| `POST /api/trips` | `pickupLocationId`, `destinationLocationId`, `departureTime`, optional `returnDepartureTime` | 201 TripView |
| `GET /api/trips/:id` | Trip UUID | 200 TripView |
| `PATCH /api/trips/:id` | `{ status: "cancelled" }` | 200 TripView |
| `POST /api/trips/:id/join` | `{ agreementAccepted: true, agreementVersion }` | 200 TripView |
| `POST /api/trips/:id/leave` | Empty object | 200 TripView |
| `GET /api/locations/search` | `q`, optional `cursor` | 200 Location[] |
| `GET /api/regions` | Optional `cursor` | 200 Region[] |
| `GET /api/trips/:id/messages` | Optional `cursor` for older messages | 200 ChatMessage[] |
| `POST /api/trips/:id/messages` | `{ content }` | 201 ChatMessage |
| `POST /api/trips/:id/attendance-reports` | `{ subjectId, reason: "no_show" }` | 201 AttendanceReport |
| `GET /api/locations/pickups` | None | 200 Location[] (campus pickup catalog). **Proposed.** |
| `GET /api/terms` | None | 200 AgreementTerms. **Proposed.** |
| `POST /api/auth/login`, `POST /api/auth/logout` | `{ userId }` for a seeded demo identity / empty | 200. **Mock mode only**; live uses the auth provider. |
| `POST /api/demo/reset` | Empty | 200. **Mock mode only**; restores the seeded dataset. |

**Filters and validation.** `scope=discover` returns upcoming open and full trips. `scope=mine` returns the actor’s created and previously joined trips. Use inclusive `from` and exclusive `to`. Destination search resolves the location and its region. Within the effective region, sort by straight-line distance, departure time, then ID. Without a destination, use departure and ID. Resolve conflicts between explicit and inferred region by using the explicit region. Search results use persisted, validated location IDs. Use the campus pickup catalog in the initial UI. Page messages newest first by timestamp and ID. Trim chat text and accept 1–1,000 characters. Serve a fixed 25 results per page.

**Failures.** Map malformed or invalid input to 400 `VALIDATION_ERROR`, missing session to 401 `UNAUTHORIZED`, and denied access to 403 `FORBIDDEN`. Use 404 `TRIP_NOT_FOUND` for missing or nonvisible trips. Use 409 `TRIP_FULL`, `TRIP_CLOSED` or `ALREADY_REPORTED` for state conflicts, plus the proposed `ACTIVE_TRIP_EXISTS` (D-002) and `LEAVE_WINDOW_CLOSED` (D-003). Use 422 `AGREEMENT_REQUIRED` for missing acceptance or stale terms, 429 `RATE_LIMITED`, 503 `PROVIDER_UNAVAILABLE`, and 500 `INTERNAL_ERROR`. The earlier draft’s `ALREADY_JOINED` becomes a successful repeat for the same rider.

**Service interface.** `TripService` exposes `listTrips`, `getTrip`, `createTrip`, `cancelTrip`, `joinTrip` and `leaveTrip` using the route payloads and return types. `LocationService` exposes `searchLocations`, `getRegions` and internal region lookup. `MessageService` exposes `getMessages` and `sendMessage`. `AttendanceService` exposes `reportNoShow` once reporting authority is approved. The route layer wraps service results in the common envelope.

## 6 Ownership and GitHub

**Proposed.** Assign a named human owner to each area before opening parallel branches. One person can hold multiple roles. Each feature owner owns its feature directory and review for the UI it ships. The integration owner approves shared changes and merges the demo baseline.

| Owner slot | Directory under src/features | Deliverable and dependency |
| --- | --- | --- |
| Authentication | `auth/` | Home, login and route guards. Uses Auth and current-user contract. |
| Trip Creation | `trip-creation/` | Pickup, destination, date/time, Booker and return link. Uses Trip and Location services. |
| Discovery | `trip-discovery/` | Search, region/time filters, trip cards and seat counts. Uses shared discovery query. |
| Signup | `trip-signup/` | Trip detail, agreements, join, leave and My Trips. Uses Trip service and session. |
| Party Chat | `party-chat/` | Roster, history, send and realtime updates. Uses current membership and Message service. |
| Attendance | `attendance/` | Pending report flow. Uses trip history and approved policy. |
| Integration | Shared repository paths | Types, services, schemas, route contracts, dependencies, UI primitives, CI and deployment config. |

### Instructions for every agent

1. Read root `AGENTS.md`, this README, and the current decision log. Check the existing code, shared type definitions and service adapters before editing.
2. Stay within the assigned files. Import the existing DTOs, validators and components. Use shared mock adapters for work that depends on an unfinished backend.
3. When a shared change is needed, propose the exact field, endpoint, behavior or migration. Include affected consumers and tests. Continue work that fits the current contract while the integration owner reviews.
4. Before handoff, run the project checks and one affected end-to-end path. Report the files changed, tests run, decisions needed and steps a teammate can use to verify the feature.

### Branch and merge protocol

Use `feature/<area>` branches and pull requests into protected `main`. Merge the scaffold, types and fixtures first, then small vertical slices. Require CI, the feature owner’s review where applicable, and integration-owner review for shared changes. Shared paths include root contract docs, dependency manifests and lockfile, `.env.example`, routing, shared UI, types, validation, services, provider adapters, configuration and migrations.

Each PR lists the feature, contract and migration changes, dependencies, validation results, limitations and integration risks. Include screenshots for visible changes. Record approved decisions in `docs/decisions.md` and cross-feature handoffs in `docs/integration-log.md`. Update the README and shared code in the same PR when interfaces change. Notify dependent owners and re-run the integrated smoke test before advancing the demo deployment.

## 7 Security and demo

### Proposed role and data boundaries

| Access | Rule |
| --- | --- |
| Unauthenticated or ineligible | Access login only. Protect routes and provider reads with the verified session. |
| Eligible student | Browse discoverable trip details, create trips, and join under the capacity and agreement rules. Read own profile and memberships. |
| Confirmed participant | View the roster and read or send chat while the trip allows it. Leave before departure if not the Booker. |
| Booker | Is a confirmed member. Can cancel own trip before departure. Proposed reporter role requires policy approval. |
| Reviewer | Access attendance review only if the team defines and provisions this role. |

Enforce membership and ownership in route services and RLS on all exposed tables, including Realtime. Restrict direct database mutations so callers must use the same validated operations. Expired or removed members lose subscription access. Protect cookie-authenticated writes against cross-site requests, validate all input, escape rendered messages, and rate-limit search, join and messaging. Keep credentials in appropriate environment settings. Keep privileged Supabase keys and server Maps credentials out of browser bundles, source control and logs. Scope provider credentials and redact session, email, chat and agreement details from logs. Read active terms and version from shared server config. Store the version and timestamp on signup. Approve agreement language, billing and penalty policy before enabling them for real users.

### Mock to live workflow

1. **Prototype.** Seed two USC demo identities, campus pickups, an LAX destination, one joinable ride, one full ride and an optional return. Share one fixture factory and fixed clock. Use stable IDs. Use a labeled demo mode with a shared fixture store across its two sessions and a reset action or seed command. Keep demo authentication and data entirely outside the live environment.
2. **Integrate.** Replace mock adapters behind the same routes and DTOs. Exercise two sessions in an isolated preview against the same backend. Test successful and failed joins, linked return, chat and reconnect. Use a separate Supabase environment and test accounts.
3. **Demo.** The Booker creates Village → LAX with an optional return. A second student searches, sees the trip, accepts mock terms and joins. Show both sessions, seat counts and a chat message, then point out the independent return signup. Use two browser profiles and a known starting dataset.
4. **Fallback.** Keep a seeded mock build that runs without Maps or Supabase credentials. Before presenting, verify the demo URL and rehearse switching to the mock build. Label simulated authentication, mapping and agreement behavior in the demo.

## 8 Acceptance tests and open decisions

### Integration release checks

| Scenario | Passing result |
| --- | --- |
| USC entry and access | Anonymous requests receive 401. Ineligible accounts receive 403. An eligible student can access their own profile and the trip flow. |
| Create with return | Booker membership counts as one on each leg. Reversed locations and later departure persist. A failed return insert rolls back both legs. Joining the outbound leaves return seats unchanged. |
| Search and time | Region, destination and date filters return the expected order. Range boundaries and Los Angeles daylight-saving rendering match stored UTC times. |
| Agreement and concurrency | Missing or stale terms fail. Two sessions competing for the last seat produce one success and one `TRIP_FULL` at limits four and six. A retry by the winner keeps one membership. |
| Leave and cancellation | Leaving reopens a seat for an upcoming trip. A non-Booker cannot cancel. An authorized cancellation removes the trip from discovery and blocks joins and chat. |
| Chat isolation | Members send and receive across sessions. Reconnect restores missed messages without duplicates. A nonmember or former member cannot read or send via HTTP or Realtime. |
| Honor system | With reporting enabled, duplicate or unauthorized reports are denied. A pending report does not issue a strike or ban while policy remains open. |
| Resilience and demo | Maps failure shows retry feedback. A fresh mock session resets cleanly, mirrors API errors and runs without live credentials. |
| Party journeys after approval | Verify all-or-nothing group signup, individual consent, overflow listing ownership and readiness agreement against the approved policy. |

### Decision register

Decisions taken or proposed so far, including D-001 to D-009, are recorded in [docs/decisions.md](docs/decisions.md). Contract changes and handoffs are in [docs/integration-log.md](docs/integration-log.md).

| Decision | Proposed disposition and owner |
| --- | --- |
| Capacity of four or six | **Product + integration.** Confirm the limit, whether it includes the Booker, vehicle assumptions and how existing trips are treated if the default changes. |
| Party signup, overflow and readiness | **Signup + product.** Confirm who may reserve seats, how each rider consents, who owns an overflow trip, and whether all members must approve departure with fewer riders. |
| USC eligibility | **Auth.** Confirm institutional SSO or verified USC address and how student eligibility is determined. An address alone does not establish SSO or student status. |
| Billing and cancellations | **Product.** Approve terms text and version, fee trigger and collection, late cancellation and effects on a linked return. The MVP proposal acknowledges terms only. |
| Attendance and lifecycle | **Attendance + product.** Confirm report authority, evidence, disputes, one strike per verified incident, ban length, and who advances trips to in-progress or completed. |
| Region and pickup rules | **Discovery + creation.** Approve region boundaries, distance behavior, supported pickups, and whether custom pickup locations are allowed. |
| Infrastructure and scope | **Integration.** Approve stack, pinned versions, deployment and named owners. Decide whether ratings or trip detail editing fit the hackathon. |
