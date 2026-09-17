import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "downloads",
    "AutoCardMarking-Windows.exe"
  );

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Windows application not found" });
    return;
  }

  const stat = fs.statSync(filePath);

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="AutoCardMarking-Windows.exe"'
  );
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "no-store");

  const stream = fs.createReadStream(filePath);

  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download Windows application" });
    } else {
      res.destroy();
    }
  });

  stream.pipe(res);
}
