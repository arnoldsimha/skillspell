import { useEffect, useState } from 'react';
import type { Organization } from '@skillspell/shared';
import { updateOrganization } from '../../services/api/organization.js';
import { Button } from '../common/Button.js';

interface Props {
  org: Organization;
  onOrgUpdate: (updated: Organization) => void;
}

export function MarketplaceSettingsSection({ org, onOrgUpdate }: Props) {
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(
    org.marketplaceEnabled,
  );
  const [allowSelfApproval, setAllowSelfApproval] = useState(
    org.marketplaceAllowSelfApproval,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setMarketplaceEnabled(org.marketplaceEnabled);
    setAllowSelfApproval(org.marketplaceAllowSelfApproval);
  }, [org.marketplaceEnabled, org.marketplaceAllowSelfApproval]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await updateOrganization({
        marketplaceEnabled,
        marketplaceAllowSelfApproval: allowSelfApproval,
      });
      onOrgUpdate(updated);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Marketplace Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure marketplace-wide behaviour for this organisation.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Enable/Disable
        </h3>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={marketplaceEnabled}
            onChange={(e) => setMarketplaceEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">
              Enable marketplace
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              When disabled, all marketplace features (browsing, submissions, approvals) are hidden from users and API endpoints return 403 Forbidden.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Submission Approvals
        </h3>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowSelfApproval}
            onChange={(e) => setAllowSelfApproval(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">
              Allow admins to approve or reject their own skill submissions
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              By default, admins cannot approve or reject submissions they submitted
              themselves. Enable this to remove that restriction.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        {saveError && (
          <p className="text-xs text-red-600">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="text-xs text-green-600">Settings saved.</p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            size="md"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
