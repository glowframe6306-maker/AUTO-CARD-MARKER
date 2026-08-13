"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
exports.requireAnyRole = requireAnyRole;
exports.requirePermission = requirePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const secret = process.env.JWT_SECRET || "replace-this-secret";
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const verified = jsonwebtoken_1.default.verify(token, secret);
        req.user = {
            id: verified.id,
            accountId: verified.accountId,
            roles: verified.roles || [],
            permissions: verified.permissions || [],
            isOwner: verified.isOwner || false,
            deviceIdentifier: verified.deviceIdentifier,
        };
        return next();
    }
    catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}
function requireRole(roleName) {
    return (req, res, next) => {
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
function requireAnyRole(roleNames) {
    return (req, res, next) => {
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
function requirePermission(permissionName) {
    return (req, res, next) => {
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
