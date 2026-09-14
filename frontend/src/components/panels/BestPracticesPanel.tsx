import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, X, Award, Users, Clock, BookOpen, ChevronUp, ChevronDown,
  AlertCircle, RefreshCw, Loader2, CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../../services/apiClient';
import type { BestPractice, User } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState = 'loading' | 'loaded' | 'error';

interface BestPracticesPanelProps {
  currentUser: User;
  token: string;
}

interface FormState {
  strategyName: string;
  targetCompetencies: string; // comma-separated string in the UI
  strategyType: string;
  duration: string;
  strategyDescription: string;
  studentsReached: number | '';
  className: string;
}

const EMPTY_FORM: FormState = {
  strategyName: '',
  targetCompetencies: '',
  strategyType: 'small_group',
  duration: '',
  strategyDescription: '',
  studentsReached: 1,
  className: '',
};

const STRATEGY_TYPE_LABELS: Record<string, string> = {
  small_group: 'Small Group',
  one_on_one: 'One on One',
  peer_tutoring: 'Peer Tutoring',
  visual_aids: 'Visual Aids',
  manipulatives: 'Manipulatives',
  worksheets: 'Worksheets',
  game_based: 'Game Based',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesSearch(bp: BestPractice, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return (
    (bp.strategyName || '').toLowerCase().includes(lower) ||
    (bp.targetCompetencies || []).some((c) => c.toLowerCase().includes(lower)) ||
    (bp.creatorName || '').toLowerCase().includes(lower)
  );
}

function parseCompetenciesFromString(raw: string): string[] {
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StepperProps {
  value: number | '';
  onChange: (v: number | '') => void;
  min?: number;
  disabled?: boolean;
  id?: string;
}

const Stepper: React.FC<StepperProps> = ({ value, onChange, min = 1, disabled = false, id }) => {
  const handleManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(''); return; }
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= min) onChange(parsed);
  };

  const currentVal = typeof value === 'number' ? value : min;

  return (
    <div className="flex items-center w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-shadow overflow-hidden">
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        onChange={handleManual}
        disabled={disabled}
        className="flex-1 min-w-0 w-full bg-transparent text-slate-900 dark:text-white text-sm px-3 py-2 border-none focus:ring-0 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed outline-none [-moz-appearance:_textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex items-center pr-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, currentVal - 1))}
          disabled={disabled || (typeof value === 'number' && value <= min)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-lg leading-none"
          aria-label="Decrease"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onChange(currentVal + 1)}
          disabled={disabled}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-lg leading-none"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  );
};

interface ModalWrapperProps {
  onClose: () => void;
  children: React.ReactNode;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({ onClose, children }) => {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

interface LabelProps { required?: boolean; children: React.ReactNode; htmlFor?: string; }
const Label: React.FC<LabelProps> = ({ required, children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
const Input: React.FC<InputProps> = (props) => (
  <input
    {...props}
    className={
      'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
      'text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 ' +
      'focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed ' +
      (props.className || '')
    }
  />
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
const Textarea: React.FC<TextareaProps> = (props) => (
  <textarea
    {...props}
    rows={3}
    className={
      'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
      'text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 ' +
      'focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed resize-none ' +
      (props.className || '')
    }
  />
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
const Select: React.FC<SelectProps> = ({ children, ...props }) => (
  <select
    {...props}
    className={
      'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
      'text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 ' +
      'focus:ring-indigo-500 focus:border-transparent ' +
      'disabled:opacity-50 disabled:cursor-not-allowed ' +
      (props.className || '')
    }
  >
    {children}
  </select>
);

interface FormErrorProps { message: string | null; }
const FormError: React.FC<FormErrorProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Strategy form (shared between Add and Update modals)
// ---------------------------------------------------------------------------

interface StrategyFormProps {
  title: string;
  form: FormState;
  onChange: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  formError: string | null;
  submitLabel: string;
}

const StrategyForm: React.FC<StrategyFormProps> = ({
  title, form, onChange, onSubmit, onCancel, saving, formError, submitLabel,
}) => {
  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => onChange({ ...form, [field]: e.target.value });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div>
        <Label required htmlFor="bp-strategy-name">Strategy Name</Label>
        <Input
          id="bp-strategy-name"
          value={form.strategyName}
          onChange={set('strategyName')}
          placeholder="e.g. Number Line Counting"
          disabled={saving}
        />
      </div>

      <div>
        <Label required htmlFor="bp-competencies">Target Competencies</Label>
        <Input
          id="bp-competencies"
          value={form.targetCompetencies}
          onChange={set('targetCompetencies')}
          placeholder="e.g. Addition, Number Sense"
          disabled={saving}
        />
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Separate multiple competencies with commas.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required htmlFor="bp-type">Strategy Type</Label>
          <Select id="bp-type" value={form.strategyType} onChange={set('strategyType')} disabled={saving}>
            {Object.entries(STRATEGY_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="bp-duration">Duration</Label>
          <Input
            id="bp-duration"
            value={form.duration}
            onChange={set('duration')}
            placeholder="e.g. 2 weeks"
            disabled={saving}
          />
        </div>
      </div>

      <div>
        <Label required htmlFor="bp-description">Strategy Description</Label>
        <Textarea
          id="bp-description"
          value={form.strategyDescription}
          onChange={set('strategyDescription')}
          placeholder="Describe the remediation strategy in detail..."
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required htmlFor="bp-students">Students Reached</Label>
          <Stepper
            id="bp-students"
            value={form.studentsReached}
            onChange={(val) => onChange({ ...form, studentsReached: val })}
            min={1}
            disabled={saving}
          />
        </div>
        <div>
          <Label required htmlFor="bp-class">Class</Label>
          <Input
            id="bp-class"
            type="text"
            value={form.className}
            onChange={set('className')}
            placeholder="e.g. Preschool or 2"
            disabled={saving}
          />
        </div>
      </div>

      <FormError message={formError} />

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BestPractice card
// ---------------------------------------------------------------------------

interface CardProps {
  bp: BestPractice;
  isOwner: boolean;
  onUpdate?: () => void;
  onUse?: () => void;
}

const BestPracticeCard: React.FC<CardProps> = ({ bp, isOwner, onUpdate, onUse }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow space-y-3 flex flex-col">
    {/* Header */}
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 ${
          isOwner
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
        }`}>
          {STRATEGY_TYPE_LABELS[bp.strategyType] || bp.strategyType}
        </span>
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-tight line-clamp-2">
          {bp.strategyName}
        </h3>
      </div>
    </div>

    {/* Description */}
    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 flex-1">
      {bp.strategyDescription}
    </p>

    {/* Tags */}
    {(bp.targetCompetencies || []).length > 0 && (
      <div className="flex flex-wrap gap-1">
        {(bp.targetCompetencies || []).slice(0, 4).map((c) => (
          <span key={c} className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700">
            {c}
          </span>
        ))}
        {(bp.targetCompetencies || []).length > 4 && (
          <span className="text-[10px] px-2 py-0.5 text-slate-400 dark:text-slate-500">
            +{(bp.targetCompetencies || []).length - 4} more
          </span>
        )}
      </div>
    )}

    {/* Meta */}
    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span>{bp.creatorName}</span>
      </div>
      {bp.duration && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{bp.duration}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        <span>{bp.studentsReached} student{bp.studentsReached !== 1 ? 's' : ''} reached</span>
      </div>
      {bp.className && (
        <div className="flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 shrink-0" />
          <span>
            {(() => {
              const s = String(bp.className).trim();
              if (s.toLowerCase() === 'preschool') return 'Preschool';
              const match = s.match(/\d+/);
              if (match) return `Class ${match[0]}`;
              return s;
            })()}
          </span>
        </div>
      )}
    </div>

    {/* Used-by-others badge */}
    {bp.usedByOthers === 1 && (
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
        Used by 1 other teacher
      </p>
    )}
    {bp.usedByOthers > 1 && (
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
        Used by {bp.usedByOthers} other teachers
      </p>
    )}

    {/* Action */}
    <div className="pt-1">
      {isOwner ? (
        <button
          onClick={onUpdate}
          className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
        >
          Update your approach
        </button>
      ) : (
        <button
          onClick={onUse}
          className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Use this approach
        </button>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const BestPracticesPanel: React.FC<BestPracticesPanelProps> = ({ currentUser }) => {
  // ── Panel state ────────────────────────────────────────────────────────
  const [panelState, setPanelState] = useState<PanelState>('loading');
  const [bestPractices, setBestPractices] = useState<BestPractice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // ── Modal state ────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [editingBp, setEditingBp] = useState<BestPractice | null>(null);
  const [usingBp, setUsingBp] = useState<BestPractice | null>(null);

  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [additionalStudents, setAdditionalStudents] = useState<number | ''>(1);

  // Shared save state (one active operation at a time)
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Prevent stale closures on refresh
  const savingRef = useRef(false);

  // ── Data loading ───────────────────────────────────────────────────────
  const loadBestPractices = useCallback(async () => {
    setPanelState('loading');
    setLoadError(null);
    try {
      const res = await apiFetch('/api/best-practices');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: BestPractice[] = await res.json();
      setBestPractices(data);
      setPanelState('loaded');
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load Best Practices.');
      setPanelState('error');
    }
  }, []);

  useEffect(() => { loadBestPractices(); }, [loadBestPractices]);

  // ── Filtered lists ─────────────────────────────────────────────────────
  const sorted = [...bestPractices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const repositoryList = sorted
    .filter((bp) => bp.creatorId !== currentUser.id)
    .filter((bp) => matchesSearch(bp, search))
    .slice(0, 5); // UI display cap only

  const myList = sorted
    .filter((bp) => bp.creatorId === currentUser.id)
    .filter((bp) => matchesSearch(bp, search));

  // ── Modal helpers ──────────────────────────────────────────────────────
  const openAdd = () => {
    setAddForm(EMPTY_FORM);
    setFormError(null);
    setShowAdd(true);
  };

  const openEdit = (bp: BestPractice) => {
    setEditForm({
      strategyName: bp.strategyName,
      targetCompetencies: (bp.targetCompetencies || []).join(', '),
      strategyType: bp.strategyType,
      duration: bp.duration,
      strategyDescription: bp.strategyDescription,
      studentsReached: bp.studentsReached,
      className: bp.className || '',
    });
    setFormError(null);
    setEditingBp(bp);
  };

  const openUse = (bp: BestPractice) => {
    setAdditionalStudents(1);
    setFormError(null);
    setUsingBp(bp);
  };

  const closeAll = () => {
    if (savingRef.current) return; // don't close mid-request
    setShowAdd(false);
    setEditingBp(null);
    setUsingBp(null);
    setFormError(null);
  };

  // ── Submit: Add ────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (savingRef.current) return;
    const competencies = parseCompetenciesFromString(addForm.targetCompetencies);

    // Frontend validation
    if (!addForm.strategyName.trim()) {
      setFormError('Strategy Name is required.'); return;
    }
    if (competencies.length === 0) {
      setFormError('At least one competency is required.'); return;
    }
    if (!addForm.strategyType) {
      setFormError('Strategy Type is required.'); return;
    }
    if (!addForm.strategyDescription.trim()) {
      setFormError('Strategy Description is required.'); return;
    }
    if (addForm.studentsReached === '' || !Number.isInteger(addForm.studentsReached) || addForm.studentsReached < 1) {
      setFormError('Students Reached must be a positive integer.'); return;
    }
    const classStr = addForm.className.trim();
    if (!classStr) {
      setFormError('Class is required.'); return;
    }

    setSaving(true); savingRef.current = true; setFormError(null);
    try {
      const res = await apiFetch('/api/best-practices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyName: addForm.strategyName.trim(),
          targetCompetencies: competencies,
          strategyType: addForm.strategyType,
          duration: addForm.duration.trim(),
          strategyDescription: addForm.strategyDescription.trim(),
          studentsReached: addForm.studentsReached,
          className: addForm.className.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error || `Server error ${res.status}`); return;
      }
      setShowAdd(false);
      await loadBestPractices();
    } catch (e: any) {
      setFormError(e.message || 'Network error. Please try again.');
    } finally {
      setSaving(false); savingRef.current = false;
    }
  };

  // ── Submit: Update ─────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editingBp || savingRef.current) return;
    const competencies = parseCompetenciesFromString(editForm.targetCompetencies);

    if (!editForm.strategyName.trim()) {
      setFormError('Strategy Name is required.'); return;
    }
    if (competencies.length === 0) {
      setFormError('At least one competency is required.'); return;
    }
    if (!editForm.strategyDescription.trim()) {
      setFormError('Strategy Description is required.'); return;
    }
    if (editForm.studentsReached === '' || !Number.isInteger(editForm.studentsReached) || editForm.studentsReached < 1) {
      setFormError('Students Reached must be a positive integer.'); return;
    }
    const editClassStr = editForm.className.trim();
    if (!editClassStr) {
      setFormError('Class is required.'); return;
    }

    setSaving(true); savingRef.current = true; setFormError(null);
    try {
      const res = await apiFetch(`/api/best-practices/${editingBp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyName: editForm.strategyName.trim(),
          targetCompetencies: competencies,
          strategyType: editForm.strategyType,
          duration: editForm.duration.trim(),
          strategyDescription: editForm.strategyDescription.trim(),
          studentsReached: editForm.studentsReached,
          className: editForm.className.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error || `Server error ${res.status}`); return;
      }
      setEditingBp(null);
      await loadBestPractices();
    } catch (e: any) {
      setFormError(e.message || 'Network error. Please try again.');
    } finally {
      setSaving(false); savingRef.current = false;
    }
  };

  // ── Submit: Use ────────────────────────────────────────────────────────
  const handleUse = async () => {
    if (!usingBp || savingRef.current) return;
    if (additionalStudents === '' || !Number.isInteger(additionalStudents) || additionalStudents < 1) {
      setFormError('Please enter at least 1 student.'); return;
    }

    setSaving(true); savingRef.current = true; setFormError(null);
    try {
      const res = await apiFetch(`/api/best-practices/${usingBp.id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalStudents }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error || `Server error ${res.status}`); return;
      }
      setUsingBp(null);
      await loadBestPractices();
    } catch (e: any) {
      setFormError(e.message || 'Network error. Please try again.');
    } finally {
      setSaving(false); savingRef.current = false;
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────
  if (panelState === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (panelState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
        <button
          onClick={loadBestPractices}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-indigo-500" />
            Best Practices Repository
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Discover proven remediation strategies and adopt them for your students.
          </p>
        </div>
        <button
          id="bp-add-btn"
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Best Practice
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          id="bp-search"
          placeholder="Search strategies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
        />
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-4">
        Search by keyword, topic, or teacher name.
      </p>

      {/* ── Repository section ── */}
      <section>
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
          Repository
          <span className="ml-2 text-xs font-normal normal-case text-slate-400 dark:text-slate-500">
            (up to 5 strategies from other teachers)
          </span>
        </h2>
        {repositoryList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <BookOpen className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {search.trim()
                ? 'No strategies match your search.'
                : 'No strategies from other teachers yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {repositoryList.map((bp) => (
              <BestPracticeCard
                key={bp.id}
                bp={bp}
                isOwner={false}
                onUse={() => openUse(bp)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── My Interventions section ── */}
      <section>
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
          My Interventions
          <span className="ml-2 text-xs font-normal normal-case text-slate-400 dark:text-slate-500">
            (your own Best Practices)
          </span>
        </h2>
        {myList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <Award className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {search.trim()
                ? 'No strategies match your search.'
                : "You haven't added any Best Practices yet."}
            </p>
            {!search.trim() && (
              <button
                onClick={openAdd}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Add your first strategy →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myList.map((bp) => (
              <BestPracticeCard
                key={bp.id}
                bp={bp}
                isOwner={true}
                onUpdate={() => openEdit(bp)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Add Modal ── */}
      {showAdd && (
        <ModalWrapper onClose={closeAll}>
          <StrategyForm
            title="Add Best Practice / Strategy"
            form={addForm}
            onChange={setAddForm}
            onSubmit={handleAdd}
            onCancel={closeAll}
            saving={saving}
            formError={formError}
            submitLabel="Add Strategy"
          />
        </ModalWrapper>
      )}

      {/* ── Update Modal ── */}
      {editingBp && (
        <ModalWrapper onClose={closeAll}>
          <StrategyForm
            title="Update Best Practice"
            form={editForm}
            onChange={setEditForm}
            onSubmit={handleUpdate}
            onCancel={closeAll}
            saving={saving}
            formError={formError}
            submitLabel="Update Strategy"
          />
        </ModalWrapper>
      )}

      {/* ── Use Modal ── */}
      {usingBp && (
        <ModalWrapper onClose={closeAll}>
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Use this approach</h2>
              <button onClick={closeAll} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                {usingBp.strategyName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">by {usingBp.creatorName}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Add your students <span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                This will add your students to the total reached by this strategy.
                The number you enter is <strong>additional</strong> — it is added to the existing count.
              </p>
              <Stepper
                value={additionalStudents}
                onChange={setAdditionalStudents}
                min={1}
                disabled={saving}
              />
            </div>

            <FormError message={formError} />

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={closeAll}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="bp-use-submit"
                type="button"
                onClick={handleUse}
                disabled={saving || typeof additionalStudents !== 'number' || additionalStudents < 1}
                className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : 'Use Strategy'}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
};
