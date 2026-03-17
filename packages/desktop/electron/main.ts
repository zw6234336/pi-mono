import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadAllSkills, readSkillContent } from "./skills.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

function getConfigPath(): string {
	const configDir = path.join(app.getPath("userData"), "config");
	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
	}
	return configDir;
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 16, y: 16 },
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	// Open external links in browser
	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	if (isDev) {
		win.loadURL("http://localhost:5173");
		win.webContents.openDevTools();
	} else {
		win.loadFile(path.join(__dirname, "../dist/index.html"));
	}
}

// IPC handlers for secure config storage
ipcMain.handle("config:get", (_event, key: string) => {
	const configPath = path.join(getConfigPath(), `${key}.json`);
	if (!fs.existsSync(configPath)) return null;
	try {
		const encrypted = fs.readFileSync(configPath);
		if (safeStorage.isEncryptionAvailable()) {
			const decrypted = safeStorage.decryptString(encrypted);
			return JSON.parse(decrypted);
		}
		return JSON.parse(encrypted.toString("utf-8"));
	} catch {
		return null;
	}
});

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
	const configPath = path.join(getConfigPath(), `${key}.json`);
	const data = JSON.stringify(value);
	if (safeStorage.isEncryptionAvailable()) {
		const encrypted = safeStorage.encryptString(data);
		fs.writeFileSync(configPath, encrypted);
	} else {
		fs.writeFileSync(configPath, data, "utf-8");
	}
});

ipcMain.handle("config:delete", (_event, key: string) => {
	const configPath = path.join(getConfigPath(), `${key}.json`);
	if (fs.existsSync(configPath)) {
		fs.unlinkSync(configPath);
	}
});

// IPC handlers for skill management
ipcMain.handle("skills:load", (_event, extraDirs?: string[]) => {
	return loadAllSkills(extraDirs);
});

ipcMain.handle("skills:read", (_event, filePath: string) => {
	return readSkillContent(filePath);
});

ipcMain.handle("skills:format-prompt", (_event, extraDirs?: string[]) => {
	const skills = loadAllSkills(extraDirs);
	return formatSkillsForPrompt(skills);
});

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
