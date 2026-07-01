import type { EvalCase } from '@skillspell/shared';
import { formatDateTime } from '../../utils/formatDate.js';

interface EvalCaseListProps {
  evalCases: EvalCase[];
  loading: boolean;
  onEdit: (evalCase: EvalCase) => void;
  onDelete: (evalCase: EvalCase) => void;
  onAdd: () => void;
}

/**
 * Displays a list of eval (test) cases for a skill with edit and delete actions.
 * When no cases exist, shows an empty-state prompt encouraging the user to add one.
 */
export function EvalCaseList({
  evalCases,
  loading,
  onEdit,
  onDelete,
  onAdd,
}: EvalCaseListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (evalCases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg
          className="h-12 w-12 text-slate-300 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.13c-1.687.282-3.41.395-5.13.334l-.213-.01a8.86 8.86 0 0 1-2.89-.614L5 18.5"
          />
        </svg>
        <p className="text-sm text-slate-500 mb-3">
          No test cases yet. Add your first test case to evaluate this skill.
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Test Case
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {evalCases.map((evalCase) => (
        <EvalCaseRow
          key={evalCase.id}
          evalCase={evalCase}
          onEdit={() => onEdit(evalCase)}
          onDelete={() => onDelete(evalCase)}
        />
      ))}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function EvalCaseRow({
  evalCase,
  onEdit,
  onDelete,
}: {
  evalCase: EvalCase;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium text-slate-800 truncate">
            {evalCase.name}
          </h4>
          {evalCase.createdAtVersion && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-500">
              v{evalCase.createdAtVersion}
            </span>
          )}
          {evalCase.assertions.length > 0 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {evalCase.assertions.length} assertion{evalCase.assertions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate mb-1">
          {evalCase.prompt}
        </p>
        {evalCase.expectedOutput && (
          <p className="text-xs text-slate-400 truncate">
            Expected: {evalCase.expectedOutput}
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">
          Created {formatDateTime(evalCase.createdAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          aria-label={`Edit ${evalCase.name}`}
          title="Edit test case"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
            />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label={`Delete ${evalCase.name}`}
          title="Delete test case"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
