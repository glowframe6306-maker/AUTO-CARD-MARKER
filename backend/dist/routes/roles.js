"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN"]), async (req, res) => {
    const roles = await prisma_1.default.role.findMany({ include: { permissions: { include: { permission: true } }, users: true } });
    return res.json(roles);
});
router.post("/assign", (0, authMiddleware_1.requireAnyRole)(["OWNER"]), async (req, res) => {
    const { accountId, roleName } = req.body;
    if (!accountId || !roleName) {
        return res.status(400).json({ error: "accountId and roleName are required." });
    }
    const user = await prisma_1.default.user.findUnique({ where: { accountId } });
    const role = await prisma_1.default.role.findUnique({ where: { name: roleName } });
    if (!user || !role)
        return res.status(404).json({ error: "User or role not found." });
    await prisma_1.default.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return res.json({ message: "Role assigned." });
});
exports.default = router;
