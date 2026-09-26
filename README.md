# experiments

Each experiment lives on its own branch and deploys to its own path on the
repo's GitHub Pages site. `main` holds only the landing page and the shared
deploy workflow.

| Experiment | Branch | URL |
|---|---|---|
| assemble — molecular self-assembly simulator | [`assemble`](../../tree/assemble) | https://ericrosenbaum.github.io/experiments/assemble/ |
| sleep spectrogram | [`spectrogram`](../../tree/spectrogram) | https://ericrosenbaum.github.io/experiments/spectrogram/ |
| Oh My Eyes — letter-dice picture game | [`oh-my-eyes`](../../tree/oh-my-eyes) | https://ericrosenbaum.github.io/experiments/oh-my-eyes/ |

Landing page: https://ericrosenbaum.github.io/experiments/

## How deploys work

GitHub Pages serves the `gh-pages` branch. Each experiment branch has a small
`.github/workflows/deploy.yml` that, on every push to that branch, calls the
reusable workflow [`publish-experiment.yml`](.github/workflows/publish-experiment.yml)
on `main`. It builds the experiment (if it has a build step) and replaces
only `gh-pages/<name>/`, so experiments deploy independently of each other.
Pushes to `main` that touch `site/` redeploy the landing page at the root
(`deploy-site.yml`), leaving the experiment folders alone.

## Adding an experiment

1. Create a branch (an orphan branch if it shares nothing with the others):
   `git checkout --orphan my-thing`
2. Add `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy
   on:
     push:
       branches: [my-thing]
     workflow_dispatch:
   jobs:
     deploy:
       permissions:
         contents: write
       uses: ericrosenbaum/experiments/.github/workflows/publish-experiment.yml@main
       with:
         name: my-thing           # URL path: /experiments/my-thing/
         # build: npm run build   # omit for plain static files
         # dist: dist             # directory to publish (default: repo root)
   ```

   Built sites must use relative asset paths (Vite: `base: './'`), since they
   are served from a subfolder.
3. Push the branch, then add a line for it to `site/index.html` and this
   README on `main`.

To take an experiment down, delete its folder from `gh-pages` (and its
deploy workflow, or the next push brings it back).
