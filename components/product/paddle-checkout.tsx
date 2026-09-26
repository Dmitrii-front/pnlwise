"use client";

import { initializePaddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";
import { paddleClientConfiguration } from "@/lib/paddle-client";

export function PaddleCheckout({
  transactionId,
  reportId,
}: {
  transactionId: string;
  reportId?: string;
}) {
  const configuration = paddleClientConfiguration();
  const configured = !!configuration;
  const token = configuration?.token;
  const environment = configuration?.environment;
  const [error, setError] = useState(
    configured ? "" : "Paddle checkout is not configured.",
  );

  useEffect(() => {
    let active = true;
    if (!configured) return;
    void initializePaddle({ token: token!, environment: environment! })
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
        if (active) setError("Paddle checkout could not be opened.");
      });
    return () => {
      active = false;
    };
  }, [configured, environment, reportId, token, transactionId]);

  return (
    <div className="empty-state">
      <h1>Secure checkout</h1>
      <p>
        {error ||
          "Paddle Checkout is opening. Your downloads unlock only after verified payment confirmation."}
      </p>
    </div>
  );
}
