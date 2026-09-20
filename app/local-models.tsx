// Legacy route: Ghost Local now lives in the merged Ghost screen
// (This phone section, including first-run setup). Kept for deep-link
// compatibility; first-run params pass through.
import { Redirect } from "expo-router";
import { useLocalSearchParams } from "expo-router";

export default function LocalModelsRedirect() {
  const params = useLocalSearchParams<{ firstRun?: string }>();
  return <Redirect href={(params.firstRun === "1" ? "/ghost?firstRun=1" : "/ghost") as never} />;
}
