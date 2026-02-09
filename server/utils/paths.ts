import * as path from "path";
import * as fs from "fs";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");
export const AVATARS_DIR = path.resolve(process.cwd(), "uploads", "avatars");
export const VIBES_DIR = path.resolve(process.cwd(), "uploads", "vibes");
export const DOCS_DIR = path.resolve(process.cwd(), "docs");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}
