"use client";

import { isPaddleClientToken, paddleEnvironment } from "./paddle-payment-core";

export function paddleClientConfiguration() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment = paddleEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENV);
  if (!environment || !isPaddleClientToken(token, environment)) return null;
  return { token: token!, environment };
}
