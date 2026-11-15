import { fixtureId } from "@/lib/ids";
import { regionIdFor } from "@/lib/regions/regions";
import type { AttendanceReport, ChatMessage, Location, TripParticipant, User } from "@/types";

/**
 * Single fixture factory shared by the mock app and the tests (README §7 "Prototype").
 * Everything is derived from `now` so a fixed clock gives a fully deterministic dataset.
 * Mock identities and seed data must never be loaded in live mode.
 */

/** Persisted lifecycle states; `full` is derived (README §3). */
export type PersistedTripStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface TripRecord {
  id: string;
  bookerId: string;
  pickupLocationId: string;
  destinationLocationId: string;
  departureTime: string;
  maxParticipants: number;
  status: PersistedTripStatus;
  returnTripId: string | null;
  createdAt: string;
}

export interface MockDb {
  users: User[];
  locations: Location[];
  trips: TripRecord[];
  participants: TripParticipant[];
  messages: ChatMessage[];
  reports: AttendanceReport[];
}

export const USER = {
  tommy: fixtureId("user", 1),
  hannah: fixtureId("user", 2),
  maya: fixtureId("user", 3),
  jordan: fixtureId("user", 4),
  priya: fixtureId("user", 5),
  alex: fixtureId("user", 6),
  sam: fixtureId("user", 7),
  diego: fixtureId("user", 8),
  guest: fixtureId("user", 9),
} as const;

/** The two demo sign-in identities (README §7). */
export const DEMO_IDENTITIES = [USER.tommy, USER.hannah] as const;

const people: [string, string, string, boolean][] = [
  [USER.tommy, "Tommy Trojan", "ttrojan@usc.edu", true],
  [USER.hannah, "Hannah Kim", "hkim@usc.edu", true],
  [USER.maya, "Maya Chen", "mchen@usc.edu", true],
  [USER.jordan, "Jordan Lee", "jlee@usc.edu", true],
  [USER.priya, "Priya Patel", "ppatel@usc.edu", true],
  [USER.alex, "Alex Romero", "aromero@usc.edu", true],
  [USER.sam, "Sam Okafor", "sokafor@usc.edu", true],
  [USER.diego, "Diego Alvarez", "dalvarez@usc.edu", true],
  [USER.guest, "Guest Visitor", "guest@example.com", false],
];

export const PICKUP_IDS = [fixtureId("location", 1), fixtureId("location", 2), fixtureId("location", 3)] as const;

const L = (n: number, name: string, address: string, latitude: number, longitude: number, campus = false): Location => ({
  id: fixtureId("location", n), name, address, latitude, longitude,
  regionId: campus ? null : regionIdFor(latitude, longitude), googlePlaceId: null,
});

/** Campus pickup catalog (README R02) plus the mock place-search catalog. */
export function catalogLocations(): Location[] {
  return [
    L(1, "USC Village", "3201 S Hoover St, Los Angeles, CA 90089", 34.0256, -118.2853, true),
    L(2, "Everybody's Kitchen", "Parkside, University Park, Los Angeles, CA 90089", 34.0211, -118.288, true),
    L(3, "Webb Tower", "1130 W 36th St, Los Angeles, CA 90007", 34.0252, -118.2867, true),
    L(10, "LAX – Los Angeles International Airport", "1 World Way, Los Angeles, CA 90045", 33.9425, -118.4081),
    L(11, "Santa Monica Pier", "200 Santa Monica Pier, Santa Monica, CA 90401", 34.0094, -118.4973),
    L(12, "Third Street Promenade", "1351 3rd St Promenade, Santa Monica, CA 90401", 34.016, -118.4963),
    L(13, "The Grove", "189 The Grove Dr, Los Angeles, CA 90036", 34.072, -118.3575),
    L(14, "Melrose Trading Post", "7850 Melrose Ave, Los Angeles, CA 90046", 34.0835, -118.362),
    L(15, "Pink's Hot Dogs", "709 N La Brea Ave, Los Angeles, CA 90038", 34.0838, -118.3446),
    L(16, "Ovation Hollywood", "6801 Hollywood Blvd, Los Angeles, CA 90028", 34.1017, -118.3387),
    L(17, "Hollywood Palladium", "6215 Sunset Blvd, Los Angeles, CA 90028", 34.0983, -118.3243),
    L(18, "The Wiltern", "3790 Wilshire Blvd, Los Angeles, CA 90010", 34.0617, -118.3089),
    L(19, "SoFi Stadium", "1001 Stadium Dr, Inglewood, CA 90301", 33.9535, -118.3392),
    L(20, "Kia Forum", "3900 W Manchester Blvd, Inglewood, CA 90305", 33.9583, -118.3419),
    L(21, "Dodger Stadium", "1000 Vin Scully Ave, Los Angeles, CA 90012", 34.0739, -118.24),
    L(22, "Crypto.com Arena", "1111 S Figueroa St, Los Angeles, CA 90015", 34.043, -118.2673),
    L(23, "Grand Central Market", "317 S Broadway, Los Angeles, CA 90013", 34.0509, -118.249),
    L(24, "The Broad", "221 S Grand Ave, Los Angeles, CA 90012", 34.0545, -118.2503),
    L(25, "Japanese Village Plaza", "335 E 2nd St, Los Angeles, CA 90012", 34.0493, -118.24),
    L(26, "Griffith Observatory", "2800 E Observatory Rd, Los Angeles, CA 90027", 34.1184, -118.3004),
    L(27, "Echo Park Lake", "751 Echo Park Ave, Los Angeles, CA 90026", 34.0729, -118.2606),
    L(28, "LACMA", "5905 Wilshire Blvd, Los Angeles, CA 90036", 34.0639, -118.3592),
    L(29, "Rodeo Drive", "Rodeo Dr, Beverly Hills, CA 90210", 34.0696, -118.4031),
    L(30, "Westfield Century City", "10250 Santa Monica Blvd, Los Angeles, CA 90067", 34.0583, -118.4189),
    L(31, "Westwood Village", "1100 Glendon Ave, Los Angeles, CA 90024", 34.061, -118.447),
    L(32, "Sawtelle Japantown", "2000 Sawtelle Blvd, Los Angeles, CA 90025", 34.0393, -118.4425),
    L(33, "Downtown Culver City", "9300 Culver Blvd, Culver City, CA 90232", 34.0236, -118.3956),
    L(34, "Abbot Kinney Blvd", "1200 Abbot Kinney Blvd, Venice, CA 90291", 33.9915, -118.4686),
    L(35, "Venice Beach Boardwalk", "1800 Ocean Front Walk, Venice, CA 90291", 33.9875, -118.4725),
    L(36, "Manhattan Beach Pier", "2 Manhattan Beach Blvd, Manhattan Beach, CA 90266", 33.8847, -118.4109),
    L(37, "Universal CityWalk", "100 Universal City Plaza, Universal City, CA 91608", 34.1365, -118.353),
    L(38, "The Americana at Brand", "889 Americana Way, Glendale, CA 91210", 34.146, -118.2552),
    L(39, "Old Pasadena", "Colorado Blvd & Fair Oaks Ave, Pasadena, CA 91103", 34.1458, -118.15),
    L(40, "Rose Bowl", "1001 Rose Bowl Dr, Pasadena, CA 91103", 34.1613, -118.1676),
    L(41, "Aquarium of the Pacific", "100 Aquarium Way, Long Beach, CA 90802", 33.762, -118.1966),
  ];
}

export const LOC = {
  village: fixtureId("location", 1), evk: fixtureId("location", 2), webb: fixtureId("location", 3),
  lax: fixtureId("location", 10), smPier: fixtureId("location", 11), grove: fixtureId("location", 13),
  palladium: fixtureId("location", 17), wiltern: fixtureId("location", 18), sofi: fixtureId("location", 19),
  dodgers: fixtureId("location", 21), longBeach: fixtureId("location", 41),
} as const;

export const TRIP = {
  joinableLax: fixtureId("trip", 1),
  fullSantaMonica: fixtureId("trip", 2),
  groveOutbound: fixtureId("trip", 3),
  groveReturn: fixtureId("trip", 4),
  palladium: fixtureId("trip", 5),
  wiltern: fixtureId("trip", 6),
  sofi: fixtureId("trip", 7),
  pastDodgers: fixtureId("trip", 8),
} as const;

/** Round up to the next quarter hour. */
function quarter(ms: number): string {
  const q = 15 * 60000;
  return new Date(Math.ceil(ms / q) * q).toISOString();
}

export function createFixtures(now: Date, capacity: number): MockDb {
  const iso = now.toISOString();
  const at = (hours: number) => quarter(now.getTime() + hours * 36e5);
  const users: User[] = people.map(([id, displayName, email, verifiedUSC]) => ({ id, displayName, email, verifiedUSC, createdAt: iso }));

  const trips: TripRecord[] = [];
  const participants: TripParticipant[] = [];
  let pn = 0;
  const member = (tripId: string, userId: string, joinedAt = iso) => {
    participants.push({ id: fixtureId("participant", ++pn), tripId, userId, status: "confirmed", joinedAt, agreementAcceptedAt: joinedAt, agreementVersion: "mock-terms-v1" });
  };
  const trip = (id: string, bookerId: string, pickup: string, dest: string, hours: number, riders: string[], extra: Partial<TripRecord> = {}) => {
    trips.push({ id, bookerId, pickupLocationId: pickup, destinationLocationId: dest, departureTime: at(hours), maxParticipants: capacity,
      status: "open", returnTripId: null, createdAt: iso, ...extra });
    [bookerId, ...riders].slice(0, capacity).forEach((u) => member(id, u));
  };

  // One joinable ride to LAX (README §7 demo).
  trip(TRIP.joinableLax, USER.maya, LOC.village, LOC.lax, 20, [USER.jordan]);
  // One full ride: fill to capacity whatever the configured limit is.
  trip(TRIP.fullSantaMonica, USER.priya, LOC.evk, LOC.smPier, 5, [USER.alex, USER.sam, USER.diego, USER.maya, USER.jordan]);
  // A ride with an optional linked return leg (reversed endpoints, later departure, own Booker membership).
  trip(TRIP.groveOutbound, USER.jordan, LOC.webb, LOC.grove, 6, [], { returnTripId: TRIP.groveReturn });
  trip(TRIP.groveReturn, USER.jordan, LOC.grove, LOC.webb, 9, []);
  trip(TRIP.palladium, USER.alex, LOC.village, LOC.palladium, 8, []);
  trip(TRIP.wiltern, USER.sam, LOC.evk, LOC.wiltern, 30, [USER.diego]);
  trip(TRIP.sofi, USER.diego, LOC.village, LOC.sofi, 50, [USER.priya]);
  // A completed trip for the seeded attendance-report demonstration.
  trip(TRIP.pastDodgers, USER.hannah, LOC.village, LOC.dodgers, -48, [USER.maya, USER.jordan], { status: "completed", createdAt: at(-72) });

  const msg = (n: number, tripId: string, senderId: string, content: string, minutesAgo: number): ChatMessage => ({
    id: fixtureId("message", n), tripId, senderId, content, createdAt: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
  });
  const messages: ChatMessage[] = [
    msg(1, TRIP.joinableLax, USER.maya, "Hi! I'll book the Uber from the Village. Meet at the Hoover St entrance 5 min early.", 90),
    msg(2, TRIP.joinableLax, USER.jordan, "Sounds good. I have one checked bag, hope that's ok.", 75),
    msg(3, TRIP.groveOutbound, USER.jordan, "Posting a return at 9 too if anyone wants it.", 30),
    msg(4, TRIP.pastDodgers, USER.hannah, "Leaving from the Village at the posted time!", 49 * 60),
  ];

  const reports: AttendanceReport[] = [
    { id: fixtureId("report", 1), tripId: TRIP.pastDodgers, reporterId: USER.hannah, subjectId: USER.jordan, reason: "no_show", status: "pending", createdAt: at(-46) },
  ];

  return { users, locations: catalogLocations(), trips, participants, messages, reports };
}
