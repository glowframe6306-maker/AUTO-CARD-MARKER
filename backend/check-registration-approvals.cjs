const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      targetType: "REGISTRATION"
    },
    select: {
      id: true,
      requestId: true,
      actionType: true,
      targetType: true,
      targetId: true,
      status: true,
      newValue: true,
      createdAt: true,
      reviewedAt: true
    },
    orderBy: {
      id: "desc"
    },
    take: 20
  });

  console.log(JSON.stringify(approvals, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
