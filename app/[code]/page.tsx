import { redirect } from "next/navigation";
import { isInviteCode } from "@/lib/invites";

export default function InvitePathPage({ params }: { params: { code: string } }) {
  const code = params.code?.trim() ?? "";
  if (!isInviteCode(code)) redirect("/");
  redirect(`/?invite=${encodeURIComponent(code)}`);
}
