# Notes for coding agents

## Keep `.qa-runs` small

Every copy of `Luma Keys.app` is about 6 GB, because the companion model ships inside it. Releases used to leave several copies in each run folder (the previous installed app plus verified, reviewed and in-flight candidates), and by October 2026 they had filled the disk with about 380 GB of copies. So `.qa-runs` keeps at most two app copies, each in a fixed place:

- `.qa-runs/rollback/Luma Keys.app` is a copy of the installed app taken right before the latest install, to roll back to. Replace it instead of adding versioned copies:
  `rm -rf ".qa-runs/rollback/Luma Keys.app" && ditto "/Users/prince/Desktop/Luma Keys.app" ".qa-runs/rollback/Luma Keys.app"`
- `.qa-runs/staged/Luma Keys.app` is a tested build that has to wait to be installed. Delete it once it is installed or superseded.

Test candidates in place at `release/mac-arm64/Luma Keys.app`, and record their version and ASAR hash in `evidence/` instead of keeping copies. Don't copy model files (`*.gguf`) into `.qa-runs` either; point at `engines/`.

`npm run qa:prune` deletes every other app copy in `.qa-runs` (`npm run qa:prune -- --dry-run` lists them first). Run it when a run ends. `npm run pack` also runs it for copies more than a day old.

Older `STATUS.md` entries point at app copies inside run folders. Those were removed on 2026-10-26; the rollback copy is the only one left.
