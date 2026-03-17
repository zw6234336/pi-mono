import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const CONFIG_DIR_NAME = ".pi";
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export interface SkillInfo {
	name: string;
	description: string;
	filePath: string;
	content: string;
}

interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
}

function getAgentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}
	return path.join(homedir(), CONFIG_DIR_NAME, "agent");
}

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!normalized.startsWith("---")) {
		return { frontmatter: {}, body: normalized };
	}
	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { frontmatter: {}, body: normalized };
	}
	const yamlString = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();

	// Simple YAML key-value parser (avoids pulling in yaml dependency)
	const frontmatter: Record<string, unknown> = {};
	for (const line of yamlString.split("\n")) {
		const match = line.match(/^(\S+):\s*(.*)$/);
		if (match) {
			const key = match[1];
			let value: unknown = match[2].trim();
			if (value === "true") value = true;
			else if (value === "false") value = false;
			// Remove surrounding quotes
			if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			frontmatter[key] = value;
		}
	}
	return { frontmatter: frontmatter as SkillFrontmatter, body };
}

function isValidName(name: string): boolean {
	return (
		name.length <= MAX_NAME_LENGTH &&
		/^[a-z0-9-]+$/.test(name) &&
		!name.startsWith("-") &&
		!name.endsWith("-") &&
		!name.includes("--")
	);
}

function loadSkillFromFile(filePath: string): SkillInfo | null {
	try {
		const rawContent = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(rawContent);
		const skillDir = path.dirname(filePath);
		const parentDirName = path.basename(skillDir);

		const name = frontmatter.name || parentDirName;
		const description = frontmatter.description;

		if (!description || description.trim() === "") return null;
		if (description.length > MAX_DESCRIPTION_LENGTH) return null;
		if (!isValidName(name)) return null;
		if (frontmatter["disable-model-invocation"] === true) return null;

		return { name, description, filePath, content: body || rawContent };
	} catch {
		return null;
	}
}

function scanDir(dir: string, skills: Map<string, SkillInfo>, isRoot: boolean): void {
	if (!fs.existsSync(dir)) return;

	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });

		// Check for SKILL.md first
		for (const entry of entries) {
			if (entry.name === "SKILL.md" && (entry.isFile() || entry.isSymbolicLink())) {
				const fullPath = path.join(dir, entry.name);
				const skill = loadSkillFromFile(fullPath);
				if (skill && !skills.has(skill.name)) {
					skills.set(skill.name, skill);
				}
				return; // Don't recurse further
			}
		}

		// Process other entries
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

			const fullPath = path.join(dir, entry.name);
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();

			if (entry.isSymbolicLink()) {
				try {
					const stats = fs.statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			if (isDirectory) {
				scanDir(fullPath, skills, false);
			} else if (isFile && isRoot && entry.name.endsWith(".md")) {
				const skill = loadSkillFromFile(fullPath);
				if (skill && !skills.has(skill.name)) {
					skills.set(skill.name, skill);
				}
			}
		}
	} catch {
		// Ignore read errors
	}
}

/**
 * Load all skills from default directories:
 * - ~/.pi/agent/skills/ (global)
 * - Additional paths can be provided
 */
export function loadAllSkills(extraDirs?: string[]): SkillInfo[] {
	const skills = new Map<string, SkillInfo>();
	const agentDir = getAgentDir();

	// Global skills
	scanDir(path.join(agentDir, "skills"), skills, true);

	// Extra directories
	if (extraDirs) {
		for (const dir of extraDirs) {
			if (fs.existsSync(dir)) {
				scanDir(dir, skills, true);
			}
		}
	}

	return Array.from(skills.values());
}

/**
 * Read a skill file's full content by path.
 */
export function readSkillContent(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Format skills for inclusion in a system prompt.
 * Uses the same XML format as coding-agent's formatSkillsForPrompt.
 */
export function formatSkillsForPrompt(skills: SkillInfo[]): string {
	if (skills.length === 0) {
		return "";
	}

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];

	for (const skill of skills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");

	return lines.join("\n");
}

/**
 * Format skills as XML block for system prompt injection.
 * Only includes name, description, and location — the model uses
 * the read tool to load the full content when needed.
 */
export function formatSkillsForPrompt(skills: SkillInfo[]): string {
	if (skills.length === 0) return "";

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"When the user's task matches a skill description, read the skill file to get detailed instructions.",
		"",
		"<available_skills>",
	];

	for (const skill of skills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
