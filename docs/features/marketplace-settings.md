# Marketplace Settings

## Overview

The marketplace feature can be completely enabled or disabled at the organization level through admin settings. When disabled:

- All marketplace UI routes are hidden and redirect to `/skills` (or another non-marketplace page)
- All marketplace API endpoints return `403 Forbidden`
- Admin review and skill submission features are inaccessible
- Users cannot browse, search, or favorite public skills
- Sidebar navigation hides marketplace links

This allows organizations to completely restrict marketplace access without removing the code, providing flexibility for different organizational policies.

---

## Configuration

### Enabling/Disabling the Marketplace

#### Steps
1. **Log in as organization admin**
2. Click on your profile/avatar in the top right
3. Select **"Admin Settings"**
4. Click **"Marketplace Settings"** in the sidebar
5. Toggle the **"Enable marketplace"** checkbox:
   - **Checked (default):** Marketplace is available to all users
   - **Unchecked:** Marketplace is completely disabled
6. Click **"Save Settings"**
7. Verify the success toast appears: "Settings saved successfully"

#### Effect
The change applies **immediately**:
- If disabled: all users are redirected away from marketplace routes, and API calls return 403
- If enabled: all marketplace features become available again

The setting persists across user sessions and browser refreshes.

### Submission Approval Settings

When the marketplace is **enabled**, admins can optionally allow themselves to approve/reject their own skill submissions.

#### Steps
1. In **Marketplace Settings**, toggle **"Allow admins to approve or reject their own skill submissions"**
2. Click **"Save Settings"**

By default, admins cannot approve their own submissions (conflict of interest). This setting only appears and functions when marketplace is enabled.

---

## User Experience

### When Marketplace is Enabled (Default)

**Sidebar Navigation:**
- "Marketplace" link visible and clickable
- "My Submissions" visible under "My Skills" submenu

**Routes Available:**
- `/` — Marketplace homepage with featured skills
- `/browse` — Browse and search all public skills  
- `/favorites` — View saved favorite skills
- `/marketplace/my-submissions` — View and manage submitted skills

**API Access:**
- All marketplace endpoints (`/api/marketplace/*`, `/api/admin/marketplace/*`) return data normally

### When Marketplace is Disabled

**Sidebar Navigation:**
- "Marketplace" link is **hidden**
- "My Submissions" is **hidden** under "My Skills" submenu

**Routes:**
- `/` → redirects to `/skills`
- `/browse` → redirects to `/skills`
- `/favorites` → redirects to `/skills`
- `/marketplace/my-submissions` → redirects to `/skills`

**API Access:**
```bash
GET /api/marketplace
# Returns: 403 Forbidden
# Response body:
{
  "statusCode": 403,
  "message": "Marketplace is disabled for this organization",
  "error": "Forbidden"
}
```

All marketplace endpoints under `/api/marketplace/*` and `/api/admin/marketplace/*` follow the same behavior.

---

## Implementation Details

### Database Schema

```sql
-- Table: organizations
ALTER TABLE organizations ADD COLUMN marketplaceEnabled BOOLEAN NOT NULL DEFAULT true;
```

**Field:** `marketplaceEnabled: boolean`
- **Type:** Boolean
- **Default:** `true` (enables marketplace for new organizations)
- **Persisted:** Yes, in PostgreSQL `organizations` table

### Backend Architecture

#### MarketplaceGuard

**File:** `packages/backend/src/marketplace/marketplace.guard.ts`

Guard that checks if the marketplace is enabled for the current organization:

```typescript
@Injectable()
export class MarketplaceGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const org = this.cls.get('org');
    
    if (org && org.marketplaceEnabled === false) {
      throw new ForbiddenException('Marketplace is disabled for this organization');
    }

    return true;
  }
}
```

**Applied to:**
- `MarketplaceController` — all skill browsing, searching, and favoriting endpoints
- `AdminMarketplaceController` — all admin endpoints for approvals and submissions management

**Behavior:**
- If `org` is in request context AND `marketplaceEnabled === false` → throws 403 Forbidden
- If `org` is not in context (fallback/unauthenticated) → allows request
- If `marketplaceEnabled === true` (or undefined) → allows request

#### Request Context Population

**File:** `packages/backend/src/auth/guards/setup.guard.ts` (or relevant auth flow)

After JWT authentication, the organization is fetched and stored in NestJS request context (CLS):

```typescript
const org = await organizationService.getOrganizationByUserId(request.user.id);
if (org) {
  cls.set('org', org);  // Available to guards, services, and controllers
}
```

This allows the guard to access `org.marketplaceEnabled` efficiently without additional database queries.

### Frontend Architecture

#### MarketplaceRouteGuard Component

**File:** `packages/frontend/src/components/auth/MarketplaceRouteGuard.tsx`

React component that redirects users away from marketplace routes if disabled:

```typescript
export default function MarketplaceRouteGuard({ children }: Props) {
  const { user } = useAuth();
  const marketplaceEnabled = user?.organization?.marketplaceEnabled ?? true;

  if (!marketplaceEnabled) {
    return <Navigate to="/skills" replace />;
  }

  return children as React.ReactElement;
}
```

**Applied to routes:**
- Index (`/`)
- `/browse`
- `/browse/:skillId`
- `/favorites`
- `/marketplace/my-submissions`

#### Sidebar Conditional Rendering

**File:** `packages/frontend/src/components/layout/Sidebar.tsx`

The sidebar conditionally renders marketplace navigation:

```typescript
const marketplaceEnabled = user?.organization?.marketplaceEnabled ?? true;

// In JSX:
{marketplaceEnabled && (
  <button onClick={() => navigate('/')}>
    Marketplace
  </button>
)}

{marketplaceEnabled && (
  <button onClick={() => navigate('/marketplace/my-submissions')}>
    My Submissions
  </button>
)}
```

#### Settings Component

**File:** `packages/frontend/src/components/admin/MarketplaceSettingsSection.tsx`

Admin settings component with toggle and save functionality:

```typescript
const [marketplaceEnabled, setMarketplaceEnabled] = useState(
  org.marketplaceEnabled
);

const handleSave = async () => {
  const updated = await updateOrganization({
    marketplaceEnabled,
    // ... other fields
  });
  // Show success toast
};
```

### Type Definitions

**File:** `packages/shared/types/user.ts`

```typescript
export interface Organization {
  id: string;
  name: string;
  passwordLoginEnabled: boolean;
  ssoLoginEnabled: boolean;
  defaultTimezone?: string;
  activeSsoProtocol?: 'saml' | 'oidc' | null;
  marketplaceAllowSelfApproval: boolean;
  /** Whether the marketplace is enabled for this organization. Default: true. */
  marketplaceEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## API Reference

### Get Organization (includes marketplace setting)

```bash
GET /api/organization
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "org-123",
  "name": "Acme Corp",
  "passwordLoginEnabled": true,
  "ssoLoginEnabled": false,
  "marketplaceAllowSelfApproval": false,
  "marketplaceEnabled": true,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-06-18T12:00:00Z"
}
```

### Update Organization (set marketplace setting)

```bash
PUT /api/organization
Authorization: Bearer {token}
Content-Type: application/json

{
  "marketplaceEnabled": false
}
```

**Response:**
```json
{
  "id": "org-123",
  "name": "Acme Corp",
  "passwordLoginEnabled": true,
  "ssoLoginEnabled": false,
  "marketplaceAllowSelfApproval": false,
  "marketplaceEnabled": false,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-06-18T12:05:00Z"
}
```

### Marketplace Endpoints (when disabled)

All marketplace endpoints return 403 Forbidden:

```bash
GET /api/marketplace
Authorization: Bearer {token}

# Response:
{
  "statusCode": 403,
  "message": "Marketplace is disabled for this organization",
  "error": "Forbidden"
}
```

**Affected endpoints:**
- `GET /api/marketplace`
- `GET /api/marketplace/featured`
- `GET /api/marketplace/search`
- `POST /api/marketplace/submit`
- `GET /api/admin/marketplace/pending`
- `POST /api/admin/marketplace/approve/{id}`
- `POST /api/admin/marketplace/reject/{id}`
- All other marketplace endpoints

---

## Testing

### Manual Testing

See [docs/test-plans/marketplace-toggle-manual.md](../test-plans/marketplace-toggle-manual.md) for comprehensive manual test scenarios:
- Test Scenario 1: Marketplace Enabled (Default)
- Test Scenario 2: Disable Marketplace
- Test Scenario 3: Backend API Gating
- Test Scenario 4: Re-enable Marketplace

### Automated Testing

**Unit Tests:**
```bash
cd packages/backend
npm test -- marketplace.guard.spec.ts
```

**Integration Tests:**
```bash
cd packages/backend
npm test -- marketplace-disabled.integration.spec.ts
```

**Frontend Build:**
```bash
cd packages/frontend
npm run build
```

---

## Migration and Backward Compatibility

### For Existing Organizations

When the feature is deployed:
- `marketplaceEnabled` defaults to `true` for all existing organizations
- No action required; marketplace remains accessible
- Admins can opt-in to disabling it in settings

### No Breaking Changes

- Existing marketplace API clients continue to work
- Frontend routes don't change (just conditionally render or redirect)
- Database migration is additive (only adds a column, doesn't remove or rename)

---

## Troubleshooting

### The marketplace is still accessible after disabling

1. **Frontend not updated:**
   - Run `npm run build` in `packages/frontend`
   - Clear browser cache (Cmd+Shift+Delete on macOS)
   - Reload the page

2. **Auth context not updated:**
   - Verify organization was saved correctly in database
   - Log out and log back in
   - Check browser DevTools Network tab for auth context response

3. **Route guard not applied:**
   - Verify `MarketplaceRouteGuard` wraps all marketplace routes
   - Check `packages/frontend/src/router.tsx` for conditional rendering

### API endpoints still return 200 when should be 403

1. **Guard not applied to controller:**
   - Verify `@UseGuards(MarketplaceGuard)` is on both:
     - `MarketplaceController`
     - `AdminMarketplaceController`

2. **Org not in request context:**
   - Verify SetupGuard or auth flow populates org into CLS
   - Check backend logs for any CLS-related errors

3. **ClsService not injected properly:**
   - Verify `ClsModule` is imported in the module
   - Check that `ClsService` is provided in the test mocks

### Settings save fails

1. **Backend endpoint not working:**
   - Verify `PUT /api/organization` endpoint is accessible
   - Check backend logs for 500 errors
   - Verify `UpdateOrganizationDto` includes `marketplaceEnabled` field

2. **Permission issue:**
   - Verify logged-in user is organization admin
   - Check that organization update permissions are correct

3. **Network error:**
   - Check browser console for CORS or network errors
   - Verify backend is running and accessible

---

## Future Enhancements

Possible future improvements:

- **Marketplace sub-features:** Toggle specific marketplace features (browse, submit, admin approval) independently
- **Scheduled enable/disable:** Schedule marketplace to be disabled/enabled at specific times
- **Audit logging:** Track who disabled/enabled marketplace and when
- **User notifications:** Notify users when marketplace is disabled
- **Migration to marketplace:** Help organizations considering marketplace access with cost/benefit analysis
