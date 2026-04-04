const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifestsDir = path.join(rootDir, 'manifests');

const sourceFiles = [
    'background.js',
    'content.css',
    'content.js',
    'letters.css',
    'letters.html',
    'letters.js',
    'popup.css',
    'popup.html',
    'popup.js',
    'prompts/gemini-rewrite.json',
    'README.md'
];

const targets = {
    chromium: 'chromium.override.json',
    firefox: 'firefox.override.json'
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirectory(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyFile(sourceRelativePath, destinationDir) {
    const sourcePath = path.join(rootDir, sourceRelativePath);
    const destinationPath = path.join(destinationDir, sourceRelativePath);
    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function deepMerge(baseValue, overrideValue) {
    if (Array.isArray(overrideValue)) {
        return [...overrideValue];
    }

    if (!isPlainObject(overrideValue)) {
        return overrideValue;
    }

    const result = isPlainObject(baseValue) ? { ...baseValue } : {};
    for (const [key, value] of Object.entries(overrideValue)) {
        result[key] = deepMerge(result[key], value);
    }

    return result;
}

function buildTarget(targetName) {
    const overrideFileName = targets[targetName];
    if (!overrideFileName) {
        throw new Error(`Unsupported target: ${targetName}`);
    }

    const targetDir = path.join(distDir, targetName);
    removeDirectory(targetDir);
    ensureDirectory(targetDir);

    for (const sourceFile of sourceFiles) {
        copyFile(sourceFile, targetDir);
    }

    const baseManifest = readJson(path.join(rootDir, 'manifest.json'));
    const overrideManifest = readJson(path.join(manifestsDir, overrideFileName));
    const targetManifest = deepMerge(baseManifest, overrideManifest);
    fs.writeFileSync(
        path.join(targetDir, 'manifest.json'),
        `${JSON.stringify(targetManifest, null, 4)}\n`,
        'utf8'
    );

    return targetDir;
}

function main() {
    const requestedTargets = process.argv.slice(2);
    const buildTargets = requestedTargets.length > 0 ? requestedTargets : Object.keys(targets);

    ensureDirectory(distDir);
    for (const targetName of buildTargets) {
        buildTarget(targetName);
        console.log(`Built ${targetName} package in dist/${targetName}`);
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}