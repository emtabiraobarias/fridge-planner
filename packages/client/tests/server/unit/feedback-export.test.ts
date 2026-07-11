// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderFeedbackMarkdown } from '@server/lib/feedback-export';
import type { IFeedbackRecord } from '@server/types/feedback';

const baseBug: IFeedbackRecord = {
  userId: 'u1',
  status: 'complete',
  transcript: [],
  type: 'bug',
  title: 'Grocery list count is wrong',
  problemStatement: 'The grocery list header count does not match the visible items.',
  userStory: 'As a home cook, I want the grocery count to match the items, so that I can trust the list.',
  acceptanceCriteria: [
    { given: 'a grocery list with 5 items', when: 'the user opens the grocery page', then: 'the header shows 5' },
    { given: 'an empty grocery list', when: 'the user opens the grocery page', then: 'the header shows 0' },
  ],
  reproSteps: ['Open the grocery page', 'Add 5 items', 'Observe the header'],
  expectedBehavior: 'The header count equals the number of items.',
  actualBehavior: 'The header count stays at 0.',
  affectedArea: 'grocery',
  priority: 'P2',
  createdAt: new Date('2026-07-11T10:00:00.000Z'),
  updatedAt: new Date('2026-07-11T10:05:00.000Z'),
};

const baseImprovement: IFeedbackRecord = {
  userId: 'u1',
  status: 'complete',
  transcript: [],
  type: 'improvement',
  title: 'Add a dark mode',
  problemStatement: 'The bright UI is hard to use at night.',
  userStory: 'As a night owl, I want a dark theme, so that the app is comfortable in low light.',
  acceptanceCriteria: [
    { given: 'the app is open', when: 'the user enables dark mode', then: 'the UI switches to a dark palette' },
  ],
  reproSteps: [],
  expectedBehavior: '',
  actualBehavior: '',
  affectedArea: 'other',
  priority: 'P3',
  createdAt: new Date('2026-07-11T10:00:00.000Z'),
  updatedAt: new Date('2026-07-11T10:05:00.000Z'),
};

describe('renderFeedbackMarkdown (FR-F-007 / SC-F-003 spec-template alignment)', () => {
  it('emits the spec-template headings and the title', () => {
    const md = renderFeedbackMarkdown(baseBug);
    expect(md).toContain('# Feature Specification: Grocery list count is wrong');
    expect(md).toContain('## User Scenarios & Testing');
    expect(md).toContain('### User Story 1 - Grocery list count is wrong (Priority: P2)');
    expect(md).toContain('**Acceptance Scenarios**:');
    expect(md).toContain('## Requirements');
    expect(md).toContain('### Functional Requirements');
  });

  it('renders the user story prose and numbered Given/When/Then scenarios', () => {
    const md = renderFeedbackMarkdown(baseBug);
    expect(md).toContain('As a home cook, I want the grocery count to match the items, so that I can trust the list.');
    expect(md).toContain('1. **Given** a grocery list with 5 items, **When** the user opens the grocery page, **Then** the header shows 5');
    expect(md).toContain('2. **Given** an empty grocery list, **When** the user opens the grocery page, **Then** the header shows 0');
  });

  it('includes a reproduction section with expected-vs-actual for a bug', () => {
    const md = renderFeedbackMarkdown(baseBug);
    expect(md).toContain('## Reproduction Steps');
    expect(md).toContain('1. Open the grocery page');
    expect(md).toContain('**Expected behavior**: The header count equals the number of items.');
    expect(md).toContain('**Actual behavior**: The header count stays at 0.');
  });

  it('omits the reproduction section for an improvement', () => {
    const md = renderFeedbackMarkdown(baseImprovement);
    expect(md).not.toContain('## Reproduction Steps');
    expect(md).not.toContain('**Actual behavior**');
    expect(md).toContain('### User Story 1 - Add a dark mode (Priority: P3)');
    expect(md).toContain('**Feedback type**: Improvement');
  });

  it('surfaces metadata (type, priority, affected area, created date)', () => {
    const md = renderFeedbackMarkdown(baseBug);
    expect(md).toContain('**Feedback type**: Bug');
    expect(md).toContain('**Priority**: P2');
    expect(md).toContain('**Affected area**: grocery');
    expect(md).toContain('**Created**: 2026-07-11');
  });
});
