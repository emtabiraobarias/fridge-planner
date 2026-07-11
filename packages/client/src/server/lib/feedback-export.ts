import 'server-only';
import type { IFeedbackRecord } from '../types/feedback';

/**
 * Render a completed feedback record as markdown whose section structure matches
 * `.specify/templates/spec-template.md`, so it can be pasted into `/speckit.specify`
 * as specification input with no structural edits (FR-F-007 / SC-F-003).
 *
 * Pure and deterministic — no I/O — so it is trivially unit-testable.
 */
export function renderFeedbackMarkdown(record: IFeedbackRecord): string {
  const sections = [
    header(record),
    problemSection(record),
    scenariosSection(record),
    record.type === 'bug' ? reproSection(record) : '',
    requirementsSection(record),
  ];
  return sections.filter((s) => s !== '').join('\n');
}

function header(record: IFeedbackRecord): string {
  const title = record.title ?? 'Untitled feedback';
  const created = record.createdAt ? toIsoDate(record.createdAt) : toIsoDate(new Date());
  return [
    `# Feature Specification: ${title}`,
    '',
    `**Feedback type**: ${record.type === 'bug' ? 'Bug' : 'Improvement'}`,
    `**Status**: ${record.status}`,
    `**Priority**: ${record.priority ?? 'P3'}`,
    `**Affected area**: ${record.affectedArea ?? 'other'}`,
    `**Created**: ${created}`,
    '**Input**: Collected via the in-app feedback assistant',
    '',
  ].join('\n');
}

function problemSection(record: IFeedbackRecord): string {
  if (!record.problemStatement) return '';
  return ['## Problem Statement', '', record.problemStatement, ''].join('\n');
}

function scenariosSection(record: IFeedbackRecord): string {
  const title = record.title ?? 'Untitled feedback';
  const priority = record.priority ?? 'P3';
  const lines = ['## User Scenarios & Testing', '', `### User Story 1 - ${title} (Priority: ${priority})`, ''];
  if (record.userStory) lines.push(record.userStory, '');
  lines.push('**Acceptance Scenarios**:', '');

  const criteria = record.acceptanceCriteria ?? [];
  if (criteria.length === 0) {
    lines.push('1. _No acceptance scenarios captured._');
  } else {
    criteria.forEach((c, i) => lines.push(`${i + 1}. **Given** ${c.given}, **When** ${c.when}, **Then** ${c.then}`));
  }
  lines.push('');
  return lines.join('\n');
}

function reproSection(record: IFeedbackRecord): string {
  const steps = record.reproSteps ?? [];
  const lines = ['## Reproduction Steps', ''];
  if (steps.length === 0) {
    lines.push('1. _No reproduction steps captured._');
  } else {
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push('');
  lines.push(`**Expected behavior**: ${record.expectedBehavior ?? ''}`);
  lines.push(`**Actual behavior**: ${record.actualBehavior ?? ''}`, '');
  return lines.join('\n');
}

function requirementsSection(record: IFeedbackRecord): string {
  const noun = record.type === 'bug' ? 'defect' : 'improvement';
  const detail = record.problemStatement ?? record.title ?? 'the reported feedback';
  return [
    '## Requirements',
    '',
    '### Functional Requirements',
    '',
    `- **FR-001**: The system MUST address the reported ${noun} — ${detail}`,
    '',
  ].join('\n');
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
