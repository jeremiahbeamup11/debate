"use client";

import { BACKEND_URL } from "@/config/env";
import { ensureSignedIn } from "@/lib/supabase";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** POST to the FastAPI backend with the caller's Supabase JWT. */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = await ensureSignedIn();
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    let detail = "Something went wrong";
    try {
      const data: unknown = await resp.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof data.detail === "string"
      ) {
        detail = data.detail;
      }
    } catch {
      // keep generic message
    }
    throw new ApiError(resp.status, detail);
  }
  return (await resp.json()) as T;
}
