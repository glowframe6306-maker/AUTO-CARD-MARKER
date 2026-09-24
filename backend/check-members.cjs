const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { isOwner: false },
    select: {
      id: true,
      accountId: true,
      email: true,
      fullName: true,
      status: true,
      isOwner: true,
      memberProfile: {
        select: {
          id: true,
          memberId: true,
          userId: true,
          fullName: true,
          status: true
        }
      }
    },
    orderBy: { id: "desc" },
    take: 20
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
