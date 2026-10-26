import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const from = (name) => resolve(ROOT, "node_modules", name);
const to = (name) => resolve(ROOT, "public", name);

const TESSERACT_DIR = to("tesseract");
const TESSDATA_DIR = to("tessdata");
mkdirSync(TESSERACT_DIR, { recursive: true });
mkdirSync(TESSDATA_DIR, { recursive: true });

const CORES = [
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js",
];

function copyIfStale(source, target, label) {
  const exists =
    existsSync(target) && statSync(target).size > 0 &&
    statSync(target).size === statSync(source).size;
  if (exists) {
    console.log(`keep   ${label} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
    return;
  }
  copyFileSync(source, target);
  console.log(`copy   ${label} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
}

for (const file of ["worker.min.js", "tesseract.min.js"]) {
  copyIfStale(from(`tesseract.js/dist/${file}`), resolve(TESSERACT_DIR, file), file);
}
for (const file of CORES) {
  copyIfStale(from(`tesseract.js-core/${file}`), resolve(TESSERACT_DIR, file), file);
}
async function downloadTraineddata() {
  const target = resolve(TESSDATA_DIR, "eng.traineddata.gz");
  const url = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";
  if (existsSync(target) && statSync(target).size > 10 * 1024 * 1024) {
    console.log(`keep   eng.traineddata.gz (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
    return;
  }
  console.log(`fetch  eng.traineddata.gz …`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(target, buffer);
  console.log(`write  eng.traineddata.gz (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

await downloadTraineddata();

const total = (dir) =>
  readdirSync(dir).reduce((sum, file) => sum + statSync(resolve(dir, file)).size, 0);
console.log(
  `\npublic/tesseract: ${(total(TESSERACT_DIR) / 1024 / 1024).toFixed(1)} MB, ` +
    `public/tessdata: ${(total(TESSDATA_DIR) / 1024 / 1024).toFixed(1)} MB`,
);
