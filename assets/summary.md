Google Zanzibar is a globally distributed authorization system that manages permissions at scale. Learn how it works and which open source implementations are right for you.

As organizations scale applications to millions of users, managing permissions and access control becomes increasingly complex. Google's Zanzibar authorization service emerged as the gold standard for handling this challenge, powering permissions across Google's vast ecosystem of products.

While Google hasn't publicly released Zanzibar, several open-source projects have implemented its core principles, offering developers powerful options for building scalable authorization systems.

In this article, we'll analyze the top 5 open-source implementations of Google Zanzibar in 2024, examining their strengths, trade-offs, and ideal use cases.

## What is Google Zanzibar?

Google Zanzibar is a globally distributed authorization system that manages permissions at scale. Its key innovations include:

- Relationship-based modeling: Instead of traditional role-based access control (RBAC), Zanzibar uses a flexible relationship-based model that can express complex permission scenarios

- Consistency guarantees: The system provides external consistency and snapshot reads while handling millions of authorization checks per second

- Real-time updates: Changes to permissions are reflected globally within seconds
- Hierarchical namespaces: Resources and relationships can be organized hierarchically, enabling intuitive permission inheritance

## Understanding fine-grained permissions: a practical example

To understand why Zanzibar-style fine-grained authorization is powerful, let's compare it with traditional role-based access control (RBAC) using a document management system example:First, let's consider a typical "coarse-grained" permissions approach.

This is a simplified example of traditional role-based access control (RBAC). Users are assigned roles (like "editor" or "viewer") globally. Documents specify which roles are allowed to access them. This creates a coarse-grained, inflexible permission system:

```js
user.roles = ["editor"]; // User has a global "editor" role
document.allowedRoles = ["editor", "viewer"]; // Document allows editors and viewers

// Basic permission check function
// Simply checks if the user has ANY role that matches the document's allowed roles
function canAccessDocument(user, document) {
  return document.allowedRoles.some((role) => user.roles.includes(role));
}
```

This model has a number of downsides. All editors have the same access to all documents that allow editors. You can't grant a user edit access to just one document.

You can't model nested permissions such as folders containing documents. You can't express complex relationships like "can share" or "can transfer ownership". Changing permissions in the deployed system means changing roles, which affects all documents.

Zanzibar takes a fundamentally different approach. Instead of global roles, it allows you to define custom entities (like documents, folders, or organizations) and their relationships using a schema language.

At runtime, the Zanzibar engine can efficiently traverse these relationship graphs and perform billions of permission checks per second.

Here's how a Zanzibar-inspired system like WorkOS FGA models the same scenario:

```js
version 0.2

type user

type document
relation viewer [user]
relation editor [user]
relation owner [user]

// Inherit viewing permissions from editor relationship
inherit viewer if
relation editor

// Define what editors can do through inheritance
relation can_view []
relation can_edit []
relation can_share []
relation can_delete []

// Viewer can view
inherit can_view if
relation viewer

// Editor can view, edit, and share
inherit can_view if
relation editor

inherit can_edit if
relation editor

inherit can_share if
relation editor

// Only owner can delete
inherit can_delete if
relation owner
```

The resulting semantics are much richer allowing easier modeling of complex permissions scenarios.

## Performance characteristics of Zanzibar

The performance characteristics of Zanzibar are remarkable:

- Sub-millisecond Latency: Most permission checks complete in microseconds
- Massive Scale: The system can handle billions of users and trillions of relationships
- Global Distribution: Changes to permissions propagate globally within seconds
- Consistent Results: The system provides external consistency across all nodes
- Efficient Storage: Relationship data is optimized for fast traversal
- Caching: Frequently accessed permissions are cached for even faster checks

### Practical examples of fine-grained authorization

This model becomes particularly powerful when we consider familiar scenarios from Google's products. Consider how Google Drive implements these fine-grained permissions:

#### Direct sharing

When you share a document directly with colleague@company.com as an "Editor", Zanzibar creates a direct relationship:

```js
user:colleague@company.com is editor of document:quarterly-report
```

#### Link sharing

When you create an "anyone with the link can comment" link, it creates a relationship with a group:

```js
group:link-holders is commenter of document:quarterly-report
```

#### Nested folders

When you share a folder with your team, permissions cascade naturally:

```js
group:marketing-team is viewer of folder:campaigns
folder:campaigns contains document:q2-campaign
// Zanzibar automatically determines marketing-team members can view q2-campaign
```

#### Mixed permissions

A document in a shared folder can have different permissions than its parent:

```js
group:marketing-team is viewer of folder:campaigns
user:sarah@company.com is editor of document:q2-campaign
// Sarah has edit rights while others can only view

```

These real-world scenarios demonstrate why traditional role-based systems fall short. In Google Drive, a single user might be:

- An owner of their own documents
- An editor on their team's shared files
- A commenter on a client's proposal
- A viewer on company-wide resources

All these relationships are tracked and evaluated in real-time by Zanzibar, enabling the seamless permission management that users have come to expect from modern applications.
