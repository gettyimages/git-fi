# git-fi task runner.
#
# Every recipe delegates to the matching npm script rather than restating its
# command line: package.json stays the single source of truth, so a change there
# can't leave a stale copy here. npm remains the supported path — CI and
# `prepublishOnly` call it directly — and this is the shorthand for local work.

# List available recipes
default:
    @just --list

# Install dev dependencies (tsx, typescript)
install:
    npm install

# Run git-fi from src/ via tsx: `just run --help`
run *ARGS:
    npm start -- {{ARGS}}

# Compile TypeScript to dist/ and regenerate the man page, completions, and docs tables
build:
    npm run build

# Typecheck, check generated files are current, then run the integration suite
test:
    npm test

# Regenerate man/, completions/, and the docs reference tables from src/help.ts
gen:
    npm run gen:docs

# Fail if any committed generated file no longer matches what the generator writes
verify:
    npm run verify:generated

# Build, link this checkout onto PATH as `git fi`, and load its completions
trial-on:
    npm run trial:on

# Unlink the checkout and reinstall the published @gettyimages/git-fi
trial-off:
    npm run trial:off

# Trace every git command with its elapsed time: `just debug --add my-branch`
debug *ARGS:
    npm start -- --debug {{ARGS}}

# Remove build output and the trial directory
clean:
    rm -rf dist .trial
