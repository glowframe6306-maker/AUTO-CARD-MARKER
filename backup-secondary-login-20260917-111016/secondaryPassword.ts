export function getSecondaryPasswordHash(): string | null {
  const hash = process.env.SECONDARY_PASSWORD_HASH?.trim();
  return hash ? hash : null;
}
