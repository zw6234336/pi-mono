import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";

const shellExecSchema = Type.Object({
	command: Type.String({
		description: "The shell command to execute on the local macOS system.",
	}),
	cwd: Type.Optional(
		Type.String({
			description: "Working directory for the command. Defaults to the user's home directory if not specified.",
		}),
	),
});

type ShellExecParams = Static<typeof shellExecSchema>;

/**
 * Creates an AgentTool that runs shell commands via the Electron IPC bridge.
 * This gives the AI agent real filesystem and system access on macOS.
 *
 * @param homeDir - Default working directory when cwd is not specified.
 */
export function createShellExecTool(homeDir: string): AgentTool<typeof shellExecSchema, undefined> {
	return {
		label: "Shell",
		name: "shell_exec",
		description: `Execute a shell command on the local macOS system.

## When to Use
- Reading or writing files on the user's filesystem
- Listing directory contents, checking file existence
- Running system commands (grep, find, cat, ls, etc.)
- Any task that requires interacting with the local system

## Environment
- macOS shell (zsh)
- Full access to the local filesystem
- Commands run with the user's permissions
- Working directory defaults to the user's home directory

## Notes
- Prefer non-interactive commands (avoid commands that wait for stdin)
- For reading files, prefer \`cat\` with a specific path
- Combine commands with \`&&\` or pipes \`|\` when efficient
- Exit code != 0 is included in the output so you know if a command failed`,
		parameters: shellExecSchema,
		execute: async (_toolCallId: string, args: ShellExecParams, signal?: AbortSignal) => {
			const api = window.electronAPI?.shell;
			if (!api) {
				return {
					content: [{ type: "text", text: "Error: Shell API is not available." }],
					details: undefined,
				};
			}

			const cwd = args.cwd ?? homeDir;

			return new Promise((resolve) => {
				let output = "";
				let execId: string | null = null;
				let settled = false;

				const finish = (exitCode: number) => {
					if (settled) return;
					settled = true;
					unsubData();
					unsubExit();
					const text = output.trim() || "(no output)";
					const prefix = exitCode !== 0 ? `Exit code: ${exitCode}\n` : "";
					resolve({
						content: [{ type: "text", text: `${prefix}${text}` }],
						details: undefined,
					});
				};

				const unsubData = api.onData((id, _stream, data) => {
					if (execId !== null && id === execId) {
						output += data;
					}
				});

				const unsubExit = api.onExit((id, code) => {
					if (execId !== null && id === execId) {
						finish(code);
					}
				});

				// Handle abort: resolve early with partial output
				signal?.addEventListener("abort", () => {
					if (!settled) {
						settled = true;
						unsubData();
						unsubExit();
						const text = output.trim() || "(aborted, no output)";
						resolve({
							content: [{ type: "text", text: `Aborted.\n${text}` }],
							details: undefined,
						});
					}
				});

				api.exec(args.command, cwd).then((id) => {
					execId = id;
				});
			});
		},
	};
}
