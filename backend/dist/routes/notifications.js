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
router.get("/", async (req, res) => {
    const notifications = await prisma_1.default.notification.findMany({ where: { recipientId: req.user.id }, orderBy: { createdAt: "desc" } });
    return res.json(notifications);
});
router.post("/read/:id", async (req, res) => {
    const notification = await prisma_1.default.notification.update({ where: { id: Number(req.params.id) }, data: { read: true } });
    return res.json(notification);
});
exports.default = router;
