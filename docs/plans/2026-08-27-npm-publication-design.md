# Public npm package design

## Goal

Publish the integrated public fork as `@timiliang/pi-quotas` so other Pi users can install it with `pi install npm:@timiliang/pi-quotas`. The release must preserve upstream attribution, point users to the public fork, and be reproducible from the fork's default branch and Git tag.

## Package identity

The first fork release is `@timiliang/pi-quotas@0.5.0`. The minor version communicates that it extends upstream `0.4.0` without intentionally breaking existing configuration. The original author remains in `author`; `LJC-god` is added as a contributor and fork maintainer. The MIT license is unchanged.

Repository, bugs, homepage, and Pi image URLs point to `https://github.com/LJC-god/pi-quotas`. A short description identifies the provider quota dashboard, active-provider footer, Grok, GLM China, and guided OpenCode Go setup. `publishConfig` pins the official npm registry and public access so the machine's configured npm mirror cannot receive the publish operation.

## Documentation and source alignment

The README title, npm install command, one-off invocation, and clone URL use the new package and fork. An attribution note links the upstream project. The integration branch is the development source; after verification it fast-forwards the fork's public `main`, ensuring npm metadata and the default GitHub view match the published package.

## Release sequence

Metadata and documentation are committed before publication. The complete test suite, type check, lint, diff check, `npm pack --dry-run`, and `npm publish --dry-run` must pass. The integration branch and `main` are then pushed to the exact release commit. `npm publish --access public --registry https://registry.npmjs.org` publishes the immutable artifact. Only after registry verification is `v0.5.0` created and pushed, preventing a release tag from claiming an npm publication that did not succeed.

## Failure and security handling

The npm authentication token remains in npm's credential storage and is never read or printed. If validation or publication fails before the registry accepts the version, fix and retry without tagging. If the registry accepts the package, its version is immutable; any later correction uses a new patch version. Verification reads the public registry response and compares its version, repository, and tarball contents with the committed package.

## Local adoption

After publication, back up Pi's settings and install `npm:@timiliang/pi-quotas@0.5.0`. Pi should replace the Git source for the same functional plugin rather than keep two quota packages. Final checks require one quota package entry, a discoverable npm installation, and the two-step OpenCode Go command in the installed artifact.
