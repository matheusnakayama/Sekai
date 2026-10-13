import { redirect } from "next/navigation";
import { isInviteCode } from "@/lib/invites";

export default async function InvitePathPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode?.trim() ?? "";
  if (!isInviteCode(code)) redirect("/");
  redirect(`/?invite=${encodeURIComponent(code)}`);
}
