import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Turns experiments/voice-calibration.json into a docs root plus a candidates
// report, so src/passive-lab.ts runs on style-guide examples unchanged. Each case
// becomes its own one-sentence page, so the passage Jev sees is the guide's text.

interface Case {
	id: string;
	text: string;
	match: string;
	span: [number, number];
}

const out = resolve(process.argv[2] ?? '.style-lab-voice-calibration/input');
const casesPath = process.argv[3] ?? 'experiments/voice-calibration.json';
const { cases } = await Bun.file(casesPath).json() as { cases: Case[] };
await mkdir(resolve(out, 'docs'), { recursive: true });
const findings = [];
for (const item of cases) {
	await Bun.write(resolve(out, 'docs', `${item.id}.md`), `${item.text}\n`);
	findings.push({ id: item.id, file: `docs/${item.id}.md`, line: 1, span: item.span, check: 'Lab.PassiveHiddenActor', match: item.match, source_class: 'prose' });
}
await Bun.write(resolve(out, 'report.json'), `${JSON.stringify({ projects: [{ findings }] }, null, 2)}\n`);
console.log(`${findings.length} cases written to ${out}`);
