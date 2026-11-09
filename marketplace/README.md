# LaTeX Studio distribution

LaTeX Studio is distributed from the public repository at <https://github.com/violector/dsh-latex-studio>. The supported managed compiler currently runs on Windows. The tested desktop is DeepSeek Harness Desktop 0.2.2-rc.1.

## Install

```sh
dsh plugin --profile desktop add 'git+https://github.com/violector/dsh-latex-studio.git#v0.3.10'
```

Alternatively, download the `.tgz` from GitHub Releases and install that file. Restart dsh after installation. On first use, install the managed compiler from LaTeX Studio.

## Discover index

Enable the experimental **Custom plugin indexes** bundle in dsh, open **Plugins → Discover**, and add:

```text
https://raw.githubusercontent.com/violector/dsh-latex-studio/main/marketplace/index.json
```

This is the project's own public index. The [official dsh guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md) explains index hosting and installation. The index pins the published package to a full Git commit, includes its actual publication timestamp and `engines.dsh`, and uses the bundled SVG icon.

## Release maintenance

1. Update the package version, metadata and installation instructions. Retain the original third-party author kits, copyright and license notices; the project's MIT license covers its own code only. Template provenance and declared terms are recorded in `templates/*/SOURCE.json` and `THIRD_PARTY_NOTICES.md`.
2. Run `npm ci --legacy-peer-deps`, `npm test` and `npm run build`. Template or compiler changes also require `npm run test:compile`; client changes require a packaged desktop UI check using a new disposable manuscript.
3. Run `npm pack --pack-destination ../dsh-latex-releases`. Commit and push the source and generated `dist/` files, then verify an installation of that public commit in an isolated dsh profile. Git installations use the built entries directly: do not add `prepare`, `prepack` or other install-time build scripts, which trigger pnpm's Git-dependency build allowlist. After installation passes, create the version tag and publish a GitHub Release containing the tested `.tgz` and checksum file.
4. Generate the index from the release commit and the GitHub Release publication time, in Unix seconds:

   ```sh
   npm run market:index -- <40-character-commit> <publication-unix-seconds>
   ```

   The script validates the result with the official `@deepseek-ai/dsh-plugin-market-index` parser. Commit `marketplace/index.json` to the default branch, then fetch its public URL and validate the response again. The index commit follows the release commit, so its Git source always refers to an existing immutable release.
5. Never install the development directory through `dsh plugin add`. The generated live index is hosted separately and excluded from release packages so a package cannot contain a stale index pointing to a different release.

## Community discovery

The repository carries the `dsh-plugin` and `deepseek-harness` topics so community catalogues can discover it. Community listing is separate from publishing a working plugin and public format-1 index.

The [Awesome DSH Plugin contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) accepts one YAML entry at `data/plugins/violector__dsh-latex-studio.yml` in the `docs` category. As checked on 2026-11-09, that registry requires a public repository at least one day old and maintainer review. The submission entry lives in `marketplace/community-entry.yml`; a draft submission does not mean the registry has approved or listed the plugin.
