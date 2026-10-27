import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/platform/require-platform-admin";
import { supabaseAdmin } from "@/lib/platform/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// POST /api/platform/accounts — platform admin only.
// Body: { companyName, ownerEmail, ownerName? }
// Creates the owner user (the signup trigger builds the account and
// profile) and returns a one-time link where the owner sets their
// own password. No password is ever shown or sent.
export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin();

    const limit = checkRateLimit(
      `admin:platformCreateAccount:${userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      companyName?: unknown;
      ownerEmail?: unknown;
      ownerName?: unknown;
    } | null;

    const companyName =
      typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const ownerEmail =
      typeof body?.ownerEmail === "string"
        ? body.ownerEmail.trim().toLowerCase()
        : "";
    const ownerName =
      typeof body?.ownerName === "string" ? body.ownerName.trim() : "";

    if (companyName.length < 2 || companyName.length > 100) {
      return NextResponse.json(
        { error: "'companyName' must have 2 to 100 characters" },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(ownerEmail)) {
      return NextResponse.json(
        { error: "'ownerEmail' must be a valid email" },
        { status: 400 },
      );
    }
    if (ownerName.length > 100) {
      return NextResponse.json(
        { error: "'ownerName' must have at most 100 characters" },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();
    // Random password nobody knows; the owner replaces it via the link.
    const unusedPassword = randomBytes(24).toString("base64url");

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: ownerEmail,
      password: unusedPassword,
      email_confirm: true,
      user_metadata: { full_name: ownerName || companyName },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "";
      if (/already|registered|exists/i.test(msg)) {
        return NextResponse.json(
          { error: "This email is already registered" },
          { status: 409 },
        );
      }
      console.error("[platform create account] createUser error:", createErr);
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 },
      );
    }

    const newUserId = created.user.id;

    const { data: profile, error: profErr } = await db
      .from("profiles")
      .select("account_id")
      .eq("user_id", newUserId)
      .maybeSingle();

    if (profErr || !profile?.account_id) {
      console.error("[platform create account] profile missing:", profErr);
      await db.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 },
      );
    }

    const { error: nameErr } = await db
      .from("accounts")
      .update({ name: companyName })
      .eq("id", profile.account_id);
    if (nameErr) {
      console.error("[platform create account] rename error:", nameErr);
    }

    const { data: linkData, error: linkErr } =
      await db.auth.admin.generateLink({
        type: "recovery",
        email: ownerEmail,
      });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkErr || !hashedToken) {
      console.error("[platform create account] generateLink error:", linkErr);
    }
    const setupLink = hashedToken
      ? `${new URL(request.url).origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=/reset-password`
      : null;

    return NextResponse.json(
      {
        account: {
          id: profile.account_id,
          name: companyName,
          owner_email: ownerEmail,
        },
        setup_link: setupLink,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}