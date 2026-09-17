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
restore="$root/.trial/replaced-version"
zshrc="${HOME}/.zshrc"
marker="git-fi-trial"
pkg="@gettyimages/git-fi"

# What the global install is right now: a version for a registry install,
# `linked` where it already points at a checkout, or empty where the package is
# absent. `npm link` overwrites that install, so the answer has to be taken
# before it runs and kept for `off` to restore. `npm ls` exits non-zero on some
# tree problems while still printing usable JSON, so its status is discarded
# rather than aborting the run under `pipefail`.
installed_state() {
	{ npm ls -g --depth=0 --json "$pkg" 2>/dev/null || true; } | node -e '
		const raw = require("fs").readFileSync(0, "utf8");
		try {
			const dep = (JSON.parse(raw).dependencies ?? {})[process.argv[1]];
			if (!dep) process.exit(0);
			// A linked checkout reports `resolved` as a file: URL; only a
			// registry install names a version to come back to.
			if (String(dep.resolved ?? "").startsWith("file:")) process.stdout.write("linked");
			else if (dep.version) process.stdout.write(dep.version);
		} catch (e) {
			process.stderr.write(`could not read the global ${process.argv[1]}: ${e.message}\n`);
		}
	' "$pkg"
}

case "${1:-}" in
on)
	cd "$root"
	npm run build

	mkdir -p "$root/.trial"
	if [ ! -f "$restore" ]; then
		state="$(installed_state)"
		case "$state" in
		linked)
			: >"$restore"
			echo "$pkg already points at a checkout, so the version it displaced is gone; trial:off will install the latest. Pin by hand if you need a particular one."
			;;
		"")
			: >"$restore"
			echo "No published $pkg is installed; trial:off will install the latest."
			;;
		*)
			printf '%s\n' "$state" >"$restore"
			echo "Trial will restore $pkg@$state"
			;;
		esac
	fi

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
	echo "Linked $(node "$root/dist/index.js" --version)"
	echo
	echo "Open a new terminal, then try:  git fi <TAB>   git fi -a <TAB>   git-fi <TAB>"
	;;
off)
	version=""
	[ -f "$restore" ] && version="$(cat "$restore")"

	# `npm i -g <pkg>@<spec>` takes far more than a version — a URL, a git ref,
	# a `file:` path, an `npm:` alias — and this value comes off disk. Anything
	# that isn't a bare version is refused rather than fetched.
	case "$version" in
	"") ;;
	-* | *[!0-9A-Za-z.+-]*)
		echo "! $restore does not hold a version: $version" >&2
		echo "  Refusing to install it. Delete the file and re-run to get the latest." >&2
		exit 1
		;;
	esac

	if [ -f "$zshrc" ]; then
		tmp="$(mktemp)"
		sed "/# BEGIN ${marker}/,/# END ${marker}/d" "$zshrc" >"$tmp" && mv "$tmp" "$zshrc"

		# Only the marked block is ours to remove, so a hand-copied reference to
		# the same directory survives it — and `.trial/` goes on the next line,
		# leaving that fpath entry pointing at nothing. Name it rather than
		# delete a line the user wrote.
		if grep -qF "$compdir" "$zshrc"; then
			echo "! $zshrc still names $compdir outside the ${marker} block:" >&2
			grep -nF "$compdir" "$zshrc" >&2
			echo "  That directory is about to go; remove those lines by hand." >&2
		fi
	fi

	rm -rf "$root/.trial"
	state="$(installed_state)"

	if [ -n "$version" ]; then
		# The exact version the trial displaced, not whatever is newest: a trial
		# should hand back the install it borrowed.
		npm rm -g "$pkg" || true
		npm i -g "$pkg@$version"
	elif [ -n "$state" ] && [ "$state" != "linked" ]; then
		# Nothing is linked, so no trial is running and this install is someone's
		# own choice. Reinstalling here would replace it with whatever is newest,
		# which is the outcome the recorded version exists to prevent.
		echo "No trial to revert; $pkg@$state is installed from the registry. Leaving it alone."
	else
		npm rm -g "$pkg" || true
		echo "No recorded version to come back to; installing the latest $pkg."
		npm i -g "$pkg"
	fi

	echo
	echo "Reverted. Open a new terminal, then \`git fi --version\` to confirm."
	;;
*)
	echo "usage: npm run trial:on | npm run trial:off" >&2
	exit 1
	;;
esac
