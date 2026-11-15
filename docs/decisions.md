# Decision log

Approved decisions go here together with the contract change that implements them (README §6).
Status: **Approved**, **Proposed** (awaiting team approval), **Open** (unresolved).

| ID | Decision | Status | Implemented in |
| --- | --- | --- | --- |
| D-001 | **Trip capacity.** Mock demo uses 4 occupants including the Booker (`TRIP_CAPACITY=4`). Live mode refuses to start without an explicit value. Each trip stores its capacity at creation. Tests run at 4 and 6. | Open (live value) | `src/config/env.ts`, `TripService.createTrip` |
| D-002 | **One upcoming trip per rider.** A student can be confirmed in at most one upcoming, non-cancelled trip. The linked return leg of that trip counts as the same trip. New error `409 ACTIVE_TRIP_EXISTS` on join and create. | Proposed (requested by product owner, 2026-11-14) | `TripService.activeTripsOf` |
| D-003 | **Leave cutoff.** Riders can leave until `LEAVE_CUTOFF_MINUTES` (default 60) before departure; after that, `409 LEAVE_WINDOW_CLOSED` and the UI points them to party chat. The cancellation fee stays agreement text only; nothing is charged. | Proposed (requested by product owner, 2026-11-14) | `TripService.leaveTrip`, `LeavePanel` |
| D-004 | **Region rule.** 24 hand-drawn LA regions (`src/lib/regions/regions.ts`). A location's region is strict polygon containment. Trips can only be created to destinations inside a region; discovery warns when a searched place is outside every region. | Proposed (boundaries need approval) | `LocationService`, `TripService.createTrip`, `DiscoverScreen` |
| D-005 | **Party signup and overflow.** MVP join is single-rider only. A full trip returns `409 TRIP_FULL` and the UI offers a prefilled “Create a similar trip”. The earlier prototype's party-size signup and automatic overflow listing are removed until the allocation and consent rules are approved. | Proposed (per README §4) | `JoinPanel` |
| D-006 | **Region-center drop-off.** The HTML prototype modelled trips as going to a region, with each rider's own destination and a drop-off at the region center. The contract models a trip with one `destinationLocationId`. Kept the contract; the region-center idea needs a product decision and a contract change (per-rider destination, drop-off point). | Open | `prototype/` (reference only) |
| D-007 | **Rider-joined notifications.** The trip-posted banner tells the Booker they'll be notified when riders join. No delivery channel exists yet (email, push or SMS). | Open | `TripDetailScreen` |
| D-008 | **Booker terms on create.** Creating a trip requires the Booker to tick the terms acknowledgement in the UI; the service records the active agreement version and time on the Booker's membership. `POST /api/trips` does not take agreement fields. | Proposed | `CreateTripScreen`, `TripService.createTrip` |
| D-009 | **No-show reporting.** Only the Booker can file a report, only after departure, one per rider per trip. Reports stay `pending` and never change membership or issue strikes. Can be switched off with `ATTENDANCE_REPORTING=off`. | Proposed (policy open) | `AttendanceService` |
