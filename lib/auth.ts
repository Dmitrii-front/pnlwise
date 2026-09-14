import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
function value(key: string) {
  return (
    (env as unknown as Record<string, string | undefined>)[key] ||
    process.env[key]
  );
}
export function authEnabled() {
  return !!(value("SUPABASE_URL") && value("SUPABASE_PUBLISHABLE_KEY"));
}
/** Used only in route handlers, where refreshed cookies can be set safely. */
export async function authClient() {
  if (!authEnabled()) return null;
  const jar = await cookies();
  return createServerClient(
    value("SUPABASE_URL")!,
    value("SUPABASE_PUBLISHABLE_KEY")!,
    {
      cookieOptions: {
        httpOnly: true,
        secure:
          value("COOKIE_SECURE") !== "false" &&
          process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        },
      },
    },
  );
}
export async function accountUser() {
  const client = await authClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}
