const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	config: {
		get: (key: string) => ipcRenderer.invoke("config:get", key),
		set: (key: string, value: unknown) => ipcRenderer.invoke("config:set", key, value),
		delete: (key: string) => ipcRenderer.invoke("config:delete", key),
	},
	skills: {
		load: (extraDirs?: string[]) => ipcRenderer.invoke("skills:load", extraDirs),
		read: (filePath: string) => ipcRenderer.invoke("skills:read", filePath),
		formatPrompt: (extraDirs?: string[]) => ipcRenderer.invoke("skills:format-prompt", extraDirs),
		selectDir: () => ipcRenderer.invoke("skills:select-dir"),
	},
	shell: {
		// Execute a shell command in the given cwd. Returns an execId.
		// Listen for "shell:data" and "shell:exit" events via onData / onExit.
		exec: (command: string, cwd: string): Promise<string> => ipcRenderer.invoke("shell:exec", command, cwd),
		// Select a workspace directory via native dialog
		selectWorkspace: (): Promise<string | null> => ipcRenderer.invoke("shell:select-workspace"),
		// Register a listener for streamed output (stdout/stderr)
		onData: (
			callback: (execId: string, stream: "stdout" | "stderr", data: string) => void,
		) => {
			const listener = (_event: unknown, execId: string, stream: "stdout" | "stderr", data: string) =>
				callback(execId, stream, data);
			ipcRenderer.on("shell:data", listener);
			return () => ipcRenderer.removeListener("shell:data", listener);
		},
		// Register a listener for process exit
		onExit: (callback: (execId: string, code: number) => void) => {
			const listener = (_event: unknown, execId: string, code: number) => callback(execId, code);
			ipcRenderer.on("shell:exit", listener);
			return () => ipcRenderer.removeListener("shell:exit", listener);
		},
	},
	codingAgent: {
		/**
		 * Start a coding-agent process in RPC mode.
		 * @param sessionId  Unique ID for this agent session (caller-managed).
		 * @param cwd        Working directory for the agent.
		 * @param opts       Optional provider/model/env overrides.
		 */
		start: (
			sessionId: string,
			cwd: string,
			opts?: { provider?: string; model?: string; env?: Record<string, string> },
		): Promise<{ ok: boolean; alreadyRunning?: boolean; error?: string }> =>
			ipcRenderer.invoke("codingAgent:start", sessionId, cwd, opts),

		/**
		 * Send a serialized RpcCommand JSON string to the agent.
		 * The command must be a valid JSON object; newline framing is added automatically.
		 */
		send: (sessionId: string, commandJson: string): Promise<{ ok: boolean; error?: string }> =>
			ipcRenderer.invoke("codingAgent:send", sessionId, commandJson),

		/**
		 * Stop the agent process for the given session.
		 */
		stop: (sessionId: string): Promise<{ ok: boolean; error?: string }> =>
			ipcRenderer.invoke("codingAgent:stop", sessionId),

		/**
		 * Subscribe to JSONL event lines emitted by the agent on stdout.
		 * Returns an unsubscribe function.
		 */
		onEvent: (callback: (sessionId: string, eventJson: string) => void) => {
			const listener = (_event: unknown, sessionId: string, eventJson: string) =>
				callback(sessionId, eventJson);
			ipcRenderer.on("codingAgent:event", listener);
			return () => ipcRenderer.removeListener("codingAgent:event", listener);
		},

		/**
		 * Subscribe to stderr lines from the agent process.
		 * Returns an unsubscribe function.
		 */
		onStderr: (callback: (sessionId: string, text: string) => void) => {
			const listener = (_event: unknown, sessionId: string, text: string) =>
				callback(sessionId, text);
			ipcRenderer.on("codingAgent:stderr", listener);
			return () => ipcRenderer.removeListener("codingAgent:stderr", listener);
		},

		/**
		 * Subscribe to agent process exit events.
		 * Returns an unsubscribe function.
		 */
		onExit: (callback: (sessionId: string, code: number) => void) => {
			const listener = (_event: unknown, sessionId: string, code: number) =>
				callback(sessionId, code);
			ipcRenderer.on("codingAgent:exit", listener);
			return () => ipcRenderer.removeListener("codingAgent:exit", listener);
		},
	},
});
