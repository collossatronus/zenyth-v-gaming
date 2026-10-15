import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.8.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const liveKitUrl = Deno.env.get("LIVEKIT_URL");
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey || !liveKitApiKey || !liveKitApiSecret || !liveKitUrl) {
    return Response.json({ error: "Call service is not configured or the request is unauthenticated." }, { status: 503, headers });
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "A valid signed-in account is required." }, { status: 401, headers });
  }

  let body: { roomName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400, headers });
  }
  if (typeof body.roomName !== "string" || !/^[a-zA-Z0-9_-]{3,64}$/.test(body.roomName)) {
    return Response.json({ error: "The room name must contain 3 to 64 letters, numbers, hyphens, or underscores." }, { status: 400, headers });
  }

  const accessToken = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: userData.user.id,
    name: userData.user.user_metadata?.full_name ?? userData.user.user_metadata?.name ?? "Membre de la communauté",
    ttl: "10m"
  });
  accessToken.addGrant({
    room: body.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true
  });

  return Response.json({ token: await accessToken.toJwt() }, { headers });
});
