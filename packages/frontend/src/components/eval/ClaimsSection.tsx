import { useState } from 'react';
import type { ExtractedClaim } from '@skillspell/shared';
import { InfoTip } from '../common/InfoTip.js';

interface ClaimsSectionProps {
  claims: ExtractedClaim[];
}

/**
 * Collapsible section displaying auto-discovered claims from the grader.
 * Claims are verifiable statements the AI made in its output that were
 * automatically checked — catching issues beyond user-defined assertions.
 *
 * - Expanded by default when any claim is unverified (❌)
 * - Collapsed by default when all claims are verified (✅)
 */
export function ClaimsSection({ claims }: ClaimsSectionProps) {
  const unverifiedCount = claims.filter((c) => !c.verified).length;
  const allVerified = unverifiedCount === 0;
  const [isExpanded, setIsExpanded] = useState(!allVerified);

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        allVerified
          ? 'border-slate-200 bg-slate-50/50'
          : 'border-sky-200/60 bg-sky-50/50'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-3 text-left transition-all duration-200 ${
          allVerified ? 'hover:bg-slate-50' : 'hover:bg-sky-50'
        }`}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          {/* Search/magnifying glass icon */}
          <svg
            className={`h-4 w-4 ${allVerified ? 'text-slate-400' : 'text-sky-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <span
            className={`text-xs font-bold uppercase tracking-wide ${
              allVerified ? 'text-slate-500' : 'text-sky-700'
            }`}
          >
            Auto-Discovered Claims
          </span>
          <InfoTip
            text="The grader automatically checks verifiable statements the AI makes in its output — like counts, completeness claims, or process descriptions. These catch issues your assertions don't cover."
            size="h-3 w-3"
          />
          {/* Count badge */}
          {unverifiedCount > 0 ? (
            <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
              {unverifiedCount} issue{unverifiedCount !== 1 ? 's' : ''} found
            </span>
          ) : (
            <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
              all verified ✓
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${
            allVerified ? 'text-slate-400' : 'text-sky-400'
          } ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-3 border-t border-slate-200/60 space-y-2">
          {/* Explanation text */}
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
            These are statements the AI made in its output that were
            automatically checked for accuracy. Unverified claims (❌) suggest
            areas where you might want to add assertions.
          </p>

          {/* Claim cards — unverified first */}
          {[...claims]
            .sort((a, b) => Number(a.verified) - Number(b.verified))
            .map((claim, index) => (
              <ClaimCard key={index} claim={claim} />
            ))}
        </div>
      )}
    </div>
  );
}

/* ─── ClaimCard sub-component ────────────────────────────────────────── */

const TYPE_LABELS: Record<ExtractedClaim['type'], string> = {
  factual: 'Factual',
  process: 'Process',
  quality: 'Quality',
};

const TYPE_COLORS: Record<ExtractedClaim['type'], string> = {
  factual: 'bg-violet-100 text-violet-600',
  process: 'bg-blue-100 text-blue-600',
  quality: 'bg-amber-100 text-amber-600',
};

const TYPE_TOOLTIPS: Record<ExtractedClaim['type'], string> = {
  factual:
    'A specific number, name, or measurement stated in the output — verified by checking the actual content',
  process:
    'A statement about the steps or order of operations — verified against the output structure',
  quality:
    'A completeness or correctness claim — verified against the skill requirements',
};

function ClaimCard({ claim }: { claim: ExtractedClaim }) {
  const [isExpanded, setIsExpanded] = useState(!claim.verified);

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
        claim.verified
          ? 'border-slate-200'
          : 'border-red-200/60 border-l-2 border-l-red-400'
      }`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 text-left transition-all duration-200"
        aria-expanded={isExpanded}
        aria-label={`Claim: ${claim.claim} — ${claim.verified ? 'verified' : 'unverified'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Verified/unverified icon */}
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              claim.verified
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600'
            }`}
            aria-hidden="true"
          >
            {claim.verified ? (
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={3}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            ) : (
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={3}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            )}
          </span>

          {/* Type badge */}
          <span className="inline-flex items-center gap-1">
            <span
              className={`font-mono text-[10px] rounded-md px-1.5 py-0.5 ${TYPE_COLORS[claim.type]}`}
            >
              {TYPE_LABELS[claim.type]}
            </span>
            <InfoTip text={TYPE_TOOLTIPS[claim.type]} size="h-3 w-3" />
          </span>

          {/* Claim text */}
          <span className="text-sm text-slate-700 truncate">
            {claim.claim}
          </span>
        </div>

        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-3 bg-slate-50/50 border-t border-slate-200/60 text-sm space-y-2">
          {/* Full claim text */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Claim</span>
            <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{claim.claim}</p>
          </div>

          {/* Evidence */}
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Evidence
              </span>
              <InfoTip
                text="The grader's reasoning for why this claim is verified or unverified"
                size="h-3 w-3"
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
              {claim.evidence}
            </p>
          </div>

          {/* Confidence bar */}
          {claim.confidence !== undefined && (
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Confidence
              </span>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      claim.verified ? 'bg-emerald-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${claim.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600">
                  {(claim.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* Actionable tip for unverified claims */}
          {!claim.verified && (
            <div className="flex items-start gap-2 mt-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200/40">
              <span className="text-amber-500 shrink-0 mt-0.5">💡</span>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {claim.type === 'factual' &&
                  'Tip: Add a "contains" or "regex" assertion to enforce the correct value.'}
                {claim.type === 'quality' &&
                  'Tip: Add a "semantic" assertion to check for completeness against the skill requirements.'}
                {claim.type === 'process' &&
                  'Tip: Add a "custom" assertion to verify the correct sequence of steps.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
