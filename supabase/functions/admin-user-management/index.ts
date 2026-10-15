import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-code, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

function constantTimeEquals(first: string, second: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(first);
  const right = encoder.encode(second);
  let difference = left.length ^ right.length;
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  const allowedOrigin = Deno.env.get("SITE_ORIGIN");
  const origin = request.headers.get("origin");
  if (!allowedOrigin || origin !== allowedOrigin) {
    return new Response("Origin not allowed", { status: 403 });
  }
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowedOrigin };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  const authorization = request.headers.get("authorization");
  const expectedCode = Deno.env.get("ADMIN_ACCESS_CODE");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization?.startsWith("Bearer ") || !expectedCode || expectedCode.length < 24 || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return Response.json({ error: "The admin service is not configured or the request is unauthenticated." }, { status: 503, headers });
  }

  const token = authorization.slice("Bearer ".length);
  const suppliedCode = request.headers.get("x-admin-code") ?? "";
  if (suppliedCode.length > 256) {
    return Response.json({ error: "The server-verified admin code is incorrect." }, { status: 403, headers });
  }
  const requester = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: requesterData, error: requesterError } = await requester.auth.getUser(token);
  if (requesterError || requesterData.user?.app_metadata?.role !== "owner") {
    return Response.json({ error: "The owner account is required." }, { status: 403, headers });
  }
  if (!constantTimeEquals(suppliedCode, expectedCode)) {
    return Response.json({ error: "The server-verified admin code is incorrect." }, { status: 403, headers });
  }

  let body: { action?: unknown; page?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400, headers });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (body.action === "list-users") {
    const page = typeof body.page === "number" && Number.isInteger(body.page) ? Math.max(1, Math.min(body.page, 10000)) : 1;
    const perPage = 50;
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return Response.json({ error: error.message }, { status: 502, headers });
    return Response.json({
      page,
      perPage,
      hasMore: data.users.length === perPage,
      users: data.users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at,
        banned_until: user.banned_until ?? null,
        role: user.app_metadata?.role === "owner" || user.app_metadata?.role === "moderator" ? user.app_metadata.role : "member"
      }))
    }, { headers });
  }

  if (typeof body.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.userId)) {
    return Response.json({ error: "A valid account ID is required." }, { status: 400, headers });
  }

  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(body.userId);
  if (targetError || !targetData.user) return Response.json({ error: "Account not found." }, { status: 404, headers });
  if (targetData.user.app_metadata?.role === "owner" || targetData.user.id === requesterData.user.id) {
    return Response.json({ error: "The owner account cannot be changed from this panel." }, { status: 400, headers });
  }

  if (body.action === "make-moderator" || body.action === "remove-moderator") {
    const appMetadata = { ...targetData.user.app_metadata };
    if (body.action === "make-moderator") {
      appMetadata.role = "moderator";
    } else if (appMetadata.role === "moderator") {
      delete appMetadata.role;
    }
    const { error } = await admin.auth.admin.updateUserById(body.userId, { app_metadata: appMetadata });
    if (error) return Response.json({ error: error.message }, { status: 502, headers });
    return Response.json({ success: true }, { headers });
  }

  if (body.action === "ban-user" || body.action === "unban-user") {
    const banDuration = body.action === "ban-user" ? "720h" : "none";
    const { error } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: banDuration });
    if (error) return Response.json({ error: error.message }, { status: 502, headers });
    return Response.json({ success: true }, { headers });
  }

  return Response.json({ error: "Unsupported admin action." }, { status: 400, headers });
});
