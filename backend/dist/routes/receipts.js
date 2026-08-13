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
router.get("/", authMiddleware_1.authenticate, async (req, res) => {
    const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
    const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));
    if (hasAdminAccess) {
        const receipts = await prisma_1.default.receipt.findMany({ include: { member: true, issuedBy: true }, orderBy: { issuedAt: "desc" } });
        return res.json(receipts);
    }
    if (req.user?.roles.includes("MEMBER")) {
        const receipts = await prisma_1.default.receipt.findMany({
            where: { member: { userId: req.user.id } },
            include: { member: true, issuedBy: true },
            orderBy: { issuedAt: "desc" },
        });
        return res.json(receipts);
    }
    return res.status(403).json({ error: "Forbidden" });
});
router.get("/:receiptNumber", authMiddleware_1.authenticate, async (req, res) => {
    const receipt = await prisma_1.default.receipt.findUnique({ where: { receiptNumber: req.params.receiptNumber }, include: { member: true, issuedBy: true } });
    if (!receipt)
        return res.status(404).json({ error: "Receipt not found." });
    const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
    const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));
    if (!hasAdminAccess && receipt.member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(receipt);
});
exports.default = router;
