import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/platform/require-platform-admin";
import { supabaseAdmin } from "@/lib/platform/admin-client";

// GET /api/platform/accounts — platform admin only.
export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();

    const { data: accounts, error: accErr } = await db
      .from("accounts")
      .select("id, name, status, suspended_at, created_at, owner_user_id")
      .order("created_at", { ascending: false });
    if (accErr) throw accErr;

    const { data: profiles, error: profErr } = await db
      .from("profiles")
      .select("account_id, user_id, email, account_role");
    if (profErr) throw profErr;

    const result = (accounts ?? []).map((a) => {
      const members = (profiles ?? []).filter((p) => p.account_id === a.id);
      const owner = members.find((m) => m.user_id === a.owner_user_id);
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        suspended_at: a.suspended_at,
        created_at: a.created_at,
        owner_email: owner?.email ?? null,
        member_count: members.length,
      };
    });

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}