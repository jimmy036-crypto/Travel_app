import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const SOURCE_DIR = path.join(REPO_ROOT, '.ai', 'artifacts', 'source');
export const RENDERED_DIR = path.join(REPO_ROOT, '.ai', 'artifacts', 'rendered');

const SCHEMA_BY_TYPE = Object.freeze({
  'understanding-guide': path.join(REPO_ROOT, '.ai', 'schemas', 'understanding-guide.schema.json'),
  'explain-diff': path.join(REPO_ROOT, '.ai', 'schemas', 'explain-diff.schema.json'),
});

const schemaCache = new Map();

export class ArtifactValidationError extends Error {
  constructor(errors) {
    super(`Learning artifact validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'ArtifactValidationError';
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'object') return isPlainObject(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function resolveRef(rootSchema, reference) {
  if (!reference.startsWith('#/')) throw new Error(`Unsupported schema reference: ${reference}`);
  return reference.slice(2).split('/').reduce((current, segment) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    return current?.[key];
  }, rootSchema);
}

function validateSchemaNode(value, schema, location, rootSchema, errors) {
  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push(`${location}: schema reference ${schema.$ref} could not be resolved`);
      return;
    }
    validateSchemaNode(value, resolved, location, rootSchema, errors);
    return;
  }

  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${location}: must equal ${JSON.stringify(schema.const)}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${location}: must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
    return;
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((type) => matchesType(value, type))) {
      errors.push(`${location}: expected ${allowedTypes.join(' or ')}, received ${valueType(value)}`);
      return;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${location}: must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      errors.push(`${location}: must match ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push(`${location}: must be an ISO-compatible date-time`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${location}: must be at least ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${location}: must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${location}: must contain no more than ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${location}: items must be unique`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaNode(item, schema.items, `${location}[${index}]`, rootSchema, errors));
    }
  }

  if (isPlainObject(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${location}.${required}: is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${location}.${key}: additional property is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateSchemaNode(value[key], childSchema, `${location}.${key}`, rootSchema, errors);
    }
  }
}

function readSchema(artifactType) {
  const schemaPath = SCHEMA_BY_TYPE[artifactType];
  if (!schemaPath) return null;
  if (!schemaCache.has(schemaPath)) schemaCache.set(schemaPath, JSON.parse(readFileSync(schemaPath, 'utf8')));
  return schemaCache.get(schemaPath);
}

function isSafeRepositoryPath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const candidate = value.trim();
  if (path.isAbsolute(candidate) || path.win32.isAbsolute(candidate) || candidate.startsWith('\\')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return false;
  const segments = candidate.replaceAll('\\', '/').split('/');
  return !segments.some((segment) => segment === '..' || segment === '');
}

function visitStrings(value, visitor, location = '$') {
  if (typeof value === 'string') {
    visitor(value, location);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, visitor, `${location}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) visitStrings(child, visitor, `${location}.${key}`);
  }
}

function validateSemanticRules(artifact, errors) {
  const evidence = Array.isArray(artifact.evidence) ? artifact.evidence : [];
  const evidenceIds = new Set();

  evidence.forEach((item, index) => {
    const location = `$.evidence[${index}]`;
    if (evidenceIds.has(item.id)) errors.push(`${location}.id: duplicate evidence id ${item.id}`);
    evidenceIds.add(item.id);
    if (!isSafeRepositoryPath(item.path)) {
      errors.push(`${location}.path: must be a repository-relative path without traversal`);
    }
    if (Number.isInteger(item.lineStart) && Number.isInteger(item.lineEnd) && item.lineEnd < item.lineStart) {
      errors.push(`${location}.lineEnd: must be greater than or equal to lineStart`);
    }
  });

  for (const collectionName of ['tests', 'testing', 'changedFiles']) {
    const collection = artifact[collectionName];
    if (!Array.isArray(collection)) continue;
    collection.forEach((item, index) => {
      if (Object.hasOwn(item, 'path') && !isSafeRepositoryPath(item.path)) {
        errors.push(`$.${collectionName}[${index}].path: must be a repository-relative path without traversal`);
      }
    });
  }

  const quiz = Array.isArray(artifact.quiz) ? artifact.quiz : [];
  const quizIds = new Set();
  quiz.forEach((question, index) => {
    const location = `$.quiz[${index}]`;
    if (quizIds.has(question.id)) errors.push(`${location}.id: duplicate quiz id ${question.id}`);
    quizIds.add(question.id);
    if (
      Number.isInteger(question.correctOption)
      && Array.isArray(question.options)
      && question.correctOption >= question.options.length
    ) {
      errors.push(`${location}.correctOption: must reference an existing option`);
    }
    if (Array.isArray(question.evidenceRefs)) {
      question.evidenceRefs.forEach((reference) => {
        if (!evidenceIds.has(reference)) errors.push(`${location}.evidenceRefs: unknown evidence id ${reference}`);
      });
    }
  });

  visitStrings(artifact, (text, location) => {
    if (/^\s*javascript:/i.test(text)) errors.push(`${location}: javascript: content is not allowed`);
  });
}

export function validateArtifact(artifact) {
  const errors = [];
  if (!isPlainObject(artifact)) throw new ArtifactValidationError(['$: expected an object']);
  const schema = readSchema(artifact.artifactType);
  if (!schema) {
    throw new ArtifactValidationError([
      '$.artifactType: must be "understanding-guide" or "explain-diff"',
    ]);
  }
  validateSchemaNode(artifact, schema, '$', schema, errors);
  validateSemanticRules(artifact, errors);
  if (errors.length) throw new ArtifactValidationError(errors);
  return artifact;
}

export function loadArtifact(jsonFile) {
  const absolutePath = path.resolve(jsonFile);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new ArtifactValidationError([`${absolutePath}: ${error.message}`]);
  }
  return validateArtifact(parsed);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function list(items, className = '') {
  if (!items?.length) return '<p class="empty">None recorded.</p>';
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function section(title, content, id = '') {
  return `<section${id ? ` id="${escapeHtml(id)}"` : ''} class="section"><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function renderMetadata(artifact) {
  const { metadata } = artifact;
  const ref = artifact.artifactType === 'understanding-guide'
    ? metadata.sourceRef
    : `${metadata.baseRef} → ${metadata.headRef}`;
  return `<dl class="metadata">
    <div><dt>Project</dt><dd>${escapeHtml(metadata.project)}</dd></div>
    <div><dt>Source ref</dt><dd><code>${escapeHtml(ref)}</code></dd></div>
    <div><dt>Generated</dt><dd>${escapeHtml(metadata.generatedAt)}</dd></div>
    <div><dt>Language</dt><dd>${escapeHtml(metadata.language)}</dd></div>
    <div><dt>Generator role</dt><dd>${escapeHtml(metadata.generatorRole)}</dd></div>
  </dl>`;
}

function renderRisks(risks) {
  return `<div class="card-grid">${risks.map((risk) => `<article class="card risk-card">
    <span class="badge badge-${escapeHtml(risk.severity)}">${escapeHtml(risk.severity)}</span>
    <h3>${escapeHtml(risk.description)}</h3>
    <p><strong>Mitigation:</strong> ${escapeHtml(risk.mitigation)}</p>
  </article>`).join('')}</div>`;
}

function renderTests(tests) {
  return `<div class="card-grid">${tests.map((test) => `<article class="card">
    <div class="card-kicker">${escapeHtml(test.type)} · ${escapeHtml(test.evidenceStatus)}</div>
    <h3><code>${escapeHtml(test.path)}</code></h3>
    <p>${escapeHtml(test.behaviorProtected)}</p>
  </article>`).join('')}</div>`;
}

function renderEvidence(evidence) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Claim</th><th>Location</th><th>Confidence</th></tr></thead>
    <tbody>${evidence.map((item) => `<tr>
      <td><code>${escapeHtml(item.id)}</code></td>
      <td>${escapeHtml(item.claim)}</td>
      <td><code>${escapeHtml(item.path)}:${item.lineStart}-${item.lineEnd}</code><br>${escapeHtml(item.symbol)}</td>
      <td><span class="badge">${escapeHtml(item.confidence)}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderUnknowns(unknowns) {
  if (!unknowns.length) return '<p class="empty">No known unknowns recorded.</p>';
  return `<div class="card-grid">${unknowns.map((item) => `<article class="card">
    <h3>${escapeHtml(item.question)}</h3>
    <p><strong>Impact:</strong> ${escapeHtml(item.impact)}</p>
    <p><strong>Next step:</strong> ${escapeHtml(item.nextStep)}</p>
  </article>`).join('')}</div>`;
}

function renderQuiz(quiz) {
  return `<form id="learning-quiz" class="quiz" novalidate>
    ${quiz.map((question, questionIndex) => `<fieldset class="quiz-question" data-correct="${question.correctOption}">
      <legend>${questionIndex + 1}. ${escapeHtml(question.question)}</legend>
      <div class="quiz-options">${question.options.map((option, optionIndex) => `<label>
        <input type="radio" name="${escapeHtml(question.id)}" value="${optionIndex}">
        <span>${escapeHtml(option)}</span>
      </label>`).join('')}</div>
      <p class="quiz-evidence">Evidence: ${question.evidenceRefs.map(escapeHtml).join(', ')}</p>
      <p class="quiz-explanation" hidden>${escapeHtml(question.explanation)}</p>
    </fieldset>`).join('')}
    <div class="quiz-actions">
      <button type="button" id="check-quiz">Check answers</button>
      <output id="quiz-result" aria-live="polite"></output>
    </div>
  </form>`;
}

function renderUnderstanding(artifact) {
  const overview = `<div class="card-grid overview-grid">
    <article class="card"><div class="card-kicker">One sentence</div><p>${escapeHtml(artifact.overview.oneSentence)}</p></article>
    <article class="card"><div class="card-kicker">Why it exists</div><p>${escapeHtml(artifact.overview.purpose)}</p></article>
    <article class="card"><div class="card-kicker">Audience</div>${list(artifact.overview.audience)}</article>
    <article class="card"><div class="card-kicker">Prerequisites</div>${list(artifact.overview.prerequisites)}</article>
  </div>`;
  const journey = `<ol class="timeline">${artifact.userJourney.map((item) => `<li><span class="step-number">${item.step}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div></li>`).join('')}</ol>`;
  const modules = `<div class="card-grid">${artifact.modules.map((module) => `<article class="card"><h3>${escapeHtml(module.name)}</h3><p>${escapeHtml(module.responsibility)}</p><h4>Entry points</h4>${list(module.entryPoints)}<h4>Dependencies</h4>${list(module.dependencies)}</article>`).join('')}</div>`;
  const flows = artifact.flows.map((flow) => `<article class="flow"><h3>${escapeHtml(flow.title)}</h3><p>${escapeHtml(flow.description)}</p><div class="flow-steps">${flow.steps.map((step, index) => `<div class="flow-step"><span>${step.order}</span><strong>${escapeHtml(step.action)}</strong><p>${escapeHtml(step.result)}</p></div>${index < flow.steps.length - 1 ? '<div class="flow-arrow" aria-hidden="true">→</div>' : ''}`).join('')}</div></article>`).join('');
  const state = `<div class="card-grid">${artifact.state.map((item) => `<article class="card"><h3>${escapeHtml(item.stateName)}</h3><p><strong>Owner:</strong> ${escapeHtml(item.owner)}</p><p><strong>Initial:</strong> ${escapeHtml(item.initialValue)}</p>${list(item.transitions.map((transition) => `${transition.trigger}: ${transition.from} → ${transition.to}. ${transition.effect}`))}</article>`).join('')}</div>`;
  const data = `<div class="card-grid">${artifact.data.map((item) => `<article class="card"><div class="card-kicker">${escapeHtml(item.operation)}</div><h3>${escapeHtml(item.source)} → ${escapeHtml(item.destination)}</h3><p><strong>Persistence:</strong> ${escapeHtml(item.persistence)}</p><p><strong>Side effect:</strong> ${escapeHtml(item.sideEffect)}</p></article>`).join('')}</div>`;
  const boundaries = `<div class="boundary-grid"><article><h3>Reads</h3>${list(artifact.boundaries.reads)}</article><article><h3>Writes</h3>${list(artifact.boundaries.writes)}</article><article><h3>Must not write</h3>${list(artifact.boundaries.mustNotWrite)}</article><article><h3>External systems</h3>${list(artifact.boundaries.externalSystems)}</article></div>`;
  const decisions = artifact.decisions.length ? `<div class="card-grid">${artifact.decisions.map((decision) => `<article class="card"><div class="card-kicker">${escapeHtml(decision.id)} · ${escapeHtml(decision.status)}</div><p>${escapeHtml(decision.summary)}</p></article>`).join('')}</div>` : '<p class="empty">No related ADR recorded.</p>';
  const glossary = `<dl class="glossary">${artifact.glossary.map((item) => `<div><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd></div>`).join('')}</dl>`;
  return [section('Overview', overview, 'overview'), section('User journey', journey, 'journey'), section('Architecture modules', modules, 'modules'), section('Flows', flows, 'flows'), section('State flow', state, 'state'), section('Data flow and side effects', data, 'data'), section('Read / Write boundaries', boundaries, 'boundaries'), section('Invariants', list(artifact.invariants), 'invariants'), section('What it does not do', list(artifact.nonGoals), 'non-goals'), section('Architecture decisions', decisions, 'decisions'), section('Risks', renderRisks(artifact.risks), 'risks'), section('Test coverage', renderTests(artifact.tests), 'tests'), section('Evidence', renderEvidence(artifact.evidence), 'evidence'), section('Known unknowns', renderUnknowns(artifact.unknowns), 'unknowns'), section('Glossary', glossary, 'glossary'), section('Quiz', renderQuiz(artifact.quiz), 'quiz')].join('\n');
}

function renderDiff(artifact) {
  const beforeAfter = `<div class="before-after"><article class="card"><div class="card-kicker">Before</div><h3>${escapeHtml(artifact.before.summary)}</h3>${list(artifact.before.behaviors)}<h4>State</h4>${list(artifact.before.state)}<h4>Data</h4>${list(artifact.before.data)}</article><article class="card"><div class="card-kicker">After</div><h3>${escapeHtml(artifact.after.summary)}</h3>${list(artifact.after.behaviors)}<h4>State</h4>${list(artifact.after.state)}<h4>Data</h4>${list(artifact.after.data)}</article></div>`;
  const changes = `<div class="card-grid">${artifact.behavioralChanges.map((change) => `<article class="card"><div class="card-kicker">${escapeHtml(change.area)} · ${change.userVisible ? 'user visible' : 'internal'}</div><p><strong>Before:</strong> ${escapeHtml(change.before)}</p><p><strong>After:</strong> ${escapeHtml(change.after)}</p></article>`).join('')}</div>`;
  const concepts = `<div class="card-grid">${artifact.conceptGroups.map((group) => `<article class="card"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.summary)}</p><h4>Files</h4>${list(group.files)}<h4>Impacts</h4>${list(group.impacts)}</article>`).join('')}</div>`;
  const files = `<div class="table-wrap"><table><thead><tr><th>File</th><th>Change</th><th>Responsibility</th><th>Why</th></tr></thead><tbody>${artifact.changedFiles.map((file) => `<tr><td><code>${escapeHtml(file.path)}</code></td><td>${escapeHtml(file.changeType)}</td><td>${escapeHtml(file.responsibility)}</td><td>${escapeHtml(file.whyItChanged)}</td></tr>`).join('')}</tbody></table></div>`;
  const state = `<div class="card-grid">${artifact.stateChanges.map((change) => `<article class="card"><h3>${escapeHtml(change.state)}</h3><p><strong>Before:</strong> ${escapeHtml(change.before)}</p><p><strong>After:</strong> ${escapeHtml(change.after)}</p><p>${escapeHtml(change.impact)}</p></article>`).join('')}</div>`;
  const data = `<div class="card-grid">${artifact.dataChanges.map((change) => `<article class="card"><h3>${escapeHtml(change.data)}</h3><p><strong>Before:</strong> ${escapeHtml(change.before)}</p><p><strong>After:</strong> ${escapeHtml(change.after)}</p><p><strong>Persistence:</strong> ${escapeHtml(change.persistence)}</p><p><strong>Side effect:</strong> ${escapeHtml(change.sideEffect)}</p></article>`).join('')}</div>`;
  const compatibility = `<div class="boundary-grid"><article><h3>Preserved</h3>${list(artifact.compatibility.preserved)}</article><article><h3>Breaking</h3>${list(artifact.compatibility.breaking)}</article><article><h3>Legacy</h3>${list(artifact.compatibility.legacy)}</article></div>`;
  return [section('Intent', `<p>${escapeHtml(artifact.intent.summary)}</p><h3>Drivers</h3>${list(artifact.intent.drivers)}<h3>Non-goals</h3>${list(artifact.intent.nonGoals)}`, 'intent'), section('Before / After', beforeAfter, 'before-after'), section('Behavioral changes', changes, 'behavioral-changes'), section('Concept groups', concepts, 'concepts'), section('Changed files', files, 'changed-files'), section('State changes', state, 'state'), section('Data and side-effect changes', data, 'data'), section('Compatibility', compatibility, 'compatibility'), section('Risks', renderRisks(artifact.risks), 'risks'), section('Test coverage', renderTests(artifact.testing), 'tests'), section('Rollback', `<p>${escapeHtml(artifact.rollback.strategy)}</p>${list(artifact.rollback.steps)}`, 'rollback'), section('Evidence', renderEvidence(artifact.evidence), 'evidence'), section('Known unknowns', renderUnknowns(artifact.unknowns), 'unknowns'), section('Quiz', renderQuiz(artifact.quiz), 'quiz')].join('\n');
}

const STYLES = `
:root{color-scheme:light dark;--bg:#f6f7fb;--panel:#fff;--text:#182033;--muted:#59647a;--line:#dfe3ec;--accent:#6d4aff;--accent-soft:#eeeaff;--good:#13795b;--warn:#a15c00;--danger:#b42318}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;overflow-wrap:anywhere}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;overflow-wrap:anywhere}.shell{width:min(1120px,100%);margin:0 auto;padding:clamp(16px,4vw,48px)}.hero{padding:clamp(24px,6vw,64px);border-radius:28px;color:#fff;background:linear-gradient(135deg,#37258f,#6d4aff 55%,#2587a8);box-shadow:0 20px 60px #20195c33}.eyebrow,.card-kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.76rem;font-weight:800}.hero h1{margin:.25rem 0 .75rem;font-size:clamp(2rem,6vw,4rem);line-height:1.06}.hero p{max-width:70ch}.metadata{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:20px 0 0}.metadata div{min-width:0;padding:12px;border:1px solid #ffffff3b;border-radius:14px;background:#ffffff16}.metadata dt{font-size:.75rem;opacity:.8}.metadata dd{margin:2px 0 0;font-weight:700}.section{margin:clamp(22px,5vw,52px) 0}.section>h2{font-size:clamp(1.5rem,4vw,2.25rem);margin:0 0 18px}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:14px}.card,.flow,.boundary-grid article{min-width:0;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:0 8px 24px #1820330b}.card h3,.flow h3,.boundary-grid h3{margin:.25rem 0 .5rem}.card h4{margin:1rem 0 .25rem}.card-kicker{color:var(--accent)}.timeline{list-style:none;padding:0;display:grid;gap:14px}.timeline li{display:flex;gap:14px;padding:18px;border-left:4px solid var(--accent);background:var(--panel);border-radius:0 16px 16px 0}.timeline h3,.timeline p{margin:0}.step-number,.flow-step>span{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:50%;color:#fff;background:var(--accent);font-weight:800}.flow{margin-bottom:14px}.flow-steps{display:flex;align-items:stretch;gap:10px;overflow-x:auto;padding:8px 0}.flow-step{min-width:190px;flex:1;padding:14px;border-radius:14px;background:var(--accent-soft);color:#201a45}.flow-arrow{align-self:center;font-size:1.7rem;color:var(--accent)}.boundary-grid,.before-after{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:14px}.badge{display:inline-block;padding:3px 9px;border-radius:999px;background:var(--accent-soft);color:#3a277d;font-size:.75rem;font-weight:800;text-transform:uppercase}.badge-critical,.badge-high{background:#ffe9e7;color:var(--danger)}.badge-medium{background:#fff1d7;color:var(--warn)}.badge-low{background:#e4f7f0;color:var(--good)}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:var(--panel)}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}.glossary{display:grid;gap:10px}.glossary div{padding:14px 18px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.glossary dt{font-weight:800}.glossary dd{margin:4px 0 0;color:var(--muted)}.quiz{display:grid;gap:14px}.quiz-question{min-width:0;margin:0;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.quiz-question legend{padding:0 6px;font-weight:800}.quiz-options{display:grid;gap:8px}.quiz-options label{display:flex;gap:10px;min-height:44px;align-items:center;padding:8px 10px;border-radius:10px;background:var(--bg);cursor:pointer}.quiz-question.is-correct{border-color:var(--good)}.quiz-question.is-wrong{border-color:var(--danger)}.quiz-evidence{color:var(--muted);font-size:.85rem}.quiz-explanation{padding:10px;border-radius:10px;background:var(--accent-soft)}.quiz-actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px}.quiz-actions button{min-height:44px;border:0;border-radius:12px;padding:10px 18px;color:#fff;background:var(--accent);font-weight:800;cursor:pointer}.quiz-actions output{font-weight:800}.empty{color:var(--muted);font-style:italic}footer{margin-top:50px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}@media(prefers-color-scheme:dark){:root{--bg:#0e1220;--panel:#171d2e;--text:#edf1ff;--muted:#adb7cf;--line:#30394f;--accent:#aa94ff;--accent-soft:#292249}.flow-step{color:#f3efff}.badge{color:#e8e0ff}.badge-critical,.badge-high{background:#4d211f;color:#ffb4ad}.badge-medium{background:#493417;color:#ffd18a}.badge-low{background:#153d32;color:#8be0c1}}@media(max-width:600px){.shell{padding:12px}.hero{border-radius:18px;padding:22px 18px}.flow-steps{flex-direction:column;overflow:visible}.flow-step{min-width:0}.flow-arrow{transform:rotate(90deg)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}@media print{:root{color-scheme:light;--bg:#fff;--panel:#fff;--text:#000;--muted:#333;--line:#bbb}.shell{width:100%;padding:0}.hero{color:#000;background:#fff;box-shadow:none;border:2px solid #333}.section,.card,.flow,.quiz-question{break-inside:avoid}.quiz-actions{display:none}}
`;

const QUIZ_SCRIPT = `
(()=>{const form=document.getElementById('learning-quiz');const button=document.getElementById('check-quiz');const result=document.getElementById('quiz-result');if(!form||!button||!result)return;button.addEventListener('click',()=>{const questions=Array.from(form.querySelectorAll('.quiz-question'));let correct=0;questions.forEach((question)=>{const selected=question.querySelector('input:checked');const isCorrect=selected!==null&&Number(selected.value)===Number(question.dataset.correct);if(isCorrect)correct+=1;question.classList.toggle('is-correct',isCorrect);question.classList.toggle('is-wrong',!isCorrect);const explanation=question.querySelector('.quiz-explanation');if(explanation)explanation.hidden=false});const percent=Math.round(correct/questions.length*100);result.textContent=correct+' / '+questions.length+' correct ('+percent+'%)'})})();
`;

export function renderArtifact(artifact) {
  validateArtifact(artifact);
  const content = artifact.artifactType === 'understanding-guide' ? renderUnderstanding(artifact) : renderDiff(artifact);
  const subtitle = artifact.artifactType === 'understanding-guide' ? artifact.overview.oneSentence : artifact.intent.summary;
  return `<!doctype html>
<html lang="${escapeHtml(artifact.metadata.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(artifact.metadata.title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <main class="shell">
    <header class="hero"><div class="eyebrow">${escapeHtml(artifact.artifactType)}</div><h1>${escapeHtml(artifact.metadata.title)}</h1><p>${escapeHtml(subtitle)}</p>${renderMetadata(artifact)}</header>
    ${content}
    <footer>Generated deterministically from the validated source JSON. No external assets or network requests are required.</footer>
  </main>
  <script>${QUIZ_SCRIPT}</script>
</body>
</html>
`;
}

export function artifactFiles(sourceDir = SOURCE_DIR, renderedDir = RENDERED_DIR) {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => ({ source: path.join(sourceDir, entry.name), rendered: path.join(renderedDir, `${entry.name.slice(0, -5)}.html`) })).sort((left, right) => left.source.localeCompare(right.source));
}

export function validateAllArtifacts(options = {}) {
  const files = artifactFiles(options.sourceDir, options.renderedDir);
  files.forEach(({ source }) => loadArtifact(source));
  return files;
}

export function renderArtifactFile(jsonFile, htmlFile) {
  const artifact = loadArtifact(jsonFile);
  const html = renderArtifact(artifact);
  mkdirSync(path.dirname(path.resolve(htmlFile)), { recursive: true });
  writeFileSync(path.resolve(htmlFile), html, 'utf8');
  return html;
}

export function renderAllArtifacts(options = {}) {
  const files = validateAllArtifacts(options);
  files.forEach(({ source, rendered }) => renderArtifactFile(source, rendered));
  return files;
}

export function checkArtifacts(options = {}) {
  const files = validateAllArtifacts(options);
  const stale = [];
  files.forEach(({ source, rendered }) => {
    const expected = renderArtifact(loadArtifact(source));
    if (!existsSync(rendered) || readFileSync(rendered, 'utf8') !== expected) stale.push(rendered);
  });
  return { files, stale };
}
