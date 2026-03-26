# git-fi

A git plugin that maintains a temporary integration branch named `fi`. Merge multiple in-progress feature branches together to detect conflicts early and test features in collaboration — before they land on `main`.

**[Documentation](https://gettyimages.github.io/git-fi/)** | **[Specification](SPEC.md)**

## Install

Requires Node.js >= 18 and git >= 2.50.0.

```bash
git clone https://github.com/gettyimages/git-fi.git
cd git-fi
npm install -g .   # or: yarn global add file:.
```

## Development

```bash
npm start -- -a my-branch   # run from source via tsx
npm run build               # compile TypeScript to dist/
```

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
