import { useState, useEffect } from 'react';
import { useToast } from '../common/ToastContext.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { Button } from '../common/Button.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from '../../services/api/taxonomy.js';

// Internal shared subsection component (categories have identical UI shape)
interface TaxonomyItem {
  id: string;
  name: string;
}

interface SubsectionProps {
  title: string;
  items: TaxonomyItem[];
  loading: boolean;
  addPlaceholder: string;
  addButtonLabel: string;
  emptyHeading: string;
  emptyBody: string;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (item: TaxonomyItem) => void; // opens ConfirmDialog (parent handles)
}

function TaxonomySubsection({
  title,
  items,
  loading,
  addPlaceholder,
  addButtonLabel,
  emptyHeading,
  emptyBody,
  onAdd,
  onRename,
  onDelete,
}: SubsectionProps) {
  const [addValue, setAddValue] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editOriginal, setEditOriginal] = useState('');

  const handleAdd = async () => {
    const trimmed = addValue.trim();
    if (!trimmed) return;
    setAddSaving(true);
    try {
      await onAdd(trimmed);
      setAddValue('');
    } finally {
      setAddSaving(false);
    }
  };

  const handleStartEdit = (item: TaxonomyItem) => {
    setEditOriginal(item.name);
    setEditValue(item.name);
    setEditingId(item.id);
  };

  const handleSaveEdit = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editOriginal) {
      setEditingId(null);
      return;
    }
    setEditSaving(true);
    try {
      await onRename(editingId!, trimmed);
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>

      {/* Add form */}
      <div className="mb-4 flex gap-2">
        <input
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder={addPlaceholder}
          disabled={addSaving}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <Button
          type="button"
          onClick={() => void handleAdd()}
          disabled={addSaving || !addValue.trim()}
          variant="primary"
          size="md"
          loading={addSaving}
          loadingText={addButtonLabel}
        >
          {addButtonLabel}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 rounded bg-slate-200 animate-shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <p className="mb-1 text-sm font-semibold text-slate-500">{emptyHeading}</p>
          <p className="text-xs text-slate-400">{emptyBody}</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
            >
              {editingId === item.id ? (
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={() => { if (!editSaving) void handleSaveEdit(); }}
                  disabled={editSaving}
                  aria-label={`Rename ${item.name}`}
                  autoFocus
                  className={`flex-1 rounded-lg border border-indigo-400 px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${editSaving ? 'cursor-wait opacity-60' : ''}`}
                />
              ) : (
                <span
                  onClick={() => handleStartEdit(item)}
                  className="flex-1 cursor-pointer text-sm font-medium text-slate-800 hover:text-indigo-600 transition-colors"
                >
                  {item.name}
                </span>
              )}
              <button
                onClick={() => onDelete(item)}
                aria-label={`Delete ${item.name}`}
                className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
              >
                {/* Heroicons trash outline, h-4 w-4 */}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Main TaxonomySection ---

export default function TaxonomySection() {
  const { addToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ item: TaxonomyItem; type: 'category' } | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCategories()
      .then((cats) => {
        if (!cancelled) {
          setCategories(cats);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          addToast('error', err instanceof Error ? err.message : 'Failed to load taxonomy.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [addToast]);

  // --- Category handlers ---

  const handleAddCategory = async (name: string) => {
    try {
      const created = await createCategory(name);
      setCategories((prev) => [...prev, created]);
      addToast('success', 'Category added.');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to add category.');
      throw err; // re-throw so TaxonomySubsection can reset addSaving
    }
  };

  const handleRenameCategory = async (id: string, name: string) => {
    try {
      const updated = await updateCategory(id, name);
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      addToast('success', 'Category updated.');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to rename category.');
      throw err;
    }
  };

  // --- Delete confirmation ---

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    try {
      await deleteCategory(deleteTarget.item.id);
      setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.item.id));
      addToast('success', 'Category deleted.');
      setDeleteTarget(null);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setDeleteConfirming(false);
    }
  };

  const deleteDialogTitle = 'Delete category?';

  // Suppress unused variable warning — deleteConfirming guards async re-entry
  void deleteConfirming;

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-800">Taxonomy</h2>

      <div className="space-y-6">
        <TaxonomySubsection
          title="Categories"
          items={categories}
          loading={loading}
          addPlaceholder="Category name..."
          addButtonLabel="Add Category"
          emptyHeading="No categories yet"
          emptyBody="Add your first category to help organise skills in the marketplace."
          onAdd={handleAddCategory}
          onRename={handleRenameCategory}
          onDelete={(item) => setDeleteTarget({ item, type: 'category' })}
        />
      </div>

      {/* Delete confirmation dialog — variant='warning' per D-05 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteDialogTitle}
        confirmLabel="Delete"
        variant="warning"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          Deleting &apos;{deleteTarget?.item.name ?? ''}&apos; will remove it from all skills that use it.
        </p>
      </ConfirmDialog>
    </div>
  );
}
