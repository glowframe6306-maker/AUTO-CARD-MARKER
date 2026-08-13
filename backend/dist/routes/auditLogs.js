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
router.get("/", (0, authMiddleware_1.requirePermission)("view_audit_logs"), async (req, res) => {
    const { page = "1", pageSize = "20", search } = req.query;
    const where = {};
    if (search) {
        where.OR = [
            { actorRole: { contains: search, mode: "insensitive" } },
            { action: { contains: search, mode: "insensitive" } },
            { targetType: { contains: search, mode: "insensitive" } },
            { targetId: { contains: search, mode: "insensitive" } },
            { reason: { contains: search, mode: "insensitive" } },
        ];
    }
    const logs = await prisma_1.default.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(pageSize), take: Number(pageSize) });
    const count = await prisma_1.default.auditLog.count({ where });
    return res.json({ data: logs, count });
});
exports.default = router;
