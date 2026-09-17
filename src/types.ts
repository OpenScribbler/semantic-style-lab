export interface RuleContext {
	description: string;
	expected?: string;
	preserve?: boolean;
}

export interface ContextualRule {
	id: string;
	label: string;
	vale_check: string;
	source: { guide: string; url: string; rationale: string };
	question: string;
	variants: string[];
	contexts: Record<string, RuleContext>;
	review_at: number;
	flag_at: number;
}

export interface ValeAlert {
	Check: string;
	Line: number;
	Span: [number, number];
	Match: string;
	Message: string;
	Severity: string;
}

export interface Candidate {
	id: string;
	file: string;
	line: number;
	span: [number, number];
	match: string;
	context: string;
	ruleId: string;
}

export interface Classification {
	candidate: Candidate;
	choice: string;
	confidence: number;
	probability: number;
	expectedForm: string | null;
	status: 'pass' | 'uncertain' | 'review' | 'flag' | 'preserve';
	model: string;
}

export interface Fixture {
	id: string;
	rule: string;
	text: string;
	match: string;
	expected_context: string;
}
