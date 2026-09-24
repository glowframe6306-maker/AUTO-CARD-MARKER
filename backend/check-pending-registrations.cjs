const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const registrations = await prisma.pendingRegistration.findMany({
    select: {
      id: true,
      name: true,
      rcStudentId: true,
      email: true,
      status: true,
      approvedById: true,
      approvedAt: true
    },
    orderBy: {
      id: "desc"
    },
    take: 20
  });

  console.log(JSON.stringify(registrations, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
