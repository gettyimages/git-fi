# git-fi task runner.
#
# Every recipe delegates to the matching npm script rather than restating its
# command line: package.json stays the single source of truth, so a change there
# can't leave a stale copy here. npm remains the supported path — CI and
# `prepublishOnly` call it directly — and this is the shorthand for local work.

# What this is, and every recipe there is
[private]
default:
    @echo ""
    @echo "  git-fi: the git subcommand that keeps fi, an integration branch of in-flight work"
    @echo ""
    @echo "  New here?   just install, then just test"
    @echo ""
    @just --list --unsorted --list-heading '' --list-prefix '    '
    @echo ""
    @echo "  Most recipes call an npm script; package.json is where each command is defined."

# Install dev dependencies (tsx, typescript)
[group('start here')]
install:
    npm install

# Run git-fi from src/ via tsx: `just run --help`
[group('start here')]
run *ARGS:
    npm start -- {{ARGS}}

# Run with every git command traced and timed: `just run-debug --add my-branch`
[group('start here')]
run-debug *ARGS:
    npm start -- --debug {{ARGS}}

# Typecheck, check generated files are current, then run the integration suite
[group('start here')]
test:
    npm test

# Serve the docs site locally at http://127.0.0.1:3000/
[group('docs')]
docs:
    npm run docs

# Compile TypeScript to dist/ and regenerate the man page, completions, and docs tables
[group('build and generate')]
build:
    npm run build

# Regenerate man/, completions/, and the docs reference tables from src/help.ts
[group('build and generate')]
gen:
    npm run gen:docs

# Fail if any committed generated file no longer matches what the generator writes
[group('build and generate')]
check-generated:
    npm run verify:generated

# Build, link this checkout onto PATH as `git fi`, and load its completions
[group('try it as git fi')]
trial-on:
    npm run trial:on

# Unlink the checkout and restore the @gettyimages/git-fi version it replaced
[group('try it as git fi')]
trial-off:
    npm run trial:off

# Remove build output and the trial directory
[group('tidy')]
clean:
    rm -rf dist .trial
