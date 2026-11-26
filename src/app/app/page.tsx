import { OboudCallWorkspace } from "@/components/OboudCallWorkspace";

// Subscribers' entry point. Same app as "/"; no technical data is rendered
// here and the owner APIs reject non-owners on the server.
export default function SubscriberAppPage() {
  return <OboudCallWorkspace />;
}
