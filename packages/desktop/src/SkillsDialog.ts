import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { FolderOpen, FolderPlus, RefreshCw, Trash2, X } from "lucide";

declare global {
	interface HTMLElementTagNameMap {
		"skills-dialog": SkillsDialog;
	}
}

@customElement("skills-dialog")
export class SkillsDialog extends LitElement {
	// Disable shadow DOM so Tailwind classes apply
	createRenderRoot() {
		return this;
	}

	@state() private skills: SkillInfo[] = [];
	@state() private extraDirs: string[] = [];
	@state() private loading = false;
	@state() private expandedSkill: string | null = null;
	@state() private skillContent: string | null = null;
	@state() private loadingContent = false;

	private onClose: (() => void) | null = null;
	private onReload: ((extraDirs: string[]) => Promise<void>) | null = null;

	async init(
		skills: SkillInfo[],
		extraDirs: string[],
		onClose: () => void,
		onReload: (extraDirs: string[]) => Promise<void>,
	) {
		this.skills = skills;
		this.extraDirs = [...extraDirs];
		this.onClose = onClose;
		this.onReload = onReload;
	}

	private async reload() {
		if (!this.onReload) return;
		this.loading = true;
		try {
			await this.onReload(this.extraDirs);
			this.skills = (await window.electronAPI?.skills.load(this.extraDirs)) ?? [];
		} finally {
			this.loading = false;
		}
	}

	private async addDir() {
		const dir = await window.electronAPI?.skills.selectDir();
		if (!dir) return;
		if (!this.extraDirs.includes(dir)) {
			this.extraDirs = [...this.extraDirs, dir];
			await this.reload();
		}
	}

	private async removeDir(dir: string) {
		this.extraDirs = this.extraDirs.filter((d) => d !== dir);
		await this.reload();
	}

	private async toggleSkill(filePath: string) {
		if (this.expandedSkill === filePath) {
			this.expandedSkill = null;
			this.skillContent = null;
			return;
		}
		this.expandedSkill = filePath;
		this.skillContent = null;
		this.loadingContent = true;
		try {
			this.skillContent = (await window.electronAPI?.skills.read(filePath)) ?? null;
		} finally {
			this.loadingContent = false;
		}
	}

	render() {
		const defaultDir = `~/.pi/agent/skills/`;

		return html`
			<!-- Backdrop -->
			<div
				class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
				@click=${(e: MouseEvent) => {
					if (e.target === e.currentTarget) this.onClose?.();
				}}
			>
				<!-- Dialog -->
				<div class="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
					<!-- Header -->
					<div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
						<h2 class="text-base font-semibold text-foreground">Skills</h2>
						${Button({
							variant: "ghost",
							size: "sm",
							children: icon(X, "sm"),
							onClick: () => this.onClose?.(),
						})}
					</div>

					<div class="overflow-y-auto flex-1 p-4 space-y-5">
						<!-- Directories section -->
						<section>
							<div class="flex items-center justify-between mb-2">
								<h3 class="text-sm font-medium text-foreground">Skill Directories</h3>
								${Button({
									variant: "outline",
									size: "sm",
									children: html`${icon(FolderPlus, "xs")}<span class="ml-1">Add Directory</span>`,
									onClick: () => this.addDir(),
								})}
							</div>
							<ul class="space-y-1">
								<!-- Default directory (always present, non-removable) -->
								<li class="flex items-center gap-2 text-xs px-3 py-2 rounded bg-secondary/50 text-muted-foreground">
									${icon(FolderOpen, "xs")}
									<span class="flex-1 font-mono truncate">${defaultDir}</span>
									<span class="text-xs text-muted-foreground shrink-0">default</span>
								</li>
								${this.extraDirs.map(
									(dir) => html`
										<li class="flex items-center gap-2 text-xs px-3 py-2 rounded bg-secondary/50">
											${icon(FolderOpen, "xs")}
											<span class="flex-1 font-mono truncate text-foreground">${dir}</span>
											${Button({
												variant: "ghost",
												size: "sm",
												children: icon(Trash2, "xs"),
												onClick: () => this.removeDir(dir),
												title: "Remove directory",
											})}
										</li>
									`,
								)}
							</ul>
						</section>

						<!-- Skills list -->
						<section>
							<div class="flex items-center justify-between mb-2">
								<h3 class="text-sm font-medium text-foreground">
									Loaded Skills
									<span class="ml-1 text-muted-foreground font-normal">(${this.skills.length})</span>
								</h3>
								${Button({
									variant: "ghost",
									size: "sm",
									children: html`<span class=${this.loading ? "animate-spin inline-flex" : "inline-flex"}>${icon(RefreshCw, "xs")}</span><span class="ml-1">Reload</span>`,
									onClick: () => this.reload(),
								})}
							</div>

							${
								this.skills.length === 0
									? html`<p class="text-xs text-muted-foreground px-3 py-4 text-center">
										No skills found. Add a directory containing <code class="font-mono">SKILL.md</code> files.
									</p>`
									: html`<ul class="space-y-2">
										${this.skills.map(
											(skill) => html`
												<li class="border border-border rounded-md overflow-hidden">
													<button
														class="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
														@click=${() => this.toggleSkill(skill.filePath)}
													>
														<div class="flex-1 min-w-0">
															<div class="flex items-center gap-2">
																<span class="text-sm font-medium text-foreground font-mono">${skill.name}</span>
															</div>
															<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">${skill.description}</p>
															<p class="text-xs text-muted-foreground/60 mt-1 font-mono truncate">${skill.filePath}</p>
														</div>
														<span class="text-muted-foreground text-xs shrink-0 mt-0.5">
															${this.expandedSkill === skill.filePath ? "▲" : "▼"}
														</span>
													</button>
													${
														this.expandedSkill === skill.filePath
															? html`<div class="border-t border-border px-3 py-2 bg-secondary/20">
																${
																	this.loadingContent
																		? html`<p class="text-xs text-muted-foreground">Loading…</p>`
																		: html`<pre class="text-xs text-foreground whitespace-pre-wrap font-mono overflow-x-auto max-h-48">${this.skillContent ?? ""}</pre>`
																}
															</div>`
															: nothing
													}
												</li>
											`,
										)}
									</ul>`
							}
						</section>
					</div>
				</div>
			</div>
		`;
	}

	static async open(
		skills: SkillInfo[],
		extraDirs: string[],
		onReload: (extraDirs: string[]) => Promise<void>,
		onExtraDirsChange: (dirs: string[]) => void,
	): Promise<void> {
		return new Promise((resolve) => {
			const el = document.createElement("skills-dialog") as SkillsDialog;

			const close = () => {
				onExtraDirsChange(el.extraDirs);
				el.remove();
				resolve();
			};

			document.body.appendChild(el);
			el.init(skills, extraDirs, close, onReload);
		});
	}
}
