// Legacy route: Ghost Pod health now lives in the merged Ghost screen
// (Status + Home Pod sections). Kept for deep-link compatibility.
import { Redirect } from "expo-router";

export default function DeviceRedirect() {
  return <Redirect href={"/ghost" as never} />;
}
