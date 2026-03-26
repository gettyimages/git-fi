# Quick Start

See the [README](https://github.com/gettyimages/git-fi#install) for installation instructions.

## Your First Integration

### 1. List branches in fi

From any git repository:

```bash
git fi
```

If `fi` doesn't exist yet, you'll see an empty list.

### 2. Add a branch

```bash
git fi -a my-feature
```

git-fi will:
1. Fetch from origin
2. Create (or rebuild) the `fi` branch from `main`
3. Merge `origin/my-feature` into it
4. Push `fi` to origin

### 3. Add more branches

```bash
git fi -a another-feature
```

Now `fi` contains both branches merged together. If they conflict, git-fi tells you immediately.

### 4. Remove a branch

```bash
git fi -r my-feature
```

The `fi` branch is rebuilt with only the remaining branches.

### 5. Use the interactive picker

```bash
git fi -s
```

Browse remote branches and select which ones to add or remove.

## Next Steps

- [Basic Commands](/commands) — list, add, remove, and select
- [Advanced Commands](/advanced) — force, again, pruning, and CI mode
- [Merge Process](/merge-process) — what happens under the hood
