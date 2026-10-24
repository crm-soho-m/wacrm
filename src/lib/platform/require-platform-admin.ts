import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/account";
import { supabaseAdmin } from "./admin-client";

/**
 * Resolve the caller and verify they are a platform admin.
 * Throws UnauthorizedError (no session) or ForbiddenError (not an admin).
 */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new UnauthorizedError();

  const { data, error } = await supabaseAdmin()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[requirePlatformAdmin] lookup error:", error);
    throw new ForbiddenError("Could not verify platform admin");
  }
  if (!data) throw new ForbiddenError("Platform admin only");

  return { userId: user.id };
}