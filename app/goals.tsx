// Legacy route: Goals now live as a section inside Routines
// (one destination for everything Ghost does for you). Kept for
// deep-link compatibility.
import { Redirect } from "expo-router";

export default function GoalsRedirect() {
  return <Redirect href={"/routines" as never} />;
}
