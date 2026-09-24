import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "readline";

const prisma = new PrismaClient();

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(prompt);

    readline.emitKeypressEvents(stdin);

    const wasRaw = stdin.isRaw;

    try {
      stdin.setRawMode(true);
    } catch {
      reject(new Error("Unable to enable secure password input mode."));
      return;
    }

    stdin.resume();

    let value = "";

    const cleanup = () => {
      stdin.removeListener("keypress", onKeypress);

      try {
        stdin.setRawMode(wasRaw ?? false);
      } catch {
        // Ignore terminal cleanup errors.
      }
    };

    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }

      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
        }
        return;
      }

      if (key.name === "c" && key.ctrl) {
        cleanup();
        stdout.write("\n");
        reject(new Error("Password input cancelled."));
        return;
      }

      if (key.sequence && !key.ctrl && !key.meta) {
        const char = key.sequence;

        if (
          char !== "\r" &&
          char !== "\n" &&
          char !== "\u0000" &&
          char.length > 0
        ) {
          value += char;
        }
      }
    };

    stdin.on("keypress", onKeypress);
  });
}

async function main() {
  console.log("");
  console.log("=== RESET SHARED SECONDARY PASSWORD ===");
  console.log("");
  console.log("This password will work for all NON-OWNER accounts.");
  console.log("Owner accounts will continue using their primary password only.");
  console.log("");
  console.log("Existing secondary passwords will be cleared first.");
  console.log("");

  const cleared = await prisma.user.updateMany({
    data: {
      secondaryPasswordHash: null,
    },
  });

  console.log(
    `Cleared existing secondary password from ${cleared.count} account(s).`
  );

  console.log("");

  const password = await askHidden(
    "Enter NEW secondary password: "
  );

  if (!password.trim()) {
    throw new Error("Password cannot be empty.");
  }

  const confirm = await askHidden(
    "Confirm NEW secondary password: "
  );

  if (password !== confirm) {
    throw new Error("Passwords do not match. Please run the command again and type the same password carefully.");
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

  console.log("");
  console.log(
    `SUCCESS: New secondary password set for ${result.count} non-owner account(s).`
  );
  console.log("Owner accounts were excluded.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
