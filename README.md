# git-fi

A git plugin that maintains a temporary integration branch named `fi`. Merge multiple in-progress feature branches together to detect conflicts early and test features in collaboration — before they land on `main`.

**[Documentation](https://gettyimages.github.io/git-fi/)** | **[Specification](SPEC.md)**

## Install

git-fi is a git subcommand: once the `git-fi` binary is on your `PATH`, invoke it as `git fi`. Requires Node.js >= 18 and git >= 2.50.0.

### From npm

```bash
npm install -g @gettyimages/git-fi
```

Or run it without installing:

```bash
npx @gettyimages/git-fi --help
```

### From source

```bash
git clone https://github.com/gettyimages/git-fi.git
cd git-fi
npm install -g .   # or: yarn global add file:.
```

The `prepare` script compiles TypeScript on install, so `git fi` is ready right after.

## Development

```bash
npm start -- -a my-branch   # run from source via tsx
npm run build               # compile TypeScript to dist/
npm test                    # build, then run the integration suite
```

The test suite drives the compiled binary against throwaway git repositories (a bare `origin` plus a working clone), so it exercises real `git fetch`/`merge`/`push` behavior end-to-end.

The implementation follows [SPEC.md](SPEC.md), which defines every requirement with a unique ID and includes mermaid diagrams for the major flows.

## Project Structure

```text
SPEC.md        Behavioral specification
src/           TypeScript implementation
docs/          Docsify documentation site
```

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/gettyimages/git-fi/issues).

## License

[MIT](LICENSE) — Copyright (c) 2017-2026 Getty Images.
