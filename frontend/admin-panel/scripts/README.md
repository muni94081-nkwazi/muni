# One-shot scaffolding scripts

These three Python scripts generated the initial admin-panel component tree.
They ran once, in that order, and are kept only as a record of how the initial
files were produced.

**Do not run them.**

- They write with `open(..., "w")` and no existence check, so every file they
  touch is overwritten. Everything under `src/components/` has been edited by
  hand since, and running one would silently revert that work.
- `base_dir` is hardcoded to an absolute path from the machine they were
  written on (`c:\PROJECTS\Projects\MUNI\...`), so on any other checkout they
  either fail or write outside the repository.
- They are not part of the build. Nothing in `package.json`, CI, or the Vite
  config references them.

They were moved here from the package root, where their presence implied they
were a supported part of the build. Deleting them outright is also fine — the
history has them either way.
