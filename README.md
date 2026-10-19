# Canevas Studio

**Understand and improve Power Apps canvas app screens with AI — while you review every change.**

In Power Apps Studio, **Copy code** gives you the YAML of a screen. Paste it into Canevas Studio to see how it renders, ask an AI assistant (Claude, ChatGPT, Azure OpenAI, Gemini or Mistral) to explain or modify it, review each change as a before/after diff, then paste the YAML back into Power Apps.

Canevas Studio is not a full designer: it is a fast companion for reading, checking and editing canvas screens with AI, built with Next.js and React (plain JavaScript and CSS).

## Highlights

- **Close-to-real preview** of the screen: modern and classic controls, auto-layout containers, galleries, forms and component instances.
- **YAML editor** with syntax highlighting and YAML / Power Fx errors at the exact line.
- **AI assistant** whose suggestions are validated and shown as diffs before you apply them in one click (Ctrl+Z to undo).
- **Changes view** comparing your work with the YAML originally pasted from Power Apps.
- **App checker**, **interactive preview** (F5) with a Power Fx emulator, **mock data**, **Dataverse** import and **Power Automate** mocks.
- Available in **English, French and Spanish**, with a short guided tour and a built-in guide.

## Getting started

Requirements: [Node.js](https://nodejs.org/) 20.9 or later.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3210>, create an app, then paste the YAML of a screen (Ctrl+V) or import YAML / ZIP files. A welcome window and a five-step guided tour help you get started; the guide stays available from the **?** button.

Other commands:

```bash
npm test
```

```bash
npm run build
```

## Workflow with Power Apps

1. In Power Apps Studio, right-click a screen in the tree view and select **Copy code**.
2. In Canevas Studio, paste with **Ctrl+V** (or **Paste YAML**). This YAML becomes the screen's **baseline**.
3. Look at the screen in **Preview**, read its **YAML**, and ask the **AI assistant** to explain or change it. Each suggestion appears as a before/after comparison and is applied in one click.
4. In the **Changes** view, review everything that changed since the baseline.
5. Click **Copy for Power Apps**, paste the code back into Power Apps Studio (right-click in the tree view › **Paste code**), then **set the current state as baseline**.

The generated YAML follows Power Apps conventions (alphabetically sorted properties, `|-` blocks for multi-line formulas, 2-space indentation). A read/write round trip produces a byte-identical file, which is covered by the tests on the screens in `tests/fixtures`.

## AI assistant

Open the assistant settings (⚙ button in the AI pane) to choose a provider, enter an API key and pick a model.

| Provider | What you need |
| --- | --- |
| Anthropic Claude | API key |
| OpenAI ChatGPT | API key |
| Azure OpenAI | Resource endpoint (`https://my-resource.openai.azure.com`, or just the resource name), resource key and deployment name |
| Google Gemini | API key |
| Mistral AI | API key |

- **Context sent with each request**: the current screen's YAML, the selected control, the App formulas, the data schema, flows and the checker's errors. You can also attach images, such as a mockup to reproduce.
- **Verified suggestions**: every YAML or formula block is parsed and validated, then shown as a diff against the current YAML (screen, replaced control, inserted controls, formula, components or App).
- **Verified models**: as soon as a key is entered, the studio lists the provider's models and sends each one a minimal request; only models that answer are offered. For Azure OpenAI, deployments cannot be listed with a key, so only the deployment you enter is checked. Calls use the resource's v1 API (`/openai/v1/chat/completions` with the `api-key` header).
- **Reasoning and timeouts**: choose the reasoning level (deep, standard, fast, minimal). If no text arrives within the chosen delay (60 s by default), the request is retried with simpler reasoning; generation stops after 45 s without data or after the maximum duration (300 s by default), keeping the beginning of the answer.
- The assistant answers in the interface language.

API keys can also be provided on the server side in `.env.local`:

```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com
```

## Features

### Three views of a screen

- **Preview** (default): the rendered screen. Click a control to select it; double-click it to show its YAML.
- **YAML**: the YAML of the screen, the App (OnStart, Formulas…) or the components. The selected control is highlighted, and moving the cursor in the YAML selects the matching control. Changes are applied as soon as the YAML is valid (Ctrl+S applies them right away); invalid YAML is never applied.
- **Changes**: a line-by-line comparison with the baseline, with the changed part of each line highlighted.

### Projects and screens

- Several projects, saved automatically in the browser (IndexedDB).
- Several screens per project, with a tree view to navigate, duplicate, reorder or delete screens and copy the YAML of a control.
- Import `.yml`, `.pa.yaml`, `.zip` and `canevas-project.json` files. ZIP export: one YAML file per screen, plus `App.pa.yaml`, the components and the metadata (data sources, mocks, settings).
- **App checker**: YAML structure, control types and versions, duplicate names, Power Fx syntax, argument counts, misplaced behavior functions, unknown names, unmocked external calls and unknown component properties. Click an issue to jump to its line.

### Interactive preview (F5)

Runs the formulas: variables (`Set`, `UpdateContext`), collections, `Navigate`/`Back`, `Patch`, `SubmitForm`, `Notify`, `Select`, timers, `App.OnStart`, `OnVisible`, named formulas, component events and properties… The **Variables** pane shows the runtime state. **Alt+click** runs an action directly in the Preview view.

### Data and flows

- **Mock tables**: manual entry, CSV/JSON import, sample row generation and automatic detection of the data sources used by formulas.
- **Dataverse**: sign in with a device code, an app secret or a pasted token, then import table metadata and rows. **Writes stay local**: `Patch`, `SubmitForm`, `Remove`… never modify Dataverse.
- **Power Automate and actions**: detection of `MyFlow.Run(…)`, `Environment.MyAction({…})` and connector calls; mock them with a fixed JSON response, a local script, a real HTTP trigger call or an unbound Dataverse action; import the environment's cloud flows; run log.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+V | Paste Power Apps YAML (screen, App, components or controls) |
| Ctrl+C | Copy the YAML of the selected item |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S (YAML view) | Apply the YAML right away |
| Double-click (Preview) | Show the control's YAML |
| F5 / Esc | Open / close the interactive preview |
| Alt + click | Run an action in the Preview view |
| Ctrl + mouse wheel | Zoom |

## Languages

The interface is available in **English**, **French** and **Spanish**. On the first visit it follows the browser language (English when that language is not available); change it from the home page or the **…** menu of the studio. The choice is stored in a `lang` cookie.

The language of the **emulated app** (`Language()`, `Text()` formats, month names…) is a separate setting in the app settings; new projects use the interface language.

### Adding a language

1. Copy `lib/i18n/messages/en/` to `lib/i18n/messages/<code>/` and translate each file (one file per area: `home`, `studio`, `ai`, `data`, `validation`, `fx`, `help`…). Keys and `{param}` placeholders must stay the same; plurals are written `{ one: '…', other: '…' }`.
2. Declare the language in `lib/i18n/index.js` (`LOCALES`, `LOCALE_NAMES`, `INTL_LOCALES` and the messages import).
3. Run `npm test`: `tests/i18n.test.js` checks that every language has the same keys and placeholders, and that every key used in the code exists.

## Privacy and security

- Projects live in your browser (IndexedDB). Export them as ZIP files to back them up or share them.
- API keys and Dataverse credentials are stored in this browser's `localStorage` and only sent to the Canevas Studio server (local or your own deployment), which calls the provider you chose. If you host an instance, its users send their keys through your server.
- The app is desktop-only: on phones, touch tablets, in portrait mode or in a window smaller than 1024 × 500 pixels, a message replaces the editor (your work is kept).

## Deploying to Cloudflare Workers

Canevas Studio runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with the [OpenNext adapter](https://opennext.js.org/cloudflare). The configuration is in `wrangler.jsonc` (Worker name, `nodejs_compat` flag) and `open-next.config.ts`; no cache or storage binding is needed because every page is rendered on demand.

Test the production build locally in the Workers runtime (<http://localhost:8787>):

```bash
npm run preview
```

Deploy from your computer:

```bash
npx wrangler login
```

```bash
npm run deploy
```

The app is then available at `https://canevas-studio.<your-subdomain>.workers.dev`. You can also connect the GitHub repository in the Cloudflare dashboard (**Workers & Pages › Create › Import a repository**) and set the deploy command to `npm run deploy`, so that every push to `main` is deployed.

- **Plan**: the Workers Free plan allows 10 ms of CPU time per request, which server rendering may exceed. If you get “Worker exceeded CPU time limit” errors, switch to Workers Paid.
- **Server-side API keys**: do not add provider keys (`ANTHROPIC_API_KEY`…) as secrets on a public instance — anyone could use them through `/api/ai`. If you need them, restrict access to the Worker with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/).
- **Windows**: OpenNext recommends building from WSL; builds from Windows work but are not officially supported.

## Project structure

```
app/                    Next.js pages (home, studio) and API routes
  api/ai                Streaming AI proxy (Claude, OpenAI, Azure OpenAI, Gemini, Mistral)
  api/ai/models, probe  Model listing and per-model checks with the key
  api/dataverse         Dataverse Web API proxy and Entra ID authentication
  api/flow              Power Automate HTTP trigger calls
components/
  studio/               Studio UI: Preview / YAML / Changes views, AI assistant, panes
  controls/             React rendering of Power Apps controls
  help/                 Welcome window, guided tour and guide
lib/
  pa/                   Power Apps YAML reader / writer, control locations in the text
  diff/                 Line diff (Changes view, AI suggestions)
  fx/                   Power Fx engine: lexer, parser, evaluator, ~200 functions
  catalog/              Control catalog (types, versions, defaults) and enums
  render/               Instance tree and layout engine
  runtime/              Runtime state: variables, collections, navigation, behaviors
  data/                 Mock data sources, data source detection
  dataverse/            Dataverse client (browser)
  validation/           App checker and diagnostics located in the YAML
  project/              Project model, component custom properties
  ai/                   System prompt, applying suggested blocks, providers (checks, reasoning)
  i18n/                 Translations: language choice, messages per language and area
  help/                 Guided tour steps, guide topics, tour bubble placement
tests/                  node:test tests (YAML round trip, Power Fx, rendering, components, diff, translations…)
  fixtures/             Fictional screen and component YAML used by the tests
```

## Known limitations

- Power Fx is **emulated**: types are more permissive than in Power Apps and delegation is not simulated. A few functions are not emulated and are reported as such.
- The rendering is **close to, but not identical to**, Power Apps: fonts, modern themes and control details may differ.
- A component instance (`CanvasComponent`) whose definition is missing is shown as a placeholder: paste the `ComponentDefinitions:` YAML to render it. Component libraries (`ComponentLibraryUniqueName`) are not loaded.

## Contributing

Issues and suggestions are welcome. Please open an issue to discuss a change before submitting a pull request; all changes are reviewed by the maintainer before being merged.

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Nolann Morencé ([exagyde](https://github.com/exagyde)).

Power Apps, Power Automate, Dataverse and Azure are trademarks of Microsoft. Canevas Studio is an independent project and is not affiliated with or endorsed by Microsoft.
