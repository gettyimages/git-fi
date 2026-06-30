# Basic Commands

The essentials: listing, adding, removing, and picking branches interactively.

## Overview

```bash
git fi [options] [<branch>...]
```

git-fi is invoked as a git subcommand from the repository root.

## list (default)

When invoked with no action flag, git-fi lists the branches currently merged into `fi`.

```bash
git fi
```

```text
 * feature-auth
 * feature-search
 * bugfix-nav
```

### Machine-readable output

With `--bare` (`-b`), output is space-separated branch names with no formatting — suitable for piping:

```bash
git fi -b | xargs -I {} echo "Branch: {}"
```

With `--json` (`-j`), output is a structured JSON object:

```json
{
  "branches": ["feature-auth", "feature-search", "bugfix-nav"],
  "ci": [
    { "branch": "feature-auth", "status": "OK", "url": "..." }
  ]
}
```

The `ci` array is present only when `GITLAB_ACCESS_TOKEN` is set. `--json` is only valid with the `list` command.

### Filtering

Pass a pattern to filter the list:

```bash
git fi feature
```

Shows only branches matching the filter.

## add

Append one or more branches to `fi`.

```bash
git fi -a feature-auth feature-search
```

If no branch name is given, the current working branch is used:

```bash
git fi -a
```

All specified branches must exist on the remote. The `origin/` prefix is optional — `feature-auth` and `origin/feature-auth` are equivalent.

## remove

Remove one or more branches from `fi`.

```bash
git fi -r feature-auth
```

If no branch name is given, the current working branch is used. Removing a branch that isn't in `fi` is silently ignored.

## select

Open an interactive branch picker. Requires a TTY.

```bash
git fi -s
```

When used alone, the picker shows all recent remote branches plus current `fi` branches. Current `fi` branches are pre-selected. Toggle branches on/off and confirm — git-fi computes the adds and removes automatically.

When combined with `-a`:

```bash
git fi -s -a
```

Shows only branches not already in `fi`. Select which to add.

When combined with `-r`:

```bash
git fi -s -r
```

Shows only branches currently in `fi`. Select which to remove.

## Global Options

| Flag | Long | Description |
|------|------|-------------|
| `-d` | `--debug` | Show git commands as they execute |
| `-b` | `--bare` | Machine-readable output (space-separated, no decoration) |
| `-j` | `--json` | Structured JSON output (list command only) |
| `-s` | `--select` | Interactive branch picker (requires TTY) |
| `-y` | `--yes` | Bootstrap `fi` without the confirmation prompt (for CI/scripts) |

## Branch Name Resolution

1. The `origin/` prefix is optional — `feature-auth` and `origin/feature-auth` are equivalent
2. When no branch is specified (for `-a`, `-r`), the current working branch is used
3. Adding or forcing requires branches to exist on the remote
4. Removing a non-existent branch is a no-op
