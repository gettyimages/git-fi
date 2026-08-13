# Quick Start

## Install

git-fi is a git subcommand: once the `git-fi` binary is on your `PATH`, invoke it as `git fi`. Requires Node.js >= 22 and git >= 2.13.0.

```bash
npm install -g @gettyimages/git-fi
```

This puts `git-fi` on your `PATH`, which is what makes the `git fi` subcommand work. To preview without installing (this runs as `npx @gettyimages/git-fi`, **not** `git fi`):

```bash
npx @gettyimages/git-fi --help
```

> [!TIP|label:Migrating from older versions]
> 💎 git-fi shipped as a Ruby gem through 0.9.3400163. `git fi` runs whichever `git-fi` comes first on your `PATH`, so remove the gem before you install the npm package:
>
> ```bash
> gem uninstall git-fi
> npm install -g @gettyimages/git-fi
> ```
>
> Let `gem uninstall` do the removal rather than deleting the gem's files by hand. RubyGems puts launchers named `git-fi` in Ruby's own `bin` directory, outside the gem directory, and that directory can sit earlier on `PATH` than npm's. Delete the gem by hand and those launchers stay behind pointing at code that is gone, so `git fi` fails with whatever the dead launcher produces: a Ruby `cannot load such file` error, or `Maybe git-fi is broken?`.
>
> Then open a new shell. If `git fi --version` still reports a `0.x` version, or you get the broken-launcher error above, an older `git-fi` is ahead of npm's on your `PATH`. List every one in resolution order and delete those outside npm's own prefix (`npm config get prefix`):
>
> ```bash
> which -a git-fi
> ```
>
> git-fi says so itself where it can: `--version` names any other `git-fi` that `PATH` resolves ahead of it. When the other one is winning, `git fi` never reaches git-fi to ask, so reach it directly instead — `npx @gettyimages/git-fi --version` prints the version and the launcher standing in front of it.

> [!TIP|label:Migrating on Windows]
> Run `gem uninstall` from a shell started as administrator where Ruby is installed system-wide (under `C:\tools`, say). Without it the removal can quietly not happen; `gem list git` before and after tells you whether it did.
>
> A leftover launcher with no file extension gives `Program 'git-fi' failed to run: No application is associated with the specified file`. `Get-Command` names the one that wins and lists the rest in resolution order:
>
> ```powershell
> Get-Command git-fi -All
> ```

### Updating

```bash
git fi --update
```

Installs the latest published version, from any directory. git-fi prints a one-line notice naming this command when a newer version is out, so you don't have to check.

If that reports an unknown option, you're on a version that predates the flag; update once with npm and you'll have it:

```bash
npm install -g @gettyimages/git-fi
```

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

If `fi` exists but nothing has been added to it, the list reads `(no branches)`. If `fi` doesn't exist in the repository at all, git-fi says so and tells you how to bootstrap it.

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
