import { notFound } from "next/navigation";
import { getOwnerForPage } from "@/lib/roles";
import { recordAuditLog } from "@/lib/privacy-search";
import { OwnerArchitecture } from "./OwnerArchitecture";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function OwnerArchitecturePage() {
  const { status, user } = await getOwnerForPage();
  if (status === 403) {
    await recordAuditLog({
      actorId: user?.id ?? null,
      action: "unauthorized_owner_access",
      metadata: { path: "/owner/architecture", status },
    });
    notFound(); // subscribers learn nothing about this page
  }
  // 401: only a login form is rendered, never any architecture content.
  return <OwnerArchitecture authenticated={status === 200} />;
}
