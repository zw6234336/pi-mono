import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";

const createSkillSchema = Type.Object({
	name: Type.String({
		description:
			"Unique slug for the skill. Lowercase letters, digits, and hyphens only. No leading/trailing hyphens or consecutive hyphens. Max 64 characters. Example: 'typescript-refactoring'.",
	}),
	description: Type.String({
		description:
			"One-sentence description used by the AI to decide when to load this skill. Be specific and action-oriented. Max 1024 characters.",
	}),
	content: Type.String({
		description: "Full Markdown body of the skill. Do not include frontmatter — it will be generated automatically.",
	}),
});

type CreateSkillParams = Static<typeof createSkillSchema>;

/**
 * Creates an AgentTool that writes a new skill to ~/.pi/agent/skills/<name>/SKILL.md
 * and immediately reloads skills so the change takes effect in the current session.
 *
 * @param onCreated - Called after a skill is successfully written. Should reload skills
 *                    and update the agent's system prompt.
 */
export function createSkillTool(onCreated: () => Promise<void>): AgentTool<typeof createSkillSchema, undefined> {
	return {
		label: "Create Skill",
		name: "create_skill",
		description: `Create a new Pi skill that will be available to future AI sessions.

## What is a Skill?
A skill is a Markdown file stored at ~/.pi/agent/skills/<name>/SKILL.md. When a future conversation matches the skill's description, the AI will load and follow its instructions.

## When to Use
- When the user asks you to "remember how to do X" or "create a skill for Y"
- When building reusable instructions for a repeated task type
- When the user wants to teach the AI a workflow or set of preferences

## Parameters
- name: Lowercase slug, e.g. 'python-testing' or 'git-workflow'
- description: Clear one-liner so the AI knows when to apply this skill
- content: The full Markdown instructions (no frontmatter needed)

## After Creation
The skill is immediately active — it will be included in the system prompt of future sessions that match the description.`,
		parameters: createSkillSchema,
		execute: async (_toolCallId: string, args: CreateSkillParams) => {
			const api = window.electronAPI?.skills;
			if (!api) {
				return {
					content: [{ type: "text", text: "Error: Skills API is not available." }],
					details: undefined,
				};
			}

			try {
				const filePath = await api.create(args.name, args.description, args.content);
				await onCreated();
				return {
					content: [{ type: "text", text: `Skill "${args.name}" created at ${filePath}.` }],
					details: undefined,
				};
			} catch (err: unknown) {
				return {
					content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
					details: undefined,
				};
			}
		},
	};
}
