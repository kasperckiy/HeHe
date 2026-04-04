const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const sourceSvgPath = path.join(rootDir, 'sources', 'icons', 'hehe-icon.svg');
const outputDir = path.join(rootDir, 'icons');
const outputSizes = [16, 32, 48, 128, 256, 512];

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

async function buildIcon(size) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(sourceSvgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);

    console.log(`Generated icons/icon-${size}.png`);
}

async function main() {
    if (!fs.existsSync(sourceSvgPath)) {
        throw new Error(`Source SVG not found: ${sourceSvgPath}`);
    }

    ensureDirectory(outputDir);
    for (const size of outputSizes) {
        await buildIcon(size);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});