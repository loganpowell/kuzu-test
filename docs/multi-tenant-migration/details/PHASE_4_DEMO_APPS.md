# Phase 4: Demo Applications

**Status:** 0% Complete  
**Estimated Duration:** 3-4 weeks  
**Target:** Showcase Relish authorization in real-world applications

> **Parent Plan:** [MASTER_PLAN.md](../MASTER_PLAN.md)  
> **Related:** [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)

---

## 📊 Phase Overview

### Goal

Build three demo applications that showcase Relish authorization in different use cases, with both web and Tauri (desktop) versions, complete with OpenAPI specifications.

### Current Progress

| Component                  | Progress | Status             |
| -------------------------- | -------- | ------------------ |
| Document Management System | 0%       | ⏳ Not Started     |
| Multi-Tenant SaaS App      | 0%       | ⏳ Not Started     |
| Healthcare Records System  | 0%       | ⏳ Not Started     |
| **Overall**                | **0%**   | **⏳ Not Started** |

### Dependencies

- ⏳ Phase 1: Client SDK (Must be 100%)
- ⏳ Phase 3: Auth.js Integration (Must be 100%)
- 🟡 Phase 2: Schema Infrastructure (Recommended)

---

## 📋 Demo Applications

### 4.1 Document Management System (Week 1-2)

**Goal:** Google Docs-style app with folder hierarchies and real-time collaboration

#### Features

- User authentication (Auth.js)
- Document CRUD (create, read, update, delete)
- Folder hierarchy with inherited permissions
- Share documents with users/groups
- Real-time collaboration (multiple users editing)
- Permission levels: owner, editor, commenter, viewer
- Audit log (who accessed what, when)

#### OpenAPI REST Endpoints

```yaml
# Documents
GET    /api/documents                # List (filtered by read permission)
POST   /api/documents                # Create (checks create permission)
GET    /api/documents/:id            # Get (checks read permission)
PATCH  /api/documents/:id            # Update (checks write permission)
DELETE /api/documents/:id            # Delete (checks delete permission)

# Folders
GET    /api/folders                  # List (filtered by read permission)
POST   /api/folders                  # Create (checks create permission)
GET    /api/folders/:id/documents    # List (inherited permissions)

# Sharing
POST   /api/documents/:id/share      # Share (checks owner permission)
DELETE /api/documents/:id/share/:userId  # Revoke (checks owner permission)
GET    /api/documents/:id/permissions    # List who has access

# Collaboration
WS     /api/documents/:id/collaborate    # WebSocket for real-time editing
GET    /api/documents/:id/activity       # Audit log
```

#### Web Version Tasks

- [ ] **Project Setup**

  - [ ] Next.js 14 project with App Router
  - [ ] TypeScript configuration
  - [ ] Tailwind CSS styling
  - [ ] Relish SDK integration

- [ ] **UI Components**

  - [ ] Document list view
  - [ ] Document editor (rich text using Tiptap)
  - [ ] Folder tree view (recursive)
  - [ ] Share dialog with permission selector
  - [ ] Permission badge component
  - [ ] Audit log viewer

- [ ] **Features**

  - [ ] Real-time collaboration (WebSocket)
  - [ ] Offline mode with sync
  - [ ] Keyboard shortcuts
  - [ ] Search functionality
  - [ ] Export to PDF/Markdown

- [ ] **API Documentation**
  - [ ] OpenAPI spec (`openapi.yaml`)
  - [ ] Swagger UI at `/api/docs`
  - [ ] Example requests/responses
  - [ ] Authentication documentation

---

## 🧪 Test-Driven Development (TDD) Approach

### TDD Workflow for Phase 4

**Demo applications require end-to-end testing:**

1. **Write API contract tests first** (OpenAPI spec as source of truth)
2. **Write integration tests** for auth + authz flows
3. **Write E2E tests** for critical user journeys
4. **Test permission inheritance** thoroughly
5. Mark complete **only when all scenarios pass**

### Test Framework Setup

```bash
# For each demo app
cd demo-apps/document-management
npm install --save-dev vitest @vitest/ui
npm install --save-dev @testing-library/react @testing-library/user-event
npm install --save-dev @playwright/test
npm install --save-dev msw  # Mock Service Worker
```

### Demo 4.1: Document Management - Test Suite

**API Contract Tests (write BEFORE implementation):**

```typescript
// tests/api/documents.contract.test.ts
import { describe, it, expect } from "vitest";

describe("Documents API Contract", () => {
  describe("GET /api/documents", () => {
    it("should match OpenAPI spec", async () => {
      const response = await fetch("/api/documents", {
        headers: { Authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchSchema("DocumentListResponse");
    });

    it("should filter by read permission", async () => {
      const aliceResponse = await fetch("/api/documents", {
        headers: { Authorization: "Bearer alice-token" },
      });
      const bobResponse = await fetch("/api/documents", {
        headers: { Authorization: "Bearer bob-token" },
      });

      const aliceDocs = await aliceResponse.json();
      const bobDocs = await bobResponse.json();

      expect(aliceDocs.documents).toHaveLength(2);
      expect(bobDocs.documents).toHaveLength(1);
    });
  });

  describe("POST /api/documents/:id/share", () => {
    it("should allow owner to share", async () => {
      const response = await fetch("/api/documents/doc1/share", {
        method: "POST",
        headers: { Authorization: "Bearer alice-token" },
        body: JSON.stringify({ userId: "user:bob", permission: "read" }),
      });
      expect(response.status).toBe(200);
    });

    it("should deny non-owner sharing", async () => {
      const response = await fetch("/api/documents/doc1/share", {
        method: "POST",
        headers: { Authorization: "Bearer bob-token" },
        body: JSON.stringify({ userId: "user:charlie", permission: "read" }),
      });
      expect(response.status).toBe(403);
    });
  });
});
```

**Permission Inheritance Tests:**

```typescript
// tests/permissions/folder-hierarchy.test.ts
describe("Folder Permission Inheritance", () => {
  it("should inherit from parent folder", async () => {
    const canRead = await checkPermission("user:alice", "doc:child", "read");
    expect(canRead).toBe(true);
  });

  it("should override inherited permissions", async () => {
    const canRead = await checkPermission("user:alice", "doc:blocked", "read");
    expect(canRead).toBe(false);
  });
});
```

**E2E Tests:**

```typescript
// tests/e2e/document-workflow.spec.ts
import { test, expect } from "@playwright/test";

test("complete document workflow", async ({ page }) => {
  await page.goto("/login");
  await page.click("text=Sign in with Google");

  await page.click("text=New Document");
  await page.fill('input[name="title"]', "My Document");
  await page.click('button:has-text("Save")');

  await page.click('button[aria-label="Share"]');
  await page.fill('input[placeholder="Email"]', "bob@example.com");
  await page.click('button:has-text("Share")');

  await expect(page.locator("text=Shared with bob")).toBeVisible();
});
```

**✅ Demo 4.1 is DONE when:** All tests pass + manual testing confirms real-time collaboration

---

#### Tauri Version Tasks

- [ ] **Project Setup**

  - [ ] Tauri v2 project
  - [ ] Reuse React components from web
  - [ ] Native menu bar

- [ ] **Desktop Features**

  - [ ] Local document storage (SQLite)
  - [ ] Offline mode with background sync
  - [ ] Native file system integration
  - [ ] Desktop notifications
  - [ ] System tray icon

- [ ] **Build & Distribution**
  - [ ] Code signing for macOS
  - [ ] Code signing for Windows
  - [ ] Build for Linux (AppImage)
  - [ ] Auto-update mechanism

#### File Structure

```
examples/document-management/
  web/
    src/
      app/
        api/              # OpenAPI REST endpoints
          documents/route.ts
          folders/route.ts
        documents/
          page.tsx        # Document list
          [id]/page.tsx   # Document editor
        folders/[id]/page.tsx
      components/
        DocumentList.tsx
        DocumentEditor.tsx
        ShareDialog.tsx
        PermissionBadge.tsx
        FolderTree.tsx
      lib/
        relish-client.ts  # Relish SDK instance
        auth-middleware.ts
    openapi.yaml          # OpenAPI 3.0 spec
    package.json

  tauri/
    src-tauri/src/
      main.rs
      db.rs               # Local SQLite
      sync.rs             # Sync with server
      menu.rs             # Native menu
    src/                  # Symlink to ../web/src
    package.json

  README.md               # Setup instructions
  DEMO.md                 # Demo script
```

#### Acceptance Criteria

- ✅ Document CRUD working
- ✅ Folder hierarchy with inherited permissions
- ✅ Real-time collaboration working
- ✅ Share/revoke permissions working
- ✅ OpenAPI spec complete
- ✅ Web version deployed
- ✅ Tauri version builds for all platforms

---

### 4.2 Multi-Tenant SaaS App (Week 3)

**Goal:** Showcase multi-org resource isolation and cross-org sharing

#### Features

- Multiple organizations (tenants)
- Per-org resource isolation
- Cross-org sharing (optional)
- Org admin role (can manage org users)
- Billing/usage dashboard per org

#### OpenAPI REST Endpoints

```yaml
# Organizations
GET    /api/orgs                     # List user's orgs
POST   /api/orgs                     # Create org
GET    /api/orgs/:id                 # Get org details

# Org Members
GET    /api/orgs/:id/members         # List members
POST   /api/orgs/:id/members         # Add member
DELETE /api/orgs/:id/members/:userId # Remove member

# Org Resources
GET    /api/orgs/:id/resources       # List resources
POST   /api/orgs/:id/resources       # Create resource

# Cross-Org Sharing
POST   /api/resources/:id/share-external  # Share with another org
GET    /api/resources/shared-with-me      # Resources shared from other orgs
```

#### Tasks

- [ ] **Org Management**

  - [ ] Create organization
  - [ ] Org switcher component
  - [ ] Org settings page
  - [ ] Billing integration (mock)

- [ ] **Member Management**

  - [ ] Invite users to org
  - [ ] Remove users from org
  - [ ] Assign org roles (admin, member, viewer)
  - [ ] Bulk user operations

- [ ] **Cross-Org Sharing**

  - [ ] Share resource with external org
  - [ ] Accept/reject share requests
  - [ ] Revoke external shares
  - [ ] Audit external access

- [ ] **Usage Dashboard**
  - [ ] API usage metrics
  - [ ] Storage usage
  - [ ] User activity
  - [ ] Billing summary

#### File Structure

```
examples/multi-tenant-saas/
  src/
    app/
      api/
        orgs/route.ts
        orgs/[id]/members/route.ts
        orgs/[id]/resources/route.ts
      orgs/
        page.tsx          # Org list
        [id]/page.tsx     # Org details
        [id]/settings/page.tsx
      resources/
        page.tsx          # Resource list
        [id]/page.tsx     # Resource details
    components/
      OrgSwitcher.tsx
      MemberList.tsx
      UsageDashboard.tsx
    lib/
      relish-client.ts
  openapi.yaml
  README.md
```

#### Acceptance Criteria

- ✅ Multi-org support working
- ✅ Per-org resource isolation
- ✅ Cross-org sharing working
- ✅ Org admin roles working
- ✅ Usage dashboard showing metrics
- ✅ OpenAPI spec complete

---

### 4.3 Healthcare Records System (Week 4)

**Goal:** Demonstrate strict access control and HIPAA compliance features

#### Features

- Patient records with strict access control
- Doctor/nurse role-based access
- Temporary access grants (e.g., on-call doctor)
- Break-glass emergency access (with audit)
- Complete audit trail (HIPAA compliance)

#### OpenAPI REST Endpoints

```yaml
# Patient Records
GET    /api/patients                 # List patients
GET    /api/patients/:id/records     # Get records
POST   /api/patients/:id/records     # Add record

# Emergency Access
POST   /api/emergency-access/:patientId  # Break-glass access

# Audit
GET    /api/audit/patient/:id        # Patient access log
GET    /api/audit/user/:id           # User activity log
```

#### Tasks

- [ ] **Patient Records**

  - [ ] Patient list view (filtered by access)
  - [ ] Medical record viewer
  - [ ] Add/edit records
  - [ ] Record attachments (images, PDFs)

- [ ] **Access Control**

  - [ ] Role-based access (doctor, nurse, admin)
  - [ ] Temporary access grants (time-limited)
  - [ ] Break-glass emergency access
  - [ ] Access revocation

- [ ] **Audit & Compliance**

  - [ ] Complete audit log
  - [ ] Patient access history
  - [ ] User activity log
  - [ ] Export audit reports (CSV, PDF)
  - [ ] HIPAA compliance documentation

- [ ] **Emergency Features**
  - [ ] Emergency access dialog
  - [ ] Reason for emergency access
  - [ ] Automatic notification on emergency access
  - [ ] Post-emergency access review

#### File Structure

```
examples/healthcare-records/
  web/
    src/
      app/
        api/
          patients/route.ts
          emergency-access/route.ts
          audit/route.ts
        patients/
          page.tsx        # Patient list
          [id]/page.tsx   # Medical records
        audit/page.tsx    # Audit log
      components/
        PatientList.tsx
        MedicalRecordViewer.tsx
        EmergencyAccessDialog.tsx
        AuditLogViewer.tsx
      lib/
        relish-client.ts
    openapi.yaml

  tauri/
    src-tauri/src/
      main.rs
    package.json

  README.md
  HIPAA_COMPLIANCE.md   # Compliance documentation
```

#### Acceptance Criteria

- ✅ Patient records with strict access
- ✅ Role-based access working
- ✅ Temporary access grants working
- ✅ Break-glass emergency access working
- ✅ Complete audit trail
- ✅ HIPAA compliance documented
- ✅ OpenAPI spec complete

---

## ✅ Phase 4 Success Criteria

### Functional Requirements

- ✅ All three demo apps working
- ✅ Web versions deployed and accessible
- ✅ Tauri versions build for all platforms
- ✅ All features demonstrated

### API Requirements

- ✅ OpenAPI specs complete for all apps
- ✅ Swagger UI hosted for each app
- ✅ API documentation complete
- ✅ Example requests/responses

### Quality Requirements

- ✅ Authorization checks working (<1ms)
- ✅ Real-time features working
- ✅ Error handling complete
- ✅ Responsive design (mobile-friendly)

### Demo Materials

- ✅ Demo scripts prepared
- ✅ Video tutorials recorded
- ✅ Screenshots for documentation
- ✅ Presentation slides

---

## 🚀 Getting Started

### For This Phase

1. **Setup:**

   ```bash
   cd examples/document-management
   npm install
   npm run dev
   ```

2. **Pick an App:**

   - Start with Document Management (most complex)
   - Then Multi-Tenant SaaS
   - Finally Healthcare Records

3. **Implementation Workflow:**
   - Design UI mockups
   - Create OpenAPI spec
   - Implement backend API
   - Build frontend UI
   - Add Relish authorization checks
   - Test all permissions
   - Create Tauri version
   - Write demo script

### Testing

```bash
# Test API endpoints
npm run test:api

# Test authorization checks
npm run test:authz

# Test in browser
npm run dev

# Build Tauri app
cd tauri
npm run tauri build
```

---

## 📚 Related Documentation

- **[MASTER_PLAN.md](../MASTER_PLAN.md)** - Overall project plan
- **[Phase 1: Client SDK](PHASE_1_CLIENT_SDK.md)** - Client SDK (dependency)
- **[Phase 3: Auth Integration](PHASE_3_AUTH_INTEGRATION.md)** - Auth.js (dependency)

---

**Last Updated:** January 11, 2026  
**Phase Owner:** TBD  
**Status:** Not Started (0%)
