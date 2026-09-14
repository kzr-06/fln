import express from 'express';
import { randomUUID } from 'crypto';
import { dbStore, UserRole, BestPractice, BestPracticeUpdate } from '../db';
import { getAuthUser } from '../auth';

// Fields that may never be sent by the client in a PATCH body.
// Presence of any of these in req.body → 400.
const IMMUTABLE_FIELDS = [
  'id',
  'creatorId',
  'creatorName',
  'usedByOthers',
  'createdAt',
  'updatedAt',
] as const;

// --------------------------------------------------------------------------
// Validation helpers
// --------------------------------------------------------------------------

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

/** Parse and trim competencies string[] from req.body. Returns null if invalid. */
function parseCompetencies(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = (raw as unknown[])
    .filter((c) => typeof c === 'string')
    .map((c) => (c as string).trim())
    .filter((c) => c.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

// --------------------------------------------------------------------------
// Route registration
// --------------------------------------------------------------------------

export function registerBestPracticeRoutes(app: express.Express) {

  // ── GET /api/best-practices ──────────────────────────────────────────────
  // Authenticated Teachers only. Returns the full shared repository (no
  // school filter — cross-school sharing is a hard requirement).
  app.get('/api/best-practices', async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== UserRole.TEACHER) return res.status(403).json({ error: 'Forbidden' });

      const bestPractices = await dbStore.getBestPractices();
      return res.json(bestPractices);
    } catch (err: any) {
      console.error('[GET /api/best-practices]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── POST /api/best-practices ─────────────────────────────────────────────
  // Authenticated Teacher only. Server injects id, creatorId, creatorName,
  // usedByOthers, createdAt, updatedAt — never trusted from client body.
  app.post('/api/best-practices', async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== UserRole.TEACHER) return res.status(403).json({ error: 'Forbidden' });

      const {
        strategyName,
        targetCompetencies,
        strategyType,
        duration,
        strategyDescription,
        studentsReached,
        className,
      } = req.body;

      // Validate required fields
      if (!isNonEmptyString(strategyName)) {
        return res.status(400).json({ error: 'strategyName is required.' });
      }
      const competencies = parseCompetencies(targetCompetencies);
      if (!competencies) {
        return res.status(400).json({
          error: 'targetCompetencies must be a non-empty array of strings.',
        });
      }
      if (!isNonEmptyString(strategyType)) {
        return res.status(400).json({ error: 'strategyType is required.' });
      }
      if (!isNonEmptyString(strategyDescription)) {
        return res.status(400).json({ error: 'strategyDescription is required.' });
      }
      if (!isPositiveInteger(studentsReached)) {
        return res.status(400).json({
          error: 'studentsReached must be a positive integer (>= 1).',
        });
      }
      const classNameStr = typeof className === 'string' ? className.trim() : '';
      if (!isNonEmptyString(classNameStr)) {
        return res.status(400).json({ error: 'Class is required.' });
      }

      const now = new Date().toISOString();
      const bp: BestPractice = {
        id: `bp_${randomUUID()}`,
        creatorId: user.id,
        creatorName: user.name,
        strategyName: (strategyName as string).trim(),
        targetCompetencies: competencies,
        strategyType: (strategyType as string).trim(),
        duration: typeof duration === 'string' ? duration.trim() : '',
        strategyDescription: (strategyDescription as string).trim(),
        studentsReached,
        className: classNameStr,
        usedByOthers: 0,
        createdAt: now,
        updatedAt: now,
      };

      await dbStore.addBestPractice(bp);
      return res.status(201).json(bp);
    } catch (err: any) {
      console.error('[POST /api/best-practices]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── PATCH /api/best-practices/:id ────────────────────────────────────────
  // Authenticated Teacher, creator only. Immutable fields in body → 400.
  app.patch('/api/best-practices/:id', async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== UserRole.TEACHER) return res.status(403).json({ error: 'Forbidden' });

      // Reject immutable fields explicitly (do NOT silently strip them)
      const attempted = IMMUTABLE_FIELDS.filter((f) => f in req.body);
      if (attempted.length > 0) {
        return res.status(400).json({ error: 'Immutable fields cannot be modified.' });
      }

      const bps = await dbStore.getBestPractices();
      const bp = bps.find((b) => b.id === req.params.id);
      if (!bp) return res.status(404).json({ error: 'Best Practice not found.' });
      if (bp.creatorId !== user.id) return res.status(403).json({ error: 'Forbidden' });

      const {
        strategyName,
        targetCompetencies,
        strategyType,
        duration,
        strategyDescription,
        studentsReached,
        className,
      } = req.body;

      // Validate any supplied editable fields
      if (strategyName !== undefined && !isNonEmptyString(strategyName)) {
        return res.status(400).json({ error: 'strategyName cannot be empty.' });
      }
      if (targetCompetencies !== undefined) {
        const parsed = parseCompetencies(targetCompetencies);
        if (!parsed) {
          return res.status(400).json({
            error: 'targetCompetencies must be a non-empty array of strings.',
          });
        }
      }
      if (strategyType !== undefined && !isNonEmptyString(strategyType)) {
        return res.status(400).json({ error: 'strategyType cannot be empty.' });
      }
      if (strategyDescription !== undefined && !isNonEmptyString(strategyDescription)) {
        return res.status(400).json({ error: 'strategyDescription cannot be empty.' });
      }
      if (studentsReached !== undefined && !isPositiveInteger(studentsReached)) {
        return res.status(400).json({
          error: 'studentsReached must be a positive integer (>= 1).',
        });
      }
      if (className !== undefined) {
        const classStr = typeof className === 'string' ? className.trim() : '';
        if (!isNonEmptyString(classStr)) {
          return res.status(400).json({ error: 'Class cannot be empty.' });
        }
      }

      // Build the update — only editable fields, never immutable ones.
      // updatedAt is always server-injected.
      const updates: BestPracticeUpdate & { updatedAt: string } = {
        strategyName: strategyName !== undefined
          ? (strategyName as string).trim()
          : bp.strategyName,
        targetCompetencies: targetCompetencies !== undefined
          ? parseCompetencies(targetCompetencies)!
          : bp.targetCompetencies,
        strategyType: strategyType !== undefined
          ? (strategyType as string).trim()
          : bp.strategyType,
        duration: duration !== undefined
          ? (typeof duration === 'string' ? duration.trim() : bp.duration)
          : bp.duration,
        strategyDescription: strategyDescription !== undefined
          ? (strategyDescription as string).trim()
          : bp.strategyDescription,
        studentsReached: studentsReached !== undefined ? studentsReached : bp.studentsReached,
        className: className !== undefined
          ? (className as string).trim()
          : bp.className,
        updatedAt: new Date().toISOString(),
      };

      const updated = await dbStore.updateBestPractice(req.params.id, updates);
      if (!updated) return res.status(404).json({ error: 'Best Practice not found.' });
      return res.json(updated);
    } catch (err: any) {
      console.error('[PATCH /api/best-practices/:id]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── POST /api/best-practices/:id/use ─────────────────────────────────────
  // Authenticated Teacher, non-creator only.
  // Effect: studentsReached += additionalStudents, usedByOthers += 1 (atomic).
  // Does NOT create an Intervention. Does NOT copy the record.
  app.post('/api/best-practices/:id/use', async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== UserRole.TEACHER) return res.status(403).json({ error: 'Forbidden' });

      const bps = await dbStore.getBestPractices();
      const bp = bps.find((b) => b.id === req.params.id);
      if (!bp) return res.status(404).json({ error: 'Best Practice not found.' });

      if (bp.creatorId === user.id) {
        return res.status(403).json({
          error: 'Use "Update your approach" to modify your own strategy.',
        });
      }

      const { additionalStudents } = req.body;
      if (!isPositiveInteger(additionalStudents)) {
        return res.status(400).json({
          error: 'additionalStudents must be a positive integer (>= 1).',
        });
      }

      const updated = await dbStore.useBestPractice(req.params.id, additionalStudents, user.id);
      if (!updated) return res.status(404).json({ error: 'Best Practice not found.' });
      return res.json(updated);
    } catch (err: any) {
      console.error('[POST /api/best-practices/:id/use]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
