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

In zsh, `npm install -g` sets this up for you — open a new shell and press `<TAB>`:

```zsh
git fi <TAB>          # actions, options, subcommands
git fi --add <TAB>    # origin branches not yet in fi
git fi --remove <TAB> # only branches currently in fi
```

The install writes the completion files into npm's own prefix (`$(npm config get prefix)/share/zsh/site-functions`), the directory Homebrew and `/usr/local` zsh setups already read.

If `git fi <TAB>` offers filenames instead, that directory isn't on your `fpath`. Install into one that is — this creates it if needed and tells you what it wrote:

```zsh
git fi install-completions --write "${fpath[1]}"
autoload -Uz compinit && compinit
```

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

Now `fi` contains both branches merged together. If they conflict, git-fi reports it and aborts without changing `fi` on the remote.

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
