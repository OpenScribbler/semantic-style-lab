import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export interface ProjectConfig {
	name: string;
	root: string;
	include: string[];
	exclude: string[];
	max_files?: number;
}

export interface StyleLabConfig {
	schema_version: 1;
	output_dir: string;
	projects: ProjectConfig[];
	jev: {
		model: string;
		batch_question_limit: number;
	};
	parsing: {
		max_unparsed_file_ratio: number;
	};
}

export interface LoadedConfig extends StyleLabConfig {
	config_path: string;
}

function nonemptyStrings(value: unknown, field: string) {
	if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
		throw new Error(`${field} must be a non-empty array of strings.`);
	}
	return value as string[];
}

function strings(value: unknown, field: string) {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
		throw new Error(`${field} must be an array of non-empty strings.`);
	}
	return value as string[];
}

export async function loadStyleLabConfig(path = 'style-lab.config.json'): Promise<LoadedConfig> {
	const configPath = resolve(path);
	let raw: unknown;
	try {
		raw = await Bun.file(configPath).json();
	} catch (error) {
		throw new Error(`Could not read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!raw || typeof raw !== 'object') throw new Error(`${configPath}: configuration must be an object.`);
	const value = raw as Record<string, unknown>;
	if (value.schema_version !== 1) throw new Error(`${configPath}: schema_version must be 1.`);
	if (!Array.isArray(value.projects) || value.projects.length === 0) {
		throw new Error(`${configPath}: projects must contain at least one project.`);
	}
	const base = dirname(configPath);
	const names = new Set<string>();
	const projects = value.projects.map((entry, index): ProjectConfig => {
		if (!entry || typeof entry !== 'object') throw new Error(`projects[${index}] must be an object.`);
		const project = entry as Record<string, unknown>;
		if (typeof project.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project.name)) {
			throw new Error(`projects[${index}].name must contain only letters, numbers, dots, dashes, or underscores.`);
		}
		if (names.has(project.name)) throw new Error(`Duplicate project name: ${project.name}`);
		names.add(project.name);
		if (typeof project.root !== 'string' || !project.root.trim()) throw new Error(`projects[${index}].root is required.`);
		const maxFiles = project.max_files;
		if (maxFiles !== undefined && (!Number.isInteger(maxFiles) || (maxFiles as number) < 1)) {
			throw new Error(`projects[${index}].max_files must be a positive integer.`);
		}
		return {
			name: project.name,
			root: isAbsolute(project.root) ? project.root : resolve(base, project.root),
			include: nonemptyStrings(project.include, `projects[${index}].include`),
			exclude: project.exclude === undefined ? [] : strings(project.exclude, `projects[${index}].exclude`),
			...(maxFiles === undefined ? {} : { max_files: maxFiles as number }),
		};
	});
	const jev = value.jev && typeof value.jev === 'object' ? value.jev as Record<string, unknown> : {};
	const model = jev.model ?? 'jev-latest';
	if (typeof model !== 'string' || !model.trim()) throw new Error('jev.model must be a non-empty string.');
	const questionLimit = jev.batch_question_limit ?? 200;
	if (!Number.isInteger(questionLimit) || (questionLimit as number) < 1 || (questionLimit as number) > 255) {
		throw new Error('jev.batch_question_limit must be an integer from 1 through 255.');
	}
	const output = value.output_dir ?? '.style-lab';
	if (typeof output !== 'string' || !output.trim()) throw new Error('output_dir must be a non-empty string.');
	const parsing = value.parsing && typeof value.parsing === 'object' ? value.parsing as Record<string, unknown> : {};
	const maxUnparsedFileRatio = parsing.max_unparsed_file_ratio ?? 0;
	if (typeof maxUnparsedFileRatio !== 'number' || maxUnparsedFileRatio < 0 || maxUnparsedFileRatio > 1) {
		throw new Error('parsing.max_unparsed_file_ratio must be a number from 0 through 1.');
	}
	return {
		schema_version: 1,
		config_path: configPath,
		output_dir: isAbsolute(output) ? output : resolve(base, output),
		projects,
		jev: { model, batch_question_limit: questionLimit as number },
		parsing: { max_unparsed_file_ratio: maxUnparsedFileRatio },
	};
}

function matchesAny(path: string, patterns: string[]) {
	return patterns.some((pattern) => new Bun.Glob(pattern).match(path));
}

export async function discoverProjectFiles(project: ProjectConfig) {
	const rootStat = await stat(project.root).catch(() => null);
	if (!rootStat?.isDirectory()) throw new Error(`${project.name}: root is not a directory: ${project.root}`);
	const paths = new Set<string>();
	for (const pattern of project.include) {
		for await (const path of new Bun.Glob(pattern).scan({ cwd: project.root, absolute: true, onlyFiles: true, dot: false })) {
			const local = relative(project.root, path).replaceAll('\\', '/');
			if (!matchesAny(local, project.exclude)) paths.add(resolve(path));
		}
	}
	const sorted = [...paths].sort();
	if (!project.max_files) return sorted;
	return sorted
		.map((path) => ({
			path,
			hash: createHash('sha256').update(relative(project.root, path).replaceAll('\\', '/')).digest('hex'),
		}))
		.sort((left, right) => left.hash.localeCompare(right.hash) || left.path.localeCompare(right.path))
		.slice(0, project.max_files)
		.map((item) => item.path)
		.sort();
}
