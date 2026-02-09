import { db } from "./db";
import { users, solos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { openai } from "./replit_integrations/audio/client";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, unlink, readFile } from "fs/promises";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");

const script = `Let's have an honest conversation about commercial real estate, because the industry is going through the most significant disruption since the invention of the suburb. Office vacancy rates in major cities are sitting at historic highs. In San Francisco, nearly a third of office space is empty. New York is better but still well above pre-pandemic levels. The narrative that everyone would just go back to the office hasn't played out. Hybrid work isn't a trend, it's the new default for knowledge workers. Companies that tried to force five-day return-to-office policies saw significant attrition among their best talent. What does that mean for buildings? Conversion projects are booming. Office to residential, office to mixed use, even office to life science labs. But conversion is expensive. We're going to see a repricing event in commercial real estate that creates generational buying opportunities. The smart money is already moving into distressed commercial debt. If you're a startup founder, this actually works in your favor. Lease rates for quality office space are the most competitive they've been in twenty years.`;

async function run() {
  const [user] = await db.select().from(users).where(eq(users.username, "lisabizbrief")).limit(1);
  if (!user) { console.log("User not found"); process.exit(1); }

  const existing = await db.select().from(solos).where(eq(solos.userId, user.id)).limit(1);
  if (existing.length > 0) { console.log("Already has a post"); process.exit(0); }

  console.log("Generating TTS for lisabizbrief...");
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice: "shimmer", format: "wav" },
    messages: [
      { role: "system", content: "You are a professional podcast host. Read the following text naturally and engagingly. Do not add any commentary. Just read the text exactly as written." },
      { role: "user", content: script },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  const wavBuffer = Buffer.from(audioData, "base64");
  console.log("WAV:", wavBuffer.length, "bytes");

  const inputPath = path.join(tmpdir(), `lisa-in-${randomUUID()}.wav`);
  const outputPath = path.join(tmpdir(), `lisa-out-${randomUUID()}.m4a`);
  await writeFile(inputPath, wavBuffer);
  await new Promise<void>((resolve, reject) => {
    const f = spawn("ffmpeg", ["-i", inputPath, "-c:a", "aac", "-b:a", "192k", "-y", outputPath]);
    f.stderr.on("data", () => {});
    f.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg failed")));
    f.on("error", reject);
  });
  const m4aBuffer = await readFile(outputPath);
  const fileId = randomUUID();
  const filePath = path.join(UPLOADS_DIR, `${fileId}.m4a`);
  fs.writeFileSync(filePath, m4aBuffer);

  const durationMs = await new Promise<number>((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath]);
    let o = "";
    p.stdout.on("data", (d: any) => { o += d.toString(); });
    p.on("close", () => resolve(Math.round(parseFloat(o.trim()) * 1000) || 60000));
  });

  const [solo] = await db.insert(solos).values({
    userId: user.id, username: "lisabizbrief", audioUrl: `/api/audio/${fileId}`,
    tags: [], avatarUrl: null, title: "Remote Work Is Reshaping Commercial Real Estate Forever",
    durationMs, displayName: "lisabizbrief",
  }).returning();
  console.log("Done:", solo.id, "Duration:", durationMs, "ms");
  await unlink(inputPath).catch(() => {});
  await unlink(outputPath).catch(() => {});
  process.exit(0);
}
run();
