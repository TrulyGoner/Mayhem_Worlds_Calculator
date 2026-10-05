import { readdir, rm, mkdir, stat, cp } from "node:fs/promises";
import { copyFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

// The source photos are head-and-shoulders cutouts on a transparent background,
// but framed wide: the head only fills the top half of the image, the rest is
// shoulders. Squeezing that whole bust into a 45px socket leaves a ~23px face.
// This crops every cutout to a square centred on the head so the face actually
// fills the box, and makes every file the same shape so the CSS can stay dumb.

const dir = "public/players";
const tmp = "public/players-faces-tmp";
const SIZE = 128;
const HEAD_BAND = 0.55; // share of the height that always contains the head
const PAD = 1.35; // crop side relative to the head, leaves the shoulders room

const ratings = JSON.parse(
  readFileSync("public/data/worlds_mayhem_ratings.json", "utf8"),
);
// Only files the app can actually request are worth keeping or dropping.
const needed = new Set(ratings.player_competition_scores.map((row) => row.player));

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// libvips keeps the last ~100 inputs open in an LRU. Windows then refuses the
// overwrite of those files, which is why the apply step failed on the tail of
// the readdir order and not on any particular picture.
sharp.cache(false);

// Alpha bounding box of the upper band = the head. The cutouts are consistent
// enough that the upper 55% never clips a chin, and using the real box instead
// of fixed percentages is what keeps the 2% of odd framings from drifting.
async function headBox(src, width, height) {
  const band = Math.max(1, Math.round(height * HEAD_BAND));
  const { data, info } = await sharp(src)
    .extract({ left: 0, top: 0, width, height: band })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = info.width;
  let x1 = -1;
  let y0 = info.height;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] <= 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

const files = (await readdir(dir)).filter((file) => file.endsWith(".webp"));
const dropped = [];
const skipped = [];
// Files that need no work are left in place, so only the crops ever move.
let untouched = 0;
let cropped = 0;

for (const file of files) {
  const src = path.join(dir, file);
  const meta = await sharp(src).metadata();

  // Idempotent: a file that is already the exact crop size is left alone, so
  // running this twice cannot crop an already cropped face.
  if (meta.width === SIZE && meta.height === SIZE) {
    untouched++;
    continue;
  }

  // No alpha means a rectangular studio photo, not a cutout. Cropping it blind
  // can cut the head off, and a light rectangle punches a hole in the dark
  // theme. Drop the ones the app requests so the roster falls back to the role
  // glyph, and leave the rest, which nothing can request.
  if (!meta.hasAlpha) {
    const name = file.slice(0, -".webp".length);
    if (needed.has(name)) dropped.push(name);
    else untouched++;
    continue;
  }

  const head = await headBox(src, meta.width, meta.height);
  if (!head) {
    skipped.push(file);
    continue;
  }

  const headW = head.x1 - head.x0 + 1;
  const headH = head.y1 - head.y0 + 1;
  let side = Math.max(headW, headH) * PAD;
  // A head that spans the whole frame would ask for more crop than exists.
  if (side > meta.width || side > meta.height) {
    side = Math.min(meta.width, meta.height);
  }
  side = Math.round(side);

  // Centre on the head horizontally, keep a little air above it. The top clamp
  // fires on most files, because the cutouts already touch the top edge.
  const left = clamp(Math.round((head.x0 + head.x1) / 2 - side / 2), 0, meta.width - side);
  const top = clamp(Math.round(head.y0 - (side - headH) * 0.3), 0, meta.height - side);

  await sharp(src)
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE)
    .webp({ quality: 80, effort: 5 })
    .toFile(path.join(tmp, file));
  cropped++;
}

if (skipped.length) {
  throw new Error(`no head found in ${skipped.length} file(s): ${skipped.join(", ")}`);
}

const produced = (await readdir(tmp)).filter((file) => file.endsWith(".webp"));
if (produced.length !== cropped) {
  throw new Error(`expected ${cropped} crops, got ${produced.length}`);
}

// Everything below is in place, so the originals can be replaced.
const backup = path.join(os.tmpdir(), "players-before-face-crop");
await rm(backup, { recursive: true, force: true });
await cp(dir, backup, { recursive: true });

// Overwriting the source paths can still race a scanner, so retry with a pause.
function place(src, dest) {
  for (let attempt = 1; ; attempt++) {
    try {
      copyFileSync(src, dest);
      return;
    } catch (error) {
      if (attempt >= 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

for (const file of produced) {
  place(path.join(tmp, file), path.join(dir, file));
}
for (const name of dropped) {
  await rm(path.join(dir, `${name}.webp`), { force: true });
}
await rm(tmp, { recursive: true, force: true });

// A partial apply must not pass silently: every crop has to be on disk at the
// crop size before the originals become unrecoverable in the working tree.
const wrong = [];
for (const file of produced) {
  const meta = await sharp(path.join(dir, file)).metadata();
  if (meta.width !== SIZE || meta.height !== SIZE) wrong.push(file);
}
if (wrong.length) {
  throw new Error(`${wrong.length} crop(s) did not land: ${wrong.slice(0, 5).join(", ")}`);
}

const after = (await readdir(dir)).filter((file) => file.endsWith(".webp"));
let finalBytes = 0;
for (const file of after) finalBytes += (await stat(path.join(dir, file))).size;

console.log(`cropped ${cropped} cutouts to ${SIZE}x${SIZE}`);
console.log(`dropped ${dropped.length} rectangular photos, roster falls back to the role glyph:`);
console.log(`  ${dropped.join(", ")}`);
console.log(`${after.length} files, ${(finalBytes / 1024 / 1024).toFixed(1)} MB in ${dir}`);
console.log(`untouched ${untouched} (already cropped, or rectangular files nothing requests)`);
console.log(`originals backed up to ${backup}`);
console.log("re-running is safe: files already at 128x128 are skipped");
