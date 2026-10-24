import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/platform/require-platform-admin";
import { supabaseAdmin } from "@/lib/platform/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/platform/accounts/[accountId]/status
// Body: { "status": "active" | "suspended" } — platform admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { userId } = await requirePlatformAdmin();

    const limit = checkRateLimit(
      `admin:platformAccountStatus:${userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { accountId } = await params;
    if (!UUID_RE.test(accountId)) {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as
      | { status?: unknown }
      | null;
    const status = body?.status;
    if (status !== "active" && status !== "suspended") {
      return NextResponse.json(
        { error: "'status' must be 'active' or 'suspended'" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin()
      .from("accounts")
      .update({
        status,
        suspended_at: status === "suspended" ? new Date().toISOString() : null,
      })
      .eq("id", accountId)
      .select("id, name, status, suspended_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}