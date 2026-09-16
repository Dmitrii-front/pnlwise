import type { Report, calculatePnl } from "./domain";
export interface ApiResponse {
  report: Report;
  pnl: ReturnType<typeof calculatePnl>;
  priceCents: number;
  checkoutEnabled: boolean;
  error: string;
  url: string;
  transactionId: string;
  successUrl: string;
  details?: { headers?: string[] };
  deleted?: boolean;
}
/** Responses from our same-origin API. Error bodies are checked before data is used. */
export async function readResponse(response: Response): Promise<ApiResponse> {
  return (await response.json()) as ApiResponse;
}
