"use strict";

// --- CONFIG & CONSTANTS ---
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
  white: "#FFFFFF",
};

let CV_STATE = {
  personal: {
    fullName: "",
    jobTitle: "",
    email: "",
    phone: "",
    location: "",
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
};

let LAST_STATE_BACKUP = null;

// --- DOM REFERENCES ---
const dropZone = document.getElementById("dropZone");
const photoInput = document.getElementById("photoInput");
const cvPreview = document.getElementById("cvPreview");
const toast = document.getElementById("toast");

// --- UTILITIES ---
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const showToast = (message, type = "info", action = null) => {
  toast.innerHTML = message;
  
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
  
  // Longer duration if there is an action button
  const duration = action ? 6000 : 3000;
  setTimeout(() => toast.classList.remove("show"), duration);
};

// --- INITIALIZATION ---
function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      CV_STATE = JSON.parse(saved);
      // Backwards compatibility for new fields
      if (!CV_STATE.languages) CV_STATE.languages = [];
      if (!CV_STATE.hobbies) CV_STATE.hobbies = [];
      syncFormWithState();
    } catch (e) {
      console.error("Error loading state", e);
    }
  }
  setupEventListeners();
  updatePreview();
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

  renderDynamicListUI("experiences");
  renderDynamicListUI("educations");
  renderSkillsUI();
  renderLanguagesUI();
  renderHobbiesUI();
}

// --- EVENT HANDLERS ---
function setupEventListeners() {
  document.querySelectorAll('[data-state^="personal."]').forEach((input) => {
    input.addEventListener("input", (e) => {
      const key = e.target.dataset.state.split(".")[1];
      CV_STATE.personal[key] = e.target.value;
      saveState();
      updatePreview();
      if (key === "fullName") updateInitials();
    });
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
}

// --- PHOTO LOGIC ---
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
  container.innerHTML = `<img src="${src}" class="preview-img" alt="Profile">`;
}

function updateInitials() {
  const name = CV_STATE.personal.fullName || "";
  const initials = name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  if (!CV_STATE.photo) {
    document.getElementById("initialsPlaceholder").textContent = initials || "??";
  }
}

// --- DYNAMIC SECTIONS LOGIC ---
function addDynamicItem(type) {
  const item = type === "experiences"
      ? { id: Date.now(), company: "", role: "", dates: "", description: "" }
      : { id: Date.now(), school: "", degree: "", dates: "", description: "" };

  CV_STATE[type].push(item);
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

function renderDynamicListUI(type) {
  const container = document.getElementById(`${type}Container`);
  if (!container) return;
  container.innerHTML = "";

  CV_STATE[type].forEach((item) => {
    const div = document.createElement("div");
    div.className = "dynamic-item";

    if (type === "experiences") {
      div.innerHTML = `
        <div class="form-row">
          <input type="text" placeholder="Entreprise" value="${item.company}" oninput="handleDynamicInput('experiences', ${item.id}, 'company', this.value)">
          <input type="text" placeholder="Dates (ex: 2020 - Présent)" value="${item.dates}" oninput="handleDynamicInput('experiences', ${item.id}, 'dates', this.value)">
        </div>
        <input type="text" placeholder="Poste" value="${item.role}" oninput="handleDynamicInput('experiences', ${item.id}, 'role', this.value)">
        <textarea placeholder="Description des missions..." oninput="handleDynamicInput('experiences', ${item.id}, 'description', this.value)">${item.description}</textarea>
        <div class="item-controls">
          <span class="drag-handle">⠿</span>
          <button class="btn btn-ghost btn-sm" style="color: var(--error)" onclick="removeDynamicItem('experiences', ${item.id})">Supprimer</button>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="form-row">
          <input type="text" placeholder="École / Université" value="${item.school}" oninput="handleDynamicInput('educations', ${item.id}, 'school', this.value)">
          <input type="text" placeholder="Dates" value="${item.dates}" oninput="handleDynamicInput('educations', ${item.id}, 'dates', this.value)">
        </div>
        <input type="text" placeholder="Diplôme" value="${item.degree}" oninput="handleDynamicInput('educations', ${item.id}, 'degree', this.value)">
        <div class="item-controls">
          <span class="drag-handle">⠿</span>
          <button class="btn btn-ghost btn-sm" style="color: var(--error)" onclick="removeDynamicItem('educations', ${item.id})">Supprimer</button>
        </div>
      `;
    }
    container.appendChild(div);
  });
}

// --- SKILLS, LANGUAGES, HOBBIES LOGIC ---
function addSkill() {
  const name = prompt("Nom de la compétence :");
  if (name) {
    CV_STATE.skills.push({ name: name, percentage: 80 });
    renderSkillsUI();
    saveState();
    updatePreview();
  }
}

function removeSkill(index) {
  CV_STATE.skills.splice(index, 1);
  renderSkillsUI();
  saveState();
  updatePreview();
}

function handleSkillUpdate(index, field, value) {
  CV_STATE.skills[index][field] = field === 'percentage' ? parseInt(value) || 0 : value;
  saveState();
  debouncedUpdatePreview();
}

function renderSkillsUI() {
  const container = document.getElementById("skillsContainer");
  if (!container) return;
  container.innerHTML = "";
  
  CV_STATE.skills.forEach((skill, index) => {
    // Check if skill is object (new format) or string (old format)
    const name = typeof skill === 'string' ? skill : skill.name;
    const percentage = typeof skill === 'string' ? 80 : (skill.percentage || 0);
    
    // Auto-migrate old format if needed
    if (typeof skill === 'string') {
      CV_STATE.skills[index] = { name: name, percentage: percentage };
    }

    const div = document.createElement("div");
    div.className = "skill-item-form";
    div.innerHTML = `
      <div class="form-row">
        <input type="text" value="${name}" placeholder="Compétence" oninput="handleSkillUpdate(${index}, 'name', this.value)">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="range" min="0" max="100" value="${percentage}" oninput="this.nextElementSibling.value = this.value + '%'; handleSkillUpdate(${index}, 'percentage', this.value)">
          <output style="font-size: 0.8rem; width: 35px; font-weight: 600;">${percentage}%</output>
          <button class="btn btn-ghost btn-sm" style="color: var(--error); padding: 4px;" onclick="removeSkill(${index})">×</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function addLanguage() {
  const name = prompt("Langue (ex: Anglais) :");
  if (name) {
    CV_STATE.languages.push({ name: name, level: "Intermédiaire" });
    renderLanguagesUI();
    saveState();
    updatePreview();
  }
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
  container.innerHTML = "";
  
  CV_STATE.languages.forEach((lang, index) => {
    // Handle old string format
    let name, level;
    if (typeof lang === 'string') {
      const parts = lang.split(" - ");
      name = parts[0] || lang;
      level = parts[1] || "Intermédiaire";
      CV_STATE.languages[index] = { name, level };
    } else {
      name = lang.name;
      level = lang.level;
    }

    const div = document.createElement("div");
    div.className = "language-item-form";
    div.innerHTML = `
      <div class="form-row">
        <input type="text" value="${name}" placeholder="Langue" oninput="handleLanguageUpdate(${index}, 'name', this.value)">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="text" value="${level}" placeholder="Niveau (ex: Débutant, C1...)" oninput="handleLanguageUpdate(${index}, 'level', this.value)">
          <button class="btn btn-ghost btn-sm" style="color: var(--error); padding: 4px;" onclick="removeLanguage(${index})">×</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}


function addHobby() {
  const hobby = prompt("Loisir ou Sport (ex: Football, Lecture, Voyage) :");
  if (hobby) {
    CV_STATE.hobbies.push(hobby);
    renderHobbiesUI();
    saveState();
    updatePreview();
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
  container.innerHTML = "";
  CV_STATE.hobbies.forEach((hobby, index) => {
    const span = document.createElement("span");
    span.className = "btn btn-outline btn-sm";
    span.style.borderRadius = "50px";
    span.innerHTML = `${hobby} <span style="margin-left: 8px; cursor: pointer; color: var(--error)" onclick="removeHobby(${index})">×</span>`;
    container.appendChild(span);
  });
}

// --- PREVIEW RENDERING ---
function updatePreview() {
  const template = CV_STATE.template;
  cvPreview.className = `cv-page template-${template}`;
  let html = "";
  if (template === "executive") html = renderExecutive();
  else if (template === "creative") html = renderCreative();
  else html = renderMinimal();
  cvPreview.innerHTML = html;
}

const debouncedUpdatePreview = debounce(updatePreview, 300);

function renderExecutive() {
  const p = CV_STATE.personal;
  return `
    <header class="cv-header">
      ${CV_STATE.photo ? `<div style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--primary); margin: 0 auto 10px; overflow: hidden;"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : ""}
      <h1 class="cv-name" style="font-size: 1.8rem; margin-bottom: 2px;">${p.fullName || "Votre Nom"}</h1>
      <p class="cv-title" style="font-size: 0.95rem; margin-bottom: 10px;">${p.jobTitle || "Votre Titre Professionnel"}</p>
      <div class="cv-info-list" style="color: #000 !important; gap: 8px; font-size: 0.75rem;">
        ${p.email ? `<span>${p.email}</span>` : ""}
        ${p.phone ? `<span>${p.phone}</span>` : ""}
        ${p.location ? `<span>${p.location}</span>` : ""}
        ${p.website ? `<span>${p.website.replace("https://", "")}</span>` : ""}
      </div>
    </header>

    <div style="display: grid; grid-template-columns: 2.2fr 1fr; gap: 20px;">
      <div>
        ${p.summary ? `<section class="cv-section" style="margin-bottom: 12px;"><h2 class="cv-section-title" style="margin-bottom: 5px;">Profil</h2><p style="font-size: 0.8rem; color: #000; line-height: 1.2;">${p.summary}</p></section>` : ""}

        <section class="cv-section" style="margin-bottom: 12px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Expériences</h2>
          ${CV_STATE.experiences.map((exp) => `
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; font-weight: 700; color: #000; font-size: 0.85rem;">
                <span>${exp.role || "Poste"}</span>
                <span style="color: var(--primary)">${exp.dates || "Période"}</span>
              </div>
              <div style="font-style: italic; color: #333; font-size: 0.8rem; margin-bottom: 1px;">${exp.company || "Entreprise"}</div>
              <p style="font-size: 0.75rem; color: #000; white-space: pre-line; line-height: 1.2;">${exp.description || ""}</p>
            </div>
          `).join("")}
        </section>

        <section class="cv-section" style="margin-bottom: 10px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Formation</h2>
          ${CV_STATE.educations.map((edu) => `
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; font-weight: 700; color: #000; font-size: 0.85rem;">
                <span>${edu.degree || "Diplôme"}</span>
                <span>${edu.dates || ""}</span>
              </div>
              <div style="color: #333; font-size: 0.8rem;">${edu.school || "Établissement"}</div>
            </div>
          `).join("")}
        </section>
      </div>

      <div>
        <section class="cv-section" style="margin-bottom: 12px;">
          <h2 class="cv-section-title" style="margin-bottom: 8px;">Compétences</h2>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${CV_STATE.skills.map((skill) => {
              const name = typeof skill === 'string' ? skill : skill.name;
              const perc = typeof skill === 'string' ? 80 : skill.percentage;
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 600; color: #000; margin-bottom: 1px;">
                    <span>${name}</span>
                    <span>${perc}%</span>
                  </div>
                  <div class="cv-progress-container" style="height: 3px; margin-top: 0;">
                    <div class="cv-progress-fill" style="width: ${perc}%"></div>
                  </div>
                </div>
              `;
            }).join("")}
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
            <h2 class="cv-section-title" style="margin-bottom: 8px;">Loisirs</h2>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${CV_STATE.hobbies.map(h => `<div style="font-size: 0.75rem; color: #000; font-weight: 500;">• ${h}</div>`).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    </div>
  `;
}

function renderCreative() {
  const p = CV_STATE.personal;
  return `
    <div class="cv-sidebar" style="background: var(--primary); color: var(--primary-contrast) !important;">
      ${CV_STATE.photo ? `<div style="width: 100px; height: 100px; border-radius: 12px; overflow: hidden; margin: 0 auto 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); border: 2px solid var(--primary-contrast);"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : ""}
      
      <div style="margin-bottom: 20px;">
        <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">Contact</h3>
        <div style="font-size: 0.7rem; display: flex; flex-direction: column; gap: 6px; color: var(--primary-contrast);">
          ${p.email ? `<div><strong style="display:block;opacity:0.8;">Email</strong>${p.email}</div>` : ""}
          ${p.phone ? `<div><strong style="display:block;opacity:0.8;">Tel</strong>${p.phone}</div>` : ""}
          ${p.location ? `<div><strong style="display:block;opacity:0.8;">Lieu</strong>${p.location}</div>` : ""}
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; border-bottom: 1px solid var(--primary-contrast); padding-bottom: 4px; margin-bottom: 10px; font-weight: 700; color: var(--primary-contrast);">Compétences</h3>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${CV_STATE.skills.map((s) => {
            const name = typeof s === 'string' ? s : s.name;
            const perc = typeof s === 'string' ? 80 : s.percentage;
            return `
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: 700; margin-bottom: 2px; color: var(--primary-contrast);">
                  <span>${name}</span>
                  <span>${perc}%</span>
                </div>
                <div style="height: 3px; background: rgba(0,0,0,0.15); border-radius: 2px;">
                  <div style="height: 100%; background: var(--primary-contrast); width: ${perc}%; border-radius: 2px;"></div>
                </div>
              </div>
            `;
          }).join("")}
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
                <div style="display: flex; justify-content: space-between;">
                  <span>• ${name}</span>
                  <span style="font-weight: 400; opacity: 0.7; font-size: 0.65rem;">${level}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      ` : ""}

      ${CV_STATE.hobbies.length > 0 ? `
        <div>
          <h3 style="text-transform: uppercase; font-size: 0.8rem; letter-spacing: 2px; border-bottom: 2px solid var(--primary-contrast); padding-bottom: 6px; margin-bottom: 12px; font-weight: 700; color: var(--primary-contrast);">Loisirs</h3>
          <div style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 6px; color: var(--primary-contrast);">
            ${CV_STATE.hobbies.map(h => `<div>• ${h}</div>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
    <div class="cv-main" style="color: #000 !important;">
      <header style="margin-bottom: 25px;">
        <h1 class="cv-name" style="color: var(--primary); margin-bottom: 2px; font-size: 1.6rem;">${p.fullName || "Votre Nom"}</h1>
        <p style="font-size: 1.1rem; font-weight: 600; color: #000;">${p.jobTitle || "Votre Titre"}</p>
      </header>

      ${p.summary ? `<section style="margin-bottom: 25px;"><h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Profil</h2><p style="font-size: 0.85rem; color: #000; line-height: 1.4;">${p.summary}</p></section>` : ""}

      <section style="margin-bottom: 25px;">
        <h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Expériences</h2>
        ${CV_STATE.experiences.map((exp) => `
          <div style="margin-bottom: 15px;">
            <div style="font-weight: 700; font-size: 0.95rem; color: #000;">${exp.role}</div>
            <div style="color: var(--primary); font-size: 0.85rem; font-weight: 700; margin-bottom: 4px;">${exp.company} • ${exp.dates}</div>
            <p style="font-size: 0.8rem; color: #000; line-height: 1.4;">${exp.description}</p>
          </div>
        `).join("")}
      </section>

      <section>
        <h2 style="font-size: 1rem; border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Formations</h2>
        ${CV_STATE.educations.map((edu) => `
          <div style="margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 0.9rem; color: #000;">${edu.degree}</div>
            <div style="font-size: 0.85rem; color: #333;">${edu.school} • ${edu.dates}</div>
          </div>
        `).join("")}
      </section>
    </div>
  `;
}

function renderMinimal() {
  const p = CV_STATE.personal;
  return `
    <header style="border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; color: #000;">
      <div style="display: flex; align-items: center; gap: 20px;">
        ${CV_STATE.photo ? `<div style="width: 80px; height: 80px; border-radius: 4px; border: 2px solid #000; overflow: hidden;"><img src="${CV_STATE.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : ""}
        <div>
          <h1 style="font-family: var(--font-serif); font-size: 2.2rem; color: #000; margin: 0; font-weight: 700;">${p.fullName || "Nom"}</h1>
          <p style="font-size: 1rem; color: #000; margin-top: 2px; font-weight: 500;">${p.jobTitle || "Titre"}</p>
        </div>
      </div>
      <div style="text-align: right; font-size: 0.8rem; color: #000; font-weight: 500;">
        ${p.email ? `<div>${p.email}</div>` : ""}
        ${p.phone ? `<div>${p.phone}</div>` : ""}
        ${p.location ? `<div>${p.location}</div>` : ""}
      </div>
    </header>

    ${p.summary ? `<section style="margin-bottom: 25px; color: #000;"><h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 10px; font-weight: 700;">À propos</h2><p style="font-size: 0.85rem; color: #000; line-height: 1.5;">${p.summary}</p></section>` : ""}

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 40px; color: #000;">
      <div>
        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 15px; font-weight: 700;">Expérience Professionnelle</h2>
          ${CV_STATE.experiences.map((exp) => `
            <div style="margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <strong style="font-size: 1rem; color: #000;">${exp.role}</strong>
                <span style="font-size: 0.8rem; color: #000; font-weight: 600;">${exp.dates}</span>
              </div>
              <div style="font-size: 0.9rem; margin-bottom: 6px; color: #333; font-weight: 500;">${exp.company}</div>
              <p style="font-size: 0.8rem; color: #000; border-left: 2px solid #000; padding-left: 12px; line-height: 1.4;">${exp.description}</p>
            </div>
          `).join("")}
        </section>

        <section>
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 15px; font-weight: 700;">Formation</h2>
          ${CV_STATE.educations.map((edu) => `
            <div style="margin-bottom: 15px;">
              <div style="font-weight: 700; font-size: 0.9rem; color: #000; margin-bottom: 1px;">${edu.degree}</div>
              <div style="font-size: 0.85rem; color: #333; font-weight: 500;">${edu.school}</div>
              <div style="font-size: 0.8rem; color: #555; font-style: italic;">${edu.dates}</div>
            </div>
          `).join("")}
        </section>
      </div>

      <div>
        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 15px; font-weight: 700;">Compétences</h2>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${CV_STATE.skills.map((s) => {
              const name = typeof s === 'string' ? s : s.name;
              const perc = typeof s === 'string' ? 80 : s.percentage;
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 2px;">
                    <span>${name}</span>
                    <span style="font-size: 0.75rem;">${perc}%</span>
                  </div>
                  <div style="height: 2px; background: #eee;">
                    <div style="height: 100%; background: #000; width: ${perc}%;"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </section>

        ${CV_STATE.languages.length > 0 ? `
          <section style="margin-bottom: 25px;">
            <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 15px; font-weight: 700;">Langues</h2>
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
            <h2 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 15px; font-weight: 700;">Loisirs</h2>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${CV_STATE.hobbies.map(h => `<div style="font-size: 0.85rem; color: #000; font-weight: 500;">• ${h}</div>`).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    </div>
  `;
}

// --- PDF DOWNLOAD ---
function downloadPDF() {
  const element = document.getElementById('cvPreview');
  const opt = {
    margin: 0,
    filename: `CV_${CV_STATE.personal.fullName || 'Export'}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  showToast("Génération du PDF en cours...");
  
  const watermark = document.createElement('div');
  watermark.style.cssText = 'position:absolute;bottom:10mm;right:15mm;font-size:8pt;color:#ccc;font-family:sans-serif;pointer-events:none;';
  element.appendChild(watermark);

  html2pdf().set(opt).from(element).save().then(() => {
    element.removeChild(watermark);
    showToast("PDF téléchargé avec succès !");
    
    // Reset form automatically after 3 seconds
    setTimeout(() => {
      resetCV(true); // true means show undo button
    }, 3000);
  });
}

function resetCV(withUndo = false) {
  // Save backup before resetting
  LAST_STATE_BACKUP = JSON.parse(JSON.stringify(CV_STATE));

  CV_STATE = {
    personal: {
      fullName: "",
      jobTitle: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      summary: "",
    },
    photo: null,
    experiences: [],
    educations: [],
    skills: [],
    languages: [],
    hobbies: [],
    template: CV_STATE.template, // Keep current template/theme
    theme: CV_STATE.theme,
  };
  
  // Reset Photo UI to placeholder
  const photoPreview = document.getElementById("photoPreview");
  if (photoPreview) {
    photoPreview.innerHTML = `<span class="initials-placeholder" id="initialsPlaceholder">??</span>`;
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


// --- DATA MANAGEMENT ---
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(CV_STATE));
}

function applyTheme(themeKey) {
  const color = THEMES[themeKey] || THEMES.ocean;
  document.documentElement.style.setProperty("--primary", color);
  document.documentElement.style.setProperty("--primary-dark", color === "#FFFFFF" ? "#F1F5F9" : color + "CC");
  document.documentElement.style.setProperty("--primary-light", color === "#FFFFFF" ? "#F8FAF8" : color + "1A");
  
  // Calculate contrast color (white or black) based on primary color
  const contrastColor = getContrastColor(color);
  document.documentElement.style.setProperty("--primary-contrast", contrastColor);
}

function getContrastColor(hexcolor) {
  // If white, return dark gray/black
  if (hexcolor.toUpperCase() === "#FFFFFF") return "#1e293b";
  
  // Remove # if present
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  
  // Calculate brightness (Luma)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff";
}

function loadExampleData() {
  CV_STATE = {
    personal: {
      fullName: "Abdoulaye Traoré",
      jobTitle: "Développeur Web Fullstack",
      email: "abdoulaye.traore@email.com",
      phone: "+225 07 08 09 10 11",
      location: "Abidjan, Côte d'Ivoire",
      website: "https://github.com/atraore",
      summary: "Passionné par le développement web et les nouvelles technologies, j'ai plus de 5 ans d'expérience dans la création d'applications web performantes et scalables. Spécialisé en JavaScript, React et Node.js."
    },
    photo: null,
    experiences: [
      { id: 1, company: "Tech Solution Africa", role: "Fullstack Developer", dates: "2021 - Présent", description: "Développement de plateformes E-commerce haute performance.\nManagement d'une équipe de 3 développeurs.\nOptimisation du SEO et des performances de chargement." },
      { id: 2, company: "Innov CI", role: "Développeur Junior", dates: "2019 - 2021", description: "Maintenance applicative et création de nouvelles features sur des applications existantes.\nApprentissage des bonnes pratiques de code et des tests unitaires." }
    ],
    educations: [
      { id: 3, school: "ESATIC Abidjan", degree: "Master en Systèmes d'Information", dates: "2017 - 2019", description: "" }
    ],
    skills: [
      { name: "JavaScript", percentage: 90 },
      { name: "React.js", percentage: 85 },
      { name: "Node.js", percentage: 80 },
      { name: "PostgreSQL", percentage: 70 },
      { name: "Docker", percentage: 65 }
    ],
    languages: [
      { name: "Français", level: "Maternel" },
      { name: "Anglais", level: "Avancé" },
      { name: "Malinké", level: "Courant" }
    ],
    hobbies: ["Football", "Lecture", "Voyages"],
    template: "executive",
    theme: "ocean"
  };
  syncFormWithState();
  updatePreview();
  saveState();
  showToast("Données d'exemple chargées");
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

init();
