import type { SubmissionRequirement } from '@skillspell/shared';

interface Props {
  requirements: SubmissionRequirement[];
  note?: string; // optional footnote, e.g. "Requirements checked at time of submission."
}

export default function SubmissionRequirementsChecklist({ requirements, note }: Props) {
  if (requirements.length === 0) return null;

  return (
    <div className="submission-requirements rounded-lg border border-slate-200 bg-white p-4">
      <p className="submission-requirements__heading mb-3 font-semibold text-slate-900">
        Submission Requirements
      </p>
      <ul className="submission-requirements__list space-y-2">
        {requirements.map((req) => (
          <li
            key={req.id}
            className={`submission-requirements__item flex items-start gap-3 rounded px-2 py-1 ${
              req.met ? 'submission-requirements__item--met bg-green-50' : 'submission-requirements__item--unmet bg-red-50'
            }`}
          >
            <span
              className={`submission-requirements__icon mt-0.5 font-bold ${
                req.met ? 'text-green-600' : 'text-red-600'
              }`}
              aria-hidden="true"
            >
              {req.met ? '✓' : '!'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="submission-requirements__label block text-sm text-slate-800">
                {req.label}
              </span>
              {!req.met && req.hint && (
                <span className="submission-requirements__hint block text-xs text-slate-600 mt-1">
                  {req.hint}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="submission-requirements__note mt-3 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
