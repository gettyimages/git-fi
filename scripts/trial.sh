#!/usr/bin/env bash
# Local trial helper (pnpm run trial:on / trial:off). Points `git fi` at this
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

# pnpm's global commands, run from outside the checkout. Inside it pnpm sees the
# `packageManager` pin and warns on every one that --global skips that check,
# which is about this project rather than the global directory being changed.
pnpm_g() {
	pnpm --dir "$HOME" "$@" -g
}

# What the global install is right now: a version for a registry install,
# `linked` where it already points at a checkout, or empty where the package is
# absent. Linking the checkout overwrites that install, so the answer has to be
# taken before it runs and kept for `off` to restore. `pnpm ls` can exit
# non-zero while still printing usable JSON, so its status is discarded rather
# than aborting the run under `pipefail`.
installed_state() {
	{ pnpm_g ls --depth=0 --json 2>/dev/null || true; } | node -e '
		const fs = require("fs");
		const raw = fs.readFileSync(0, "utf8");
		try {
			const dep = JSON.parse(raw)
				.map((tree) => (tree.dependencies ?? {})[process.argv[1]])
				.find(Boolean);
			if (!dep) process.exit(0);
			// pnpm reports a linked checkout with the version its package.json
			// holds, so the version alone cannot tell the two apart. A registry
			// install resolves into a node_modules (the global directory or the
			// store); a linked one resolves to the checkout itself.
			const real = fs.realpathSync(dep.path);
			if (!/[\\/]node_modules[\\/]/.test(real)) process.stdout.write("linked");
			else if (dep.version) process.stdout.write(dep.version);
		} catch (e) {
			process.stderr.write(`could not read the global ${process.argv[1]}: ${e.message}\n`);
		}
	' "$pkg"
}

case "${1:-}" in
on)
	cd "$root"

	# installed_state sees only pnpm's global directory. A copy installed with
	# npm would sit beside the link rather than be replaced by it, and trial:off
	# would then add a second copy instead of handing the first one back.
	if command -v npm >/dev/null && npm ls -g --depth=0 "$pkg" >/dev/null 2>&1; then
		echo "! $pkg is installed with npm, so a pnpm trial would sit beside it rather than replace it." >&2
		echo "  Remove it first (npm rm -g $pkg), then re-run." >&2
		exit 1
	fi

	# pnpm refuses a global add while its bin directory is off PATH, which is the
	# state of any terminal opened before `pnpm setup` edited the rc file. Asked
	# here, before the build and before anything lands under .trial/:
	# `pnpm bin -g` makes the same check and prints pnpm's own error.
	if ! pnpm_g bin >/dev/null; then
		echo "! Run \`pnpm setup\` if you never have, then open a new terminal (or \`exec zsh\`) and re-run." >&2
		exit 1
	fi

	pnpm run build

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

	# A directory added globally is saved as a `link:` dependency, so later
	# builds take effect without reinstalling (pnpm 12 has no `link --global`).
	pnpm_g add "$root"

	# install-completions tells a user how to get the directory onto their fpath;
	# the block below is how the trial does that, so its advice is noise here.
	node "$root/dist/index.js" install-completions --write "$compdir" >/dev/null

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

	# `pnpm add -g <pkg>@<spec>` takes far more than a version — a URL, a git
	# ref, a `file:` path, an `npm:` alias — and this value comes off disk. Anything
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
		pnpm_g rm "$pkg" || true
		pnpm_g add "$pkg@$version"
	elif [ -n "$state" ] && [ "$state" != "linked" ]; then
		# Nothing is linked, so no trial is running and this install is someone's
		# own choice. Reinstalling here would replace it with whatever is newest,
		# which is the outcome the recorded version exists to prevent.
		echo "No trial to revert; $pkg@$state is installed from the registry. Leaving it alone."
	else
		pnpm_g rm "$pkg" || true
		echo "No recorded version to come back to; installing the latest $pkg."
		pnpm_g add "$pkg"
	fi

	echo
	echo "Reverted. Open a new terminal, then \`git fi --version\` to confirm."
	;;
*)
	echo "usage: pnpm run trial:on | pnpm run trial:off" >&2
	exit 1
	;;
esac
