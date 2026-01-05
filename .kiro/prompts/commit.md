---
description: Create commits following Hamza's commit style conventions
---

# Commit Style

Follow these conventions when creating commits.

## Format

**Conventional commits** with this structure:

```
<type>: <Short description>

<Optional body explaining why>
```

## Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or functionality                            |
| `fix`      | Bug fix                                                 |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore`    | Maintenance, dependencies, config changes               |
| `docs`     | Documentation only                                      |
| `test`     | Adding or updating tests                                |
| `style`    | Formatting, whitespace (no code change)                 |

## Rules

### Title (subject line)

- **Capitalized first letter** after the type (e.g., `feat: Add user auth`)
- **No period** at the end
- **Short** - aim for under 50 characters
- **What** changed - describe the change itself

### Body (optional but encouraged for non-trivial changes)

- **Why** - explain the reasoning behind the change
- Wrap at 72 characters
- Separate from title with a blank line

### Granularity

- **One commit per task** (not per feature)
- Each commit should be a logical unit of work
- If a task is large, multiple commits are fine - each should be atomic

## Examples

**Simple change (title only):**

```
fix: Handle empty response from API
```

**Change with context (title + body):**

```
feat: Add retry logic for rate-limited requests

Upstream APIs occasionally return 429 errors during peak hours.
Exponential backoff with 3 retries handles this gracefully
without failing the entire request.
```

**Refactor:**

```
refactor: Extract validation into separate module

Validation logic was duplicated across three handlers.
Centralizing it reduces duplication and makes testing easier.
```

## Anti-patterns (avoid these)

| Bad                  | Why                         | Better                                       |
| -------------------- | --------------------------- | -------------------------------------------- |
| `fix stuff`          | Unclear what was fixed      | `fix: Correct null check in user lookup`     |
| `WIP`                | Not a complete unit of work | Don't commit WIP, or squash before pushing   |
| `misc changes`       | Says nothing                | Be specific about what changed               |
| `update code`        | Vague                       | `refactor: Simplify error handling in proxy` |
| `feat: add feature.` | Period at end               | `feat: Add feature`                          |
| `feat: add feature`  | Not capitalized             | `feat: Add feature`                          |

The commit message should stand on its own.

## Before Committing

1. Quality gates must pass
2. Review staged changes: `git diff --staged`
3. Write commit message following this style
4. Hamza reviews and pushes
