import { Suspense } from "react";
import { TripDetailScreen } from "@/features/trip-signup/TripDetailScreen";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <TripDetailScreen tripId={id} />
    </Suspense>
  );
}
