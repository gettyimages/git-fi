# Quick Start

## Install

git-fi is a git subcommand: once the `git-fi` binary is on your `PATH`, invoke it as `git fi`. Requires Node.js >= 18 and git >= 2.39.0.

```bash
npm install -g @gettyimages/git-fi
```

This puts `git-fi` on your `PATH`, which is what makes the `git fi` subcommand work. Upgrade the same way — re-running it installs the latest published version. To preview without installing (this runs as `npx @gettyimages/git-fi`, **not** `git fi`):

```bash
npx @gettyimages/git-fi --help
```

### Upgrading from an older git-fi

`git fi` runs whichever `git-fi` comes first on your `PATH`. An older install — such as the legacy Ruby gem — can shadow a freshly installed npm version. Run `which -a git-fi`; if more than one path is listed, remove the older one (e.g. `gem uninstall git-fi`) so `git fi` resolves to the version you intend.

> Working on git-fi itself? The [README](https://github.com/gettyimages/git-fi#readme) covers running from source.

### Getting help

```bash
git fi -h        # quick summary
git fi help      # same summary (a plain subcommand)
git fi --help    # opens the man page
```

`git` itself intercepts `git fi --help` and routes it to `man git-fi` — so it works once the man page is installed (it ships with the npm package). `git fi -h` and `git fi help` reach git-fi directly and always print the summary.

### Shell completion

`git fi install-completions` prints the completion script for your shell (auto-detected from `$SHELL`, or pass `bash` / `zsh`). Wire it into your shell's startup file:

```bash
# bash — in ~/.bashrc (requires git's bash completion)
source <(git fi install-completions bash)
```

```zsh
# zsh — write it onto your fpath, then let compinit pick it up
git fi install-completions zsh > "${fpath[1]}/_git-fi"
autoload -Uz compinit && compinit
```

Completion offers the action/option flags and, for positional arguments, the branch names available on `origin` — only branches not yet in `fi` for `--add`, and only branches currently in `fi` for `--remove`.

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

The first time you run this in a repository that has no `fi` branch yet, git-fi asks you to confirm bootstrapping it. In CI or scripts, pass `--yes` (`-y`) to bootstrap without the prompt. Once `fi` exists, every command runs non-interactively.

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
