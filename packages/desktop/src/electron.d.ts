interface SkillInfo {
	name: string;
	description: string;
	filePath: string;
	content: string;
}

interface SystemInfo {
	homeDir: string;
	username: string;
	hostname: string;
	platform: string;
	arch: string;
	desktopDir: string;
	documentsDir: string;
	downloadsDir: string;
	tempDir: string;
}

interface ElectronAPI {
	config: {
		get: (key: string) => Promise<unknown>;
		set: (key: string, value: unknown) => Promise<void>;
		delete: (key: string) => Promise<void>;
	};
	system: {
		info: () => Promise<SystemInfo>;
	};
	skills: {
		load: (extraDirs?: string[]) => Promise<SkillInfo[]>;
		read: (filePath: string) => Promise<string | null>;
		formatPrompt: (extraDirs?: string[]) => Promise<string>;
		selectDir: () => Promise<string | null>;
		create: (name: string, description: string, content: string) => Promise<string>;
	};
	shell: {
		exec: (command: string, cwd: string) => Promise<string>;
		selectWorkspace: () => Promise<string | null>;
		onData: (callback: (execId: string, stream: "stdout" | "stderr", data: string) => void) => () => void;
		onExit: (callback: (execId: string, code: number) => void) => () => void;
	};
	codingAgent: {
		start: (
			sessionId: string,
			cwd: string,
			opts?: { provider?: string; model?: string; env?: Record<string, string> },
		) => Promise<{ ok: boolean; alreadyRunning?: boolean; error?: string }>;
		send: (sessionId: string, commandJson: string) => Promise<{ ok: boolean; error?: string }>;
		stop: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
		onEvent: (callback: (sessionId: string, eventJson: string) => void) => () => void;
		onStderr: (callback: (sessionId: string, text: string) => void) => () => void;
		onExit: (callback: (sessionId: string, code: number) => void) => () => void;
	};
}

interface Window {
	electronAPI?: ElectronAPI;
}
