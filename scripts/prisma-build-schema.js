/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const partsDir = path.join(root, "prisma", "schema");
const outFile = path.join(root, "prisma", "schema.prisma");

if (!fs.existsSync(partsDir)) {
  console.error(`❌ Pasta não encontrada: ${partsDir}`);
  process.exit(1);
}

const partFiles = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith(".prisma"))
  .sort((a, b) => a.localeCompare(b));

if (partFiles.length === 0) {
  console.error(`❌ Nenhum .prisma em: ${partsDir}`);
  process.exit(1);
}

const banner =
  `// ==========================================\n` +
  `// ⚠️  AUTO-GERADO. NÃO EDITE ESTE ARQUIVO.\n` +
  `// Fonte: prisma/schema/*.prisma\n` +
  `// ==========================================\n\n`;

const content =
  banner +
  partFiles
    .map((file) => {
      const full = path.join(partsDir, file);
      const txt = fs.readFileSync(full, "utf8").trim();
      return `// ----- ${file} -----\n${txt}\n`;
    })
    .join("\n");

fs.writeFileSync(outFile, content, "utf8");
console.log(`✅ Gerado: prisma/schema.prisma`);
console.log(`📦 Incluídos (${partFiles.length}): ${partFiles.join(", ")}`);
