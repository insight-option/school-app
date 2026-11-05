import { Redirect } from 'expo-router';

/** Older links (profile, notifications) open the saved places screen. */
export default function HomeLocationRedirect() {
  return <Redirect href={"/(student)/places" as never} />;
}
