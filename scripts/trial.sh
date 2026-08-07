#!/usr/bin/env bash
# Local trial helper (npm run trial:on / trial:off). Points `git fi` at this
# working copy and loads the completion the way a user installs it, so the change
# can be run for a few days before shipping, then reverts. Not published (see
# package.json "files").
#
# The completion goes on the zsh fpath via `install-completions --write`, the
# command a user installs with (COMPLETE-06), so a trial covers both providers the
# same way they do. A trial that instead sources the bash script into ~/.zshrc
# defines _git_fi for git's wrapper and nothing else, so it passes even when the
# shipped path is broken: that gap is what let 1.0.7 publish with no working
# `git fi <TAB>` under git's wrapper.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
compdir="$root/.trial/completions"
zshrc="${HOME}/.zshrc"
marker="git-fi-trial"

case "${1:-}" in
on)
	cd "$root"
	npm run build
	npm link

	node "$root/dist/index.js" install-completions --write "$compdir"

	if ! grep -qF "# BEGIN ${marker}" "$zshrc" 2>/dev/null; then
		# Autoload the two files directly rather than re-running compinit: this
		# block lands at the end of .zshrc, after compinit has already scanned
		# the fpath, and a second compinit costs every new shell. `compdef`
		# stands in for the `#compdef git-fi` tag compinit would have read.
		{
			printf '\n# BEGIN %s\n' "$marker"
			printf 'fpath=(%s $fpath)\n' "$compdir"
			printf 'autoload -Uz _git-fi _git_fi\n'
			printf '(( $+functions[compdef] )) && compdef _git-fi git-fi\n'
			printf '# END %s\n' "$marker"
		} >>"$zshrc"
		echo "Loaded completion via $zshrc"
	else
		echo "Completion already loaded in $zshrc"
	fi
	echo
	echo "Open a new terminal, then try:  git fi <TAB>   git fi -a <TAB>   git-fi <TAB>"
	;;
off)
	if [ -f "$zshrc" ]; then
		tmp="$(mktemp)"
		sed "/# BEGIN ${marker}/,/# END ${marker}/d" "$zshrc" >"$tmp" && mv "$tmp" "$zshrc"
	fi
	rm -rf "$root/.trial"
	npm rm -g @gettyimages/git-fi || true
	npm i -g @gettyimages/git-fi
	echo
	echo "Reverted. Open a new terminal."
	;;
*)
	echo "usage: npm run trial:on | npm run trial:off" >&2
	exit 1
	;;
esac
