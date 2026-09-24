import { Router } from "express";
import prisma from "../prisma";
import { hashPassword } from "../utils/auth";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { name, rcStudentId, email, dob, password } = req.body ?? {};

    const normalizedName =
      typeof name === "string" ? name.trim() : "";

    const normalizedRcStudentId =
      typeof rcStudentId === "string"
        ? rcStudentId.trim()
        : String(rcStudentId || "");

    const normalizedEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    const normalizedDob =
      typeof dob === "string" ? dob.trim() : dob;

    const normalizedPassword =
      typeof password === "string" ? password : "";

    const missingFields: string[] = [];

    if (!normalizedName) missingFields.push("name");
    if (!normalizedRcStudentId) missingFields.push("rcStudentId");
    if (!normalizedEmail) missingFields.push("email");
    if (!normalizedDob) missingFields.push("dob");
    if (!normalizedPassword) missingFields.push("password");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required registration fields.",
        code: "MISSING_FIELDS",
        missingFields,
      });
    }

    const parsedDob = new Date(normalizedDob);

    if (Number.isNaN(parsedDob.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid date of birth.",
      });
    }

    const [
      existingUserByAccount,
      existingUserByEmail,
      existingMember,
      existingPending,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { accountId: normalizedRcStudentId },
        select: { id: true },
      }),

      prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),

      prisma.memberProfile.findUnique({
        where: { memberId: normalizedRcStudentId },
        select: { id: true },
      }),

      prisma.pendingRegistration.findUnique({
        where: { rcStudentId: normalizedRcStudentId },
        select: { id: true, status: true },
      }),
    ]);

    if (existingUserByAccount || existingMember || existingPending) {
      return res.status(409).json({
        success: false,
        error:
          "An account or pending registration with that RC Student ID already exists.",
        code: "DUPLICATE_REGISTRATION",
      });
    }

    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        error: "An account with that email already exists.",
        code: "DUPLICATE_EMAIL",
      });
    }

    const passwordHash = await hashPassword(normalizedPassword);

    const registration = await prisma.pendingRegistration.create({
      data: {
        name: normalizedName,
        rcStudentId: normalizedRcStudentId,
        email: normalizedEmail,
        dob: parsedDob,
        passwordHash,
        imagePath: "",
      },
    });

    const requestId =
      `REG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    await prisma.approvalRequest.create({
      data: {
        requestId,
        requesterId: null,
        requesterRole: "PUBLIC",
        actionType: "CREATE",
        targetType: "REGISTRATION",
        targetId: String(registration.id),
        oldValue: {},
        newValue: {
          name: registration.name,
          rcStudentId: registration.rcStudentId,
          email: registration.email,
          dob: registration.dob,
          imagePath: registration.imagePath,
        },
        reason: "New member registration",
        status: "PENDING",
      },
    });

    return res.status(201).json({
      success: true,
      id: registration.id,
      name: registration.name,
      rcStudentId: registration.rcStudentId,
      email: registration.email,
      dob: registration.dob,
      status: registration.status,
      message: "Registration submitted successfully.",
    });
  } catch (error: any) {
    console.error("REGISTRATION ERROR:", error?.message ?? error);

    return res.status(500).json({
      success: false,
      error: "Unable to submit registration.",
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const registrations =
      await prisma.pendingRegistration.findMany({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          rcStudentId: true,
          email: true,
          dob: true,
          imagePath: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          approvedById: true,
          approvedAt: true,
        },
      });

    return res.json(registrations);
  } catch (error: any) {
    console.error("REGISTRATION LIST ERROR:", error?.message ?? error);

    return res.status(500).json({
      success: false,
      error: "Unable to load registrations.",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid registration ID.",
      });
    }

    const registration =
      await prisma.pendingRegistration.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          rcStudentId: true,
          email: true,
          dob: true,
          imagePath: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          approvedById: true,
          approvedAt: true,
        },
      });

    if (!registration) {
      return res.status(404).json({
        success: false,
        error: "Registration not found.",
      });
    }

    return res.json(registration);
  } catch (error: any) {
    console.error(
      "REGISTRATION DETAILS ERROR:",
      error?.message ?? error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to load registration details.",
    });
  }
});

export default router;
