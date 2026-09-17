import prisma from "../prisma";

/*
 * Returns the current shared secondary password hash.
 *
 * The hash is stored on non-owner User records.
 * The first available non-owner hash is treated as the current
 * shared secondary password hash.
 *
 * This function never returns or logs the plaintext password.
 */
export async function getSecondaryPasswordHash(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: {
      isOwner: false,
      secondaryPasswordHash: {
        not: null,
      },
    },
    select: {
      secondaryPasswordHash: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return user?.secondaryPasswordHash ?? null;
}
