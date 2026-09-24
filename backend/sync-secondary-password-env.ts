import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const existingUser = await prisma.user.findFirst({
    where: {
      isOwner: false,
      secondaryPasswordHash: {
        not: null,
      },
    },
    select: {
      secondaryPasswordHash: true,
    },
  });

  if (!existingUser?.secondaryPasswordHash) {
    throw new Error("No existing non-owner secondary password hash was found.");
  }

  const envPath = path.resolve(".env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const line = `SECONDARY_PASSWORD_HASH=${existingUser.secondaryPasswordHash}`;

  if (/^SECONDARY_PASSWORD_HASH=.*$/m.test(env)) {
    env = env.replace(/^SECONDARY_PASSWORD_HASH=.*$/m, line);
  } else {
    env = env.replace(/\s*$/, "") + `\n${line}\n`;
  }

  fs.writeFileSync(envPath, env, "utf8");

  console.log("SUCCESS: Shared secondary password hash saved to .env");
}

main()
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
