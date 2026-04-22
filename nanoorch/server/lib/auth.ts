import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { workspaceMembers } from "@shared/schema";
import { and, eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;
    csrfToken: string;
    oidcState?: string;
    oidcCodeVerifier?: string;
    oidcProviderId?: string;
    oidcRedirect?: string;
    samlProviderId?: string;
    samlRedirect?: string;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const hashBuffer = Buffer.from(hash, "hex");
    const derivedHash = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuffer, derivedHash);
  } catch {
    return false;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Forbidden — admin only" });
  }
  next();
}

/**
 * Allows access if the user is a global admin OR a workspace admin for the
 * workspace identified by req.params.id. Use on all workspace-scoped routes.
 */
export function requireWorkspaceAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.session.userRole === "admin") {
    return next();
  }
  const workspaceId = req.params.id;
  if (!workspaceId) {
    return res.status(403).json({ error: "Forbidden — workspace admin access required" });
  }
  db.select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId as string),
      eq(workspaceMembers.userId, req.session.userId as string),
      eq(workspaceMembers.role, "admin"),
    ))
    .then(([row]) => {
      if (row) return next();
      return res.status(403).json({ error: "Forbidden — workspace admin access required" });
    })
    .catch(next);
}
