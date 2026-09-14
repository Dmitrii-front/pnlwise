import {
  api,
  body,
  json,
  guardOrigin,
  sessionRate,
  AppError,
  setting,
} from "@/lib/server";
import { authClient } from "@/lib/auth";
import { config } from "@/lib/config";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "auth", 5);
    const input = await body(req);
    const client = await authClient();
    if (!client)
      throw new AppError(
        "Account sign-in is not enabled yet. You can continue without an account.",
        503,
      );
    const report =
      typeof input.reportId === "string" &&
      /^[a-f0-9-]{36}$/.test(input.reportId)
        ? input.reportId
        : "";
    const origin = setting("APP_ORIGIN") || config.siteUrl;
    const redirectTo = `${origin}/auth/confirm${report ? "?report=" + report : ""}`;
    if (input.provider === "google") {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url)
        throw new AppError(
          "Google sign-in is unavailable. Try email instead.",
          503,
        );
      return json({ url: data.url });
    }
    if (
      typeof input.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(input.email) ||
      input.email.length > 254
    )
      throw new AppError("Enter a valid email address.");
    const { error } = await client.auth.signInWithOtp({
      email: input.email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error)
      throw new AppError(
        "We couldn’t send your sign-in link. Wait a moment and try again.",
        503,
      );
    return json({ sent: true });
  });
