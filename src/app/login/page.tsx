import { getConfig } from "@/config/env";
import { LoginScreen, type DemoIdentity } from "@/features/auth/LoginScreen";
import { DEMO_IDENTITIES } from "@/lib/mock/fixtures";
import { getMockDb } from "@/lib/mock/store";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mockMode = getConfig().appMode === "mock";
  const identities: DemoIdentity[] = mockMode
    ? DEMO_IDENTITIES.map((id) => getMockDb().users.find((u) => u.id === id)!).map(({ id, displayName, email }) => ({ id, displayName, email }))
    : [];
  return <LoginScreen identities={identities} mockMode={mockMode} />;
}
