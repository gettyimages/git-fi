# git-fi

A git plugin that maintains a temporary integration branch named `fi`. Merge multiple in-progress feature branches together to detect conflicts early and test features in collaboration — before they land on `main`.

**[Documentation & install](https://gettyimages.github.io/git-fi/#/quickstart)** | **[Specification](SPEC.md)**

This README is for working on git-fi itself. To install and use it, see the [documentation site](https://gettyimages.github.io/git-fi/#/quickstart).

## Local development

Requires Node.js >= 18 and git >= 2.50.0.

```bash
git clone https://github.com/gettyimages/git-fi.git
cd git-fi
npm install                 # dev dependencies (tsx, typescript)
```

Day-to-day, git-fi runs straight from source — no global install needed:

```bash
npm start -- --help         # run src/ directly via tsx
npm run build               # compile TypeScript to dist/
npm test                    # build, then run the integration suite
```

`npm test` is the primary feedback loop: it drives the compiled binary against throwaway git repositories (a bare `origin` plus a working clone), exercising real `git fetch`/`merge`/`push` behavior end-to-end.

To try your local build as the `git fi` subcommand in another repository, install the checkout globally:

```bash
npm install -g .            # puts your build on PATH as `git fi`
```

The published package — `npm install -g @gettyimages/git-fi`, documented on the [docs site](https://gettyimages.github.io/git-fi/#/quickstart) — is the official install for end users. Reach for it here mainly to test the distribution itself; local development runs from source.

The implementation follows [SPEC.md](SPEC.md), which defines every requirement with a unique ID and includes mermaid diagrams for the major flows.

## Project Structure

```text
SPEC.md        Behavioral specification
STATUS.md      Requirement coverage
src/           TypeScript implementation
test/          Integration suite (Node test runner)
docs/          Docsify documentation site
```

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/gettyimages/git-fi/issues).

## License

[MIT](LICENSE) — Copyright (c) 2017-2026 Getty Images.
