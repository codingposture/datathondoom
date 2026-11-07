import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./services";

/** Wraps a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: e.issues }, { status: 400 });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: (e as Error).message ?? "Internal error" }, { status: 500 });
    }
  };
}

export type Params<T extends string> = { params: Promise<Record<T, string>> };
