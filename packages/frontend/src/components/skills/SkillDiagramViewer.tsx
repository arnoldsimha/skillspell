import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
// Primary XSS defense is mermaid's own `securityLevel: 'strict'` (see
// mermaid.initialize below): it sanitizes node-label *text* during rendering
// while preserving the <foreignObject>/<div> structure that holds the label,
// so box content still shows. (Running DOMPurify over the finished SVG cannot
// be used here — it strips <div> inside <foreignObject> as a namespace-confusion
// mXSS defense and blanks mermaid v11 labels.)
//
// This regex pass is defense-in-depth only: it removes <script> blocks and
// inline event handlers, neither of which mermaid legitimately emits, so it can
// never erase legitimate label content. The event-handler match tolerates any
// non-name separator before `on…` (e.g. `<img src=x/onerror=…>`, not just a
// space) and also neutralizes javascript:/data: URLs in href/src/xlink:href.
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/[^a-zA-Z0-9]on[a-z][\w-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ')
    .replace(/((?:href|src|xlink:href)\s*=\s*["']?)\s*(?:javascript|data)\s*:/gi, '$1');
}
import type { SkillDiagram } from '@skillspell/shared';
import { generateDiagram } from '../../services/api/index.js';
import { useToast } from '../common/ToastContext.js';

interface SkillDiagramViewerProps {
  skillId: string;
  version?: number;
  onBack?: () => void;
  /** Override the default ownership-gated diagram endpoint. Used by shared-skill view. */
  generateFn?: (skillId: string, force: boolean, version?: number) => Promise<import('@skillspell/shared').SkillDiagram>;
  /** When true, shows the Regenerate button in the header. */
  isOwner?: boolean;
}

// Initialize mermaid with a clean config
// securityLevel: 'strict' — mermaid sanitizes label text (its bundled DOMPurify)
// while keeping htmlLabels rendering intact, so box content still displays but
// injected HTML/JS in a label is encoded to inert text. Do NOT set htmlLabels
// to false: that changes the label render mechanism and breaks box layout.
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
  },
});

export default function SkillDiagramViewer({ skillId, version, generateFn, isOwner }: SkillDiagramViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagram, setDiagram] = useState<SkillDiagram | null>(null);
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const hasAutoRetried = useRef(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  // Track whether the current effect is still valid (prevents stale responses
  // from a previous skillId overwriting the current diagram state).
  const cancelledRef = useRef(false);

  const loadDiagram = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setRenderError(null);
    setRenderedSvg(null);
    hasAutoRetried.current = false;

    try {
      const result = await (generateFn ?? generateDiagram)(skillId, force, version);
      if (!cancelledRef.current) {
        setDiagram(result);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to generate diagram');
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [skillId, version, generateFn]);

  // Load diagram on mount or when skillId changes
  useEffect(() => {
    cancelledRef.current = false;
    void loadDiagram();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadDiagram]);

  // Render mermaid when diagram data changes — auto-retry once on failure
  useEffect(() => {
    if (!diagram?.mermaid) return;

    const renderMermaid = async () => {
      const id = `mermaid-${Date.now()}`;
      try {
        const { svg } = await mermaid.render(id, diagram.mermaid);
        setRenderedSvg(sanitizeSvg(svg));
        setRenderError(null);
        hasAutoRetried.current = false; // reset for next version
      } catch (err) {
        console.error('[diagram] mermaid.render threw:', err);
        // Mermaid inserts an error element into document.body on failure — clean it up
        // so "Syntax error in text" doesn't appear at the bottom of the page.
        const errEl = document.getElementById(id);
        errEl?.closest('.mermaid-error')?.remove();
        errEl?.remove();
        // Also remove any stray mermaid error containers
        document.querySelectorAll('[id^="d"] .error-icon').forEach((el) => {
          el.closest('svg')?.parentElement?.remove();
        });

        setRenderedSvg(null);

        // Auto-retry once: force-regenerate from the LLM (bypasses cache)
        if (!hasAutoRetried.current) {
          hasAutoRetried.current = true;
          void loadDiagram(true);
          return;
        }

        // Second attempt also failed — show the error + manual button
        setRenderError(
          err instanceof Error ? err.message : 'Failed to render Mermaid diagram',
        );
      }
    };

    void renderMermaid();
  }, [diagram?.mermaid, loadDiagram]);

  const handleCopy = async () => {
    if (!diagram?.mermaid) return;
    try {
      await navigator.clipboard.writeText(diagram.mermaid);
      setCopied(true);
      addToast('success', 'Mermaid code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('error', 'Failed to copy to clipboard');
    }
  };

  // Close fullscreen on Escape; zoom with +/- keys
  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFullscreen(false); setZoom(1); setPan({ x: 0, y: 0 }); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom((z) => Math.min(4, z + 0.25)); }
      if (e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.25, z - 0.25)); }
      if (e.key === '0') { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  // Mouse wheel zoom in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const viewport = fullscreenViewportRef.current;
    if (!viewport) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.25, z + delta)));
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [fullscreen]);

  // Mouse drag panning in fullscreen
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    e.preventDefault(); // prevent text selection
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <DiagramHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-teal-500/10 blur-xl animate-pulse" />
            <div className="relative h-12 w-12 animate-spin-ease rounded-full border-[3px] border-teal-200 border-t-teal-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Generating Diagram…</h3>
          <p className="text-sm text-slate-500 text-center max-w-sm leading-relaxed">
            Analyzing the skill's workflow and building a visual flowchart.
          </p>
        </div>
      </div>
    );
  }

  // Error state (generation failed)
  if (error) {
    return (
      <div className="flex h-full flex-col">
        <DiagramHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Failed to Generate Diagram</h3>
          <p className="text-sm text-slate-500 text-center max-w-md">{error}</p>
          <button
            onClick={() => void loadDiagram()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 hover:shadow-xl hover:brightness-110 transition-all duration-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render error with no diagram fallback — both auto-retries failed and diagram cleared
  if (renderError && !diagram) {
    return (
      <div className="flex h-full flex-col">
        <DiagramHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
            <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Could Not Render Diagram</h3>
          <p className="text-sm text-slate-500 text-center max-w-md">{renderError}</p>
          <button
            onClick={() => void loadDiagram(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 hover:shadow-xl hover:brightness-110 transition-all duration-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Regenerate
          </button>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="flex h-full flex-col">
      <DiagramHeader
        onCopy={diagram?.mermaid ? () => void handleCopy() : undefined}
        copied={copied}
        onFullscreen={renderedSvg ? () => setFullscreen(true) : undefined}
        onRegenerate={isOwner ? () => void loadDiagram(true) : undefined}
      />

      {/* Fullscreen overlay */}
      {fullscreen && renderedSvg && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white animate-backdrop">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800">Skill Diagram</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Zoom out"
                  disabled={zoom <= 0.25}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  </svg>
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="flex h-7 min-w-[3rem] items-center justify-center rounded-lg px-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Zoom in"
                  disabled={zoom >= 4}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <button
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Reset view"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => { setFullscreen(false); setZoom(1); setPan({ x: 0, y: 0 }); }}
                className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                Exit
              </button>
            </div>
          </div>
          <div
            ref={fullscreenViewportRef}
            className="flex-1 overflow-hidden relative select-none"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: dragging ? 'none' : 'transform 200ms ease',
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: renderedSvg }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Diagram or fallback */}
        <div className="p-6">
          {renderedSvg ? (
            <div
              ref={containerRef}
              className="flex justify-center overflow-auto rounded-xl border border-slate-200/60 bg-white p-6"
              dangerouslySetInnerHTML={{ __html: renderedSvg }}
            />
          ) : renderError ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                  </svg>
                  <p className="text-sm text-amber-800">
                    Diagram generated but could not be rendered. Showing raw Mermaid code below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDiagram(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shrink-0"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                  </svg>
                  Regenerate
                </button>
              </div>
              <pre className="overflow-auto rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-slate-100 leading-relaxed">
                <code>{diagram?.mermaid}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Header Sub-component ───────────────────────────────────────────── */

function DiagramHeader({
  onCopy,
  copied,
  onFullscreen,
  onRegenerate,
}: {
  onCopy?: () => void;
  copied?: boolean;
  onFullscreen?: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Skill Diagram</h3>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
            title="Regenerate diagram from latest skill content"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Regenerate
          </button>
        )}
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
            title="View in fullscreen"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Fullscreen
          </button>
        )}
        {onCopy && (
          <button
            onClick={onCopy}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
              copied
                ? 'bg-emerald-50 border border-emerald-200/60 text-emerald-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {copied ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                Copy Mermaid
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
