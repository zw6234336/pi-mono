const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "dist-electron");

for (const file of fs.readdirSync(dir)) {
	if (!file.endsWith(".js")) continue;
	const filePath = path.join(dir, file);
	let content = fs.readFileSync(filePath, "utf8");
	// Fix relative imports: ./foo.js -> ./foo.mjs
	content = content.replace(/from\s+"\.\/([^"]+)\.js"/g, 'from "./$1.mjs"');
	fs.writeFileSync(filePath, content);
	fs.renameSync(filePath, filePath.replace(/\.js$/, ".mjs"));
}
