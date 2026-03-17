import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
	type AgentState,
	ApiKeyPromptDialog,
	ApiKeysTab,
	AppStorage,
	ChatPanel,
	CustomProvidersStore,
	createJavaScriptReplTool,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	ProvidersModelsTab,
	ProxyTab,
	SessionListDialog,
	SessionsStore,
	SettingsDialog,
	SettingsStore,
	setAppStorage,
} from "@mariozechner/pi-web-ui";
import { html, render } from "lit";
import { BookOpen, History, Plus, RefreshCw, Settings } from "lucide";
import "./app.css";
import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import "./SkillsDialog.js";
import { createShellExecTool } from "./shellTool.js";

// Create stores
const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();
const customProviders = new CustomProvidersStore();

// Gather configs
const configs = [
	settings.getConfig(),
	SessionsStore.getMetadataConfig(),
	providerKeys.getConfig(),
	customProviders.getConfig(),
	sessions.getConfig(),
];

// Create backend
const backend = new IndexedDBStorageBackend({
	dbName: "pi-desktop",
	version: 1,
	stores: configs,
});

// Wire backend to stores
settings.setBackend(backend);
providerKeys.setBackend(backend);
customProviders.setBackend(backend);
sessions.setBackend(backend);

// Create and set app storage
const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);

let currentSessionId: string | undefined;
let currentTitle = "";
let isEditingTitle = false;
let agent: Agent;
let chatPanel: ChatPanel;
let agentUnsubscribe: (() => void) | undefined;
let skillsPromptBlock = "";
let loadedSkills: SkillInfo[] = [];
let extraSkillDirs: string[] = [];
let systemInfo: SystemInfo | null = null;

async function loadSystemInfo(): Promise<void> {
	try {
		systemInfo = (await window.electronAPI?.system.info()) ?? null;
	} catch (err) {
		console.error("Failed to load system info:", err);
	}
}

async function loadExtraSkillDirs(): Promise<void> {
	const saved = await window.electronAPI?.config.get("skillDirs");
	if (Array.isArray(saved)) {
		extraSkillDirs = saved as string[];
	}
}

async function saveExtraSkillDirs(): Promise<void> {
	await window.electronAPI?.config.set("skillDirs", extraSkillDirs);
}

async function loadSkillsFromDisk(): Promise<void> {
	if (!window.electronAPI?.skills) return;
	try {
		loadedSkills = await window.electronAPI.skills.load(extraSkillDirs);
		skillsPromptBlock = await window.electronAPI.skills.formatPrompt(extraSkillDirs);
	} catch (err) {
		console.error("Failed to load skills:", err);
	}
}

function buildSystemPrompt(): string {
	const lines: string[] = [
		"You are a helpful AI assistant running inside Pi Desktop, a native macOS application.",
		"You have full access to the local macOS filesystem and can run shell commands via the shell_exec tool.",
	];

	if (systemInfo) {
		lines.push(
			"",
			"## Local System",
			`- User: ${systemInfo.username}`,
			`- Hostname: ${systemInfo.hostname}`,
			`- Platform: ${systemInfo.platform} (${systemInfo.arch})`,
			`- Home directory: ${systemInfo.homeDir}`,
			`- Desktop: ${systemInfo.desktopDir}`,
			`- Documents: ${systemInfo.documentsDir}`,
			`- Downloads: ${systemInfo.downloadsDir}`,
			`- Temp: ${systemInfo.tempDir}`,
		);
	}

	const base = lines.join("\n");
	return skillsPromptBlock ? `${base}${skillsPromptBlock}` : base;
}

const generateTitle = (messages: AgentMessage[]): string => {
	const firstUserMsg = messages.find((m) => m.role === "user" || m.role === "user-with-attachments");
	if (!firstUserMsg || (firstUserMsg.role !== "user" && firstUserMsg.role !== "user-with-attachments")) return "";

	let text = "";
	const content = firstUserMsg.content;

	if (typeof content === "string") {
		text = content;
	} else {
		const textBlocks = content.filter((c: any) => c.type === "text");
		text = textBlocks.map((c: any) => c.text || "").join(" ");
	}

	text = text.trim();
	if (!text) return "";

	const sentenceEnd = text.search(/[.!?]/);
	if (sentenceEnd > 0 && sentenceEnd <= 50) {
		return text.substring(0, sentenceEnd + 1);
	}
	return text.length <= 50 ? text : `${text.substring(0, 47)}...`;
};

const shouldSaveSession = (messages: AgentMessage[]): boolean => {
	const hasUserMsg = messages.some((m: any) => m.role === "user" || m.role === "user-with-attachments");
	const hasAssistantMsg = messages.some((m: any) => m.role === "assistant");
	return hasUserMsg && hasAssistantMsg;
};

const saveSession = async () => {
	if (!storage.sessions || !currentSessionId || !agent || !currentTitle) return;

	const state = agent.state;
	if (!shouldSaveSession(state.messages)) return;

	try {
		const sessionData = {
			id: currentSessionId,
			title: currentTitle,
			model: state.model!,
			thinkingLevel: state.thinkingLevel,
			messages: state.messages,
			createdAt: new Date().toISOString(),
			lastModified: new Date().toISOString(),
		};

		const metadata = {
			id: currentSessionId,
			title: currentTitle,
			createdAt: sessionData.createdAt,
			lastModified: sessionData.lastModified,
			messageCount: state.messages.length,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			modelId: state.model?.id || null,
			thinkingLevel: state.thinkingLevel,
			preview: generateTitle(state.messages),
		};

		await storage.sessions.save(sessionData, metadata);
	} catch (err) {
		console.error("Failed to save session:", err);
	}
};

const updateUrl = (sessionId: string) => {
	const url = new URL(window.location.href);
	url.searchParams.set("session", sessionId);
	window.history.replaceState({}, "", url);
};

const createAgent = async (initialState?: Partial<AgentState>) => {
	if (agentUnsubscribe) {
		agentUnsubscribe();
	}

	agent = new Agent({
		initialState: initialState || {
			systemPrompt: buildSystemPrompt(),
			model: getModel("anthropic", "claude-sonnet-4-5-20250929"),
			thinkingLevel: "off",
			messages: [],
			tools: [],
		},
	});

	agentUnsubscribe = agent.subscribe((event: any) => {
		if (event.type === "state-update") {
			const messages = event.state.messages;

			if (!currentTitle && shouldSaveSession(messages)) {
				currentTitle = generateTitle(messages);
			}

			if (!currentSessionId && shouldSaveSession(messages)) {
				currentSessionId = crypto.randomUUID();
				updateUrl(currentSessionId);
			}

			if (currentSessionId) {
				saveSession();
			}

			renderApp();
		}
	});

	await chatPanel.setAgent(agent, {
		onApiKeyRequired: async (provider: string) => {
			return await ApiKeyPromptDialog.prompt(provider);
		},
		toolsFactory: (_agent, _agentInterface, _artifactsPanel, runtimeProvidersFactory) => {
			const replTool = createJavaScriptReplTool();
			replTool.runtimeProvidersFactory = runtimeProvidersFactory;
			const shellTool = createShellExecTool(systemInfo?.homeDir ?? "/tmp");
			return [replTool, shellTool];
		},
	});
};

const loadSession = async (sessionId: string): Promise<boolean> => {
	if (!storage.sessions) return false;

	const sessionData = await storage.sessions.get(sessionId);
	if (!sessionData) {
		console.error("Session not found:", sessionId);
		return false;
	}

	currentSessionId = sessionId;
	const metadata = await storage.sessions.getMetadata(sessionId);
	currentTitle = metadata?.title || "";

	await createAgent({
		model: sessionData.model,
		thinkingLevel: sessionData.thinkingLevel,
		messages: sessionData.messages,
		tools: [],
	});

	updateUrl(sessionId);
	renderApp();
	return true;
};

const newSession = () => {
	const url = new URL(window.location.href);
	url.search = "";
	window.location.href = url.toString();
};

const openSettings = () => {
	SettingsDialog.open([new ProvidersModelsTab(), new ApiKeysTab(), new ProxyTab()]);
};

const openSkillsDialog = async () => {
	const { SkillsDialog } = await import("./SkillsDialog.js");
	await SkillsDialog.open(
		loadedSkills,
		extraSkillDirs,
		async (dirs) => {
			extraSkillDirs = dirs;
			await saveExtraSkillDirs();
			await loadSkillsFromDisk();
			if (agent) {
				agent.setSystemPrompt(buildSystemPrompt());
			}
			renderApp();
		},
		(dirs) => {
			extraSkillDirs = dirs;
		},
	);
	renderApp();
};

// ============================================================================
// RENDER
// ============================================================================
const renderApp = () => {
	const app = document.getElementById("app");
	if (!app) return;

	const appHtml = html`
		<div class="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden">
			<!-- Title bar (draggable for macOS) -->
			<div class="titlebar-drag flex items-center justify-between border-b border-border shrink-0">
				<div class="titlebar-no-drag flex items-center gap-2 px-4 py-1" style="padding-left: 80px;">
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(History, "sm"),
						onClick: () => {
							SessionListDialog.open(
								async (sessionId) => {
									await loadSession(sessionId);
								},
								(deletedSessionId) => {
									if (deletedSessionId === currentSessionId) {
										newSession();
									}
								},
							);
						},
						title: "Sessions",
					})}
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(Plus, "sm"),
						onClick: newSession,
						title: "New Session",
					})}

					${
						currentTitle
							? isEditingTitle
								? html`<div class="flex items-center gap-2">
									${Input({
										type: "text",
										value: currentTitle,
										className: "text-sm w-64",
										onChange: async (e: Event) => {
											const newTitle = (e.target as HTMLInputElement).value.trim();
											if (newTitle && newTitle !== currentTitle && storage.sessions && currentSessionId) {
												await storage.sessions.updateTitle(currentSessionId, newTitle);
												currentTitle = newTitle;
											}
											isEditingTitle = false;
											renderApp();
										},
										onKeyDown: async (e: KeyboardEvent) => {
											if (e.key === "Enter") {
												const newTitle = (e.target as HTMLInputElement).value.trim();
												if (newTitle && newTitle !== currentTitle && storage.sessions && currentSessionId) {
													await storage.sessions.updateTitle(currentSessionId, newTitle);
													currentTitle = newTitle;
												}
												isEditingTitle = false;
												renderApp();
											} else if (e.key === "Escape") {
												isEditingTitle = false;
												renderApp();
											}
										},
									})}
								</div>`
								: html`<button
									class="px-2 py-1 text-sm text-foreground hover:bg-secondary rounded transition-colors"
									@click=${() => {
										isEditingTitle = true;
										renderApp();
										requestAnimationFrame(() => {
											const input = app?.querySelector('input[type="text"]') as HTMLInputElement;
											if (input) {
												input.focus();
												input.select();
											}
										});
									}}
									title="Click to edit title"
								>
									${currentTitle}
								</button>`
							: html`<span class="text-base font-semibold text-foreground">Pi Desktop</span>`
					}
				</div>
				<div class="titlebar-no-drag flex items-center gap-1 px-2">
					${
						loadedSkills.length > 0
							? html`<button
							class="text-xs text-muted-foreground flex items-center gap-1 px-2 hover:text-foreground transition-colors"
							@click=${openSkillsDialog}
							title="Manage Skills"
						>
							${icon(BookOpen, "xs")} ${loadedSkills.length} skill${loadedSkills.length > 1 ? "s" : ""}
						</button>`
							: html`<button
							class="text-xs text-muted-foreground flex items-center gap-1 px-2 hover:text-foreground transition-colors"
							@click=${openSkillsDialog}
							title="Manage Skills"
						>
							${icon(BookOpen, "xs")} Skills
						</button>`
					}
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(RefreshCw, "sm"),
						onClick: async () => {
							await loadSkillsFromDisk();
							if (agent) {
								agent.setSystemPrompt(buildSystemPrompt());
							}
							renderApp();
						},
						title: "Reload Skills",
					})}
					<theme-toggle></theme-toggle>
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(Settings, "sm"),
						onClick: openSettings,
						title: "Settings",
					})}
				</div>
			</div>

			<!-- Chat Panel -->
			${chatPanel}
		</div>
	`;

	render(appHtml, app);
};

// ============================================================================
// INIT
// ============================================================================
async function initApp() {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	render(
		html`
			<div class="w-full h-screen flex items-center justify-center bg-background text-foreground">
				<div class="text-muted-foreground">Loading...</div>
			</div>
		`,
		app,
	);

	// Load persisted extra skill directories, then skills
	await loadSystemInfo();
	await loadExtraSkillDirs();
	await loadSkillsFromDisk();

	chatPanel = new ChatPanel();

	const urlParams = new URLSearchParams(window.location.search);
	const sessionIdFromUrl = urlParams.get("session");

	if (sessionIdFromUrl) {
		const loaded = await loadSession(sessionIdFromUrl);
		if (!loaded) {
			newSession();
			return;
		}
	} else {
		await createAgent();
	}

	renderApp();
}

initApp();
