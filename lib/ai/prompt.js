// Construction du prompt système et du contexte envoyés à l'assistant IA.
// Le prompt et le contexte, destinés au modèle, restent en français ; seule la langue de réponse suit l'interface.
import { CONTROLS } from '../catalog/controls.js';
import { t, getLocale } from '../i18n/index.js';
import { walkNodes, screenYaml, controlsYaml, appYaml } from '../project/model.js';
import { splitControlType } from '../catalog/controls.js';
import { customPropertyList, kindInfo } from '../project/customProps.js';

const TYPE_LABELS = { text: 'Texte', memo: 'Texte long', number: 'Nombre', money: 'Devise', bool: 'Oui/Non', datetime: 'Date/heure', date: 'Date', choice: 'Choix', multichoice: 'Choix multiples', lookup: 'Recherche', guid: 'Identifiant', email: 'E-mail', url: 'URL', phone: 'Téléphone', image: 'Image' };

/** Types de contrôles utilisés dans le projet (versions exactes à réutiliser) */
function usedControlTypes(project) {
  const m = new Map();
  for (const s of [...(project.screens || []), ...(project.components || [])]) {
    for (const { node } of walkNodes(s.children)) {
      const t = node.head?.Control;
      if (!t) continue;
      const k = `${t}${node.head.Variant ? ` (Variant: ${node.head.Variant})` : ''}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function catalogText() {
  const lines = [];
  for (const def of CONTROLS) {
    if (!def.insertOptions) continue;
    for (const opt of def.insertOptions) {
      const keyProps = def.props
        .filter((p) => !['X', 'Y', 'Width', 'Height', 'Visible', 'DisplayMode', 'TabIndex', 'ContentLanguage', 'AccessibleLabel', 'Tooltip'].includes(p.name) && !/^(Radius|Padding|Border|Focused|Layout(Min|Max)|AlignInContainer|FillPortions)/.test(p.name))
        .slice(0, 14)
        .map((p) => p.name);
      lines.push(`- ${opt.head.Control}${opt.head.Variant ? ` Variant: ${opt.head.Variant}` : ''} — ${opt.label}${def.uncertainVersion ? ' (version à confirmer)' : ''} : ${keyProps.join(', ')}${def.outputs ? ` | sorties : ${def.outputs.join(', ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

function dataText(project) {
  const ds = project.dataSources || [];
  if (!ds.length) return 'Aucune source de données déclarée dans l’émulateur.';
  return ds
    .map((d) => {
      const cols = (d.columns || [])
        .slice(0, 80)
        .map((c) => {
          let s = `'${c.displayName || c.name}'`;
          if (c.displayName && c.displayName !== c.name) s += ` [${c.name}]`;
          s += ` : ${TYPE_LABELS[c.type] || c.type}`;
          if (c.options?.length) s += ` {${c.options.slice(0, 12).map((o) => o.label).join(' | ')}}${c.optionSetName ? ` (jeu d’options '${c.optionSetName}')` : ''}`;
          if (c.type === 'lookup' && (c.targets?.length || c.targetName)) s += ` → ${c.targets?.join('/') || c.targetName}`;
          return s;
        })
        .join(', ');
      return `- ${d.name}${d.kind === 'dataverse' ? ` (Dataverse ${d.logicalName}, clé ${d.primaryKey}, nom principal ${d.primaryName})` : ' (table simulée)'} — ${(d.rows || []).length} ligne(s) — colonnes : ${cols}`;
    })
    .join('\n');
}

function flowsText(project) {
  const fl = project.flows || [];
  if (!fl.length) return 'Aucun flux / action externe configuré.';
  return fl
    .map((f) => {
      const args = (f.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
      let out = '';
      try {
        out = f.mockResponse ? ` → renvoie ${JSON.stringify(Object.keys(JSON.parse(f.mockResponse)))}` : '';
      } catch {
        out = '';
      }
      return f.kind === 'customapi' ? `- ${f.callName}({ ${args} })${out}` : `- ${f.callName}(${args})${out}`;
    })
    .join('\n');
}

function componentsText(project) {
  const comps = project.components || [];
  if (!comps.length) return 'Aucun composant dans le projet.';
  return comps
    .map((c) => {
      const props = customPropertyList(c).map((cp) => {
        const type = kindInfo(cp.kind).typed === 'data' ? cp.dataType : cp.returnType;
        const params = cp.params.length ? `(${cp.params.map((x) => `${x.name}: ${x.dataType}`).join(', ')})` : '';
        return `${cp.name}${params} [${cp.kind}, ${type || '?'}]`;
      });
      return `- ${c.name} : ${props.length ? props.join(' ; ') : 'aucune propriété personnalisée'}`;
    })
    .join('\n');
}

// Consigne de langue de réponse, selon la langue de l'interface
const KEEP_CODE = 'y compris les explications ; le YAML, les noms d’écrans, de contrôles et de propriétés et les formules Power Fx restent inchangés.';
const ANSWER_LANGUAGE = {
  fr: 'Réponds en français.',
  en: `Réponds en anglais (langue de l’interface de l’utilisateur), ${KEEP_CODE}`,
  es: `Réponds en espagnol (langue de l’interface de l’utilisateur), ${KEEP_CODE}`,
};

export function buildSystemPrompt(project) {
  const used = usedControlTypes(project);
  return `Tu es un expert Microsoft Power Apps (Canvas Apps) et Power Fx qui assiste un développeur dans « Canevas Studio », un outil qui affiche le YAML des écrans Power Apps (le format obtenu par « Copier le code » dans Power Apps Studio) et son rendu, pour l'analyser et le modifier avant de le recoller dans Power Apps. Réponds de façon concise et concrète.

# Format YAML Power Apps (pa.yaml) — règles strictes
- Un écran :
\`\`\`yaml
Screens:
  NomEcran:
    Properties:
      Fill: =RGBA(255, 255, 255, 1)
      OnVisible: =UpdateContext({ locVar: false })
    Children:
      - conPrincipal:
          Control: GroupContainer@1.5.0
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.Vertical
            Width: =Parent.Width
            Height: =Parent.Height
          Children:
            - lblTitre:
                Control: ModernText@1.0.0
                Properties:
                  Text: ="Bonjour"
\`\`\`
- Chaque élément de Children est « - NomUnique: » suivi de Control (Type@version), éventuellement Variant / Layout / ComponentName / MetadataKey, puis Properties puis Children.
- TOUTES les valeurs de Properties sont des formules Power Fx préfixées par « = » (texte : ="abc", nombre : =12, booléen : =true, couleur : =RGBA(0, 120, 212, 1)). Une valeur vide s’écrit « = ».
- Formules multilignes ou contenant « : » suivi d’un espace : bloc littéral « |- » (indentation de 2 espaces de plus que la clé). Indentation YAML de 2 espaces ; les éléments de liste « - » sont indentés de 2 sous Children.
- Trie les propriétés par ordre alphabétique (comme Power Apps). N’ajoute que les propriétés qui diffèrent des valeurs par défaut.
- Les noms de contrôles et d’écrans sont UNIQUES dans toute l’application. Préfixes : scr, con, gal, frm, dc, btn, lbl, txt, cmb, drp, tgl, chk, ico, img, rec, htm, tim.
- Power Fx en syntaxe invariante (en-US) : séparateur d’arguments « , », chaînage « ; », décimales « . ». Noms avec espaces ou accents entre apostrophes : 'Nom du compte'.
- Utilise de préférence les types de contrôles déjà présents dans le projet (versions exactes ci-dessous). Ne pas inventer de version.
- Disposition responsive : conteneurs GroupContainer Variant AutoLayout (LayoutDirection, LayoutGap, LayoutAlignItems, LayoutJustifyContent, FillPortions, AlignInContainer, LayoutMinWidth/Height), largeurs relatives (Parent.Width), éviter les X/Y codés en dur sauf dans les conteneurs ManualLayout.
- Galeries : Items, TemplateSize, contrôles du modèle référencent ThisItem et Parent.TemplateWidth/TemplateHeight ; Select(Parent) dans OnSelect d’un enfant.
- Formulaires : Form@2.4.4 (Layout: Vertical) avec DataSource, Item, DefaultMode ; cartes TypedDataCard@1.0.7 (Variant TextualEdit / ComboBoxEdit / NumberEdit…) avec DataField (nom logique), Default (=ThisItem.'Colonne'), Update, DisplayName ; SubmitForm(frm) puis OnSuccess.
- Composants : instance « Control: CanvasComponent » + « ComponentName: NomDuComposant » (sans version), nommée NomDuComposant_1, NomDuComposant_2… Sur l’instance, ne renseigner que les propriétés d’entrée (Input), les événements (Event) et fonctions d’entrée (InputFunction) du composant, plus X, Y, Width, Height, Visible. Les sorties se lisent avec Instance.Propriété, les actions et fonctions de sortie s’appellent avec Instance.Nom(arguments).
- Définition de composant (ComponentDefinitions) : DefinitionType: CanvasComponent, CustomProperties (PropertyKind Input / Output / Event / Action / InputFunction / OutputFunction ; DataType pour Input et Output, ReturnType pour les autres, Parameters sous forme de liste « - NomParam: { DataType: … } », Default pour Input / Event / InputFunction), Properties (Fill, Width, Height, OnReset et les formules des Output / OutputFunction / Action), Children. À l’intérieur, le composant se référence par son nom (Modal.Title, Modal.OnConfirm()) et Parent désigne le composant.
- Flux Power Automate : NomDuFlux.Run(arg1, arg2) renvoie un enregistrement ; API Dataverse personnalisées : Environment.NomAction({ Param: … }).

# Types de contrôles déjà utilisés dans ce projet (à privilégier)
${used.length ? used.map((u) => `- ${u}`).join('\n') : '- (aucun)'}

# Catalogue de contrôles connus de l’émulateur (Type@version — propriétés principales)
${catalogText()}

# Sources de données disponibles
${dataText(project)}

# Composants du projet (propriétés personnalisées)
${componentsText(project)}

# Flux et actions externes disponibles
${flowsText(project)}

# Écrans du projet
${(project.screens || []).map((s) => `- ${s.name}`).join('\n') || '- (aucun)'}
Taille d’écran : ${project.settings?.width || 1366} × ${project.settings?.height || 768}.

# Protocole de réponse (important : l’interface applique tes blocs de code en un clic)
1. Pour modifier l’écran courant : renvoie l’écran COMPLET dans UN bloc \`\`\`yaml commençant par « Screens: » (conserve à l’identique les parties non modifiées, n’abrège jamais avec « ... »).
2. Pour ajouter des contrôles sans réécrire l’écran : bloc \`\`\`yaml contenant une liste « - NomControle: … », avec en première ligne le commentaire « # insert-into: NomDuConteneurOuEcran ».
3. Pour remplacer un seul contrôle (et ses enfants) : bloc \`\`\`yaml « - NomControle: … » avec en première ligne « # replace: NomControle ».
4. Pour créer un nouvel écran : bloc \`\`\`yaml « Screens: » avec un nom d’écran nouveau.
5. Pour changer une seule formule : bloc \`\`\`powerfx contenant la formule (avec « = » initial) et précise « Contrôle.Propriété » juste avant le bloc.
6. Pour des données de test : bloc \`\`\`json table=NomDeLaTable contenant un tableau d’objets dont les clés sont les noms de colonnes.
Le développeur vérifie chaque proposition sous forme de comparaison avant / après avant de l’appliquer : quand le changement est localisé, préfère le remplacement d’un contrôle (3) ou d’une formule (5) à l’écran complet, et ne réordonne ni ne reformule ce qui ne change pas.
Explique brièvement ce que tu as fait (2 à 6 puces) avant ou après le bloc. Vérifie la syntaxe Power Fx et la cohérence des noms (variables, collections, sources) avant de répondre.

# Langue de réponse
${ANSWER_LANGUAGE[getLocale()] || ANSWER_LANGUAGE.fr}`;
}

/** Contexte utilisateur ajouté au premier message de la requête */
export function buildContext(project, { screen, selection, issues, opts }) {
  const parts = [];
  if (opts.screen && screen) {
    parts.push(`## Écran courant « ${screen.name} » (YAML actuel)\n\`\`\`yaml\n${screenYaml(screen)}\`\`\``);
  }
  if (opts.selection && selection && selection.kind === 'control') {
    const t = splitControlType(selection.node.head?.Control || '');
    parts.push(`## Contrôle sélectionné : ${selection.node.name} (${t.base}${t.version ? `@${t.version}` : ''})\n\`\`\`yaml\n${controlsYaml([selection.node])}\`\`\``);
  } else if (opts.selection && selection && selection.kind === 'screen') {
    parts.push(`## Sélection : l’écran ${selection.node.name}`);
  }
  if (opts.app && project.app && Object.keys(project.app.properties || {}).length) {
    parts.push(`## App (OnStart / Formulas)\n\`\`\`yaml\n${appYaml(project.app)}\`\`\``);
  }
  if (opts.issues && issues?.length) {
    const list = issues
      .filter((i) => i.severity !== 'info' && (!screen || i.screenId === screen._id))
      .slice(0, 60)
      .map((i) => `- [${i.severity}] ${i.controlName}${i.property ? `.${i.property}` : ''} : ${i.message}`);
    if (list.length) parts.push(`## Problèmes détectés par le vérificateur\n${list.join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Demandes rapides du volet : libellé et texte (envoyé comme message de l'utilisateur) dans la langue de l'interface.
 * fill : texte à compléter, placé dans la zone de saisie au lieu d'être envoyé.
 */
export const QUICK_PROMPTS = [
  {
    id: 'explain',
    icon: 'Info',
    get label() {
      return t('ai.quickExplain');
    },
    get text() {
      return t('ai.quickExplainText');
    },
  },
  {
    id: 'fix',
    icon: 'Stethoscope',
    get label() {
      return t('ai.quickFix');
    },
    get text() {
      return t('ai.quickFixText');
    },
  },
  {
    id: 'responsive',
    icon: 'Expand',
    get label() {
      return t('ai.quickResponsive');
    },
    get text() {
      return t('ai.quickResponsiveText');
    },
  },
  {
    id: 'crud',
    icon: 'Form',
    get label() {
      return t('ai.quickCrud');
    },
    get text() {
      return t('ai.quickCrudText');
    },
  },
  {
    id: 'testData',
    icon: 'Table',
    get label() {
      return t('ai.quickTestData');
    },
    get text() {
      return t('ai.quickTestDataText');
    },
  },
  {
    id: 'newScreen',
    icon: 'Screen',
    fill: true,
    get label() {
      return t('ai.quickNewScreen');
    },
    get text() {
      return t('ai.quickNewScreenText');
    },
  },
];
