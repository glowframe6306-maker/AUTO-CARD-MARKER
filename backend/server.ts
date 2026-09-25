import dotenv from "dotenv";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";

import authRouter from "./routes/auth";
import memberRouter from "./routes/members";
import paymentRouter from "./routes/payments";
import cardRouter from "./routes/cards";
import paymentRequestsRouter from "./routes/paymentRequests";
import approvalRouter from "./routes/approvals";
import reportRouter from "./routes/reports";
import systemRouter from "./routes/system";
import userRouter from "./routes/users";
import roleRouter from "./routes/roles";
import notificationsRouter from "./routes/notifications";
import announcementRouter from "./routes/announcements";
import backupRouter from "./routes/backup";
import auditLogRouter from "./routes/auditLogs";
import receiptRouter from "./routes/receipts";
import verificationRouter from "./routes/verification";
import registrationsRouter from "./routes/registrations";
import monthsRouter from "./routes/months";
import leaderboardRouter from "./routes/leaderboard";
import chatsRouter from "./routes/chats";
import { Server } from "socket.io";
import { attachChatSocket } from "./chatSocket";

dotenv.config();

const tesseractPath = "C:\Program Files\Tesseract-OCR";
process.env.PATH = `${tesseractPath};${process.env.PATH || ""}`;

const app = express();
const port = Number(process.env.APP_PORT || 8000);
const staticUploadPath = path.resolve(__dirname, "../../uploads");

app.use(helmet());
const corsOrigins = process.env.FRONTEND_URL?.split(",") || ["http://localhost:3000"];
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    exposedHeaders: ["Authorization"],
  })
);
app.options("*", cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  skip: (req) => req.method === "POST" && req.path === "/api/auth/login",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use("/uploads", express.static(staticUploadPath));

app.use("/api/auth", authRouter);
app.use("/api/members", memberRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/payments/requests", paymentRequestsRouter);
app.use("/api/cards", cardRouter);
app.use("/api/approvals", approvalRouter);
app.use("/api/reports", reportRouter);
app.use("/api/system", systemRouter);
app.use("/api/users", userRouter);
app.use("/api/roles", roleRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/announcements", announcementRouter);
app.use("/api/backup", backupRouter);
app.use("/api/audit-logs", auditLogRouter);
app.use("/api/receipts", receiptRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/registrations", registrationsRouter);
app.use("/api/months", monthsRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/chats", chatsRouter);

app.get("/health", (req, res) => res.json({ status: "ok", backend: "online" }));

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: "An unexpected error occurred." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigins, credentials: true },
});
attachChatSocket(io);

if (process.env.VERCEL !== "1") {
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Backend running at http://localhost:${port}`);
  });
}

export default app;










