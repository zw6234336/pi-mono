interface SkillInfo {
	name: string;
	description: string;
	filePath: string;
	content: string;
}

interface ElectronAPI {
	config: {
		get: (key: string) => Promise<unknown>;
		set: (key: string, value: unknown) => Promise<void>;
		delete: (key: string) => Promise<void>;
	};
	skills: {
		load: (extraDirs?: string[]) => Promise<SkillInfo[]>;
		read: (filePath: string) => Promise<string | null>;
		formatPrompt: (extraDirs?: string[]) => Promise<string>;
	};
}

interface Window {
	electronAPI?: ElectronAPI;
}
