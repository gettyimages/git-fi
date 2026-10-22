# Troubleshooting

## Your git is older than 2.41.0

Every `git fi` command checks git first and stops if it is older than 2.41.0, naming the version it found. Where the git you have is the one your platform gives you (a long-support distribution, Apple's command line tools), install the last release that runs on git 2.13 and newer:

```bash
npm install -g @gettyimages/git-fi@1.2.2
```

## Upgrading from the Ruby gem

git-fi shipped as a Ruby gem through 0.9.3400163. `git fi` runs whichever `git-fi` comes first on your `PATH`, so remove the gem before you install the npm package:

```bash
gem uninstall git-fi
npm install -g @gettyimages/git-fi
```

Use `gem uninstall` rather than deleting the gem's files.

Then open a new shell and run `git fi --version`. If it reports a `0.x` version, or fails with `cannot load such file` or `Maybe git-fi is broken?`, an older `git-fi` is ahead of npm's on your `PATH`. List them in resolution order and delete any outside npm's own prefix (`npm config get prefix`):

```bash
which -a git-fi
```

If `git fi` doesn't reach git-fi at all, ask through npx instead:

```bash
npx @gettyimages/git-fi --version
```

That names the `git-fi` your `PATH` resolves, so you can see which file to remove.

### On Windows

Where Ruby is installed system-wide (under `C:\tools`, say), run `gem uninstall` from an administrator shell, then confirm it with `gem list git`.

To list every `git-fi` in resolution order:

```powershell
Get-Command git-fi -All
```

`Get-Command` cannot run a launcher with no file extension, so it leaves that one out. If `git fi` fails with `Program 'git-fi' failed to run` or `Maybe git-fi is broken?`, check Ruby's `bin` directory directly.

## Update reports an unknown option

If `git fi --update` reports an unknown option, you're on a version that predates the flag. Update once with npm and you'll have it:

```bash
npm install -g @gettyimages/git-fi
```

## Tab completion offers filenames

git-fi's completion isn't loaded. Install it into a directory on your `fpath`; this creates the directory if needed and tells you what it wrote:

```zsh
git fi install-completions --write "${fpath[1]}"
autoload -Uz compinit && compinit
```
