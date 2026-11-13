import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const mode = process.env.AFTERLIFE_AUTH_MODE ?? "local";
  const secret = process.env.AFTERLIFE_PROXY_SECRET ?? "";
  if (mode !== "local" && mode !== "required") return new Response("Invalid proxy configuration", { status: 503 });
  if (mode === "required" && !/^[A-Za-z0-9_-]{32,}$/.test(secret)) return new Response("Invalid proxy configuration", { status: 503 });
  const headers = new Headers(request.headers);
  headers.delete("x-afterlife-proxy-secret");
  if (mode === "required") headers.set("x-afterlife-proxy-secret", secret);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
