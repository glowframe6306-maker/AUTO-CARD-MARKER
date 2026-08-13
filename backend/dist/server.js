"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const members_1 = __importDefault(require("./routes/members"));
const payments_1 = __importDefault(require("./routes/payments"));
const cards_1 = __importDefault(require("./routes/cards"));
const approvals_1 = __importDefault(require("./routes/approvals"));
const reports_1 = __importDefault(require("./routes/reports"));
const system_1 = __importDefault(require("./routes/system"));
const users_1 = __importDefault(require("./routes/users"));
const roles_1 = __importDefault(require("./routes/roles"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const announcements_1 = __importDefault(require("./routes/announcements"));
const backup_1 = __importDefault(require("./routes/backup"));
const auditLogs_1 = __importDefault(require("./routes/auditLogs"));
const receipts_1 = __importDefault(require("./routes/receipts"));
const verification_1 = __importDefault(require("./routes/verification"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.APP_PORT || 8000);
const staticUploadPath = path_1.default.join(__dirname, "../../uploads/secure");
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL?.split(",") || ["http://localhost:3000"], credentials: true }));
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
app.use((0, morgan_1.default)("combined"));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 100),
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use("/uploads", express_1.default.static(staticUploadPath));
app.use("/api/auth", auth_1.default);
app.use("/api/members", members_1.default);
app.use("/api/payments", payments_1.default);
app.use("/api/cards", cards_1.default);
app.use("/api/approvals", approvals_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/system", system_1.default);
app.use("/api/users", users_1.default);
app.use("/api/roles", roles_1.default);
app.use("/api/notifications", notifications_1.default);
app.use("/api/announcements", announcements_1.default);
app.use("/api/backup", backup_1.default);
app.use("/api/audit-logs", auditLogs_1.default);
app.use("/api/receipts", receipts_1.default);
app.use("/api/verification", verification_1.default);
app.get("/health", (req, res) => res.json({ status: "ok", backend: "online" }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: "An unexpected error occurred." });
});
app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
