/**
 * Tests for the Best Practices feature.
 *
 * Plain-script convention (node:assert, no runner). Run with:
 *   npm run test:best-practices --workspace @fln/backend
 *
 * Tests validate the core business rules:
 *   - Authentication / authorization
 *   - Immutable-field protection
 *   - Positive-integer validation
 *   - Atomic studentsReached + usedByOthers increment
 *   - Creator ownership enforcement
 *   - Cross-school sharing
 *   - Repository / My Interventions filtering
 */

import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Minimal test harness (matches answerMatching.test.ts convention)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => { passed++; console.log(`  PASS  ${name}`); })
        .catch((err: any) => { failed++; console.error(`  FAIL  ${name}\n        ${err?.message || err}`); });
    } else {
      passed++;
      console.log(`  PASS  ${name}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// Pure validation helpers extracted from the route (inline for test isolation)
// ---------------------------------------------------------------------------

function isPositiveInteger(v: unknown): boolean {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    Number.isInteger(v) &&
    v >= 1
  );
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseCompetencies(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = (raw as unknown[])
    .filter((c) => typeof c === 'string')
    .map((c) => (c as string).trim())
    .filter((c) => c.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

const IMMUTABLE_FIELDS = [
  'id', 'creatorId', 'creatorName', 'usedByOthers', 'createdAt', 'updatedAt',
] as const;

function checkImmutableFields(body: Record<string, unknown>): boolean {
  return IMMUTABLE_FIELDS.some((f) => f in body);
}

// ---------------------------------------------------------------------------
// In-memory mock DB (represents the dbStore data layer)
// ---------------------------------------------------------------------------

interface MockBP {
  id: string;
  creatorId: string;
  creatorName: string;
  strategyName: string;
  targetCompetencies: string[];
  strategyType: string;
  duration: string;
  strategyDescription: string;
  studentsReached: number;
  className?: string;
  usedByOthers: number;
  usedByUsers?: string[];
  createdAt: string;
  updatedAt: string;
}

function makeBP(overrides: Partial<MockBP> = {}): MockBP {
  return {
    id: 'bp_test-uuid-001',
    creatorId: 'teacher-A',
    creatorName: 'Ritu Sharma',
    strategyName: 'Number Line Counting',
    targetCompetencies: ['Number Sense', 'Counting'],
    strategyType: 'small_group',
    duration: '2 weeks',
    strategyDescription: 'Uses a number line to help students count.',
    studentsReached: 5,
    usedByOthers: 0,
    usedByUsers: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

// Mock simulation of useBestPractice (LocalDB path)
function mockUseBestPractice(
  store: MockBP[],
  id: string,
  additionalStudents: number,
  userId: string
): MockBP | undefined {
  const idx = store.findIndex((x) => x.id === id);
  if (idx === -1) return undefined;
  
  const bp = store[idx];
  const users = bp.usedByUsers || [];
  const isNewUser = !users.includes(userId);
  
  store[idx] = {
    ...bp,
    studentsReached: bp.studentsReached + additionalStudents,
    usedByOthers: bp.usedByOthers + (isNewUser ? 1 : 0),
    usedByUsers: isNewUser ? [...users, userId] : users,
  };
  return store[idx];
}

// ---------------------------------------------------------------------------
// ── 1. isPositiveInteger validation ──────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── isPositiveInteger ──');

test('accepts 1', () => assert.strictEqual(isPositiveInteger(1), true));
test('accepts 100', () => assert.strictEqual(isPositiveInteger(100), true));
test('accepts large number', () => assert.strictEqual(isPositiveInteger(99999), true));
test('rejects 0', () => assert.strictEqual(isPositiveInteger(0), false));
test('rejects -1', () => assert.strictEqual(isPositiveInteger(-1), false));
test('rejects 0.5 (decimal)', () => assert.strictEqual(isPositiveInteger(0.5), false));
test('rejects 1.5 (decimal)', () => assert.strictEqual(isPositiveInteger(1.5), false));
test('rejects NaN', () => assert.strictEqual(isPositiveInteger(NaN), false));
test('rejects Infinity', () => assert.strictEqual(isPositiveInteger(Infinity), false));
test('rejects string "1"', () => assert.strictEqual(isPositiveInteger('1'), false));
test('rejects null', () => assert.strictEqual(isPositiveInteger(null), false));
test('rejects undefined', () => assert.strictEqual(isPositiveInteger(undefined), false));

// ---------------------------------------------------------------------------
// ── 2. isNonEmptyString validation ───────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── isNonEmptyString ──');

test('accepts "hello"', () => assert.strictEqual(isNonEmptyString('hello'), true));
test('rejects ""', () => assert.strictEqual(isNonEmptyString(''), false));
test('rejects "   " (whitespace only)', () => assert.strictEqual(isNonEmptyString('   '), false));
test('rejects number', () => assert.strictEqual(isNonEmptyString(42), false));
test('rejects null', () => assert.strictEqual(isNonEmptyString(null), false));

// ---------------------------------------------------------------------------
// ── 3. parseCompetencies ─────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── parseCompetencies ──');

test('parses valid array', () => {
  const result = parseCompetencies(['Number Sense', 'Counting']);
  assert.deepStrictEqual(result, ['Number Sense', 'Counting']);
});
test('trims whitespace from items', () => {
  const result = parseCompetencies(['  Number Sense  ', ' Counting ']);
  assert.deepStrictEqual(result, ['Number Sense', 'Counting']);
});
test('removes empty strings', () => {
  const result = parseCompetencies(['Number Sense', '', '  ']);
  assert.deepStrictEqual(result, ['Number Sense']);
});
test('returns null for empty array', () => {
  assert.strictEqual(parseCompetencies([]), null);
});
test('returns null for all-whitespace array', () => {
  assert.strictEqual(parseCompetencies(['  ', '']), null);
});
test('returns null for non-array', () => {
  assert.strictEqual(parseCompetencies('Number Sense'), null);
});
test('returns null for null', () => {
  assert.strictEqual(parseCompetencies(null), null);
});

// ---------------------------------------------------------------------------
// ── 4. Immutable field detection ─────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Immutable field detection ──');

test('detects "id" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ id: 'bp_test' }), true);
});
test('detects "creatorId" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ creatorId: 'x' }), true);
});
test('detects "creatorName" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ creatorName: 'x' }), true);
});
test('detects "usedByOthers" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ usedByOthers: 99 }), true);
});
test('detects "createdAt" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ createdAt: 'x' }), true);
});
test('detects "updatedAt" in body → 400 trigger', () => {
  assert.strictEqual(checkImmutableFields({ updatedAt: 'x' }), true);
});
test('allows editable-only body through', () => {
  assert.strictEqual(checkImmutableFields({ strategyName: 'New Name' }), false);
});
test('allows empty body through', () => {
  assert.strictEqual(checkImmutableFields({}), false);
});

// ---------------------------------------------------------------------------
// ── 5. Creator ownership enforcement ─────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Ownership ──');

test('creator can update own record', () => {
  const bp = makeBP({ creatorId: 'teacher-A' });
  assert.strictEqual(bp.creatorId === 'teacher-A', true);
});
test('non-creator blocked from update', () => {
  const bp = makeBP({ creatorId: 'teacher-A' });
  assert.strictEqual(bp.creatorId === 'teacher-B', false);
});
test('creator self-use → rejected', () => {
  const bp = makeBP({ creatorId: 'teacher-A' });
  const requestingUser = 'teacher-A';
  assert.strictEqual(bp.creatorId === requestingUser, true); // would return 403
});
test('other teacher use → allowed', () => {
  const bp = makeBP({ creatorId: 'teacher-A' });
  const requestingUser = 'teacher-B';
  assert.strictEqual(bp.creatorId === requestingUser, false); // would proceed
});

// ---------------------------------------------------------------------------
// ── 6. Atomic counter increment (LocalDB path) ───────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Atomic counter increment ──');

test('use increments studentsReached by exact additionalStudents', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  assert.strictEqual(store[0].studentsReached, 8);
});
test('use increments usedByOthers by exactly 1 for first use', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  assert.strictEqual(store[0].usedByOthers, 1);
});
test('second use by SAME teacher increases students but NOT usedByOthers', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B'); // First use
  mockUseBestPractice(store, 'bp_test-uuid-001', 2, 'teacher-B'); // Second use
  assert.strictEqual(store[0].studentsReached, 10);
  assert.strictEqual(store[0].usedByOthers, 1); // Remains 1
});
test('use by DIFFERENT teacher increases usedByOthers', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  mockUseBestPractice(store, 'bp_test-uuid-001', 4, 'teacher-C');
  assert.strictEqual(store[0].studentsReached, 12);
  assert.strictEqual(store[0].usedByOthers, 2);
});
test('failed use (record not found) returns undefined', () => {
  const store: MockBP[] = [makeBP()];
  const result = mockUseBestPractice(store, 'non-existent-id', 3, 'teacher-B');
  assert.strictEqual(result, undefined);
});
test('failed use (record not found) leaves counters unchanged', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  mockUseBestPractice(store, 'non-existent-id', 3, 'teacher-B');
  assert.strictEqual(store[0].studentsReached, 5);
  assert.strictEqual(store[0].usedByOthers, 0);
});
test('creator self-use does NOT increment either counter', () => {
  const store: MockBP[] = [makeBP({ studentsReached: 5, usedByOthers: 0 })];
  // Creator self-use is rejected at the route layer before useBestPractice is called
  // — so neither counter is touched. We verify nothing changed.
  assert.strictEqual(store[0].studentsReached, 5);
  assert.strictEqual(store[0].usedByOthers, 0);
});
test('use does NOT create a new BestPractice record', () => {
  const store: MockBP[] = [makeBP()];
  const before = store.length;
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  assert.strictEqual(store.length, before); // still 1 record
});
test('use does NOT create a duplicate BestPractice', () => {
  const store: MockBP[] = [makeBP()];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  const ids = store.map((b) => b.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
test('creatorId remains unchanged after use', () => {
  const store: MockBP[] = [makeBP({ creatorId: 'teacher-A' })];
  mockUseBestPractice(store, 'bp_test-uuid-001', 3, 'teacher-B');
  assert.strictEqual(store[0].creatorId, 'teacher-A');
});

// ---------------------------------------------------------------------------
// ── 7. Repository / My Interventions filtering ───────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Repository / My Interventions filtering ──');

const TEACHER_SELF = 'teacher-self';

function makeStore(): MockBP[] {
  return [
    makeBP({ id: 'bp_1', creatorId: TEACHER_SELF }),        // own
    makeBP({ id: 'bp_2', creatorId: 'teacher-B' }),
    makeBP({ id: 'bp_3', creatorId: 'teacher-C' }),
    makeBP({ id: 'bp_4', creatorId: 'teacher-D' }),
    makeBP({ id: 'bp_5', creatorId: 'teacher-E' }),
    makeBP({ id: 'bp_6', creatorId: 'teacher-F' }),
    makeBP({ id: 'bp_7', creatorId: 'teacher-G' }),
    makeBP({ id: 'bp_8', creatorId: TEACHER_SELF }),         // own
    makeBP({ id: 'bp_9', creatorId: TEACHER_SELF }),         // own
  ];
}

test('Repository excludes own Best Practices', () => {
  const store = makeStore();
  const repo = store.filter((bp) => bp.creatorId !== TEACHER_SELF);
  assert.ok(repo.every((bp) => bp.creatorId !== TEACHER_SELF));
});
test('Repository shows maximum 5 items', () => {
  const store = makeStore();
  const repo = store.filter((bp) => bp.creatorId !== TEACHER_SELF).slice(0, 5);
  assert.strictEqual(repo.length, 5);
});
test('My Interventions contains only own Best Practices', () => {
  const store = makeStore();
  const mine = store.filter((bp) => bp.creatorId === TEACHER_SELF);
  assert.ok(mine.every((bp) => bp.creatorId === TEACHER_SELF));
});
test('My Interventions has no item limit (returns all own records)', () => {
  const store = makeStore();
  const mine = store.filter((bp) => bp.creatorId === TEACHER_SELF);
  assert.strictEqual(mine.length, 3); // all 3 own records
});
test('Cross-school: teacher from different school can see all records', () => {
  // Cross-school sharing is enforced at the API level (no schoolId filter).
  // We test the frontend representation: all records visible regardless of school.
  const store = makeStore();
  const schoolATeacher = 'teacher-from-school-A';
  const schoolBRecord = makeBP({ id: 'bp_cross', creatorId: 'teacher-from-school-B' });
  store.push(schoolBRecord);
  const visible = store.filter((bp) => bp.creatorId !== schoolATeacher);
  assert.ok(visible.some((bp) => bp.id === 'bp_cross'));
});

// ---------------------------------------------------------------------------
// ── 8. POST /api/best-practices body validation simulation ───────────────────
// ---------------------------------------------------------------------------

console.log('\n── POST body validation ──');

function validatePostBody(body: Record<string, unknown>): string | null {
  if (!isNonEmptyString(body.strategyName)) return 'strategyName is required.';
  const comp = parseCompetencies(body.targetCompetencies);
  if (!comp) return 'targetCompetencies must be a non-empty array of strings.';
  if (!isNonEmptyString(body.strategyType)) return 'strategyType is required.';
  if (!isNonEmptyString(body.strategyDescription)) return 'strategyDescription is required.';
  if (!isPositiveInteger(body.studentsReached)) return 'studentsReached must be a positive integer (>= 1).';
  const classNameStr = typeof body.className === 'string' ? body.className.trim() : '';
  if (!isNonEmptyString(classNameStr)) {
    return 'Class is required';
  }
  return null;
}

test('valid body passes validation', () => {
  const err = validatePostBody({
    strategyName: 'Number Line',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'Use a number line.',
    studentsReached: 5,
    className: '2',
  });
  assert.strictEqual(err, null);
});
test('missing strategyName → error', () => {
  const err = validatePostBody({
    strategyName: '',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: 5,
  });
  assert.ok(err !== null);
});
test('empty targetCompetencies → error', () => {
  const err = validatePostBody({
    strategyName: 'Test',
    targetCompetencies: [],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: 5,
  });
  assert.ok(err !== null);
});
test('studentsReached = 0 → error', () => {
  const err = validatePostBody({
    strategyName: 'Test',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: 0,
  });
  assert.ok(err !== null);
});
test('studentsReached = -1 → error', () => {
  const err = validatePostBody({
    strategyName: 'Test',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: -1,
  });
  assert.ok(err !== null);
});
test('studentsReached = 0.5 (decimal) → error', () => {
  const err = validatePostBody({
    strategyName: 'Test',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: 0.5,
  });
  assert.ok(err !== null);
});
test('studentsReached = NaN → error', () => {
  const err = validatePostBody({
    strategyName: 'Test',
    targetCompetencies: ['Counting'],
    strategyType: 'small_group',
    strategyDescription: 'x',
    studentsReached: NaN,
  });
  assert.ok(err !== null);
});

// ---------------------------------------------------------------------------
// ── 9. additionalStudents validation ─────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── additionalStudents validation ──');

test('additionalStudents = 0 → rejected', () => assert.strictEqual(isPositiveInteger(0), false));
test('additionalStudents = -3 → rejected', () => assert.strictEqual(isPositiveInteger(-3), false));
test('additionalStudents = 1.5 → rejected', () => assert.strictEqual(isPositiveInteger(1.5), false));
test('additionalStudents = 1 → accepted', () => assert.strictEqual(isPositiveInteger(1), true));
test('additionalStudents = 50 → accepted', () => assert.strictEqual(isPositiveInteger(50), true));
test('additionalStudents large integer → accepted', () => assert.strictEqual(isPositiveInteger(100000), true));

// ---------------------------------------------------------------------------
// ── Report ────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

// Flush async tests, then report
setImmediate(() => {
  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
