import { accountUser, authClient } from "@/lib/auth";
import { api, json, guardOrigin, db, session, AppError } from "@/lib/server";
import { cookies } from "next/headers";
import { paddleCheckoutSql } from "@/lib/paddle-d1";
export const DELETE = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    const owner = await session(true);
    const user = await accountUser();
    const userId = user?.id || "";
    const results = await db().batch([
      db()
        .prepare(paddleCheckoutSql.deleteOwnedWithoutActive)
        .bind(owner, userId, owner, userId),
      db().prepare(paddleCheckoutSql.activeForOwner).bind(owner, userId),
    ]);
    if ((results[1]?.results.length || 0) > 0)
      throw new AppError(
        "A Paddle checkout is active for this report. Complete the checkout or contact support before deleting your report data.",
        409,
      );
    await (await authClient())?.auth.signOut({ scope: "local" });
    (await cookies()).delete("cl_session");
    return json({ deleted: true });
  });
