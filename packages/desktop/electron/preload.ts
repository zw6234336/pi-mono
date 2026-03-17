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
	},
});
