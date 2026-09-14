"use client";

import { useEffect } from "react";
import { config } from "@/lib/config";

type ModelContext = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
      };
      execute(input: unknown): unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

export function WebMcp() {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: "start_pnl_report",
          title: "Start P&L report",
          description:
            `Open the ${config.name} statement upload flow to start a new P&L report.`,
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          execute() {
            window.location.href = "/generate";
            return { status: "opened", route: "/generate" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});

    return () => lifecycle.abort();
  }, []);

  return null;
}
