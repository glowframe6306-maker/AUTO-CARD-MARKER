import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma";
import { authenticate, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

/*
 * OWNER ONLY
 *
 * Receipts are system-wide financial records.
 * Only the real Owner account can view/download them.
 */

function requireOwner(req: AuthorizedRequest, res: any, next: any) {
  if (!req.user?.isOwner) {
    return res.status(403).json({
      error: "Forbidden. Receipts are available to the Owner only.",
    });
  }

  return next();
}

router.use(requireOwner);

/*
 * GET ALL RECEIPTS
 */
router.get("/", async (_req: AuthorizedRequest, res) => {
  try {
    const receipts = await prisma.receipt.findMany({
      include: {
        member: true,
        issuedBy: true,
        payment: true,
      },
      orderBy: {
        issuedAt: "desc",
      },
    });

    return res.json(receipts);
  } catch (error) {
    console.error("Failed to load receipts:", error);

    return res.status(500).json({
      error: "Failed to load receipts.",
    });
  }
});

/*
 * GET SINGLE RECEIPT
 */
router.get("/:receiptNumber", async (req: AuthorizedRequest, res) => {
  try {
    const receipt = await prisma.receipt.findUnique({
      where: {
        receiptNumber: req.params.receiptNumber,
      },
      include: {
        member: true,
        issuedBy: true,
        payment: true,
      },
    });

    if (!receipt) {
      return res.status(404).json({
        error: "Receipt not found.",
      });
    }

    return res.json(receipt);
  } catch (error) {
    console.error("Failed to load receipt:", error);

    return res.status(500).json({
      error: "Failed to load receipt.",
    });
  }
});

/*
 * DOWNLOAD RECEIPT AS PDF
 */
router.get("/:receiptNumber/pdf", async (req: AuthorizedRequest, res) => {
  try {
    const receipt = await prisma.receipt.findUnique({
      where: {
        receiptNumber: req.params.receiptNumber,
      },
      include: {
        member: true,
        issuedBy: true,
        payment: true,
      },
    });

    if (!receipt) {
      return res.status(404).json({
        error: "Receipt not found.",
      });
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    const safeFileName = receipt.receiptNumber.replace(
      /[^a-zA-Z0-9-_]/g,
      "_"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}.pdf"`
    );

    doc.pipe(res);

    /*
     * HEADER
     */
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("AUTO CARD MARKING", {
        align: "center",
      });

    doc
      .moveDown(0.3)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("PAYMENT RECEIPT", {
        align: "center",
      });

    doc.moveDown(1);

    /*
     * RECEIPT NUMBER
     */
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(`Receipt No: ${receipt.receiptNumber}`);

    doc.moveDown(0.8);

    /*
     * RECEIPT DETAILS
     */
    const issuedDate = new Date(receipt.issuedAt);

    const dateText = issuedDate.toLocaleDateString("en-GB");
    const timeText = issuedDate.toLocaleTimeString("en-GB");

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthText =
      receipt.month >= 1 && receipt.month <= 12
        ? monthNames[receipt.month - 1]
        : String(receipt.month);

    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Name: ${receipt.member.fullName}`)
      .text(`Member ID: ${receipt.member.memberId}`)
      .text(`Date: ${dateText}`)
      .text(`Time: ${timeText}`)
      .text(`Month: ${monthText}`)
      .text(`Amount Paid: Rs. ${receipt.amount.toLocaleString()}`)
      .text(`Weeks Paid: ${receipt.weeksPaid}`);

    doc.moveDown(1);

    /*
     * SEPARATOR
     */
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();

    doc.moveDown(1);

    /*
     * PAYMENT INFORMATION
     */
    if (receipt.payment) {
      const paymentDate = new Date(receipt.payment.paymentDate);

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("Payment Information");

      doc
        .moveDown(0.4)
        .font("Helvetica")
        .text(
          `Payment Date: ${paymentDate.toLocaleDateString("en-GB")}`
        )
        .text(
          `Payment Amount: Rs. ${receipt.payment.paymentAmount.toLocaleString()}`
        )
        .text(`Payment Status: ${receipt.payment.status}`);
    }

    doc.moveDown(2);

    /*
     * ISSUED BY
     */
    doc
      .fontSize(10)
      .text(
        `Issued By: ${receipt.issuedBy?.fullName ?? "System Owner"}`
      );

    doc.moveDown(3);

    /*
     * FOOTER
     */
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(
        "This is a system-generated payment receipt.",
        {
          align: "center",
        }
      );

    doc.end();
  } catch (error) {
    console.error("Failed to generate receipt PDF:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Failed to generate receipt PDF.",
      });
    }
  }
});

export default router;
