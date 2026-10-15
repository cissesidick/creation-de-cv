"use strict";

const STORAGE_KEY = "premium_cv_data";
const THEMES = {
  ocean: "#0F766E",
  violet: "#7C3AED",
  crimson: "#DC2626",
  royal: "#1D4ED8",
  sunset: "#EA580C",
  corporate: "#475569",
  tech: "#0891B2",
  elegant: "#A21CAF",
  navy: "#1E3A5F",
  black: "#1F2937",
  white: "#FFFFFF",
};

const SKILL_LEVELS = ["Notions", "Intermédiaire", "Avancé", "Expert"];

// Niveaux CECRL : reconnus en France comme en Côte d'Ivoire
const LANGUAGE_LEVELS = [
  "Langue maternelle",
  "C2 – Bilingue",
  "C1 – Courant",
  "B2 – Avancé",
  "B1 – Intermédiaire",
  "A2 – Élémentaire",
  "A1 – Débutant",
];

const LEGACY_LANGUAGE_LEVELS = {
  maternel: "Langue maternelle",
  maternelle: "Langue maternelle",
  "langue maternelle": "Langue maternelle",
  natif: "Langue maternelle",
  bilingue: "C2 – Bilingue",
  courant: "C1 – Courant",
  avancé: "B2 – Avancé",
  intermédiaire: "B1 – Intermédiaire",
  élémentaire: "A2 – Élémentaire",
  débutant: "A1 – Débutant",
  notions: "A1 – Débutant",
};

function normalizeLanguageLevel(level) {
  const raw = String(level || "").trim();
  if (!raw) return "B1 – Intermédiaire";
  if (LANGUAGE_LEVELS.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (LEGACY_LANGUAGE_LEVELS[lower]) return LEGACY_LANGUAGE_LEVELS[lower];
  const cecrl = LANGUAGE_LEVELS.find((l) => l.toLowerCase().startsWith(lower.slice(0, 2)) && /^[abc][12]/.test(lower));
  return cecrl || raw;
}

const COUNTRIES = {
  fr: {
    nationalityRequired: false,
    photoExpected: false,
    placeholders: {
      phone: "+33 6 12 34 56 78",
      location: "Paris (75011)",
      license: "Ex: Permis B, véhiculé",
    },
    hints: {
      country: "Format français : une page, pas d'âge ni de nationalité exigés, permis de conduire mis en avant.",
      photo: "Facultative en France : un CV sans photo est tout à fait normal.",
      age: "Déconseillé en France, vous pouvez laisser vide.",
      nationality: "Facultatif. Utile surtout pour préciser une autorisation de travail.",
      skills: "En France, on évite souvent les niveaux : regroupez plutôt par thème (ex : « Outils : Git, Docker ») et choisissez « Sans niveau ».",
    },
    labels: { hobbies: "Centres d'intérêt" },
  },
  ci: {
    nationalityRequired: true,
    photoExpected: true,
    placeholders: {
      phone: "+225 07 00 00 00 00",
      location: "Abidjan, Côte d'Ivoire",
      license: "Ex: Permis B",
    },
    hints: {
      country: "Format ivoirien : photo, âge, nationalité et situation familiale sont d'usage.",
      photo: "Recommandée pour un CV en Côte d'Ivoire.",
      age: "",
      nationality: "",
      skills: "",
    },
    labels: { hobbies: "Loisirs" },
  },
};

function getCountryConfig() {
  return COUNTRIES[CV_STATE.country] || COUNTRIES.fr;
}

const CONTRACT_TYPES = ["CDI", "CDD", "Stage", "Alternance", "Intérim", "Freelance", "Bénévolat"];

function normalizeSkill(s) {
  if (typeof s === "string") return { name: s, level: "Avancé" };
  // level "" = sans niveau (usage courant en France)
  if (s && typeof s.level === "string") return { name: s.name || "", level: s.level };
  const p = s && typeof s.percentage === "number" ? s.percentage : 80;
  let level = "Avancé";
  if (p <= 40) level = "Notions";
  else if (p <= 60) level = "Intermédiaire";
  else if (p <= 85) level = "Avancé";
  else level = "Expert";
  return { name: (s && s.name) || "", level };
}

function defaultState() {
  return {
    personal: {
      fullName: "",
      jobTitle: "",
      email: "",
      phone: "",
      location: "",
      license: "",
      age: "",
      nationality: "",
      maritalStatus: "",
      website: "",
      summary: "",
    },
    photo: null,
    experiences: [],
    educations: [],
    skills: [],
    languages: [],
    hobbies: [],
    template: "executive",
    theme: "ocean",
    country: "fr",
    educationFirst: false,
  };
}

// Complète un état sauvegardé/importé avec les champs ajoutés depuis
function mergeWithDefaults(data) {
  const base = defaultState();
  return {
    ...base,
    ...data,
    personal: { ...base.personal, ...(data.personal || {}) },
    // Les anciens CV (avant le choix du pays) étaient au format ivoirien
    country: COUNTRIES[data.country] ? data.country : "ci",
    experiences: Array.isArray(data.experiences) ? data.experiences : [],
    educations: Array.isArray(data.educations) ? data.educations : [],
    skills: Array.isArray(data.skills) ? data.skills : [],
    languages: Array.isArray(data.languages) ? data.languages : [],
    hobbies: Array.isArray(data.hobbies) ? data.hobbies : [],
  };
}

let CV_STATE = defaultState();

let LAST_STATE_BACKUP = null;

const dropZone = document.getElementById("dropZone");
const photoInput = document.getElementById("photoInput");
const cvPreview = document.getElementById("cvPreview");
const toast = document.getElementById("toast");

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function createHtmlFragment(html) {
  return document.createRange().createContextualFragment(html);
}

const VALIDATORS = {
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => !v || /^[+()\d\s.\-]{6,}$/.test(v),
  url: (v) => !v || /^https?:\/\/.+\..+/i.test(v) || /^[\w.-]+\.[a-z]{2,}\/?.*/i.test(v),
};

const VALIDATION_MESSAGES = {
  email: "Format d'email invalide",
  phone: "Numéro invalide (chiffres, +, espaces)",
  url: "Lien invalide (ex : https://…)",
};

function validateField(el) {
  const value = el.value.trim();
  const rule = el.dataset.validate;
  let ok = true;
  let msg = "";

  if (el.hasAttribute("required") && !value) {
    ok = false;
    msg = "Ce champ est obligatoire";
  } else if (rule && VALIDATORS[rule] && !VALIDATORS[rule](value)) {
    ok = false;
    msg = VALIDATION_MESSAGES[rule];
  }

  const errEl = document.querySelector(`[data-error-for="${el.id}"]`);
  el.classList.toggle("invalid", !ok);
  if (errEl) errEl.textContent = msg;
  return ok;
}

function validateAll() {
  let firstInvalid = null;
  document.querySelectorAll('[data-state^="personal."]').forEach((el) => {
    if (el.hasAttribute("required") || el.dataset.validate) {
      const ok = validateField(el);
      if (!ok && !firstInvalid) firstInvalid = el;
    }
  });
  return firstInvalid;
}

function focusNewItem(containerId, itemSelector) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = container.querySelectorAll(itemSelector);
  const last = items[items.length - 1];
  const input = last && last.querySelector('input[type="text"]');
  if (input) input.focus();
}

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const showToast = (message, type = "info", action = null) => {
  toast.replaceChildren();
  const messageNode = document.createTextNode(message);
  toast.appendChild(messageNode);
  
  if (action) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.className = "toast-action-btn";
    btn.onclick = () => {
      action.callback();
      toast.classList.remove("show");
    };
    toast.appendChild(btn);
  }

  toast.style.borderLeft = `4px solid ${type === "error" ? "var(--error)" : "var(--primary)"}`;
  toast.classList.add("show");
  
  const duration = action ? 6000 : 3000;
  setTimeout(() => toast.classList.remove("show"), duration);
};

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      CV_STATE = mergeWithDefaults(JSON.parse(saved));
      syncFormWithState();
    } catch (e) {
      console.error("Error loading state", e);
    }
  }
  applyCountry();
  setupEventListeners();
  updatePreview();
}

function syncSectionOrderUI() {
  const current = CV_STATE.educationFirst ? "education" : "experience";
  document.querySelectorAll(".order-opt").forEach((btn) => {
    const on = btn.dataset.order === current;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-checked", String(on));
  });
}

function applyCountry() {
  const key = COUNTRIES[CV_STATE.country] ? CV_STATE.country : "fr";
  const cfg = COUNTRIES[key];

  document.querySelectorAll(".country-opt").forEach((btn) => {
    const on = btn.dataset.country === key;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-checked", String(on));
  });

  Object.entries(cfg.placeholders).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = text;
  });
  Object.entries(cfg.hints).forEach(([id, text]) => {
    const el = document.querySelector(`[data-hint-for="${id}"]`);
    if (el) el.textContent = text;
  });

  const nationality = document.getElementById("nationality");
  const nationalityStar = document.querySelector('[data-req-for="nationality"]');
  if (nationality) {
    nationality.required = cfg.nationalityRequired;
    if (!cfg.nationalityRequired) {
      nationality.classList.remove("invalid");
      const err = document.querySelector('[data-error-for="nationality"]');
      if (err) err.textContent = "";
    }
  }
  if (nationalityStar) nationalityStar.hidden = !cfg.nationalityRequired;

  document.querySelectorAll("[data-country-only]").forEach((el) => {
    el.hidden = el.dataset.countryOnly !== key;
  });
}

function syncFormWithState() {
  Object.keys(CV_STATE.personal).forEach((key) => {
    const el = document.querySelector(`[data-state="personal.${key}"]`);
    if (el) el.value = CV_STATE.personal[key];
  });

  if (CV_STATE.photo) {
    updatePhotoUI(CV_STATE.photo);
  }

  document.querySelectorAll(".template-card").forEach((c) => {
    c.classList.toggle("active", c.dataset.template === CV_STATE.template);
  });
  document.querySelectorAll(".theme-opt").forEach((t) => {
    t.classList.toggle("active", t.dataset.theme === CV_STATE.theme);
  });
  applyTheme(CV_STATE.theme);
  applyCountry();
  syncSectionOrderUI();
  updateInitials();

  renderDynamicListUI("experiences");
  renderDynamicListUI("educations");
  renderSkillsUI();
  renderLanguagesUI();
  renderHobbiesUI();
}

function setupEventListeners() {
  document.querySelectorAll('[data-state^="personal."]').forEach((input) => {
    input.addEventListener("input", (e) => {
      const key = e.target.dataset.state.split(".")[1];
      CV_STATE.personal[key] = e.target.value;
      saveState();
      updatePreview();
      if (key === "fullName") updateInitials();
      if (e.target.classList.contains("invalid")) validateField(e.target);
    });
    // Toujours écouté : "required" peut changer selon le pays choisi
    input.addEventListener("blur", (e) => validateField(e.target));
  });

  dropZone.addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", handlePhotoSelect);
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handlePhotoProcess(e.dataTransfer.files[0]);
  });

  document.querySelectorAll(".template-card").forEach((card) => {
    card.addEventListener("click", () => {
      CV_STATE.template = card.dataset.template;
      document.querySelectorAll(".template-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      saveState();
      updatePreview();
    });
  });

  document.querySelectorAll(".theme-opt").forEach((opt) => {
    opt.addEventListener("click", () => {
      const theme = opt.dataset.theme;
      CV_STATE.theme = theme;
      document.querySelectorAll(".theme-opt").forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      applyTheme(theme);
      saveState();
      updatePreview();
    });
  });

  document.querySelectorAll(".country-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      CV_STATE.country = btn.dataset.country;
      applyCountry();
      saveState();
      updatePreview();
    });
  });

  document.querySelectorAll(".order-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      CV_STATE.educationFirst = btn.dataset.order === "education";
      syncSectionOrderUI();
      saveState();
      updatePreview();
    });
  });

  const importInput = document.getElementById("importInput");
  if (importInput) importInput.addEventListener("change", handleImportFile);
}

function handlePhotoSelect(e) {
  if (e.target.files.length) handlePhotoProcess(e.target.files[0]);
}

function handlePhotoProcess(file) {
  if (!file.type.match("image.*")) {
    showToast("Le fichier doit être une image", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("Image trop lourde (Max 5Mo)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 400;
      const MAX_HEIGHT = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL("image/webp", 0.8);
      CV_STATE.photo = base64;
      updatePhotoUI(base64);
      saveState();
      updatePreview();
      showToast("Photo ajoutée avec succès");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updatePhotoUI(src) {
  const container = document.getElementById("photoPreview");
  const image = document.createElement("img");
  image.src = src;
  image.className = "preview-img";
  image.alt = "Profile";
  container.replaceChildren(image);
}

function updateInitials() {
  const name = CV_STATE.personal.fullName || "";
  const initials = name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  if (CV_STATE.photo) return;
  let placeholder = document.getElementById("initialsPlaceholder");
  if (!placeholder) {
    placeholder = document.createElement("span");
    placeholder.className = "initials-placeholder";
    placeholder.id = "initialsPlaceholder";
    document.getElementById("photoPreview").replaceChildren(placeholder);
  }
  placeholder.textContent = initials || "??";
}

function addDynamicItem(type) {
  const item = type === "experiences"
      ? { id: Date.now(), company: "", city: "", contract: "", role: "", dates: "", description: "" }
      : { id: Date.now(), school: "", degree: "", equivalence: "", dates: "", description: "" };

  CV_STATE[type].push(item);
  renderDynamicListUI(type);
  saveState();
  updatePreview();
}

function moveDynamicItem(type, id, dir) {
  const list = CV_STATE[type];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renderDynamicListUI(type);
  saveState();
  updatePreview();
}

function removeDynamicItem(type, id) {
  CV_STATE[type] = CV_STATE[type].filter((item) => item.id !== id);
  renderDynamicListUI(type);
  saveState();
  updatePreview();
}

function handleDynamicInput(type, id, field, value) {
  const item = CV_STATE[type].find((i) => i.id === id);
  if (item) item[field] = value;
  saveState();
  debouncedUpdatePreview();
}

function contractOptions(current) {
  // Une valeur inconnue (import) reste proposée pour ne pas être perdue
  const list = current && !CONTRACT_TYPES.includes(current) ? [...CONTRACT_TYPES, current] : CONTRACT_TYPES;
  return list
    .map((c) => `<option value="${escapeHtml(c)}" ${c === current ? "selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
}

function renderDynamicListUI(type) {
  const container = document.getElementById(`${type}Container`);
  if (!container) return;
  container.replaceChildren();

  CV_STATE[type].forEach((item) => {
    const div = document.createElement("div");
    div.className = "dynamic-item";

    if (type === "experiences") {
      div.appendChild(createHtmlFragment(`
        <div class="form-row">
          <textarea placeholder="Entreprise" class="textarea-sm" oninput="handleDynamicInput('experiences', ${item.id}, 'company', this.value)">${escapeHtml(item.company)}</textarea>
          <textarea placeholder="Dates (ex: 2020 - Présent)" class="textarea-sm" oninput="handleDynamicInput('experiences', ${item.id}, 'dates', this.value)">${escapeHtml(item.dates)}</textarea>
        </div>
        <textarea placeholder="Poste" class="textarea-sm" oninput="handleDynamicInput('experiences', ${item.id}, 'role', this.value)">${escapeHtml(item.role)}</textarea>
        <div class="form-row">
          <input type="text" placeholder="Ville (optionnel)" value="${escapeHtml(item.city || "")}" oninput="handleDynamicInput('experiences', ${item.id}, 'city', this.value)">
          <select aria-label="Type de contrat" onchange="handleDynamicInput('experiences', ${item.id}, 'contract', this.value)">
            <option value="">Type de contrat (optionnel)</option>
            ${contractOptions(item.contract)}
          </select>
        </div>
        <textarea placeholder="Description des missions (une mission par ligne)..." oninput="handleDynamicInput('experiences', ${item.id}, 'description', this.value)">${escapeHtml(item.description)}</textarea>
        <div class="item-controls">
          <div class="reorder-controls">
            <button type="button" class="btn btn-ghost btn-sm reorder-btn" title="Monter" aria-label="Monter" onclick="moveDynamicItem('experiences', ${item.id}, -1)">↑</button>
            <button type="button" class="btn btn-ghost btn-sm reorder-btn" title="Descendre" aria-label="Descendre" onclick="moveDynamicItem('experiences', ${item.id}, 1)">↓</button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="color: var(--error)" onclick="removeDynamicItem('experiences', ${item.id})">Supprimer</button>
        </div>
      `));
    } else {
      div.appendChild(createHtmlFragment(`
        <div class="form-row">
          <textarea placeholder="École / Université" class="textarea-sm" oninput="handleDynamicInput('educations', ${item.id}, 'school', this.value)">${escapeHtml(item.school)}</textarea>
          <textarea placeholder="Dates" class="textarea-sm" oninput="handleDynamicInput('educations', ${item.id}, 'dates', this.value)">${escapeHtml(item.dates)}</textarea>
        </div>
        <div class="form-row">
          <textarea placeholder="Diplôme" class="textarea-sm" oninput="handleDynamicInput('educations', ${item.id}, 'degree', this.value)">${escapeHtml(item.degree)}</textarea>
          <textarea placeholder="Équivalence (ex: Bac+2) — optionnel" class="textarea-sm" title="Aide le recruteur à situer un diplôme obtenu dans un autre pays" oninput="handleDynamicInput('educations', ${item.id}, 'equivalence', this.value)">${escapeHtml(item.equivalence || "")}</textarea>
        </div>
        <textarea placeholder="Description (optionnel)..." oninput="handleDynamicInput('educations', ${item.id}, 'description', this.value)">${escapeHtml(item.description || "")}</textarea>
        <div class="item-controls">
          <div class="reorder-controls">
            <button type="button" class="btn btn-ghost btn-sm reorder-btn" title="Monter" aria-label="Monter" onclick="moveDynamicItem('educations', ${item.id}, -1)">↑</button>
            <button type="button" class="btn btn-ghost btn-sm reorder-btn" title="Descendre" aria-label="Descendre" onclick="moveDynamicItem('educations', ${item.id}, 1)">↓</button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="color: var(--error)" onclick="removeDynamicItem('educations', ${item.id})">Supprimer</button>
        </div>
      `));
    }
    container.appendChild(div);
  });
}

function addSkill() {
  CV_STATE.skills.push({ name: "", level: CV_STATE.country === "fr" ? "" : "Avancé" });
  renderSkillsUI();
  saveState();
  updatePreview();
  focusNewItem("skillsContainer", ".skill-item-form");
}

function removeSkill(index) {
  CV_STATE.skills.splice(index, 1);
  renderSkillsUI();
  saveState();
  updatePreview();
}

function handleSkillUpdate(index, field, value) {
  CV_STATE.skills[index][field] = value;
  saveState();
  debouncedUpdatePreview();
}

function renderSkillsUI() {
  const container = document.getElementById("skillsContainer");
  if (!container) return;
  container.replaceChildren();

  CV_STATE.skills.forEach((skill, index) => {
    const s = normalizeSkill(skill);
    CV_STATE.skills[index] = s;

    const div = document.createElement("div");
    div.className = "skill-item-form";
    div.appendChild(createHtmlFragment(`
      <div class="form-row">
        <input type="text" value="${escapeHtml(s.name)}" placeholder="Ex: Langages : JavaScript, Python" oninput="handleSkillUpdate(${index}, 'name', this.value)">
        <div style="display: flex; align-items: center; gap: 8px;">
          <select aria-label="Niveau" onchange="handleSkillUpdate(${index}, 'level', this.value)">
            <option value="" ${s.level === "" ? "selected" : ""}>Sans niveau</option>
            ${SKILL_LEVELS.map((l) => `<option value="${escapeHtml(l)}" ${l === s.level ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-sm" style="color: var(--error); padding: 4px;" onclick="removeSkill(${index})">×</button>
        </div>
      </div>
    `));
    container.appendChild(div);
  });
}

function addLanguage() {
  CV_STATE.languages.push({ name: "", level: "B1 – Intermédiaire" });
  renderLanguagesUI();
  saveState();
  updatePreview();
  focusNewItem("languagesContainer", ".language-item-form");
}

function removeLanguage(index) {
  CV_STATE.languages.splice(index, 1);
  renderLanguagesUI();
  saveState();
  updatePreview();
}

function handleLanguageUpdate(index, field, value) {
  CV_STATE.languages[index][field] = value;
  saveState();
  debouncedUpdatePreview();
}

function renderLanguagesUI() {
  const container = document.getElementById("languagesContainer");
  if (!container) return;
  container.replaceChildren();
  
  CV_STATE.languages.forEach((lang, index) => {
    let name, level;
    if (typeof lang === 'string') {
      const parts = lang.split(" - ");
      name = parts[0] || lang;
      level = parts[1] || "";
    } else {
      name = lang.name || "";
      level = lang.level;
    }
    level = normalizeLanguageLevel(level);
    CV_STATE.languages[index] = { name, level };

    // Un niveau personnalisé (ancien CV) reste proposé pour ne pas être perdu
    const options = LANGUAGE_LEVELS.includes(level) ? LANGUAGE_LEVELS : [...LANGUAGE_LEVELS, level];

    const div = document.createElement("div");
    div.className = "language-item-form";
    div.appendChild(createHtmlFragment(`
      <div class="form-row">
        <input type="text" value="${escapeHtml(name)}" placeholder="Langue" oninput="handleLanguageUpdate(${index}, 'name', this.value)">
        <div style="display: flex; align-items: center; gap: 8px;">
          <select aria-label="Niveau" onchange="handleLanguageUpdate(${index}, 'level', this.value)">
            ${options.map((l) => `<option value="${escapeHtml(l)}" ${l === level ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-sm" style="color: var(--error); padding: 4px;" onclick="removeLanguage(${index})">×</button>
        </div>
      </div>
    `));
    container.appendChild(div);
  });
}


function addHobby() {
  const input = document.getElementById("hobbyInput");
  if (input) input.focus();
}

function commitHobby(value, refocus = false) {
  const hobby = value.trim();
  if (!hobby) return;
  CV_STATE.hobbies.push(hobby);
  renderHobbiesUI();
  saveState();
  updatePreview();
  if (refocus) {
    const input = document.getElementById("hobbyInput");
    if (input) input.focus();
  }
}

function removeHobby(index) {
  CV_STATE.hobbies.splice(index, 1);
  renderHobbiesUI();
  saveState();
  updatePreview();
}

function renderHobbiesUI() {
  const container = document.getElementById("hobbiesContainer");
  if (!container) return;
  container.replaceChildren();

  CV_STATE.hobbies.forEach((hobby, index) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.appendChild(document.createTextNode(hobby));
    chip.appendChild(createHtmlFragment(`<span class="chip-remove" role="button" aria-label="Supprimer" onclick="removeHobby(${index})">×</span>`));
    container.appendChild(chip);
  });

  const input = document.createElement("input");
  input.type = "text";
  input.id = "hobbyInput";
  input.className = "chip-input";
  input.placeholder = "Loisir + Entrée";
  input.setAttribute("aria-label", "Ajouter un loisir");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitHobby(e.target.value, true);
    }
  });
  input.addEventListener("blur", (e) => commitHobby(e.target.value, false));
  container.appendChild(input);
}

function buildSafeState() {
  const e = escapeHtml;
  const cfg = getCountryConfig();
  const personal = Object.fromEntries(
    Object.entries(CV_STATE.personal).map(([k, v]) => [k, e(v)])
  );
  // La situation familiale ne figure jamais sur un CV français
  if (CV_STATE.country === "fr") personal.maritalStatus = "";
  return {
    personal,
    labels: cfg.labels,
    experiences: CV_STATE.experiences.map((x) => ({
      role: e(x.role), dates: e(x.dates), company: e(x.company), description: e(x.description),
      city: e(x.city), contract: e(x.contract),
    })),
    educationFirst: !!CV_STATE.educationFirst,
    educations: CV_STATE.educations.map((x) => ({
      degree: e(x.degree), equivalence: e(x.equivalence), dates: e(x.dates), school: e(x.school), description: e(x.description),
    })),
    skills: CV_STATE.skills.map((s) => {
      const n = normalizeSkill(s);
      return { name: e(n.name), level: e(n.level) };
    }),
    languages: CV_STATE.languages.map((l) => {
      const name = typeof l === "string" ? l : l.name;
      const level = typeof l === "string" ? "" : l.level;
      return { name: e(name), level: e(level) };
    }),
    hobbies: CV_STATE.hobbies.map((h) => e(h)),
    photo: CV_STATE.photo,
  };
}

function updatePreview() {
  const template = CV_STATE.template;
  cvPreview.className = `cv-page template-${template}`;
  const safe = buildSafeState();
  let html = "";
  if (template === "executive") html = renderExecutive(safe);
  else if (template === "creative") html = renderCreative(safe);
  else if (template === "classique") html = renderClassique(safe);
  else html = renderMinimal(safe);
  cvPreview.replaceChildren(createHtmlFragment(html));
  updateCompletionUI();
  updatePageWarning();
}

function updateCompletionUI() {
  const p = CV_STATE.personal;
  const checks = [
    (p.fullName || "").trim(),
    (p.jobTitle || "").trim(),
    (p.email || "").trim(),
    (p.phone || "").trim(),
    (p.location || "").trim(),
    (p.summary || "").trim(),
    CV_STATE.experiences.length,
    CV_STATE.educations.length,
    CV_STATE.skills.length,
    CV_STATE.languages.length,
  ];
  // La photo ne compte que là où elle est attendue
  if (getCountryConfig().photoExpected) checks.push(CV_STATE.photo);
  const done = checks.filter(Boolean).length;
  const pct = Math.round((done / checks.length) * 100);

  const fill = document.getElementById("completionFill");
  const val = document.getElementById("completionValue");
  if (fill) fill.style.width = pct + "%";
  if (val) val.textContent = pct + "%";
}

const A4_HEIGHT_PX = 1123;

// Le CV doit idéalement tenir sur une page (norme en France)
function updatePageWarning() {
  const warning = document.getElementById("pageWarning");
  if (!warning) return;
  // scrollHeight : la page est étirée par son conteneur flex, seul le contenu compte
  warning.hidden = cvPreview.scrollHeight <= A4_HEIGHT_PX + 2;
}

function equivalenceTag(edu) {
  return edu.equivalence
    ? ` <span style="font-weight: 500; font-size: 0.85em; color: #555;">(${edu.equivalence})</span>`
    : "";
}

// "Agence Pixel · Lyon · CDI" : le format attendu en France
function experienceMeta(exp) {
  return [exp.company, exp.city, exp.contract].filter(Boolean).join(" · ");
}

function joinParts(parts, sep = " • ") {
  return parts.filter(Boolean).join(sep);
}

// Une mission par ligne → liste à puces (présentation attendue en France).
// Un texte d'une seule ligne reste un paragraphe. `text` est déjà échappé.
function missionList(text, style) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*–]\s*/, ""))
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return `<p style="${style}">${lines[0]}</p>`;
  return `<div style="${style}">${lines
    .map((l) => `<div style="display: flex; gap: 6px;"><span aria-hidden="true">•</span><span>${l}</span></div>`)
    .join("")}</div>`;
}

// Formation d'abord pour un étudiant / jeune diplômé, expériences d'abord sinon
function orderSections(S, experiencesHtml, educationsHtml) {
  return S.educationFirst ? educationsHtml + experiencesHtml : experiencesHtml + educationsHtml;
}

const debouncedUpdatePreview = debounce(updatePreview, 300);

function renderExecutive(S) {
  const CV_STATE = S;
  const p = S.personal;
  return `
    <header class="cv-header">
      ${CV_STATE.photo ? `<div style="width: 110px; height: 110px; border-radius: 50%; border: 3px solid var(--primary); margin: 0 auto 10px; overflow: hidden; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.12);"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover; object-position: center top; border-radius: 50%;"></div>` : ""}
      <h1 class="cv-name" style="font-size: 1.8rem; margin-bottom: 2px; white-space: pre-line;">${p.fullName || "Votre Nom"}</h1>
      <p class="cv-title" style="font-size: 0.95rem; margin-bottom: 10px; white-space: pre-line;">${p.jobTitle || "Votre Titre Professionnel"}</p>
      <div class="cv-info-list" style="color: #000 !important; gap: 8px; font-size: 0.75rem; white-space: pre-line;">
        ${p.email ? `<span>${p.email}</span>` : ""}
        ${p.phone ? `<span>${p.phone}</span>` : ""}
        ${p.location ? `<span>${p.location}</span>` : ""}
        ${p.license ? `<span>${p.license}</span>` : ""}
        ${p.age ? `<span>${p.age} ans</span>` : ""}
        ${p.nationality ? `<span>${p.nationality}</span>` : ""}
        ${p.maritalStatus ? `<span>${p.maritalStatus}</span>` : ""}
        ${p.website ? `<span>${p.website.replace("https://", "")}</span>` : ""}
      </div>
    </header>

    <div style="display: grid; grid-template-columns: 2.2fr 1fr; gap: 20px;">
      <div>
        ${p.summary ? `<section class="cv-section" style="margin-bottom: 12px;"><h2 class="cv-section-title" style="margin-bottom: 5px;">Profil</h2><p style="font-size: 0.85rem; color: #000; line-height: 1.35; white-space: pre-line;">${p.summary}</p></section>` : ""}

        ${orderSections(S, `
        <section class="cv-section" style="margin-bottom: 12px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Expériences</h2>
          ${CV_STATE.experiences.map((exp) => `
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; gap: 12px; font-weight: 700; color: #000; font-size: 0.85rem;">
                <span style="white-space: pre-line;">${exp.role}</span>
                <span style="color: var(--primary); white-space: pre-line; flex-shrink: 0;">${exp.dates}</span>
              </div>
              <div style="font-style: italic; color: #333; font-size: 0.8rem; margin-bottom: 1px; white-space: pre-line;">${experienceMeta(exp)}</div>
              ${missionList(exp.description, "font-size: 0.82rem; color: #000; line-height: 1.35;")}
            </div>
          `).join("")}
        </section>
        `, `
        <section class="cv-section" style="margin-bottom: 12px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Formation</h2>
          ${CV_STATE.educations.map((edu) => `
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; gap: 12px; font-weight: 700; color: #000; font-size: 0.85rem;">
                <span style="white-space: pre-line;">${edu.degree}${equivalenceTag(edu)}</span>
                <span style="white-space: pre-line; flex-shrink: 0;">${edu.dates || ""}</span>
              </div>
              <div style="color: #333; font-size: 0.8rem; white-space: pre-line;">${edu.school}</div>
              ${edu.description ? `<p style="font-size: 0.75rem; color: #000; white-space: pre-line; line-height: 1.2; margin-top: 2px;">${edu.description}</p>` : ""}
            </div>
          `).join("")}
        </section>
        `)}
      </div>

      <div>
        <section class="cv-section" style="margin-bottom: 12px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Compétences</h2>
          <div style="display: flex; flex-direction: column; gap: 3px;">
            ${CV_STATE.skills.map((skill) => `
                <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.78rem; color: #000; padding: 2px 0; border-bottom: 1px solid #eee;">
                  <span style="font-weight: 600;">${skill.name}</span>
                  ${skill.level ? `<span style="color: var(--primary); font-weight: 600; font-size: 0.72rem; flex-shrink: 0; margin-left: 8px;">${skill.level}</span>` : ""}
                </div>
              `).join("")}
          </div>
        </section>

        ${CV_STATE.languages.length > 0 ? `
          <section class="cv-section" style="margin-bottom: 12px;">
            <h2 class="cv-section-title" style="margin-bottom: 8px;">Langues</h2>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${CV_STATE.languages.map(l => {
                const name = typeof l === 'string' ? l : l.name;
                const level = typeof l === 'string' ? "" : l.level;
                return `
                  <div style="font-size: 0.75rem; color: #000; font-weight: 500; display: flex; justify-content: space-between;">
                    <span>• ${name}</span>
                    <span style="font-weight: 400; font-style: italic; font-size: 0.7rem;">${level}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        ` : ""}

        ${CV_STATE.hobbies.length > 0 ? `
          <section class="cv-section">
            <h2 class="cv-section-title" style="margin-bottom: 8px;">${S.labels.hobbies}</h2>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${CV_STATE.hobbies.map(h => `<div style="font-size: 0.75rem; color: #000; font-weight: 500;">• ${h}</div>`).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    </div>
  `;
}

function renderCreative(S) {
  const CV_STATE = S;
  const p = S.personal;
  return `
    <div class="cv-sidebar" style="background: var(--primary); color: var(--primary-contrast) !important;">
      ${CV_STATE.photo ? `<div style="width: 150px; height: 150px; flex-shrink: 0; border-radius: 50%; overflow: hidden; margin: 0 auto 20px; box-shadow: 0 6px 18px rgba(0,0,0,0.25); border: 4px solid #fff;"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover; object-position: center top; border-radius: 50%;"></div>` : ""}
      
      <div style="margin-bottom: 20px;">
        <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">Contact</h3>
        <div style="font-size: 0.7rem; display: flex; flex-direction: column; gap: 6px; color: var(--primary-contrast); white-space: pre-line;">
          ${p.email ? `<div><strong style="display:block;opacity:0.8;">Email</strong>${p.email}</div>` : ""}
          ${p.phone ? `<div><strong style="display:block;opacity:0.8;">Tel</strong>${p.phone}</div>` : ""}
          ${p.location ? `<div><strong style="display:block;opacity:0.8;">Lieu</strong>${p.location}</div>` : ""}
          ${p.license ? `<div><strong style="display:block;opacity:0.8;">Permis / Mobilité</strong>${p.license}</div>` : ""}
          ${p.age ? `<div><strong style="display:block;opacity:0.8;">Âge</strong>${p.age} ans</div>` : ""}
          ${p.nationality ? `<div><strong style="display:block;opacity:0.8;">Nationalité</strong>${p.nationality}</div>` : ""}
          ${p.maritalStatus ? `<div><strong style="display:block;opacity:0.8;">Situation familiale</strong>${p.maritalStatus}</div>` : ""}
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">Compétences</h3>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${CV_STATE.skills.map((s) => `
              <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.72rem; color: var(--primary-contrast); padding-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.2);">
                <span style="font-weight: 700;">${s.name}</span>
                ${s.level ? `<span style="font-size: 0.7rem; flex-shrink: 0; margin-left: 8px;">${s.level}</span>` : ""}
              </div>
            `).join("")}
        </div>
      </div>

      ${CV_STATE.languages.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">Langues</h3>
          <div style="font-size: 0.7rem; display: flex; flex-direction: column; gap: 4px; color: var(--primary-contrast);">
            ${CV_STATE.languages.map(l => {
              const name = typeof l === 'string' ? l : l.name;
              const level = typeof l === 'string' ? "" : l.level;
              return `
                <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
                  <span style="white-space: nowrap;">• ${name}</span>
                  <span style="font-weight: 400; font-size: 0.7rem; text-align: right;">${level}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      ` : ""}

      ${CV_STATE.hobbies.length > 0 ? `
        <div>
          <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">${S.labels.hobbies}</h3>
          <div style="font-size: 0.7rem; display: flex; flex-direction: column; gap: 4px; color: var(--primary-contrast);">
            ${CV_STATE.hobbies.map(h => `<div>• ${h}</div>`).join("")}
          </div>
        </div>
      ` : ""}

      ${p.website ? `
        <div style="margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.25);">
          <h3 style="text-transform: uppercase; font-size: 0.7rem; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; color: var(--primary-contrast); opacity: 0.85;">Portfolio</h3>
          <div style="font-size: 0.7rem; word-break: break-word; color: var(--primary-contrast);">${p.website.replace("https://", "").replace("http://", "")}</div>
        </div>
      ` : ""}
    </div>
    <div class="cv-main" style="color: #000 !important;">
      <header style="margin-bottom: 25px;">
        <h1 class="cv-name" style="color: var(--primary); margin-bottom: 2px; font-size: 1.6rem; white-space: pre-line;">${p.fullName || "Votre Nom"}</h1>
        <p style="font-size: 1.1rem; font-weight: 600; color: #000; white-space: pre-line;">${p.jobTitle || "Votre Titre"}</p>
      </header>

      ${p.summary ? `<section style="margin-bottom: 25px;"><h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Profil</h2><p style="font-size: 0.85rem; color: #000; line-height: 1.4; white-space: pre-line;">${p.summary}</p></section>` : ""}

      ${orderSections(S, `
      <section style="margin-bottom: 25px;">
        <h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Expériences</h2>
        ${CV_STATE.experiences.map((exp) => `
          <div style="margin-bottom: 15px;">
            <div style="font-weight: 700; font-size: 0.95rem; color: #000; white-space: pre-line;">${exp.role}</div>
            <div style="color: var(--primary); font-size: 0.85rem; font-weight: 700; margin-bottom: 4px; white-space: pre-line;">${joinParts([experienceMeta(exp), exp.dates])}</div>
            ${missionList(exp.description, "font-size: 0.82rem; color: #000; line-height: 1.4;")}
          </div>
        `).join("")}
      </section>
      `, `
      <section style="margin-bottom: 25px;">
        <h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Formation</h2>
        ${CV_STATE.educations.map((edu) => `
          <div style="margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 0.9rem; color: #000; white-space: pre-line;">${edu.degree}${equivalenceTag(edu)}</div>
            <div style="font-size: 0.85rem; color: #333; white-space: pre-line;">${joinParts([edu.school, edu.dates])}</div>
            ${edu.description ? `<p style="font-size: 0.8rem; color: #000; white-space: pre-line; line-height: 1.4; margin-top: 2px;">${edu.description}</p>` : ""}
          </div>
        `).join("")}
      </section>
      `)}
    </div>
  `;
}

function renderMinimal(S) {
  const CV_STATE = S;
  const p = S.personal;
  return `
    <header style="border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; color: #000;">
      <div style="display: flex; align-items: center; gap: 20px;">
        ${CV_STATE.photo ? `<div style="width: 110px; height: 110px; border-radius: 50%; border: 3px solid #000; overflow: hidden; display: block;"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover; object-position: center top; border-radius: 50%;"></div>` : ""}
        <div>
          <h1 style="font-family: var(--font-serif); font-size: 2.2rem; color: #000; margin: 0; font-weight: 700; white-space: pre-line;">${p.fullName || "Nom"}</h1>
          <p style="font-size: 1rem; color: #000; margin-top: 2px; font-weight: 500; white-space: pre-line;">${p.jobTitle || "Titre"}</p>
        </div>
      </div>
      <div style="text-align: right; font-size: 0.8rem; color: #000; font-weight: 500; line-height: 1.6;">
        ${p.email ? `<div>${p.email}</div>` : ""}
        ${p.phone ? `<div>${p.phone}</div>` : ""}
        ${p.location ? `<div>${p.location}</div>` : ""}
        ${p.license ? `<div>${p.license}</div>` : ""}
        ${p.age ? `<div>${p.age} ans</div>` : ""}
        ${p.nationality ? `<div>${p.nationality}</div>` : ""}
        ${p.maritalStatus ? `<div>${p.maritalStatus}</div>` : ""}
      </div>
    </header>

    ${p.summary ? `<section style="margin-bottom: 25px; color: #000;"><h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 10px; font-weight: 700;">Profil</h2><p style="font-size: 0.85rem; color: #000; line-height: 1.5; white-space: pre-line;">${p.summary}</p></section>` : ""}

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 40px; color: #000;">
      <div>
        ${orderSections(S, `
        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 15px; font-weight: 700;">Expérience Professionnelle</h2>
          ${CV_STATE.experiences.map((exp) => `
            <div style="margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
                <strong style="font-size: 1rem; color: #000; white-space: pre-line;">${exp.role}</strong>
                <span style="font-size: 0.8rem; color: #000; font-weight: 600; flex-shrink: 0;">${exp.dates}</span>
              </div>
              <div style="font-size: 0.9rem; margin-bottom: 6px; color: #333; font-weight: 500; white-space: pre-line;">${experienceMeta(exp)}</div>
              ${missionList(exp.description, "font-size: 0.82rem; color: #000; border-left: 2px solid #000; padding-left: 12px; line-height: 1.4;")}
            </div>
          `).join("")}
        </section>
        `, `
        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 15px; font-weight: 700;">Formation</h2>
          ${CV_STATE.educations.map((edu) => `
            <div style="margin-bottom: 15px;">
              <div style="font-weight: 700; font-size: 0.9rem; color: #000; margin-bottom: 1px; white-space: pre-line;">${edu.degree}${equivalenceTag(edu)}</div>
              <div style="font-size: 0.85rem; color: #333; font-weight: 500; white-space: pre-line;">${edu.school}</div>
              <div style="font-size: 0.8rem; color: #555; font-style: italic;">${edu.dates}</div>
              ${edu.description ? `<p style="font-size: 0.8rem; color: #000; border-left: 2px solid #000; padding-left: 12px; line-height: 1.4; margin-top: 4px; white-space: pre-line;">${edu.description}</p>` : ""}
            </div>
          `).join("")}
        </section>
        `)}
      </div>

      <div>
        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 15px; font-weight: 700;">Compétences</h2>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${CV_STATE.skills.map((s) => `
                <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.85rem; padding-bottom: 3px; border-bottom: 1px solid #eee;">
                  <span style="font-weight: 600;">${s.name}</span>
                  ${s.level ? `<span style="font-size: 0.75rem; color: #555; flex-shrink: 0; margin-left: 8px;">${s.level}</span>` : ""}
                </div>
              `).join("")}
          </div>
        </section>

        ${CV_STATE.languages.length > 0 ? `
          <section style="margin-bottom: 25px;">
            <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 15px; font-weight: 700;">Langues</h2>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${CV_STATE.languages.map(l => {
                const name = typeof l === 'string' ? l : l.name;
                const level = typeof l === 'string' ? "" : l.level;
                return `
                  <div style="font-size: 0.85rem; color: #000; font-weight: 500; display: flex; justify-content: space-between;">
                    <span>• ${name}</span>
                    <span style="font-size: 0.75rem; font-weight: 400; font-style: italic;">${level}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        ` : ""}

        ${CV_STATE.hobbies.length > 0 ? `
          <section>
            <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 15px; font-weight: 700;">${S.labels.hobbies}</h2>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${CV_STATE.hobbies.map(h => `<div style="font-size: 0.85rem; color: #000; font-weight: 500;">• ${h}</div>`).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    </div>
  `;
}

// Une colonne, noir et blanc : le format français le plus répandu,
// et le mieux lu par les logiciels de tri des candidatures
function renderClassique(S) {
  const p = S.personal;
  const heading = (title) =>
    `<h2 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: #000; border-bottom: 1px solid #000; padding-bottom: 2px; margin: 0 0 8px;">${title}</h2>`;
  const contact = [
    p.email, p.phone, p.location, p.license,
    p.age ? `${p.age} ans` : "", p.nationality, p.maritalStatus,
    p.website ? p.website.replace(/^https?:\/\//, "") : "",
  ];

  const experiences = S.experiences.length ? `
    <section style="margin-bottom: 14px;">
      ${heading("Expériences professionnelles")}
      ${S.experiences.map((exp) => `
        <div style="margin-bottom: 9px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 0.88rem; font-weight: 700;">
            <span style="white-space: pre-line;">${exp.role}</span>
            <span style="flex-shrink: 0; font-weight: 600;">${exp.dates}</span>
          </div>
          <div style="font-size: 0.82rem; font-style: italic; color: #333; margin-bottom: 2px; white-space: pre-line;">${experienceMeta(exp)}</div>
          ${missionList(exp.description, "font-size: 0.82rem; line-height: 1.35;")}
        </div>
      `).join("")}
    </section>` : "";

  const educations = S.educations.length ? `
    <section style="margin-bottom: 14px;">
      ${heading("Formation")}
      ${S.educations.map((edu) => `
        <div style="margin-bottom: 7px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 0.88rem; font-weight: 700;">
            <span style="white-space: pre-line;">${edu.degree}${equivalenceTag(edu)}</span>
            <span style="flex-shrink: 0; font-weight: 600;">${edu.dates}</span>
          </div>
          <div style="font-size: 0.82rem; color: #333; white-space: pre-line;">${edu.school}</div>
          ${edu.description ? `<p style="font-size: 0.82rem; line-height: 1.35; white-space: pre-line;">${edu.description}</p>` : ""}
        </div>
      `).join("")}
    </section>` : "";

  return `
    <header style="display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 16px; color: #000;">
      <div>
        <h1 style="font-size: 1.9rem; font-weight: 700; line-height: 1.15; margin: 0; white-space: pre-line;">${p.fullName || "Votre Nom"}</h1>
        <p style="font-size: 1.05rem; font-weight: 600; margin: 2px 0 8px; white-space: pre-line;">${p.jobTitle || "Votre Titre Professionnel"}</p>
        <p style="font-size: 0.8rem; line-height: 1.5;">${joinParts(contact, " | ")}</p>
      </div>
      ${S.photo ? `<img src="${S.photo}" alt="" style="width: 95px; height: 95px; object-fit: cover; object-position: center top; border-radius: 4px; flex-shrink: 0;">` : ""}
    </header>

    <div style="color: #000;">
      ${p.summary ? `<section style="margin-bottom: 14px;">${heading("Profil")}<p style="font-size: 0.85rem; line-height: 1.4; white-space: pre-line;">${p.summary}</p></section>` : ""}

      ${orderSections(S, experiences, educations)}

      ${S.skills.length ? `
        <section style="margin-bottom: 14px;">
          ${heading("Compétences")}
          ${S.skills.map((s) => `<div style="font-size: 0.82rem; line-height: 1.5;">• ${s.name}${s.level ? ` — ${s.level}` : ""}</div>`).join("")}
        </section>` : ""}

      ${S.languages.length ? `
        <section style="margin-bottom: 14px;">
          ${heading("Langues")}
          <p style="font-size: 0.82rem; line-height: 1.5;">${S.languages.map((l) => `${l.name}${l.level ? ` (${l.level})` : ""}`).join(" · ")}</p>
        </section>` : ""}

      ${S.hobbies.length ? `
        <section>
          ${heading(S.labels.hobbies)}
          <p style="font-size: 0.82rem; line-height: 1.5;">${S.hobbies.join(" · ")}</p>
        </section>` : ""}
    </div>
  `;
}

function pdfFileName() {
  const name = (CV_STATE.personal.fullName || "Export")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `CV_${name || "Export"}.pdf`;
}

function ensureValidForm() {
  const firstInvalid = validateAll();
  if (!firstInvalid) return true;
  firstInvalid.focus();
  firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("Veuillez remplir les champs obligatoires (*)", "error");
  return false;
}

// PDF avec du vrai texte (lisible par les logiciels de tri des recruteurs),
// via la boîte d'impression du navigateur et les styles @media print
function printPDF() {
  if (!ensureValidForm()) return;
  updatePreview();

  const previousTitle = document.title;
  document.title = pdfFileName().replace(/\.pdf$/, "");
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);

  showToast("Choisissez « Enregistrer au format PDF » comme imprimante");
  setTimeout(() => window.print(), 400);
}

// PDF image (rendu identique à l'aperçu, mais texte non sélectionnable)
async function downloadPDF() {
  const element = document.getElementById('cvPreview');

  if (!element) {
    showToast("Erreur: Aperçu introuvable", "error");
    return;
  }

  if (!ensureValidForm()) return;

  showToast("Préparation du PDF...");

  updatePreview();

  const existingContainer = document.getElementById('pdf-export-container');
  if (existingContainer) existingContainer.remove();

  const A4_WIDTH_PX = 794;

  const container = document.createElement('div');
  container.id = 'pdf-export-container';
  
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${A4_WIDTH_PX}px`,
    height: `${A4_HEIGHT_PX}px`,
    background: 'white',
    zIndex: '-1',
    opacity: '0.01',
    pointerEvents: 'none',
    overflow: 'hidden'
  });
  
  const clone = element.cloneNode(true);
  clone.classList.add('pdf-rendering');
  
  Object.assign(clone.style, {
    transform: 'none',
    webkitTransform: 'none',
    margin: '0',
    padding: clone.classList.contains('template-creative') ? '0' : '15mm',
    width: `${A4_WIDTH_PX}px`,
    height: `${A4_HEIGHT_PX}px`,
    minHeight: `${A4_HEIGHT_PX}px`,
    maxHeight: `${A4_HEIGHT_PX}px`,
    display: 'block',
    opacity: '1',
    visibility: 'visible',
    position: 'relative'
  });
  
  container.appendChild(clone);
  document.body.appendChild(container);

  const overflows = clone.scrollHeight > A4_HEIGHT_PX + 2;

  const opt = {
    margin: 0,
    filename: pdfFileName(),
    image: { type: 'jpeg', quality: 1.0 },
    html2canvas: { 
      scale: 2, 
      useCORS: true,
      allowTaint: true,
      letterRendering: true,
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      logging: false
    },
    jsPDF: { unit: 'px', format: [A4_WIDTH_PX, A4_HEIGHT_PX], orientation: 'portrait' }
  };
  
  try {
    const images = clone.getElementsByTagName('img');
    await Promise.all(
      Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => { img.onload = res; img.onerror = res; });
      })
    );
    
    if (document.fonts) await document.fonts.ready;

    setTimeout(() => {
      html2pdf().set(opt).from(clone).toPdf().get('pdf').then((pdf) => {
        const totalPages = pdf.internal.getNumberOfPages();
        if (totalPages > 1) {
          for (let i = totalPages; i > 1; i--) pdf.deletePage(i);
        }
      }).save().then(() => {
        if (document.body.contains(container)) container.remove();
        if (overflows) {
          showToast("PDF créé, mais le bas du CV a été coupé : raccourcissez-le ou utilisez « Imprimer le PDF »", "error");
        } else {
          showToast("PDF terminé avec succès !");
        }
      }).catch(err => {
        console.error("PDF Export Error:", err);
        if (document.body.contains(container)) container.remove();
        showToast("Erreur d'exportation", "error");
      });
    }, 1200);
  } catch (err) {
    console.error("PDF Init Error:", err);
    if (document.body.contains(container)) container.remove();
    showToast("Erreur de préparation PDF", "error");
  }
}

function resetCV(withUndo = false) {
  LAST_STATE_BACKUP = JSON.parse(JSON.stringify(CV_STATE));

  CV_STATE = {
    ...defaultState(),
    template: CV_STATE.template,
    theme: CV_STATE.theme,
    country: CV_STATE.country,
    educationFirst: CV_STATE.educationFirst,
  };

  const photoPreview = document.getElementById("photoPreview");
  if (photoPreview) {
    const placeholder = document.createElement("span");
    placeholder.className = "initials-placeholder";
    placeholder.id = "initialsPlaceholder";
    placeholder.textContent = "??";
    photoPreview.replaceChildren(placeholder);
  }
  
  syncFormWithState();
  updatePreview();
  saveState();

  if (withUndo) {
    showToast("Formulaire vidé. ", "info", {
      label: "Annuler (Récupérer)",
      callback: restoreLastState
    });
  } else {
    showToast("Formulaire réinitialisé.", "success");
  }
}

function restoreLastState() {
  if (LAST_STATE_BACKUP) {
    CV_STATE = JSON.parse(JSON.stringify(LAST_STATE_BACKUP));
    syncFormWithState();
    updatePreview();
    saveState();
    showToast("Données restaurées !", "success");
    LAST_STATE_BACKUP = null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(CV_STATE));
}

function applyTheme(themeKey) {
  const color = THEMES[themeKey] || THEMES.ocean;
  document.documentElement.style.setProperty("--primary", color);
  document.documentElement.style.setProperty("--primary-dark", color === "#FFFFFF" ? "#F1F5F9" : color + "CC");
  document.documentElement.style.setProperty("--primary-light", color === "#FFFFFF" ? "#F8FAF8" : color + "1A");
  
  const contrastColor = getContrastColor(color);
  document.documentElement.style.setProperty("--primary-contrast", contrastColor);
}

function getContrastColor(hexcolor) {
  if (hexcolor.toUpperCase() === "#FFFFFF") return "#1e293b";
  
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff";
}

const EXAMPLES = {
  fr: {
    personal: {
      fullName: "Thomas Moreau",
      jobTitle: "Développeur Web Fullstack",
      email: "thomas.moreau@email.fr",
      phone: "+33 6 12 34 56 78",
      location: "Lyon (69003)",
      license: "Permis B, véhiculé",
      age: "",
      nationality: "",
      maritalStatus: "",
      website: "https://linkedin.com/in/thomasmoreau",
      summary: "Développeur fullstack avec 4 ans d'expérience, je conçois des applications web fiables et accessibles. À la recherche d'un CDI dans une équipe produit à Lyon ou en télétravail partiel."
    },
    experiences: [
      { id: 1, company: "Agence Pixel", city: "Lyon", contract: "CDI", role: "Développeur Fullstack", dates: "Sept. 2022 - Présent", description: "Développement d'applications React / Node.js pour des clients PME.\nMise en place des tests automatisés (couverture passée de 20 % à 75 %).\nAccompagnement de 2 alternants." },
      { id: 2, company: "Startup Kiwi", city: "Villeurbanne", contract: "Alternance", role: "Développeur Web", dates: "Sept. 2020 - Août 2022", description: "Refonte du site vitrine et du back-office.\nAmélioration des performances (temps de chargement divisé par 2)." }
    ],
    educations: [
      { id: 3, school: "Université Lyon 1", degree: "Licence professionnelle Métiers de l'informatique", equivalence: "Bac+3", dates: "2021 - 2022", description: "En alternance." },
      { id: 4, school: "Lycée La Martinière, Lyon", degree: "BTS SIO option SLAM", equivalence: "Bac+2", dates: "2019 - 2021", description: "" }
    ],
    skills: [
      { name: "Langages : JavaScript, TypeScript, SQL", level: "" },
      { name: "Frameworks : React, Node.js, Express", level: "" },
      { name: "Outils : Git, Docker, CI/CD", level: "" },
      { name: "Méthodes : Agile / Scrum, tests automatisés", level: "" }
    ],
    languages: [
      { name: "Français", level: "Langue maternelle" },
      { name: "Anglais", level: "B2 – Avancé" },
      { name: "Espagnol", level: "A2 – Élémentaire" }
    ],
    hobbies: ["Escalade", "Bénévolat associatif", "Photographie"],
  },
  ci: {
    personal: {
      fullName: "Abdoulaye Traoré",
      jobTitle: "Développeur Web Fullstack",
      email: "abdoulaye.traore@email.com",
      phone: "+225 07 08 09 10 11",
      location: "Abidjan, Côte d'Ivoire",
      license: "Permis B",
      age: "28",
      nationality: "Ivoirienne",
      maritalStatus: "Célibataire",
      website: "https://github.com/atraore",
      summary: "Passionné par le développement web et les nouvelles technologies, j'ai plus de 5 ans d'expérience dans la création d'applications web performantes et scalables. Spécialisé en JavaScript, React et Node.js."
    },
    experiences: [
      { id: 1, company: "Tech Solution Africa", city: "Abidjan", contract: "CDI", role: "Fullstack Developer", dates: "2021 - Présent", description: "Développement de plateformes E-commerce haute performance.\nManagement d'une équipe de 3 développeurs.\nOptimisation du SEO et des performances de chargement." },
      { id: 2, company: "Innov CI", city: "Abidjan", contract: "CDD", role: "Développeur Junior", dates: "2019 - 2021", description: "Maintenance applicative et création de nouvelles features sur des applications existantes.\nApprentissage des bonnes pratiques de code et des tests unitaires." }
    ],
    educations: [
      { id: 3, school: "ESATIC Abidjan", degree: "Master en Systèmes d'Information", equivalence: "Bac+5", dates: "2017 - 2019", description: "" }
    ],
    skills: [
      { name: "JavaScript", level: "Expert" },
      { name: "React.js", level: "Avancé" },
      { name: "Node.js", level: "Avancé" },
      { name: "PostgreSQL", level: "Intermédiaire" },
      { name: "Docker", level: "Intermédiaire" }
    ],
    languages: [
      { name: "Français", level: "Langue maternelle" },
      { name: "Anglais", level: "B2 – Avancé" },
      { name: "Malinké", level: "C1 – Courant" }
    ],
    hobbies: ["Football", "Lecture", "Voyages"],
  },
};

function loadExampleData() {
  const country = COUNTRIES[CV_STATE.country] ? CV_STATE.country : "fr";
  CV_STATE = mergeWithDefaults({
    ...JSON.parse(JSON.stringify(EXAMPLES[country])),
    photo: null,
    template: CV_STATE.template,
    theme: CV_STATE.theme,
    educationFirst: CV_STATE.educationFirst,
    country,
  });
  syncFormWithState();
  updatePreview();
  saveState();
  showToast(country === "fr" ? "Exemple de CV français chargé" : "Exemple de CV ivoirien chargé");
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(CV_STATE));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "mon_cv_data.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function importData() {
  const input = document.getElementById("importInput");
  if (input) input.click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || typeof data.personal !== "object") {
        throw new Error("Format inattendu");
      }
      if (data.photo && !/^data:image\//.test(data.photo)) data.photo = null;
      LAST_STATE_BACKUP = JSON.parse(JSON.stringify(CV_STATE));
      CV_STATE = mergeWithDefaults(data);
      syncFormWithState();
      updatePreview();
      saveState();
      showToast("CV importé avec succès", "info", {
        label: "Annuler",
        callback: restoreLastState,
      });
    } catch (err) {
      console.error("Import Error:", err);
      showToast("Fichier JSON invalide", "error");
    }
  };
  reader.readAsText(file);
}

init();
