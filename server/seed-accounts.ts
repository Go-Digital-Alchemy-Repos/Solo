import { db } from "./db";
import { users, solos } from "@shared/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { openai } from "./replit_integrations/audio/client";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, unlink, readFile } from "fs/promises";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ACCOUNTS = [
  {
    email: "mike_sportsdesk@solo.app",
    username: "mikesportsdesk",
    bio: "Your daily source for sports analysis and hot takes.",
    voice: "onyx" as const,
    title: "Is the NBA Mid-Season Tournament Actually Working?",
    script: `Let's talk about the NBA's mid-season tournament, because it's become a real lightning rod for debate. When the league first announced the In-Season Tournament, a lot of people were skeptical. People said the regular season already has eighty two games, why do we need another thing layered on top? But here we are, and the numbers are telling us a very different story. Viewership for tournament games jumped by almost thirty percent compared to standard November matchups. That's massive. Players are actually locked in. You're seeing guys like Anthony Edwards and Shai Gilgeous-Alexander playing like it's a playoff game in November. The bonus money helps, obviously, but there's something else going on. Pride. These guys are competitors, and when you slap a trophy and a special court on the floor, they rise to the occasion. Now, the critics will say the tournament still doesn't matter in the grand scheme of the season, and I get that point. But here's my counter: engagement matters. Fan engagement, player engagement, and most importantly, sponsor engagement. The NBA is a business, and this tournament is printing money for the league. My prediction? Within five years, every major sports league in the world will have some version of a mid-season cup. The Premier League's been doing it forever with the League Cup. This is the NBA catching up, and doing it with more flair than anyone expected.`,
  },
  {
    email: "sara_politicalpulse@solo.app",
    username: "sarapolitics",
    bio: "Breaking down policy, elections, and the world stage.",
    voice: "nova" as const,
    title: "Why Swing State Demographics Are Shifting Everything",
    script: `If you've been paying attention to the last few election cycles, you've noticed something that pollsters are finally starting to admit: the old swing state playbook is dead. Let me explain. For decades, campaigns treated states like Ohio, Florida, and Pennsylvania as monolithic battlegrounds. You'd flood the airwaves with ads, send the candidate to rallies in Cleveland and Tampa, and hope the turnout math worked out. But the demographic shifts happening right now are rewriting all of those assumptions. Take Georgia. Ten years ago, nobody considered Georgia competitive at the presidential level. But the growth of the Atlanta metro area, combined with significant increases in Black voter registration and a surge of young professionals moving from the northeast, completely flipped the calculus. Arizona is another example. The Latino vote there is not a monolith, and campaigns that treat it like one are making a critical mistake. You have third and fourth generation Mexican-American families with very different priorities than recent arrivals. Education and local tax policy matter way more to them than immigration rhetoric. And here's the big one that nobody is talking about enough: Texas. The urbanization of Dallas, Houston, Austin, and San Antonio is creating a completely different electorate than the one that existed even a decade ago. Now, I'm not saying Texas is going to flip tomorrow, but the margins are tightening in ways that are forcing campaigns to spend resources there, and that changes everything downstream.`,
  },
  {
    email: "david_prophetic@solo.app",
    username: "davidprophetic",
    bio: "Exploring ancient scripture and its relevance today.",
    voice: "echo" as const,
    title: "Daniel Chapter 2: The Statue and World Empires",
    script: `Today I want to walk you through one of the most remarkable prophecies in all of scripture: the dream of King Nebuchadnezzar in Daniel chapter two. The king has a dream that troubles him deeply. He sees an enormous statue, and each part of the statue is made of a different material. The head is gold, the chest and arms are silver, the belly and thighs are bronze, the legs are iron, and the feet are a mixture of iron and clay. Daniel interprets this dream, and what's absolutely stunning is how precisely these materials correspond to the actual succession of world empires that followed. The head of gold represents Babylon itself, the empire of Nebuchadnezzar. After Babylon fell, the Medo-Persian empire rose, represented by the silver. Then came Greece under Alexander the Great, the bronze. And the iron legs? That's Rome. The strength and durability of iron perfectly describes the Roman Empire. But here's where it gets really interesting. The feet of iron mixed with clay represent a divided kingdom, strong and weak at the same time. Many scholars see this as the fragmented nations that came out of Rome, the foundations of modern Europe. And then, the stone that strikes the statue and becomes a great mountain? That represents a kingdom established by God himself that will never be destroyed. Whether you see this as a historical curiosity or as evidence of divine foreknowledge, you have to admit, the precision is remarkable. Written roughly six hundred years before Christ, this prophecy maps onto real history with incredible accuracy.`,
  },
  {
    email: "joe_rogan@solo.app",
    username: "joerogan",
    bio: "Comedian, UFC commentator, podcaster. Just asking questions.",
    voice: "fable" as const,
    title: "AI Is Getting Weird and Nobody's Ready For It",
    script: `Dude, can we just talk about how insane artificial intelligence has gotten? Because I had a guest on the podcast last week, a researcher from one of the big AI labs, and the things this person was telling me genuinely kept me up at night. We're not talking about the chatbot stuff, although that's wild enough on its own. We're talking about AI systems that are starting to show emergent behaviors that their own creators didn't predict. Let me explain what that means. You build a system to do one thing, like translate languages, and it spontaneously learns to do math. Nobody programmed it to do math. It just figured it out. That's like training a dog to fetch and then it starts doing your taxes. It's absolutely bonkers. And here's the thing that really trips me out: nobody fully understands why it works. The people building these systems, the smartest computer scientists on the planet, they'll tell you straight up, we don't know exactly why it produces the outputs it produces. We know the architecture, we know the training data, but the emergent behavior is a black box. That should terrify people more than it does. I'm not saying we should stop developing AI. That ship has sailed. But the speed at which this is moving is unlike anything we've ever seen as a species. The internet changed everything. Social media changed everything. This is going to make those look like minor upgrades. And we're just sitting here scrolling through our phones while it happens. It's wild, man. Absolutely wild.`,
  },
  {
    email: "lisa_bizbrief@solo.app",
    username: "lisabizbrief",
    bio: "CEO insights, market trends, and startup strategy.",
    voice: "shimmer" as const,
    title: "Remote Work Is Reshaping Commercial Real Estate Forever",
    script: `Let's have an honest conversation about commercial real estate, because the industry is going through the most significant disruption since the invention of the suburb. Here's what's actually happening on the ground. Office vacancy rates in major cities are sitting at historic highs. In San Francisco, nearly a third of office space is empty. New York is better but still well above pre-pandemic levels. And the narrative that everyone would just go back to the office? It hasn't played out that way. The data from the last three years is unambiguous. Hybrid work isn't a trend, it's the new default for knowledge workers. Companies that tried to force five-day return-to-office policies saw significant attrition among their best talent. And what does that mean for the buildings themselves? Conversion projects are booming. Office to residential, office to mixed use, even office to life science labs. But conversion is expensive. The floor plates, the plumbing, the windows, everything about a Class A office tower is designed for office use, and retrofitting it for residential is a massive capital expenditure. So what happens to the buildings that can't be converted? This is where it gets interesting from an investment perspective. We're going to see a repricing event in commercial real estate that creates generational buying opportunities. The smart money is already moving into distressed commercial debt. They're buying bonds at sixty or seventy cents on the dollar, betting that they can restructure and profit as the market finds its new equilibrium. If you're a startup founder, this actually works in your favor. Lease rates for quality office space are the most competitive they've been in twenty years.`,
  },
];

async function generateTTSAudio(text: string, voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"): Promise<Buffer> {
  console.log(`  Generating TTS with voice: ${voice}...`);
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "wav" },
    messages: [
      { role: "system", content: "You are a professional podcast host. Read the following text naturally and engagingly, as if speaking on a podcast. Do not add any commentary or introduction. Just read the text exactly as written." },
      { role: "user", content: text },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  if (!audioData) throw new Error("No audio data returned from TTS");
  return Buffer.from(audioData, "base64");
}

async function convertToM4A(wavBuffer: Buffer): Promise<Buffer> {
  const inputPath = path.join(tmpdir(), `seed-in-${randomUUID()}.wav`);
  const outputPath = path.join(tmpdir(), `seed-out-${randomUUID()}.m4a`);
  try {
    await writeFile(inputPath, wavBuffer);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        outputPath,
      ]);
      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    let output = "";
    ffprobe.stdout.on("data", (data) => { output += data.toString(); });
    ffprobe.stderr.on("data", () => {});
    ffprobe.on("close", (code) => {
      if (code === 0) {
        const durationSec = parseFloat(output.trim());
        resolve(Math.round(durationSec * 1000));
      } else {
        resolve(60000);
      }
    });
    ffprobe.on("error", () => resolve(60000));
  });
}

async function seed() {
  console.log("Starting seed: Creating 5 dummy accounts with audio content...\n");

  const passwordHash = await bcrypt.hash("solo1234", 12);

  for (const account of ACCOUNTS) {
    console.log(`Creating account: @${account.username}`);

    let user;
    const existing = await db.select().from(users).where(
      (await import("drizzle-orm")).eq(users.username, account.username)
    ).limit(1);

    if (existing.length > 0) {
      user = existing[0];
      console.log(`  Account already exists, reusing.`);
    } else {
      const [created] = await db.insert(users).values({
        email: account.email,
        passwordHash,
        username: account.username,
        bio: account.bio,
      }).returning();
      user = created;
      console.log(`  Account created: ${user.id}`);
    }

    try {
      console.log(`  Generating audio for: "${account.title}"`);
      const wavBuffer = await generateTTSAudio(account.script, account.voice);
      console.log(`  WAV generated: ${wavBuffer.length} bytes`);

      const m4aBuffer = await convertToM4A(wavBuffer);
      console.log(`  M4A converted: ${m4aBuffer.length} bytes`);

      const fileId = randomUUID();
      const fileName = `${fileId}.m4a`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, m4aBuffer);

      const durationMs = await getAudioDurationMs(filePath);
      console.log(`  Duration: ${durationMs}ms`);

      const audioUrl = `/api/audio/${fileId}`;
      const [solo] = await db.insert(solos).values({
        userId: user.id,
        username: account.username,
        audioUrl,
        tags: [],
        avatarUrl: null,
        title: account.title,
        durationMs,
        displayName: account.username,
      }).returning();

      console.log(`  Solo posted: ${solo.id}\n`);
    } catch (err) {
      console.error(`  Failed to generate audio for @${account.username}:`, err);
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
