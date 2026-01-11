# Relish Admin UI

**Component:** Task 2.6 of Phase 2 (Schema Infrastructure)  
**Status:** ⏳ Not Started (0%)  
**Duration:** 2 weeks  
**Dependencies:** Phase 1 (Client SDK), Hot Reload System (2.3)

---

## 🎯 Goal

Build a **SaaS operator dashboard** for Relish administrators to manage tenants, monitor usage, and maintain system health.

**Target User:** Relish platform operators and SaaS administrators.

**Key Features:** Tenant management, usage metrics, system health monitoring, incident response.

---

## 📊 Progress Tracking

| Component                             | Status             | Progress |
| ------------------------------------- | ------------------ | -------- |
| 2.6.1 Project Setup                   | ⏳ Not Started     | 0%       |
| 2.6.2 Tenant List View                | ⏳ Not Started     | 0%       |
| 2.6.3 Tenant Detail Page              | ⏳ Not Started     | 0%       |
| 2.6.4 Tenant Creation Wizard          | ⏳ Not Started     | 0%       |
| 2.6.5 Usage Metrics Dashboard         | ⏳ Not Started     | 0%       |
| 2.6.6 System Health Monitoring        | ⏳ Not Started     | 0%       |
| 2.6.7 Tenant Actions (Suspend/Resume) | ⏳ Not Started     | 0%       |
| 2.6.8 Deploy to Cloudflare Pages      | ⏳ Not Started     | 0%       |
| **Overall**                           | **⏳ Not Started** | **0%**   |

---

## 🏗️ Architecture

### Tech Stack

```yaml
Framework: Next.js 14 (App Router)
Language: TypeScript
UI Library: shadcn/ui (Radix UI primitives)
Charts: Recharts
State Management: React Query (TanStack Query)
Forms: React Hook Form + Zod
Styling: Tailwind CSS
Deployment: Cloudflare Pages (via Pulumi)
```

### Component Hierarchy

```
App Layout
├── Sidebar (navigation)
├── Tenant List View
│   ├── Search/Filter Bar
│   ├── Tenant Table
│   │   ├── Tenant Row (name, status, users, created)
│   │   └── Quick Actions (view, suspend, delete)
│   └── Create Tenant Button
├── Tenant Detail Page
│   ├── Tenant Info Card
│   ├── Metrics Dashboard
│   │   ├── Active Users Chart
│   │   ├── Request Rate Chart
│   │   └── Error Rate Chart
│   ├── User List
│   └── Permission Graph Viewer
├── Tenant Creation Wizard
│   ├── Basic Info Step
│   ├── Schema Selection Step
│   └── Confirmation Step
└── System Health Dashboard
    ├── Overall Status
    ├── Service Health Cards
    ├── Recent Incidents
    └── Performance Metrics
```

### Data Flow

```
UI → React Query → API Routes → Cloudflare Worker → Durable Objects
                                                  → KuzuDB
                                                  → Analytics
```

---

## 📋 Task List

### 2.6.1 Project Setup (Day 1)

#### Tasks

- [ ] **Create Next.js project**

  ```bash
  cd admin-ui
  npx create-next-app@latest relish-admin \
    --typescript \
    --tailwind \
    --app \
    --no-src-dir
  cd relish-admin
  ```

- [ ] **Install dependencies**

  ```bash
  npm install @tanstack/react-query
  npm install react-hook-form zod @hookform/resolvers
  npm install recharts
  npm install lucide-react
  npm install date-fns
  npx shadcn-ui@latest init
  ```

- [ ] **Add shadcn/ui components**

  ```bash
  npx shadcn-ui@latest add button
  npx shadcn-ui@latest add input
  npx shadcn-ui@latest add table
  npx shadcn-ui@latest add dialog
  npx shadcn-ui@latest add badge
  npx shadcn-ui@latest add card
  npx shadcn-ui@latest add tabs
  npx shadcn-ui@latest add select
  npx shadcn-ui@latest add toast
  npx shadcn-ui@latest add dropdown-menu
  npx shadcn-ui@latest add alert
  ```

- [ ] **Setup directory structure**

  ```
  relish-admin/
  ├── app/
  │   ├── layout.tsx
  │   ├── page.tsx                # Dashboard
  │   ├── tenants/
  │   │   ├── page.tsx            # Tenant list
  │   │   ├── [id]/page.tsx       # Tenant detail
  │   │   └── new/page.tsx        # Create tenant
  │   ├── system/
  │   │   └── page.tsx            # System health
  │   └── api/
  │       └── tenants/
  │           ├── route.ts        # List/create
  │           └── [id]/route.ts   # CRUD operations
  ├── components/
  │   ├── tenant-list.tsx
  │   ├── tenant-card.tsx
  │   ├── tenant-creation-wizard.tsx
  │   ├── metrics-dashboard.tsx
  │   ├── system-health-card.tsx
  │   └── user-list.tsx
  ├── lib/
  │   ├── api-client.ts
  │   ├── types.ts
  │   └── utils.ts
  └── public/
  ```

- [ ] **Configure environment variables**
  ```bash
  # .env.local
  NEXT_PUBLIC_WORKER_URL=http://localhost:8787
  RELISH_ADMIN_API_KEY=admin-secret-key
  ```

#### Acceptance Criteria

- ✅ Next.js project running on `localhost:3000`
- ✅ All dependencies installed
- ✅ Directory structure created

---

### 2.6.2 Tenant List View (Days 2-3)

- [ ] **Create Tenant List** (`components/tenant-list.tsx`)

  ```typescript
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
  } from "@/components/ui/table";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { MoreHorizontal, Search } from "lucide-react";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import Link from "next/link";
  import { useState } from "react";

  export function TenantList() {
    const [search, setSearch] = useState("");

    const { data, isLoading } = useQuery({
      queryKey: ["tenants", search],
      queryFn: async () => {
        const response = await fetch(`/api/tenants?search=${search}`);
        return response.json();
      },
    });

    if (isLoading) return <div>Loading...</div>;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button asChild>
            <Link href="/tenants/new">Create Tenant</Link>
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.tenants.map((tenant: any) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/tenants/${tenant.id}`}
                    className="hover:underline"
                  >
                    {tenant.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      tenant.status === "active" ? "default" : "secondary"
                    }
                  >
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell>{tenant.userCount}</TableCell>
                <TableCell>
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/tenants/${tenant.id}`}>View Details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>Suspend</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  ```

---

### 2.6.3 Tenant Detail Page (Days 4-6)

- [ ] **Create Tenant Detail Page** (`app/tenants/[id]/page.tsx`)

  ```typescript
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "@/components/ui/tabs";
  import { MetricsDashboard } from "@/components/metrics-dashboard";
  import { UserList } from "@/components/user-list";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";

  export default function TenantDetailPage({
    params,
  }: {
    params: { id: string };
  }) {
    const { data: tenant, isLoading } = useQuery({
      queryKey: ["tenant", params.id],
      queryFn: async () => {
        const response = await fetch(`/api/tenants/${params.id}`);
        return response.json();
      },
    });

    if (isLoading) return <div>Loading...</div>;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{tenant.name}</h1>
            <p className="text-gray-500">ID: {tenant.id}</p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge
              variant={tenant.status === "active" ? "default" : "secondary"}
            >
              {tenant.status}
            </Badge>
            <Button variant="outline">Suspend</Button>
            <Button variant="destructive">Delete</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Users</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{tenant.metrics.activeUsers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requests (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {tenant.metrics.requests24h.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{tenant.metrics.errorRate}%</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="metrics">
          <TabsList>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="space-y-4">
            <MetricsDashboard tenantId={params.id} />
          </TabsContent>

          <TabsContent value="users">
            <UserList tenantId={params.id} />
          </TabsContent>

          <TabsContent value="permissions">
            <div>Permission graph viewer (TODO)</div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  ```

---

### 2.6.4 Tenant Creation Wizard (Days 7-8)

- [ ] **Create Tenant Creation Wizard**
- [ ] **Add form validation**
- [ ] **Add schema template selection**

---

### 2.6.5 Usage Metrics Dashboard (Days 9-10)

- [ ] **Create Metrics Dashboard** (`components/metrics-dashboard.tsx`)

  ```typescript
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
  } from "recharts";

  export function MetricsDashboard({ tenantId }: { tenantId: string }) {
    const { data } = useQuery({
      queryKey: ["metrics", tenantId],
      queryFn: async () => {
        const response = await fetch(`/api/tenants/${tenantId}/metrics`);
        return response.json();
      },
      refetchInterval: 30000, // Refresh every 30 seconds
    });

    return (
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Active Users (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data?.activeUsers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3B82F6" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request Rate (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data?.requests}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10B981" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

---

### 2.6.6 System Health Monitoring (Days 11-12)

- [ ] **Create System Health Dashboard**
- [ ] **Add service status cards**
- [ ] **Add incident log**

---

### 2.6.7 Tenant Actions (Day 13)

- [ ] **Implement suspend/resume**
- [ ] **Add confirmation dialogs**
- [ ] **Add audit logging**

---

### 2.6.8 Deploy to Cloudflare Pages (Day 14)

- [ ] **Create Pulumi deployment**
- [ ] **Configure environment variables**
- [ ] **Deploy to production**

---

## 🔐 Authorization (Dogfooding)

This UI uses **Relish authorization** internally to control access:

```yaml
# Roles
relish:operator → User       # Read-only access
relish:admin → User          # Manage tenants
relish:superadmin → User     # Full access

# Permissions
tenant:view → relish:operator
tenant:create → relish:admin
tenant:suspend → relish:admin
tenant:delete → relish:superadmin
metrics:view → relish:operator
system:manage → relish:superadmin
```

---

## 🎯 Success Criteria

- ✅ Tenant list view working
- ✅ Tenant detail page working
- ✅ Tenant creation working
- ✅ Usage metrics dashboard working
- ✅ System health monitoring working
- ✅ Tenant actions working (suspend/resume)
- ✅ Deployed to Cloudflare Pages
- ✅ Authorization working (dogfooding Relish)

---

## 📚 Related Documents

- [PHASE_2_SCHEMA_INFRASTRUCTURE.md](./PHASE_2_SCHEMA_INFRASTRUCTURE.md) - Parent phase document
- [CUSTOMER_ADMIN_UI_WEB.md](./CUSTOMER_ADMIN_UI_WEB.md) - Customer schema editor

---

**Last Updated:** January 11, 2026  
**Next Review:** Weekly during implementation
