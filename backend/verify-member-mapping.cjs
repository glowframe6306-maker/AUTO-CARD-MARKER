const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      isOwner: false
    },
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
    orderBy: {
      id: "asc"
    }
  });

  for (const user of users) {
    const registrations = await prisma.pendingRegistration.findMany({
      where: {
        email: user.email,
        status: "APPROVED"
      },
      select: {
        id: true,
        rcStudentId: true,
        name: true,
        email: true,
        status: true
      },
      orderBy: {
        id: "desc"
      }
    });

    console.log(JSON.stringify({
      user,
      approvedRegistrations: registrations
    }, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
