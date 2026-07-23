#!/usr/bin/env bash
# Local trial helper (npm run trial:on / trial:off). Points `git fi` at this
# working copy and loads the fixed completion so the change can be run for a few
# days before shipping, then reverts. Not published (see package.json "files").
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
zshrc="${HOME}/.zshrc"
marker="git-fi-trial"

case "${1:-}" in
on)
	cd "$root"
	npm run build
	npm link
	if ! grep -qF "# BEGIN ${marker}" "$zshrc" 2>/dev/null; then
		{
			printf '\n# BEGIN %s\n' "$marker"
			printf 'source <(git fi install-completions bash)\n'
			printf '# END %s\n' "$marker"
		} >>"$zshrc"
		echo "Loaded completion via $zshrc"
	else
		echo "Completion already loaded in $zshrc"
	fi
	echo
	echo "Open a new terminal, then try:  git fi -<TAB>   git fi -a <TAB>"
	;;
off)
	if [ -f "$zshrc" ]; then
		tmp="$(mktemp)"
		sed "/# BEGIN ${marker}/,/# END ${marker}/d" "$zshrc" >"$tmp" && mv "$tmp" "$zshrc"
	fi
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
