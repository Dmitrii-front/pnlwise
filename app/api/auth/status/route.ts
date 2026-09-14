import { accountUser, authEnabled } from "@/lib/auth";
import { api, json } from "@/lib/server";
export const GET = () =>
  api(async () => {
    const user = await accountUser();
    return json({ enabled: authEnabled(), email: user?.email || null });
  });
