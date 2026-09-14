import { authClient } from "@/lib/auth";
import { db, session, track } from "@/lib/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const report = url.searchParams.get("report");
  const target =
    report && /^[a-f0-9-]{36}$/.test(report)
      ? `/report/${report}`
      : "/generate";
  const client = await authClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await client.auth.getUser();
      if (data.user) {
        const owner = await session(true);
        await db()
          .prepare(
            "UPDATE reports SET user_id=? WHERE session_hash=? AND user_id IS NULL",
          )
          .bind(data.user.id, owner)
          .run();
        await track("account_created");
        return Response.redirect(new URL(target, req.url), 303);
      }
    }
  }
  return Response.redirect(
    new URL(
      `/sign-in?error=expired${report ? "&report=" + encodeURIComponent(report) : ""}`,
      req.url,
    ),
    303,
  );
}
