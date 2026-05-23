import type { MiddlewareHandler } from "hono";
import type { Env } from "./index";

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const token = c.req.header("X-Auth-Token");
  if (!token || token !== c.env.AUTH_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
