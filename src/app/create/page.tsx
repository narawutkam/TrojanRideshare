import { Suspense } from "react";
import { CreateTripScreen } from "@/features/trip-creation/CreateTripScreen";

export default function CreatePage() {
  return (
    <Suspense>
      <CreateTripScreen />
    </Suspense>
  );
}
