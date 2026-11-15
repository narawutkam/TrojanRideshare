import { newId } from "@/lib/ids";
import type { ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import type { AttendanceReport } from "@/types";

/**
 * AttendanceService (README §5, R09). Proposed MVP: the Booker may file a
 * pending no-show report after departure. A pending report never changes
 * membership, issues a strike or bans anyone while the policy is open (README §8).
 */
export class AttendanceService {
  constructor(private readonly ctx: ServiceContext) {}

  reportNoShow(actorId: string, tripId: string, subjectId: string): AttendanceReport {
    if (!this.ctx.config.attendanceReporting) throw new AppError("FORBIDDEN", "No-show reporting is turned off pending policy approval.");
    const trip = this.ctx.db.trips.find((t) => t.id === tripId);
    const actorMember = this.ctx.db.participants.find((p) => p.tripId === tripId && p.userId === actorId);
    if (!trip || (trip.status === "cancelled" && !actorMember)) throw new AppError("TRIP_NOT_FOUND", "Trip not found.");
    if (trip.bookerId !== actorId) throw new AppError("FORBIDDEN", "Only the Booker can report a no-show.");
    if (trip.status === "cancelled") throw new AppError("TRIP_CLOSED", "This trip was cancelled.");
    if (Date.parse(trip.departureTime) > this.ctx.clock.now().getTime()) throw new AppError("TRIP_CLOSED", "No-shows can be reported after departure.");
    const subject = this.ctx.db.participants.find((p) => p.tripId === tripId && p.userId === subjectId);
    if (!subject || subjectId === actorId || subject.status === "cancelled") throw new AppError("VALIDATION_ERROR", "That person wasn't a rider on this trip.");
    const dup = this.ctx.db.reports.some((r) => r.tripId === tripId && r.reporterId === actorId && r.subjectId === subjectId && r.reason === "no_show");
    if (dup) throw new AppError("ALREADY_REPORTED", "You already reported this rider for this trip.");
    const report: AttendanceReport = {
      id: newId(), tripId, reporterId: actorId, subjectId, reason: "no_show", status: "pending", createdAt: this.ctx.clock.now().toISOString(),
    };
    this.ctx.db.reports.push(report);
    return report;
  }

  /** Reports filed by the actor on a trip (their own view only). */
  myReports(actorId: string, tripId: string): AttendanceReport[] {
    return this.ctx.db.reports.filter((r) => r.tripId === tripId && r.reporterId === actorId);
  }
}
