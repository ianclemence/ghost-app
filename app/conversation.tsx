import { Redirect } from "expo-router";

// There is one conversation and it is the app's home. Older links and
// notification taps that point here land on it.
export default function ConversationRedirect() {
  return <Redirect href="/" />;
}
