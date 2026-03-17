import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
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

ipcMain.handle("skills:select-dir", async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return null;
	const result = await dialog.showOpenDialog(win, {
		properties: ["openDirectory"],
		title: "Select Skills Directory",
	});
	return result.canceled ? null : result.filePaths[0];
});

// IPC handler for executing shell commands in a workspace directory.
// Returns a unique execId; stdout/stderr are streamed via "shell:data" events,
// and completion is signalled via "shell:exit".
ipcMain.handle("shell:exec", (event, command: string, cwd: string) => {
	const execId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	const child = child_process.spawn(command, {
		cwd,
		shell: true,
		env: { ...process.env },
	});

	child.stdout.on("data", (data: Buffer) => {
		if (!event.sender.isDestroyed()) {
			event.sender.send("shell:data", execId, "stdout", data.toString());
		}
	});

	child.stderr.on("data", (data: Buffer) => {
		if (!event.sender.isDestroyed()) {
			event.sender.send("shell:data", execId, "stderr", data.toString());
		}
	});

	child.on("close", (code: number | null) => {
		if (!event.sender.isDestroyed()) {
			event.sender.send("shell:exit", execId, code ?? -1);
		}
	});

	child.on("error", (err: Error) => {
		if (!event.sender.isDestroyed()) {
			event.sender.send("shell:data", execId, "stderr", err.message);
			event.sender.send("shell:exit", execId, -1);
		}
	});

	return execId;
});

// IPC handler for selecting a workspace directory
ipcMain.handle("shell:select-workspace", async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return null;
	const result = await dialog.showOpenDialog(win, {
		properties: ["openDirectory"],
		title: "Select Workspace Directory",
	});
	return result.canceled ? null : result.filePaths[0];
});

// ============================================================================
// Coding Agent RPC bridge
//
// The coding-agent CLI is bundled inside the app as:
//   <resources>/coding-agent/dist/cli.js
//
// One agent process is managed per session id. The main process spawns it in
// --mode rpc, pipes JSONL commands from renderer→agent and agent→renderer.
// ============================================================================

/** Resolve the path to the bundled coding-agent CLI entry point. */
function getCodingAgentCliPath(): string {
	if (isDev) {
		// In dev mode point directly at the source package dist
		return path.join(__dirname, "../../coding-agent/dist/cli.js");
	}
	// In packaged app, resources are at process.resourcesPath
	return path.join(process.resourcesPath, "coding-agent", "dist", "cli.js");
}

interface AgentProcess {
	proc: child_process.ChildProcessWithoutNullStreams;
	stopReading: () => void;
}

// Map of sessionId -> running agent process
const agentProcesses = new Map<string, AgentProcess>();

/** Attach a strict LF-only JSONL reader to a readable stream. */
function attachJsonlReader(
	stream: NodeJS.ReadableStream,
	onLine: (line: string) => void,
): () => void {
	const decoder = new StringDecoder("utf8");
	let buffer = "";

	const onData = (chunk: string | Buffer) => {
		buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
		let idx: number;
		while ((idx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 1);
			const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
			if (trimmed.length > 0) onLine(trimmed);
		}
	};

	const onEnd = () => {
		buffer += decoder.end();
		if (buffer.length > 0) {
			const trimmed = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
			if (trimmed.length > 0) onLine(trimmed);
			buffer = "";
		}
	};

	stream.on("data", onData);
	stream.on("end", onEnd);
	return () => {
		stream.off("data", onData);
		stream.off("end", onEnd);
	};
}

/**
 * Start a coding-agent process in RPC mode for the given session.
 * Returns the sessionId on success.
 */
ipcMain.handle(
	"codingAgent:start",
	(
		event,
		sessionId: string,
		cwd: string,
		opts?: { provider?: string; model?: string; env?: Record<string, string> },
	) => {
		if (agentProcesses.has(sessionId)) {
			return { ok: true, alreadyRunning: true };
		}

		const cliPath = getCodingAgentCliPath();
		if (!fs.existsSync(cliPath)) {
			return { ok: false, error: `coding-agent CLI not found at: ${cliPath}` };
		}

		const args = [cliPath, "--mode", "rpc"];
		if (opts?.provider) args.push("--provider", opts.provider);
		if (opts?.model) args.push("--model", opts.model);

		const proc = child_process.spawn(process.execPath, args, {
			cwd,
			env: { ...process.env, ...(opts?.env ?? {}) },
			stdio: ["pipe", "pipe", "pipe"],
		}) as child_process.ChildProcessWithoutNullStreams;

		const stopReading = attachJsonlReader(proc.stdout, (line) => {
			if (!event.sender.isDestroyed()) {
				event.sender.send("codingAgent:event", sessionId, line);
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			if (!event.sender.isDestroyed()) {
				event.sender.send("codingAgent:stderr", sessionId, data.toString());
			}
		});

		proc.on("exit", (code) => {
			agentProcesses.delete(sessionId);
			if (!event.sender.isDestroyed()) {
				event.sender.send("codingAgent:exit", sessionId, code ?? -1);
			}
		});

		proc.on("error", (err: Error) => {
			agentProcesses.delete(sessionId);
			if (!event.sender.isDestroyed()) {
				event.sender.send("codingAgent:stderr", sessionId, err.message);
				event.sender.send("codingAgent:exit", sessionId, -1);
			}
		});

		agentProcesses.set(sessionId, { proc, stopReading });
		return { ok: true, alreadyRunning: false };
	},
);

/** Send a JSONL command to a running agent process. */
ipcMain.handle("codingAgent:send", (_event, sessionId: string, commandJson: string) => {
	const entry = agentProcesses.get(sessionId);
	if (!entry) return { ok: false, error: "No running agent for sessionId" };
	const line = commandJson.endsWith("\n") ? commandJson : `${commandJson}\n`;
	entry.proc.stdin.write(line);
	return { ok: true };
});

/** Stop a running agent process. */
ipcMain.handle("codingAgent:stop", (_event, sessionId: string) => {
	const entry = agentProcesses.get(sessionId);
	if (!entry) return { ok: false, error: "No running agent for sessionId" };
	entry.stopReading();
	entry.proc.kill("SIGTERM");
	agentProcesses.delete(sessionId);
	return { ok: true };
});

// Clean up all agent processes when the app quits
app.on("before-quit", () => {
	for (const [, entry] of agentProcesses) {
		entry.stopReading();
		entry.proc.kill("SIGTERM");
	}
	agentProcesses.clear();
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
