import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "readline";

const prisma = new PrismaClient();

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const password = await new Promise<string>((resolve) => {
    rl.question("Enter secondary password for all non-owner accounts: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  if (!password.trim()) {
    throw new Error("Password cannot be empty.");
  }

  const secondaryPasswordHash = await bcrypt.hash(password, 12);

  const result = await prisma.user.updateMany({
    where: {
      isOwner: false,
    },
    data: {
      secondaryPasswordHash,
    },
  });

  console.log(`SUCCESS: Secondary password set for ${result.count} non-owner account(s).`);
}

main()
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
