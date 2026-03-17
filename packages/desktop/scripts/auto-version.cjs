#!/usr/bin/env node
/**
 * Auto-version script for packaging.
 * Sets patch = git commit count, resulting in version like 0.1.<commitCount>.
 * Run before electron-builder so the DMG reflects the current build number.
 */

const { execSync } = require("child_process");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

let commitCount;
try {
	commitCount = execSync("git rev-list --count HEAD", { encoding: "utf-8", cwd: path.join(__dirname, "../../..") }).trim();
} catch {
	// Fallback if git is unavailable (e.g. CI without git history)
	console.warn("git rev-list failed, using existing patch version");
	process.exit(0);
}

const [major, minor] = pkg.version.split(".");
const newVersion = `${major}.${minor}.${commitCount}`;

if (pkg.version !== newVersion) {
	pkg.version = newVersion;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
	console.log(`Version bumped to ${newVersion}`);
} else {
	console.log(`Version unchanged: ${newVersion}`);
}
