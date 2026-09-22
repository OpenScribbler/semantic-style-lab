import type { AuditFinding, ProjectAudit } from './style-lab-audit';

function escapeHtml(value: unknown) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function badge(action: AuditFinding['action']) {
	return `<span class="badge ${action}">${escapeHtml(action)}</span>`;
}

export function buildEditorChecklist(projects: ProjectAudit[]) {
	return projects.flatMap((project) => {
		const actionable = project.findings.filter((finding) => finding.action === 'flag' || finding.action === 'review');
		const files = [...new Set(actionable.map((finding) => finding.file))].sort();
		return files.map((file) => ({
			project: project.name,
			root: project.root,
			file,
			instructions: 'Address only the localized findings below. Preserve technical meaning, code, UI text, product names, and unrelated prose. Return a minimal patch; do not invent additional style violations.',
			findings: actionable.filter((finding) => finding.file === file).map((finding) => ({
				id: finding.id,
				line: finding.line,
				rule_id: finding.rule_id,
				action: finding.action,
				passage: finding.marked_context,
				matched_text: finding.match,
				expected_form: finding.expected_form ?? null,
				reason: finding.reason,
				signals: finding.signals,
			})),
		}));
	});
}

export function buildHtmlReport(report: {
	generated_at: string;
	model: string;
	no_jev: boolean;
	pipeline_version: string;
	rule_set_version: string;
	static_rules: readonly string[];
	projects: ProjectAudit[];
	summary: { files: number; candidates: number; flag: number; review: number; suppress: number; unparsed: number; ast_parsed_files: number; fallback_files: number; unparsed_files: number; jev_calls: number; jev_candidates: number; input_tokens: number; estimated_input_cost_usd: number };
}) {
	const rows = report.projects.flatMap((project) => project.findings.map((finding) => `
		<tr>
			<td>${badge(finding.action)}</td>
			<td><strong>${escapeHtml(project.name)}</strong><br><span class="muted">${escapeHtml(finding.file)}:${finding.line}</span></td>
			<td><code>${escapeHtml(finding.rule_id)}</code></td>
			<td><div class="passage">${escapeHtml(finding.marked_context)}</div><div class="reason">${escapeHtml(finding.reason)}</div></td>
		</tr>`)).join('');
	const ruleItems = report.static_rules.map((rule) => `<li><code>${escapeHtml(rule)}</code></li>`).join('');
	const degraded = report.projects.flatMap((project) => project.source_health
		.filter((item) => item.parser === 'lexical_fallback' || item.parser === 'unparsed')
		.map((item) => `<li><strong>${escapeHtml(project.name)}</strong> · ${escapeHtml(item.file)} · <code>${escapeHtml(item.parser)}</code>${item.parse_error ? `<br><span class="muted">${escapeHtml(item.parse_error)}</span>` : ''}</li>`)).join('');
	const sampling = report.projects.filter((project) => project.sampling).map((project) => {
		const sample = project.sampling!;
		const rows = Object.keys(sample.available_candidates).sort().map((rule) => `<tr><td><code>${escapeHtml(rule)}</code></td><td>${sample.available_candidates[rule]}</td><td>${sample.selected_candidates[rule]}</td><td>${sample.target_met[rule] ? 'yes' : sample.all_available_selected[rule] ? 'all available; target unavailable' : 'no'}</td></tr>`).join('');
		return `<h3>${escapeHtml(project.name)}</h3><p><strong>${sample.selected_files}</strong> of ${sample.eligible_files} eligible files selected; target ${sample.min_candidates_per_rule} candidates per available rule.</p><table><thead><tr><th>Rule</th><th>Available</th><th>Selected</th><th>Target met</th></tr></thead><tbody>${rows}</tbody></table>`;
	}).join('');
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Semantic Style Lab audit</title>
<style>
:root{color-scheme:dark;--bg:#0b100e;--panel:#121a16;--line:#2b3d34;--text:#edf5f0;--muted:#9eb1a7;--mint:#7de2b8;--blue:#86adff;--yellow:#f0c86a;--red:#ff8c8c;--purple:#c7a7ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:48px 28px 80px}h1{font:700 clamp(2.2rem,5vw,4.2rem)/1.05 Georgia,serif;margin:.25rem 0 1rem}.eyebrow{color:var(--mint);letter-spacing:.08em;text-transform:uppercase;font-size:.75rem}.lede{max-width:820px;color:#c9d8d0;font-size:1.15rem}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:28px 0}.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}.value{font:700 1.8rem Georgia,serif}.label,.muted{color:var(--muted)}.panel{margin:22px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:13px 10px}th{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em}.badge{display:inline-block;border:1px solid;border-radius:999px;padding:2px 8px;font-size:.72rem;text-transform:uppercase}.badge.flag{color:var(--red)}.badge.review{color:var(--yellow)}.badge.suppress{color:var(--mint)}.badge.unparsed{color:var(--purple)}code{color:var(--blue)}.passage{white-space:pre-wrap;max-width:720px}.reason{color:var(--muted);margin-top:6px;font-size:.9rem}@media(max-width:760px){main{padding:28px 16px}th:nth-child(3),td:nth-child(3){display:none}}
</style></head><body><main>
<div class="eyebrow">Semantic Style Lab · ${escapeHtml(report.pipeline_version)} · ${escapeHtml(report.rule_set_version)} · shadow-mode audit</div><h1>Localized style decisions, not another wall of alerts.</h1>
<p class="lede">Vale enumerated a fixed research rule set. Source parsing removed non-prose matches, and ${report.no_jev ? 'Jev was disabled, so semantic candidates remain in review.' : 'Jev evaluated narrow semantic conditions while code decided whether to flag, review, or suppress each candidate.'}</p>
<section class="cards">
<div class="card"><div class="value">${report.summary.files}</div><div class="label">files scanned</div></div>
<div class="card"><div class="value">${report.summary.candidates}</div><div class="label">Vale candidates</div></div>
<div class="card"><div class="value">${report.summary.flag}</div><div class="label">flag</div></div>
<div class="card"><div class="value">${report.summary.review}</div><div class="label">review</div></div>
<div class="card"><div class="value">${report.summary.suppress}</div><div class="label">suppressed</div></div>
<div class="card"><div class="value">${report.summary.unparsed}</div><div class="label">unparsed candidates</div></div>
<div class="card"><div class="value">${report.summary.jev_candidates}</div><div class="label">reached Jev in ${report.summary.jev_calls} calls</div></div>
<div class="card"><div class="value">$${report.summary.estimated_input_cost_usd.toFixed(4)}</div><div class="label">estimated Jev input cost</div></div>
</section>
<section class="panel"><h2>Parse health</h2><p><strong>${report.summary.ast_parsed_files}</strong> AST-parsed · <strong>${report.summary.fallback_files}</strong> protected lexical fallback · <strong>${report.summary.unparsed_files}</strong> unparsed.</p>${degraded ? `<ul>${degraded}</ul>` : '<p class="muted">Every file used its format-specific AST parser.</p>'}<p class="muted">Fallback candidates may still reach Jev after code, template, link, and frontmatter ranges are protected. Unparsed candidates never count as semantic review or effectiveness evidence.</p></section>
${sampling ? `<section class="panel"><h2>Rule-stratified sampling</h2>${sampling}<p class="muted">Selection used Vale candidates only, before any Jev response. Unavailable rules remain explicitly unmeasured.</p></section>` : ''}
<section class="panel"><h2>Fixed rule set</h2><ul>${ruleItems}</ul><p class="muted">Suppression is a shadow-mode recommendation only. This command does not edit source files or change CI.</p></section>
<section class="panel"><h2>Experimental boundary</h2><p>The primary judgments in this report come from Jev probabilities composed by code. An agent may configure, run, and diagnose the experiment, but must not replace skipped Jev calls with its own style judgments or count agent-authored labels as primary effectiveness evidence.</p></section>
<section class="panel"><h2>All candidates</h2><table><thead><tr><th>Disposition</th><th>Location</th><th>Rule</th><th>Passage and reason</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No candidates found.</td></tr>'}</tbody></table></section>
<p class="muted">Generated ${escapeHtml(report.generated_at)} with ${escapeHtml(report.model)}. Raw requests and responses are stored beside this report.</p>
</main></body></html>`;
}
