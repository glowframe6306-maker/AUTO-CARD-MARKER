const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { accountId: "owner" },
    select: { id: true, accountId: true, passwordHash: true }
  });

  if (!user) {
    console.log("OWNER_NOT_FOUND");
    return;
  }

  const password = process.env.NEW_OWNER_PASSWORD;

  if (!password) {
    console.log("NEW_OWNER_PASSWORD is missing.");
    return;
  }

  if (password.length < 8) {
    console.log("PASSWORD_TOO_SHORT");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { accountId: "owner" },
    data: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      forcePasswordReset: false
    }
  });

  console.log("OWNER_PASSWORD_CHANGED");
  console.log("ACCOUNT = owner");
  console.log("FAILED_ATTEMPTS_RESET = 0");
  console.log("LOCK = CLEARED");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
