const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	config: {
		get: (key) => ipcRenderer.invoke("config:get", key),
		set: (key, value) => ipcRenderer.invoke("config:set", key, value),
		delete: (key) => ipcRenderer.invoke("config:delete", key),
	},
	skills: {
		load: (extraDirs) => ipcRenderer.invoke("skills:load", extraDirs),
		read: (filePath) => ipcRenderer.invoke("skills:read", filePath),
		formatPrompt: (extraDirs) => ipcRenderer.invoke("skills:format-prompt", extraDirs),
		selectDir: () => ipcRenderer.invoke("skills:select-dir"),
	},
});
