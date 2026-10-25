# Quick Start

## Install

git-fi is a git subcommand: once the `git-fi` binary is on your `PATH`, invoke it as `git fi`. Requires Node.js >= 22 and git >= 2.41.0.

```bash
npm install -g @gettyimages/git-fi
```

Then turn on tab completion, so `git fi --add <TAB>` offers your branches. In zsh:

```zsh
git fi install-completions --write "${fpath[1]}"
```

In bash, add `source <(git fi install-completions bash)` to `~/.bashrc`. [Shell completion](#shell-completion) has the details.

To try it without installing, run `npx @gettyimages/git-fi --help` (this runs as `npx @gettyimages/git-fi`, not `git fi`).

On older git, or upgrading from the Ruby gem? See [Troubleshooting](/troubleshooting).

## Your First Integration

### 1. List branches in fi

From any git repository:

```bash
git fi
```

If `fi` exists but nothing has been added to it, the list reads `(no branches)`. If `fi` doesn't exist in the repository at all, git-fi says so and points you at `--bootstrap`, which creates an empty one:

```bash
git fi --bootstrap
```

It doesn't prompt, so it works the same at a terminal and in CI, and running it where `fi` already exists only lists what's there.

### 2. Add a branch

```bash
git fi -a my-feature
```

git-fi will:
1. Fetch from origin
2. Create (or rebuild) the `fi` branch from `main`
3. Merge `origin/my-feature` into it
4. Push `fi` to origin

If you skipped `--bootstrap` and the repository has no `fi` branch yet, git-fi asks you to confirm creating it; in CI or scripts, pass `--yes` (`-y`) to confirm without the prompt. Once `fi` exists, every command runs non-interactively.

### 3. Add more branches

```bash
git fi -a another-feature
```

Now `fi` contains both branches merged together. If they conflict, git-fi reports it and aborts without changing `fi` on the remote.

### 4. Remove a branch

```bash
git fi -r my-feature
```

The `fi` branch is rebuilt with only the remaining branches.

See [remove](commands.md#remove) for more information.

### 5. Use the interactive picker

```bash
git fi -s
```

Browse remote branches and select which ones to add or remove.

## Setup

### Updating

```bash
git fi --update
```

Installs the latest published version, from any directory. git-fi prints a one-line notice naming this command when a newer version is out, so you don't have to check.

> Working on git-fi itself? The [README](https://github.com/gettyimages/git-fi#readme) covers running from source.

### Getting help

```bash
git fi -h        # quick summary
git fi help      # same summary (a plain subcommand)
git fi --help    # opens the man page
```

`git` itself intercepts `git fi --help` and opens git-fi's documentation in git's configured help format. On macOS and Linux that's `man git-fi`, which works once the npm package's man page is installed. Git for Windows looks for an HTML page instead, which git-fi doesn't ship, so use `git fi -h` there ([Troubleshooting](troubleshooting.md#help-fails-on-windows)). `git fi -h` and `git fi help` reach git-fi directly and always print the summary.

### Shell completion

In zsh, write both completion files onto your `fpath`. The command creates the directory if needed and names each file it wrote:

```zsh
git fi install-completions --write "${fpath[1]}"
```

Open a new shell and press `<TAB>`:

```zsh
git fi <TAB>          # actions, options, subcommands
git fi --add <TAB>    # origin branches not yet in fi
git fi --remove <TAB> # only branches currently in fi
```

If `${fpath[1]}` isn't writable (a root-owned `/usr/local`, say), the command stops and shows how to install into a directory you own instead. Run it again after `git fi --update` so completion picks up new flags.

For bash, add one line to `~/.bashrc` (git's bash completion has to be loaded first):

```bash
source <(git fi install-completions bash)
```

<details>
<summary>Packaging git-fi, or placing the files yourself?</summary>

`install-completions <bash|zsh|zsh-git>` prints a single script to stdout, so you can put it wherever your packaging wants. The two zsh files exist because two providers dispatch `git fi`, and which one is live depends on the git install: zsh's built-in `_git` calls `_git-fi`, while git's own completion wrapper (what ships with git, and what you get on macOS/Homebrew) calls `_git_fi`. Installing both covers either one, since each provider loads only the file it dispatches to.

```zsh
git fi install-completions zsh     > "${fpath[1]}/_git-fi"
git fi install-completions zsh-git > "${fpath[1]}/_git_fi"
```

</details>

## Next Steps

- [Daily Workflow](/daily-workflow) — a feature branch from first commit until it merges to `main`
- [Basic Commands](/commands) — list, add, remove, and select
- [Advanced Commands](/advanced) — force, again, pruning, and CI mode
- [Merge Process](/merge-process) — what happens under the hood
- [Troubleshooting](/troubleshooting) — older git, upgrading from the Ruby gem, completion setup
