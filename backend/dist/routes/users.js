"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const auth_1 = require("../utils/auth");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const users = await prisma_1.default.user.findMany({ include: { roles: { include: { role: true } }, memberProfile: true } });
    return res.json(users);
});
router.post("/", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN"]), async (req, res) => {
    const { accountId, fullName, email, password, roleName } = req.body;
    if (!accountId || !fullName || !password || !roleName) {
        return res.status(400).json({ error: "Required fields: accountId, fullName, password, roleName." });
    }
    const role = await prisma_1.default.role.findUnique({ where: { name: roleName } });
    if (!role)
        return res.status(400).json({ error: "Role not found." });
    const passwordHash = await (0, auth_1.hashPassword)(password);
    const user = await prisma_1.default.user.create({
        data: {
            accountId,
            fullName,
            email,
            passwordHash,
            status: "ACTIVE",
            forcePasswordReset: true,
            roles: { create: [{ roleId: role.id }] },
        },
    });
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: "CREATE_USER",
            targetType: "USER",
            targetId: accountId,
            status: "SUCCESS",
        },
    });
    return res.status(201).json(user);
});
exports.default = router;
