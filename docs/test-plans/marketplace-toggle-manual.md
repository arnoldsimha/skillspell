# Manual Test Plan: Marketplace Enable/Disable

## Overview

This document provides step-by-step manual testing procedures for the marketplace enable/disable feature. The feature allows organization admins to completely enable or disable the marketplace at the organization level via the admin settings UI.

---

## Setup

### Prerequisites
- Local development environment running (backend + frontend)
- Database populated with organizations and users
- Admin user account for testing

### Steps
1. **Start the application**
   ```bash
   # Terminal 1: Backend
   cd packages/backend
   npm run dev
   
   # Terminal 2: Frontend  
   cd packages/frontend
   npm run dev
   ```

2. **Create test organization** (if needed)
   - Use the organization creation flow or database seeding
   - Create an admin user with email: `test-admin@example.com`

3. **Log in as admin**
   - Navigate to http://localhost:3000 (or configured frontend URL)
   - Sign in with admin credentials
   - Verify you see the admin settings option in the navigation

---

## Test Scenario 1: Marketplace Enabled (Default)

**Goal:** Verify all marketplace features are accessible when marketplace is enabled (default state).

### Steps

- [ ] **Step 1: Navigate to Admin Settings**
  - Click on your profile/avatar in the top right
  - Select "Admin Settings"
  - Verify the Admin Settings page loads

- [ ] **Step 2: Navigate to Marketplace Settings**
  - In the left sidebar, click "Marketplace Settings"
  - Verify "Marketplace Settings" page loads
  - Confirm the **"Enable marketplace"** checkbox is **CHECKED**

- [ ] **Step 3: Verify marketplace is visible in sidebar**
  - Look at the left navigation sidebar
  - Confirm you can see a **"Marketplace"** link/button
  - Confirm you can see **"My Submissions"** sub-menu option under My Skills

- [ ] **Step 4: Navigate to marketplace homepage**
  - Click on the "Marketplace" link in the sidebar
  - OR navigate directly to http://localhost:3000/
  - Verify the marketplace homepage loads with:
    - Featured skills section
    - Search bar
    - Browse/filter options
  - No redirect should occur

- [ ] **Step 5: Navigate to Browse**
  - Click "Browse" in the marketplace
  - OR navigate directly to http://localhost:3000/browse
  - Verify the browse page loads showing available public skills
  - No 404 or redirect should occur

- [ ] **Step 6: Navigate to Favorites**
  - Click "Favorites" in the marketplace
  - OR navigate directly to http://localhost:3000/favorites
  - Verify the favorites page loads (may be empty)
  - No 404 or redirect should occur

- [ ] **Step 7: Navigate to My Submissions**
  - In the sidebar, expand "My Skills"
  - Click "My Submissions"
  - OR navigate directly to http://localhost:3000/marketplace/my-submissions
  - Verify the submissions page loads
  - No 404 or redirect should occur

**Expected Result:** All marketplace routes are fully accessible and render correctly.

---

## Test Scenario 2: Disable Marketplace

**Goal:** Verify that disabling marketplace hides all UI and prevents access.

### Steps

- [ ] **Step 1: Access Marketplace Settings**
  - Ensure you're in Admin Settings → Marketplace Settings
  - Verify the **"Enable marketplace"** checkbox is currently **CHECKED**

- [ ] **Step 2: Disable the marketplace**
  - **UNCHECK** the "Enable marketplace" checkbox
  - Observe the checkbox state changes to unchecked
  - A help text should be visible: "When disabled, all marketplace features... are hidden..."

- [ ] **Step 3: Save settings**
  - Click the **"Save Settings"** button
  - Verify a **success toast** appears (e.g., "Settings saved successfully")
  - Wait for the toast to disappear

- [ ] **Step 4: Verify persistence on page refresh**
  - **Refresh the page** (Cmd+R or Ctrl+R)
  - The Admin Settings page should still load
  - Verify the **"Enable marketplace"** checkbox is still **UNCHECKED**

- [ ] **Step 5: Verify sidebar marketplace link is hidden**
  - Look at the left navigation sidebar
  - Confirm the **"Marketplace"** link is NO LONGER VISIBLE
  - Confirm the **"My Submissions"** sub-menu option is NO LONGER VISIBLE under My Skills
  - Other sidebar items (Skills, Learn, etc.) should still be visible

- [ ] **Step 6: Test direct navigation to home (marketplace)**
  - Navigate directly to http://localhost:3000/ in the address bar
  - Expected: Should be **redirected** to http://localhost:3000/skills (or another valid non-marketplace page)
  - The marketplace homepage should NOT load
  - Verify you see the skills/learning page instead

- [ ] **Step 7: Test direct navigation to /browse**
  - Navigate directly to http://localhost:3000/browse
  - Expected: Should be **redirected** to http://localhost:3000/skills
  - The browse page should NOT load

- [ ] **Step 8: Test direct navigation to /favorites**
  - Navigate directly to http://localhost:3000/favorites
  - Expected: Should be **redirected** to http://localhost:3000/skills
  - The favorites page should NOT load

- [ ] **Step 9: Test direct navigation to /marketplace/my-submissions**
  - Navigate directly to http://localhost:3000/marketplace/my-submissions
  - Expected: Should be **redirected** to http://localhost:3000/skills
  - The my-submissions page should NOT load

**Expected Result:** All marketplace UI is completely hidden, sidebar links disappear, and direct navigation redirects to a valid page (not marketplace).

---

## Test Scenario 3: Backend API Gating

**Goal:** Verify that backend API endpoints return 403 Forbidden when marketplace is disabled.

### Prerequisites
- Marketplace must be disabled (completed Test Scenario 2)
- You have an auth token from a valid admin session

### Steps

- [ ] **Step 1: Get authentication token**
  - Open browser DevTools (F12 or Cmd+Option+I)
  - Go to "Application" → "Cookies"
  - Find the `access_token` cookie (or equivalent JWT)
  - Copy the full token value
  
  **Alternative:** If token is in localStorage:
  - Go to "Application" → "Local Storage"
  - Look for `auth_token` or similar
  - Copy the token

- [ ] **Step 2: Test GET /api/marketplace with curl**
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    http://localhost:3001/api/marketplace
  ```
  
  **Expected Response:**
  ```json
  {
    "statusCode": 403,
    "message": "Marketplace is disabled for this organization",
    "error": "Forbidden"
  }
  ```

- [ ] **Step 3: Test POST /api/marketplace/submit with curl**
  ```bash
  curl -X POST \
    -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    -H "Content-Type: application/json" \
    -d '{"skillId":"test-id","snapshotVersion":1}' \
    http://localhost:3001/api/marketplace/submit
  ```
  
  **Expected Response:**
  ```json
  {
    "statusCode": 403,
    "message": "Marketplace is disabled for this organization",
    "error": "Forbidden"
  }
  ```

- [ ] **Step 4: Test GET /api/admin/marketplace/pending with curl**
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    http://localhost:3001/api/admin/marketplace/pending
  ```
  
  **Expected Response:**
  ```json
  {
    "statusCode": 403,
    "message": "Marketplace is disabled for this organization",
    "error": "Forbidden"
  }
  ```

- [ ] **Step 5: Test other marketplace endpoints**
  - Try a few more endpoints (e.g., GET /api/marketplace/featured, POST /api/admin/marketplace/approve)
  - All should return 403 Forbidden
  - Non-marketplace endpoints (e.g., /api/skills, /api/organization) should work normally

**Expected Result:** All marketplace API endpoints return 403 Forbidden when marketplace is disabled for the organization. Non-marketplace endpoints continue to work normally.

---

## Test Scenario 4: Re-enable Marketplace

**Goal:** Verify that re-enabling the marketplace restores full functionality.

### Steps

- [ ] **Step 1: Return to Admin Settings**
  - Click on your profile/avatar
  - Select "Admin Settings"
  - Navigate to "Marketplace Settings"

- [ ] **Step 2: Re-enable marketplace**
  - **CHECK** the "Enable marketplace" checkbox
  - Verify the checkbox state changes to checked

- [ ] **Step 3: Save settings**
  - Click **"Save Settings"**
  - Verify a success toast appears
  - Wait for the toast to disappear

- [ ] **Step 4: Verify marketplace link returns to sidebar**
  - Look at the left sidebar
  - Confirm the **"Marketplace"** link is now **VISIBLE AGAIN**
  - Confirm the **"My Submissions"** option is **VISIBLE** under My Skills
  - Other sidebar items should also still be present

- [ ] **Step 5: Navigate to marketplace homepage**
  - Click the "Marketplace" link in the sidebar
  - OR navigate to http://localhost:3000/
  - Verify the marketplace homepage loads correctly
  - No redirect should occur

- [ ] **Step 6: Navigate to browse**
  - Click "Browse"
  - OR navigate to http://localhost:3000/browse
  - Verify the browse page loads with available skills
  - No redirect should occur

- [ ] **Step 7: Verify API endpoints work again**
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    http://localhost:3001/api/marketplace
  ```
  
  **Expected Response:** 200 OK with marketplace data (not 403)

**Expected Result:** Marketplace is fully restored. All UI elements, routes, and API endpoints work normally.

---

## Edge Cases and Additional Tests

### Test Case A: Multiple Admin Users
- [ ] Have two admin users in the same organization
- [ ] Admin A disables marketplace
- [ ] Admin B logs in → marketplace should also be disabled for Admin B
- [ ] Both users see the checkbox unchecked in admin settings

### Test Case B: Multiple Organizations
- [ ] If you have access to multiple orgs (rare, but possible):
  - Org A has marketplace enabled
  - Org B has marketplace disabled
  - Switch between orgs → marketplace toggle should reflect per-org state
  - API calls should respect org-specific marketplace setting

### Test Case C: Session Persistence
- [ ] Disable marketplace
- [ ] Log out
- [ ] Log back in
- [ ] Marketplace should still be disabled
- [ ] Sidebar should still hide marketplace links

### Test Case D: Page Reload During Settings Change
- [ ] Navigate to Marketplace Settings
- [ ] Uncheck the enable marketplace checkbox
- [ ] Close the tab WITHOUT clicking Save
- [ ] Re-open the settings page
- [ ] Checkbox should be CHECKED again (change not persisted)

---

## Acceptance Criteria

All of the following must be true for the feature to be considered complete:

- [x] Admin can navigate to Marketplace Settings
- [x] "Enable marketplace" checkbox is visible and functional
- [x] Disabling marketplace hides all sidebar links
- [x] Disabling marketplace redirects all direct navigation to non-marketplace pages
- [x] All marketplace API endpoints return 403 Forbidden when disabled
- [x] Non-marketplace endpoints continue to work when marketplace is disabled
- [x] Re-enabling marketplace restores all functionality
- [x] Settings persist across page refreshes and browser sessions
- [x] Settings are per-organization (not global or per-user)

---

## Troubleshooting

### Checkbox doesn't save
- Check browser console for JavaScript errors
- Verify backend is running and `/api/organization` endpoint is accessible
- Check network tab to see if PUT request to update organization is failing

### Marketplace still accessible after disabling
- Check that frontend build has been updated (run `npm run build` in frontend)
- Clear browser cache (Cmd+Shift+Delete or Ctrl+Shift+Delete)
- Check browser console for errors
- Verify auth token includes org info with `marketplaceEnabled: false`

### API endpoints still work with 200 after disabling
- Verify the MarketplaceGuard is properly applied to controller
- Check that org is being populated into request context (CLS)
- Review backend logs for guard execution

### Redirect not working
- Verify `MarketplaceRouteGuard` component is applied to routes
- Check for any other route guards that might intercept redirects
- Inspect network tab to see if client-side or server-side redirect is happening
