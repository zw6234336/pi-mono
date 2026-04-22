import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { completeSimple, type Model } from "@mariozechner/pi-ai";

const MEMORY_EXTRACTION_PROMPT = `The messages above are a recent conversation with the user. Your task is to update the system's long-term memory.
Extract any critical new facts, user preferences, constraints, project architectural decisions, or other information that needs to be persisted across sessions.

<rules>
- Review the conversation for any new insights, preferences, or important project context.
- If no new information needs to be saved, output the existing memory exactly as provided.
- If there is new information, safely update or append it to the existing memory.
- Keep the memory clean, concise, and logically organized. Be brief.
- Output ONLY the updated memory file content, nothing else. Do NOT wrap it in markdown code blocks (\`\`\`markdown).
</rules>

Please provide the updated MEMORY.md content now:`;

const INITIAL_MEMORY = `# Global Workspace Memory

This file contains important context, user preferences, project structure, and long-term decisions that the assistant needs to remember across sessions.

## Project Context
- (Add project details here)

## User Preferences
- (Add user preferences here)

## Critical Decisions
- (Add important decisions here)
`;

export const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

export async function extractAndSaveMemory(
	conversationText: string,
	model: Model<any>,
	apiKey: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<void> {
	if (!conversationText.trim()) return;

	const memoryPath = join(cwd, "MEMORY.md");
	let currentMemory = INITIAL_MEMORY;

	if (existsSync(memoryPath)) {
		try {
			currentMemory = readFileSync(memoryPath, "utf-8");
		} catch (error) {
			console.error(`Warning: Failed to read existing MEMORY.md: ${error}`);
		}
	}

	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n<current-memory>\n${currentMemory}\n</current-memory>\n\n${MEMORY_EXTRACTION_PROMPT}`;

	const completionMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];

	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: completionMessages },
		{ maxTokens: 4096, signal, apiKey },
	);

	if (response.stopReason === "error") {
		console.error(`Memory extraction failed: ${response.errorMessage || "Unknown error"}`);
		return;
	}

	const textContent = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();

	if (textContent && textContent !== currentMemory) {
		try {
			writeFileSync(memoryPath, textContent, "utf-8");
		} catch (error) {
			console.error(`Warning: Failed to save updated MEMORY.md: ${error}`);
		}
	}
}
