import { useEffect } from "react";
import { useRouter } from "expo-router";

// Single persistent conversation lives at /(tabs). This route stays as a
// legacy alias so old deep links keep working.
export default function ConversationAlias() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)" as never);
  }, [router]);
  return null;
}
