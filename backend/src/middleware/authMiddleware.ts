import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const secret = process.env.JWT_SECRET || "replace-this-secret";

export interface AuthorizedRequest extends Request {
  user?: {
    id: number;
    accountId: string;
    roles: string[];
    permissions: string[];
    isOwner: boolean;
    deviceIdentifier?: string;
  };
}

export function authenticate(req: AuthorizedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const verified = jwt.verify(token, secret) as any;
    req.user = {
      id: verified.id,
      accountId: verified.accountId,
      roles: verified.roles || [],
      permissions: verified.permissions || [],
      isOwner: verified.isOwner || false,
      deviceIdentifier: verified.deviceIdentifier,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(roleName: string) {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.user.isOwner) {
      return next();
    }
    if (req.user.roles.includes(roleName)) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden" });
  };
}

export function requireAnyRole(roleNames: string[]) {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (user.isOwner) {
      return next();
    }
    const hasRole = roleNames.some((role) => user.roles.includes(role));
    if (hasRole) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden" });
  };
}

export function requirePermission(permissionName: string) {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (user.isOwner) {
      return next();
    }
    if (user.permissions.includes(permissionName)) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden" });
  };
}
