const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      isOwner: false,
      memberProfile: null
    },
    select: {
      id: true,
      accountId: true,
      email: true,
      fullName: true
    },
    orderBy: {
      id: "asc"
    }
  });

  console.log(`Found ${users.length} users without MemberProfile.`);

  let created = 0;

  for (const user of users) {
    const registration = await prisma.pendingRegistration.findFirst({
      where: {
        email: user.email,
        rcStudentId: user.accountId,
        status: "APPROVED"
      },
      orderBy: {
        id: "desc"
      }
    });

    if (!registration) {
      console.log(
        `SKIP User ${user.id}: no matching APPROVED registration`
      );
      continue;
    }

    const existing = await prisma.memberProfile.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { memberId: registration.rcStudentId }
        ]
      }
    });

    if (existing) {
      console.log(
        `SKIP User ${user.id}: MemberProfile already exists`
      );
      continue;
    }

    await prisma.memberProfile.create({
      data: {
        userId: user.id,
        memberId: registration.rcStudentId,
        fullName: registration.name,
        grade: "",
        position: "",
        status: "ACTIVE"
      }
    });

    created++;

    console.log(
      `CREATED User ${user.id} -> MemberProfile ${registration.rcStudentId}`
    );
  }

  console.log(`\nCreated: ${created}`);
  console.log("BACKFILL_COMPLETED");
}

main()
  .catch((error) => {
    console.error("\nBACKFILL_FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
