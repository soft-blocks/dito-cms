import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";
import * as authSchema from "./auth-schema";

const fullSchema = { ...schema, ...authSchema };

/** Build a request-scoped Drizzle client over the D1 binding. */
export function createDb(d1: D1Database): DrizzleDb {
  return drizzle(d1, { schema: fullSchema });
}

export type DrizzleDb = ReturnType<typeof drizzle<typeof fullSchema>>;
