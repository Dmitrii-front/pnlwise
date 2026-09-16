"use client";

import { initializePaddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";

export function PaddleCheckout({
  transactionId,
  reportId,
}: {
  transactionId: string;
  reportId?: string;
}) {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENV;
  const configured =
    !!token?.startsWith("test_") &&
    (environment === undefined || environment === "sandbox");
  const [error, setError] = useState(
    configured ? "" : "Paddle Sandbox checkout is not configured.",
  );

  useEffect(() => {
    let active = true;
    if (!configured) return;
    void initializePaddle({ token: token!, environment: "sandbox" })
      .then((paddle) => {
        if (!active || !paddle) return;
        paddle.Checkout.open({
          transactionId,
          settings: {
            displayMode: "overlay",
            variant: "one-page",
            showAddDiscounts: false,
            successUrl: `${window.location.origin}/checkout/success${
              reportId ? `?report=${encodeURIComponent(reportId)}` : ""
            }`,
          },
        });
      })
      .catch(() => {
        if (active) setError("Paddle Sandbox checkout could not be opened.");
      });
    return () => {
      active = false;
    };
  }, [configured, reportId, token, transactionId]);

  return (
    <div className="empty-state">
      <h1>Secure Sandbox checkout</h1>
      <p>
        {error ||
          "Paddle Checkout is opening. Your downloads unlock only after verified payment confirmation."}
      </p>
    </div>
  );
}
