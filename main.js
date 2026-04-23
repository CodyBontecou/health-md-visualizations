var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => HealthMdPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/data-loader.ts
var import_obsidian = require("obsidian");

// src/parsers/json-parser.ts
function parseJSON(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "health-data" && parsed.date) return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

// src/parsers/csv-parser.ts
function parseRows(content) {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length >= 5) {
      rows.push({
        date: parts[0].trim(),
        category: parts[1].trim(),
        metric: parts[2].trim(),
        value: parts[3].trim(),
        unit: parts[4].trim()
      });
    }
  }
  return rows;
}
function getNum(rows, category, metric) {
  const row = rows.find(
    (r) => r.category.toLowerCase() === category.toLowerCase() && r.metric.toLowerCase() === metric.toLowerCase()
  );
  if (!row) return void 0;
  const num = parseFloat(row.value);
  return isNaN(num) ? void 0 : num;
}
function getString(rows, category, metric) {
  const row = rows.find(
    (r) => r.category.toLowerCase() === category.toLowerCase() && r.metric.toLowerCase() === metric.toLowerCase()
  );
  return row == null ? void 0 : row.value;
}
function buildDayFromRows(date, rows) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const day = {
    type: "health-data",
    date
  };
  const steps = getNum(rows, "Activity", "Steps");
  if (steps !== void 0) {
    day.activity = {
      steps,
      walkingRunningDistanceKm: (_a = getNum(rows, "Activity", "Walking Running Distance")) != null ? _a : 0,
      activeCalories: (_b = getNum(rows, "Activity", "Active Calories")) != null ? _b : 0,
      exerciseMinutes: (_c = getNum(rows, "Activity", "Exercise Minutes")) != null ? _c : 0,
      vo2Max: getNum(rows, "Activity", "VO2 Max"),
      basalEnergyBurned: getNum(rows, "Activity", "Basal Energy Burned"),
      standHours: getNum(rows, "Activity", "Stand Hours"),
      flightsClimbed: getNum(rows, "Activity", "Flights Climbed")
    };
    const distM = getNum(rows, "Activity", "Walking Running Distance");
    if (distM !== void 0 && distM > 100) {
      day.activity.walkingRunningDistanceKm = distM / 1e3;
    }
  }
  const restingHR = getNum(rows, "Heart", "Resting Heart Rate");
  const avgHR = getNum(rows, "Heart", "Average Heart Rate");
  if (restingHR !== void 0 || avgHR !== void 0) {
    day.heart = {
      averageHeartRate: (_d = avgHR != null ? avgHR : restingHR) != null ? _d : 0,
      heartRateMin: (_e = getNum(rows, "Heart", "Heart Rate Min")) != null ? _e : 0,
      heartRateMax: (_f = getNum(rows, "Heart", "Heart Rate Max")) != null ? _f : 0,
      heartRateSamples: [],
      restingHeartRate: restingHR,
      walkingHeartRateAverage: getNum(rows, "Heart", "Walking Heart Rate Average"),
      hrv: getNum(rows, "Heart", "HRV")
    };
  }
  const sleepTotal = getNum(rows, "Sleep", "Total Duration");
  if (sleepTotal !== void 0) {
    day.sleep = {
      sleepStages: [],
      totalDuration: sleepTotal,
      deepSleep: (_g = getNum(rows, "Sleep", "Deep Sleep")) != null ? _g : 0,
      remSleep: (_h = getNum(rows, "Sleep", "REM Sleep")) != null ? _h : 0,
      coreSleep: (_i = getNum(rows, "Sleep", "Core Sleep")) != null ? _i : 0,
      awakeTime: getNum(rows, "Sleep", "Awake Time"),
      bedtime: (_j = getString(rows, "Sleep", "Bedtime")) != null ? _j : "",
      wakeTime: (_k = getString(rows, "Sleep", "Wake Time")) != null ? _k : ""
    };
  }
  const respRate = getNum(rows, "Vitals", "Respiratory Rate");
  const bloodOx = getNum(rows, "Vitals", "Blood Oxygen");
  if (respRate !== void 0 || bloodOx !== void 0) {
    day.vitals = {
      respiratoryRate: respRate,
      bloodOxygenPercent: bloodOx,
      bloodOxygenAvg: bloodOx
    };
  }
  const walkSpeed = getNum(rows, "Mobility", "Walking Speed");
  if (walkSpeed !== void 0) {
    day.mobility = {
      walkingSpeed: walkSpeed,
      walkingAsymmetryPercentage: (_l = getNum(rows, "Mobility", "Walking Asymmetry Percentage")) != null ? _l : 0,
      walkingStepLength: getNum(rows, "Mobility", "Walking Step Length"),
      walkingDoubleSupportPercentage: getNum(rows, "Mobility", "Walking Double Support Percentage")
    };
  }
  const headphone = getNum(rows, "Hearing", "Headphone Audio Level");
  if (headphone !== void 0) {
    day.hearing = { headphoneAudioLevel: headphone };
  }
  return day;
}
function parseCSV(content) {
  const rows = parseRows(content);
  if (!rows.length) return [];
  const byDate = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (existing) {
      existing.push(row);
    } else {
      byDate.set(row.date, [row]);
    }
  }
  const days = [];
  for (const [date, dateRows] of byDate) {
    days.push(buildDayFromRows(date, dateRows));
  }
  return days;
}

// src/parsers/markdown-parser.ts
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result = {};
  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if (!val) continue;
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1);
      result[key] = inner.split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      result[key] = val.slice(1, -1);
      continue;
    }
    if (val === "true") {
      result[key] = true;
      continue;
    }
    if (val === "false") {
      result[key] = false;
      continue;
    }
    const num = Number(val);
    if (!isNaN(num) && val !== "") {
      result[key] = num;
      continue;
    }
    result[key] = val;
  }
  return result;
}
function getNum2(fm, key) {
  const v = fm[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? void 0 : n;
  }
  return void 0;
}
function getStr(fm, key) {
  const v = fm[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  if (Array.isArray(v)) {
    return v.map((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || typeof item === "bigint") {
        return String(item);
      }
      return JSON.stringify(item);
    }).join(", ");
  }
  if (v !== void 0 && v !== null) {
    return JSON.stringify(v);
  }
  return void 0;
}
function parseMarkdown(content) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G;
  const fm = parseFrontmatter(content);
  if (!fm) return null;
  const date = getStr(fm, "date");
  if (!date) return null;
  const day = {
    type: "health-data",
    date
  };
  const steps = (_a = getNum2(fm, "steps")) != null ? _a : getNum2(fm, "activity_steps");
  if (steps !== void 0) {
    day.activity = {
      steps,
      walkingRunningDistanceKm: (_c = (_b = getNum2(fm, "walking_running_km")) != null ? _b : getNum2(fm, "walking_running_distance_km")) != null ? _c : 0,
      activeCalories: (_e = (_d = getNum2(fm, "active_calories")) != null ? _d : getNum2(fm, "activity_active_calories")) != null ? _e : 0,
      exerciseMinutes: (_g = (_f = getNum2(fm, "exercise_minutes")) != null ? _f : getNum2(fm, "activity_exercise_minutes")) != null ? _g : 0,
      vo2Max: (_h = getNum2(fm, "vo2_max")) != null ? _h : getNum2(fm, "vo2max"),
      basalEnergyBurned: getNum2(fm, "basal_energy_burned"),
      standHours: getNum2(fm, "stand_hours"),
      flightsClimbed: getNum2(fm, "flights_climbed")
    };
  }
  const restingHR = (_i = getNum2(fm, "resting_heart_rate")) != null ? _i : getNum2(fm, "heart_resting_heart_rate");
  const avgHR = (_j = getNum2(fm, "average_heart_rate")) != null ? _j : getNum2(fm, "heart_average_heart_rate");
  const hrvVal = (_l = (_k = getNum2(fm, "hrv_ms")) != null ? _k : getNum2(fm, "hrv")) != null ? _l : getNum2(fm, "heart_hrv");
  if (restingHR !== void 0 || avgHR !== void 0) {
    day.heart = {
      averageHeartRate: (_m = avgHR != null ? avgHR : restingHR) != null ? _m : 0,
      heartRateMin: (_o = (_n = getNum2(fm, "heart_rate_min")) != null ? _n : getNum2(fm, "heart_min")) != null ? _o : 0,
      heartRateMax: (_q = (_p = getNum2(fm, "heart_rate_max")) != null ? _p : getNum2(fm, "heart_max")) != null ? _q : 0,
      heartRateSamples: [],
      restingHeartRate: restingHR,
      walkingHeartRateAverage: (_r = getNum2(fm, "walking_heart_rate")) != null ? _r : getNum2(fm, "walking_heart_rate_average"),
      hrv: hrvVal
    };
  }
  const sleepHours = getNum2(fm, "sleep_total_hours");
  const sleepSeconds = getNum2(fm, "sleep_total_duration");
  const sleepTotal = sleepHours !== void 0 ? sleepHours * 3600 : sleepSeconds;
  if (sleepTotal !== void 0) {
    const deepH = getNum2(fm, "sleep_deep_hours");
    const remH = getNum2(fm, "sleep_rem_hours");
    const coreH = getNum2(fm, "sleep_core_hours");
    const awakeH = getNum2(fm, "sleep_awake_hours");
    day.sleep = {
      sleepStages: [],
      totalDuration: sleepTotal,
      deepSleep: deepH !== void 0 ? deepH * 3600 : (_s = getNum2(fm, "sleep_deep")) != null ? _s : 0,
      remSleep: remH !== void 0 ? remH * 3600 : (_t = getNum2(fm, "sleep_rem")) != null ? _t : 0,
      coreSleep: coreH !== void 0 ? coreH * 3600 : (_u = getNum2(fm, "sleep_core")) != null ? _u : 0,
      awakeTime: awakeH !== void 0 ? awakeH * 3600 : getNum2(fm, "sleep_awake"),
      bedtime: (_w = (_v = getStr(fm, "sleep_bedtime")) != null ? _v : getStr(fm, "bedtime")) != null ? _w : "",
      wakeTime: (_y = (_x = getStr(fm, "sleep_wake")) != null ? _x : getStr(fm, "wake_time")) != null ? _y : ""
    };
  }
  const respRate = (_z = getNum2(fm, "respiratory_rate")) != null ? _z : getNum2(fm, "vitals_respiratory_rate");
  const bloodOx = (_B = (_A = getNum2(fm, "blood_oxygen")) != null ? _A : getNum2(fm, "blood_oxygen_avg")) != null ? _B : getNum2(fm, "vitals_blood_oxygen");
  if (respRate !== void 0 || bloodOx !== void 0) {
    day.vitals = {
      respiratoryRate: respRate,
      bloodOxygenPercent: bloodOx,
      bloodOxygenAvg: bloodOx
    };
  }
  const walkSpeed = (_C = getNum2(fm, "walking_speed")) != null ? _C : getNum2(fm, "mobility_walking_speed");
  if (walkSpeed !== void 0) {
    day.mobility = {
      walkingSpeed: walkSpeed,
      walkingAsymmetryPercentage: (_F = (_E = (_D = getNum2(fm, "walking_asymmetry_percentage")) != null ? _D : getNum2(fm, "walking_asymmetry_percent")) != null ? _E : getNum2(fm, "walking_asymmetry")) != null ? _F : 0,
      walkingStepLength: getNum2(fm, "walking_step_length"),
      walkingDoubleSupportPercentage: getNum2(fm, "walking_double_support_percentage")
    };
  }
  const headphone = (_G = getNum2(fm, "headphone_audio_level")) != null ? _G : getNum2(fm, "hearing_headphone_audio_level");
  if (headphone !== void 0) {
    day.hearing = { headphoneAudioLevel: headphone };
  }
  const hasData = day.activity || day.heart || day.sleep || day.vitals || day.mobility;
  return hasData ? day : null;
}

// src/data-loader.ts
var SUPPORTED_EXTENSIONS = ["json", "csv", "md"];
function matchesGlob(filename, pattern) {
  if (!pattern || pattern === "*" || pattern === "*.*") return true;
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i"
  );
  return regex.test(filename);
}
function detectFormat(extension, configFormat) {
  if (configFormat !== "auto") return configFormat;
  switch (extension) {
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "md":
      return "markdown";
    // works for both markdown and bases (same parser)
    default:
      return "json";
  }
}
var DataLoader = class {
  constructor(vault, settings) {
    this.vault = vault;
    this.settings = settings;
    this.cache = null;
    this.lastLoad = 0;
    this.TTL = 3e4;
  }
  async load() {
    if (this.cache && Date.now() - this.lastLoad < this.TTL) {
      return this.cache;
    }
    const folder = this.vault.getAbstractFileByPath(this.settings.dataFolder);
    if (!(folder instanceof import_obsidian.TFolder)) return [];
    const pattern = this.settings.filePattern || "*";
    const files = folder.children.filter((f) => {
      if (!(f instanceof import_obsidian.TFile)) return false;
      if (!SUPPORTED_EXTENSIONS.includes(f.extension)) return false;
      return matchesGlob(f.name, pattern);
    });
    const days = [];
    for (const file of files) {
      const content = await this.vault.cachedRead(file);
      const format = detectFormat(file.extension, this.settings.dataFormat);
      try {
        switch (format) {
          case "json": {
            const day = parseJSON(content);
            if (day) days.push(day);
            break;
          }
          case "csv": {
            const csvDays = parseCSV(content);
            days.push(...csvDays);
            break;
          }
          case "markdown":
          case "bases": {
            const day = parseMarkdown(content);
            if (day) days.push(day);
            break;
          }
        }
      } catch (e) {
      }
    }
    const byDate = /* @__PURE__ */ new Map();
    for (const day of days) {
      const existing = byDate.get(day.date);
      if (!existing) {
        byDate.set(day.date, day);
      } else {
        byDate.set(day.date, mergeDays(existing, day));
      }
    }
    this.cache = Array.from(byDate.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );
    this.lastLoad = Date.now();
    return this.cache;
  }
  invalidate() {
    this.cache = null;
  }
};
function mergeDays(a, b) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  return {
    type: "health-data",
    date: a.date,
    units: (_a = a.units) != null ? _a : b.units,
    activity: (_b = a.activity) != null ? _b : b.activity,
    heart: (_c = a.heart) != null ? _c : b.heart,
    vitals: (_d = a.vitals) != null ? _d : b.vitals,
    sleep: (_e = a.sleep) != null ? _e : b.sleep,
    mobility: (_f = a.mobility) != null ? _f : b.mobility,
    workouts: (_g = a.workouts) != null ? _g : b.workouts,
    hearing: (_h = a.hearing) != null ? _h : b.hearing
  };
}

// src/renderer.ts
var import_obsidian2 = require("obsidian");

// src/canvas-utils.ts
function setupCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return ctx;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function formatDate(iso) {
  const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round(seconds % 3600 / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
function hsl(h, s, l) {
  return `hsl(${h},${s}%,${l}%)`;
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}
function resolveTheme(settings) {
  let isDark;
  if (settings.theme === "auto") {
    isDark = document.body.classList.contains("theme-dark");
  } else {
    isDark = settings.theme === "dark";
  }
  const base = isDark ? { bg: "#0a0a0f", fg: "#e0e0e0", muted: "#555", isDark: true } : { bg: "#ffffff", fg: "#1a1a1a", muted: "#999", isDark: false };
  return {
    ...base,
    colors: {
      accent: settings.colorAccent,
      secondary: settings.colorSecondary,
      heart: settings.colorHeart,
      sleep: {
        deep: settings.colorSleepDeep,
        rem: settings.colorSleepRem,
        core: settings.colorSleepCore,
        awake: settings.colorSleepAwake
      }
    }
  };
}

// src/dom-utils.ts
function renderStatBoxes(statsEl, boxes) {
  statsEl.empty();
  boxes.forEach(({ value, label, color }) => {
    const box = statsEl.createDiv({ cls: "health-md-stat-box" });
    const valueEl = box.createDiv({
      cls: "health-md-stat-value",
      text: value
    });
    if (color) {
      valueEl.style.color = color;
    }
    box.createDiv({ cls: "health-md-stat-label", text: label });
  });
}
function renderInlineStats(statsEl, stats) {
  statsEl.empty();
  stats.forEach((parts) => {
    const row = statsEl.createSpan();
    parts.forEach((part) => {
      if (part.strong) {
        row.createEl("strong", { text: part.text });
        return;
      }
      row.appendChild(document.createTextNode(part.text));
    });
  });
}
function appendSvgFromMarkup(container, svgMarkup) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") return;
  container.appendChild(document.importNode(svg, true));
}

// src/visualizations/heart-terrain.ts
var renderHeartTerrain = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  const BUCKETS = 96;
  const days = data.filter((d) => {
    var _a, _b;
    return (_b = (_a = d.heart) == null ? void 0 : _a.heartRateSamples) == null ? void 0 : _b.length;
  });
  const grid = [];
  let minBPM = 999, maxBPM = 0;
  days.forEach((day) => {
    const col = new Array(BUCKETS).fill(null);
    day.heart.heartRateSamples.forEach((s) => {
      const dt = new Date(s.timestamp);
      const mins = dt.getHours() * 60 + dt.getMinutes();
      const bucket = Math.floor(mins / 15);
      if (bucket >= 0 && bucket < BUCKETS) {
        if (!col[bucket]) col[bucket] = [];
        const bucketValues = col[bucket];
        if (bucketValues) {
          bucketValues.push(s.value);
        }
      }
    });
    const averaged = col.map(
      (bucketValues) => bucketValues ? bucketValues.reduce((sum, value) => sum + value, 0) / bucketValues.length : null
    );
    averaged.forEach((v) => {
      if (v) {
        minBPM = Math.min(minBPM, v);
        maxBPM = Math.max(maxBPM, v);
      }
    });
    grid.push({ date: day.date, col: averaged });
  });
  if (grid.length === 0) {
    const heartDays = data.filter((d) => d.heart && d.heart.averageHeartRate > 0);
    if (!heartDays.length) {
      statsEl.empty();
      statsEl.createEl("p", {
        text: "No heart rate data available.",
        cls: "health-md-muted"
      });
      return;
    }
    const allAvg = heartDays.map((d) => d.heart.averageHeartRate);
    const globalMin = Math.min(
      ...heartDays.map((d) => d.heart.heartRateMin || d.heart.averageHeartRate)
    );
    const globalMax = Math.max(
      ...heartDays.map((d) => d.heart.heartRateMax || d.heart.averageHeartRate)
    );
    const colW2 = W / heartDays.length;
    heartDays.forEach((day, x) => {
      const avg4 = day.heart.averageHeartRate;
      const lo = day.heart.heartRateMin || avg4;
      const hi = day.heart.heartRateMax || avg4;
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      const tLo = (lo - globalMin) / (globalMax - globalMin || 1);
      const tHi = (hi - globalMin) / (globalMax - globalMin || 1);
      const tAvg = (avg4 - globalMin) / (globalMax - globalMin || 1);
      grad.addColorStop(
        0,
        `hsl(${lerp(220, 0, tLo)},70%,${theme.isDark ? 30 : 45}%)`
      );
      grad.addColorStop(
        0.5,
        `hsl(${lerp(220, 0, tAvg)},80%,${theme.isDark ? 45 : 55}%)`
      );
      grad.addColorStop(
        1,
        `hsl(${lerp(220, 0, tHi)},90%,${theme.isDark ? 55 : 65}%)`
      );
      ctx.fillStyle = grad;
      ctx.fillRect(x * colW2, 0, colW2 + 1, H);
      hits.add({
        shape: "rect",
        x: x * colW2,
        y: 0,
        w: colW2,
        h: H,
        title: formatDate(day.date),
        details: [
          { label: "Avg", value: `${Math.round(avg4)} bpm` },
          { label: "Min", value: `${lo} bpm` },
          { label: "Max", value: `${hi} bpm` }
        ],
        payload: day
      });
    });
    const overallAvg = Math.round(
      allAvg.reduce((a, b) => a + b, 0) / allAvg.length
    );
    renderStatBoxes(statsEl, [
      { value: String(globalMin), label: "Lowest", color: "#4488ff" },
      { value: String(overallAvg), label: "Average", color: "#cc6666" },
      { value: String(globalMax), label: "Highest", color: "#ff4444" }
    ]);
    return;
  }
  const colW = W / grid.length;
  const rowH = H / BUCKETS;
  grid.forEach((day, x) => {
    day.col.forEach((bpm, y) => {
      if (bpm === null) return;
      const t = (bpm - minBPM) / (maxBPM - minBPM);
      const h = lerp(220, 0, t);
      const s = lerp(60, 100, t);
      const l = lerp(theme.isDark ? 12 : 30, theme.isDark ? 55 : 65, t);
      ctx.fillStyle = hsl(h, s, l);
      ctx.fillRect(x * colW, y * rowH, colW + 1, rowH + 1);
    });
    const dayObj = days[x];
    const samples = dayObj.heart.heartRateSamples;
    hits.add({
      shape: "rect",
      x: x * colW,
      y: 0,
      w: colW,
      h: H,
      title: formatDate(day.date),
      details: [
        { label: "Avg", value: `${Math.round(dayObj.heart.averageHeartRate)} bpm` },
        { label: "Min", value: `${dayObj.heart.heartRateMin} bpm` },
        { label: "Max", value: `${dayObj.heart.heartRateMax} bpm` },
        { label: "Samples", value: `${samples.length}` }
      ],
      payload: dayObj
    });
  });
  const minHR = Math.min(...days.map((d) => d.heart.heartRateMin || 999));
  const maxHR = Math.max(...days.map((d) => d.heart.heartRateMax || 0));
  const avgHR = Math.round(
    days.reduce((s, d) => s + (d.heart.averageHeartRate || 0), 0) / days.length
  );
  renderStatBoxes(statsEl, [
    { value: String(minHR), label: "Lowest", color: "#4488ff" },
    { value: String(avgHR), label: "Average", color: "#cc6666" },
    { value: String(maxHR), label: "Highest", color: "#ff4444" }
  ]);
};

// src/visualizations/sleep-polar.ts
function buildSyntheticStages(night) {
  var _a, _b, _c, _d;
  const sleep = night.sleep;
  if (!sleep.bedtime || !sleep.wakeTime) return [];
  const isTimeOnly = (s) => /^\d{1,2}:\d{2}$/.test(s);
  let bedMs;
  let wakeMs;
  if (isTimeOnly(sleep.bedtime)) {
    bedMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.bedtime}:00`)).getTime();
    wakeMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.wakeTime}:00`)).getTime();
    if (wakeMs <= bedMs) wakeMs += 864e5;
  } else {
    bedMs = Date.parse(sleep.bedtime);
    wakeMs = Date.parse(sleep.wakeTime);
  }
  if (!isFinite(bedMs) || !isFinite(wakeMs) || wakeMs <= bedMs) return [];
  const stages = [];
  let cursor = bedMs;
  function addStage(stage, secs) {
    if (secs <= 0) return;
    const startDate = new Date(cursor).toISOString();
    cursor += secs * 1e3;
    stages.push({ stage, startDate, endDate: new Date(cursor).toISOString(), durationSeconds: Math.round(secs) });
  }
  const awake = (_a = sleep.awakeTime) != null ? _a : 0;
  const core = (_b = sleep.coreSleep) != null ? _b : 0;
  const deep = (_c = sleep.deepSleep) != null ? _c : 0;
  const rem = (_d = sleep.remSleep) != null ? _d : 0;
  addStage("awake", awake * 0.3);
  addStage("core", core * 0.45);
  addStage("deep", deep);
  addStage("rem", rem);
  addStage("core", core * 0.55);
  addStage("awake", awake * 0.7);
  return stages;
}
function getEffectiveStages(night) {
  var _a, _b;
  const stages = (_b = (_a = night.sleep) == null ? void 0 : _a.sleepStages) != null ? _b : [];
  if (stages.length > 0) return stages;
  return buildSyntheticStages(night);
}
var renderSleepPolar = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  const canvas = ctx.canvas;
  const nights = data.filter(
    (d) => d.sleep && (d.sleep.sleepStages.length > 0 || d.sleep.totalDuration > 0)
  );
  if (!nights.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sleep data", W / 2, H / 2);
    return;
  }
  const cols = 3;
  const rows = Math.ceil(nights.length / cols);
  const cellW = Math.floor((W - (cols - 1) * 6) / cols);
  const cellH = Math.floor((H - (rows - 1) * 6) / rows);
  const cellSize = Math.min(cellW, cellH);
  const actualH = rows * (cellSize + 6) - 6;
  if (actualH < H) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = actualH * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = actualH + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, actualH < H ? actualH : H);
  nights.forEach((night, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const offsetX = col * (cellSize + 6);
    const offsetY = row * (cellSize + 6);
    const cx = offsetX + cellSize / 2;
    const cy = offsetY + cellSize / 2;
    const r = cellSize / 2 - 10;
    ctx.fillStyle = theme.isDark ? "#0d0d18" : "#f0f0f5";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();
    const stages = getEffectiveStages(night);
    if (!stages.length) return;
    const firstStart = new Date(stages[0].startDate).getTime();
    const lastEnd = new Date(stages[stages.length - 1].endDate).getTime();
    const totalSpan = lastEnd - firstStart;
    stages.forEach((stage) => {
      const start = new Date(stage.startDate).getTime();
      const end = new Date(stage.endDate).getTime();
      const a1 = (start - firstStart) / totalSpan * Math.PI * 2 - Math.PI / 2;
      const a2 = (end - firstStart) / totalSpan * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 1, a1, a2);
      ctx.closePath();
      ctx.fillStyle = theme.colors.sleep[stage.stage] || "#333";
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = theme.bg;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    const d = /* @__PURE__ */ new Date(night.date + "T00:00:00");
    ctx.fillStyle = theme.muted;
    ctx.font = `${Math.max(7, cellSize * 0.09)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      cx,
      offsetY + cellSize - 1
    );
    const sleep = night.sleep;
    hits.add({
      shape: "circle",
      cx,
      cy,
      r: r + 6,
      title: formatDate(night.date),
      details: [
        { label: "Total", value: formatDuration(sleep.totalDuration) },
        { label: "Deep", value: formatDuration(sleep.deepSleep) },
        { label: "REM", value: formatDuration(sleep.remSleep) },
        { label: "Core", value: formatDuration(sleep.coreSleep) },
        ...sleep.awakeTime ? [{ label: "Awake", value: formatDuration(sleep.awakeTime) }] : [],
        {
          label: "Bedtime",
          value: /^\d{1,2}:\d{2}$/.test(sleep.bedtime) ? sleep.bedtime : new Date(sleep.bedtime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        },
        {
          label: "Wake",
          value: /^\d{1,2}:\d{2}$/.test(sleep.wakeTime) ? sleep.wakeTime : new Date(sleep.wakeTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })
        }
      ],
      payload: night
    });
  });
};

// src/visualizations/step-spiral.ts
var renderStepSpiral = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const rx = W / 2 - 24;
  const ry = H / 2 - 24;
  const days = data.filter((d) => {
    var _a;
    return (_a = d.activity) == null ? void 0 : _a.steps;
  });
  if (!days.length) return;
  const maxSteps = Math.max(...days.map((d) => d.activity.steps));
  const maxDist = Math.max(
    ...days.map((d) => d.activity.walkingRunningDistanceKm || 0)
  );
  let totalSteps = 0;
  let bestDay = days[0];
  days.forEach((day, i) => {
    totalSteps += day.activity.steps;
    if (day.activity.steps > bestDay.activity.steps) bestDay = day;
    const t = i / days.length;
    const angle = t * Math.PI * 3.5 - Math.PI / 2;
    const spiralT = 0.15 + t * 0.85;
    const x = cx + Math.cos(angle) * rx * spiralT;
    const y = cy + Math.sin(angle) * ry * spiralT;
    const steps = day.activity.steps;
    const dist = day.activity.walkingRunningDistanceKm || 0;
    const dotSize = 10 + steps / maxSteps * 30;
    const distT = maxDist > 0 ? dist / maxDist : 0;
    const dotAlpha = lerp(0.35, 0.9, distT);
    ctx.shadowColor = hexToRgba(theme.colors.accent, 0.7);
    ctx.shadowBlur = dotSize;
    ctx.fillStyle = hexToRgba(theme.colors.accent, dotAlpha);
    ctx.beginPath();
    ctx.arc(x, y, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (i > 0) {
      const pt = (i - 1) / days.length;
      const pa = pt * Math.PI * 3.5 - Math.PI / 2;
      const pst = 0.15 + pt * 0.85;
      const px = cx + Math.cos(pa) * rx * pst;
      const py = cy + Math.sin(pa) * ry * pst;
      ctx.strokeStyle = hexToRgba(theme.colors.accent, lerp(0.08, 0.25, distT));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      String((/* @__PURE__ */ new Date(day.date + "T00:00:00")).getDate()),
      x,
      y + dotSize / 2 + 11
    );
    hits.add({
      shape: "circle",
      cx: x,
      cy: y,
      r: Math.max(dotSize / 2 + 4, 8),
      title: formatDate(day.date),
      details: [
        { label: "Steps", value: steps.toLocaleString() },
        { label: "Distance", value: `${dist.toFixed(2)} km` },
        ...day.activity.activeCalories ? [
          {
            label: "Calories",
            value: `${Math.round(day.activity.activeCalories)} kcal`
          }
        ] : [],
        ...day.activity.exerciseMinutes ? [
          {
            label: "Exercise",
            value: `${day.activity.exerciseMinutes} min`
          }
        ] : [],
        ...day.activity.flightsClimbed ? [
          {
            label: "Flights",
            value: `${day.activity.flightsClimbed}`
          }
        ] : []
      ],
      payload: day
    });
  });
  const avgSteps = Math.round(totalSteps / days.length);
  renderStatBoxes(statsEl, [
    {
      value: avgSteps.toLocaleString(),
      label: "Avg/day",
      color: theme.colors.accent
    },
    {
      value: bestDay.activity.steps.toLocaleString(),
      label: "Best day",
      color: theme.colors.accent
    }
  ]);
};

// src/visualizations/oxygen-river.ts
function getBloodOxygenValues(day) {
  var _a, _b, _c, _d, _e, _f, _g;
  if ((_b = (_a = day.vitals) == null ? void 0 : _a.bloodOxygenSamples) == null ? void 0 : _b.length) {
    return day.vitals.bloodOxygenSamples.map((s) => s.value || s.percent || 0);
  }
  const avg4 = (_e = (_c = day.vitals) == null ? void 0 : _c.bloodOxygenAvg) != null ? _e : (_d = day.vitals) == null ? void 0 : _d.bloodOxygenPercent;
  if (avg4 !== void 0) {
    const min = (_f = day.vitals) == null ? void 0 : _f.bloodOxygenMin;
    const max = (_g = day.vitals) == null ? void 0 : _g.bloodOxygenMax;
    if (min !== void 0 && max !== void 0 && min !== max) {
      return [min, avg4, max];
    }
    return [avg4];
  }
  return [];
}
var renderOxygenRiver = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => getBloodOxygenValues(d).length > 0);
  if (!days.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No SpO2 data", W / 2, H / 2);
    return;
  }
  const allSamples = [];
  days.forEach((day, di) => {
    getBloodOxygenValues(day).forEach((v, i, arr) => {
      allSamples.push({
        x: di + (arr.length > 1 ? i / (arr.length - 1) * 0.8 : 0.4),
        value: v
      });
    });
  });
  const minO2 = Math.min(...allSamples.map((s) => s.value));
  const maxO2 = Math.max(...allSamples.map((s) => s.value));
  allSamples.forEach((s) => {
    const x = s.x / days.length * W;
    const t = (s.value - minO2) / (maxO2 - minO2 || 1);
    const y = H * 0.5 + (1 - t) * H * 0.35 - t * H * 0.35;
    const rSize = lerp(7, 3, t);
    const h = lerp(0, 210, t);
    ctx.fillStyle = hsl(h, lerp(80, 70, t), lerp(40, 50, t));
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, rSize, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  const colW = W / days.length;
  days.forEach((day, di) => {
    const vals = getBloodOxygenValues(day);
    const dayMin = Math.min(...vals);
    const dayMax = Math.max(...vals);
    const dayAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
    hits.add({
      shape: "rect",
      x: di * colW,
      y: 0,
      w: colW,
      h: H,
      title: formatDate(day.date),
      details: [
        { label: "Avg SpO\u2082", value: `${dayAvg.toFixed(1)}%` },
        { label: "Min", value: `${dayMin.toFixed(1)}%` },
        { label: "Max", value: `${dayMax.toFixed(1)}%` },
        { label: "Samples", value: `${vals.length}` }
      ],
      payload: day
    });
  });
  const avgO2 = allSamples.reduce((s, v) => s + v.value, 0) / allSamples.length;
  renderStatBoxes(statsEl, [
    { value: `${avgO2.toFixed(1)}%`, label: "Avg SpO2", color: "#4488ff" },
    { value: `${minO2.toFixed(1)}%`, label: "Min", color: "#6688cc" },
    { value: `${maxO2.toFixed(1)}%`, label: "Max", color: "#88aaee" }
  ]);
};

// src/visualizations/breathing-wave.ts
function getRespiratoryValues(day) {
  var _a, _b, _c, _d, _e, _f, _g;
  if ((_b = (_a = day.vitals) == null ? void 0 : _a.respiratoryRateSamples) == null ? void 0 : _b.length) {
    return day.vitals.respiratoryRateSamples.map((s) => s.value);
  }
  const avg4 = (_e = (_c = day.vitals) == null ? void 0 : _c.respiratoryRate) != null ? _e : (_d = day.vitals) == null ? void 0 : _d.respiratoryRateAvg;
  if (avg4 !== void 0) {
    const min = (_f = day.vitals) == null ? void 0 : _f.respiratoryRateMin;
    const max = (_g = day.vitals) == null ? void 0 : _g.respiratoryRateMax;
    if (min !== void 0 && max !== void 0 && min !== max) {
      return [min, avg4, max];
    }
    return [avg4];
  }
  return [];
}
var renderBreathingWave = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => getRespiratoryValues(d).length > 0);
  if (!days.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No respiratory data", W / 2, H / 2);
    return;
  }
  const allVals = [];
  days.forEach((day) => allVals.push(...getRespiratoryValues(day)));
  const minR = Math.min(...allVals);
  const maxR = Math.max(...allVals);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hexToRgba(theme.colors.accent, 0.35));
  grad.addColorStop(1, hexToRgba(theme.colors.accent, 0));
  ctx.beginPath();
  ctx.moveTo(0, H);
  allVals.forEach((v, i) => {
    const x = i / allVals.length * W;
    const t = (v - minR) / (maxR - minR || 1);
    ctx.lineTo(x, H - 16 - t * (H - 32));
  });
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  allVals.forEach((v, i) => {
    const x = i / allVals.length * W;
    const t = (v - minR) / (maxR - minR || 1);
    const y = H - 16 - t * (H - 32);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  let sampleIdx = 0;
  days.forEach((day) => {
    const vals = getRespiratoryValues(day);
    const startIdx = sampleIdx;
    sampleIdx += vals.length;
    const x0 = startIdx / allVals.length * W;
    const x1 = sampleIdx / allVals.length * W;
    const dayAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const dayMin = Math.min(...vals);
    const dayMax = Math.max(...vals);
    hits.add({
      shape: "rect",
      x: x0,
      y: 0,
      w: x1 - x0,
      h: H,
      title: formatDate(day.date),
      details: [
        { label: "Avg", value: `${dayAvg.toFixed(1)} br/min` },
        { label: "Min", value: `${dayMin.toFixed(1)}` },
        { label: "Max", value: `${dayMax.toFixed(1)}` },
        { label: "Samples", value: `${vals.length}` }
      ],
      payload: day
    });
  });
  const avg4 = (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(
    1
  );
  renderStatBoxes(statsEl, [
    { value: avg4, label: "Avg br/min", color: theme.colors.accent },
    { value: minR.toFixed(1), label: "Min", color: theme.muted },
    { value: maxR.toFixed(1), label: "Max", color: theme.colors.accent }
  ]);
};

// src/visualizations/vitals-rings.ts
var renderVitalsRings = (ctx, data, W, H, _config, theme, _statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const days = data.filter((d) => d.activity && d.heart);
  if (!days.length) return;
  const maxSteps = Math.max(...days.map((d) => d.activity.steps || 0));
  const maxCal = Math.max(
    ...days.map((d) => d.activity.activeCalories || 0)
  );
  const maxHR = Math.max(
    ...days.map(
      (d) => d.heart.restingHeartRate || d.heart.averageHeartRate || 80
    )
  );
  const minHR = Math.min(
    ...days.map(
      (d) => d.heart.restingHeartRate || d.heart.averageHeartRate || 60
    )
  );
  const maxRx = W / 2 - 16;
  const maxRy = H / 2 - 16;
  const ringGap = Math.min(maxRx, maxRy) / days.length;
  const sx = maxRx / Math.max(maxRx, maxRy);
  const sy = maxRy / Math.max(maxRx, maxRy);
  days.forEach((day, i) => {
    const baseR = 16 + i * ringGap;
    const steps = day.activity.steps || 0;
    const cal = day.activity.activeCalories || 0;
    const hr = day.heart.restingHeartRate || day.heart.averageHeartRate || 70;
    const stepsAngle = steps / maxSteps * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(
      sx > sy ? 1 : maxRx / maxRy,
      sy > sx ? 1 : maxRy / maxRx
    );
    ctx.strokeStyle = hexToRgba(theme.colors.accent, 0.25 + steps / maxSteps * 0.55);
    ctx.lineWidth = ringGap * 0.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, baseR, -Math.PI / 2, -Math.PI / 2 + stepsAngle);
    ctx.stroke();
    const calAngle = cal / maxCal * Math.PI * 2;
    ctx.strokeStyle = hexToRgba(theme.colors.secondary, 0.25 + cal / maxCal * 0.55);
    ctx.lineWidth = ringGap * 0.22;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      baseR + ringGap * 0.15,
      -Math.PI / 2,
      -Math.PI / 2 + calAngle
    );
    ctx.stroke();
    ctx.restore();
    const hrT = (hr - minHR) / (maxHR - minHR || 1);
    const dotAngle = -Math.PI / 2 + stepsAngle;
    const scaleX = sx > sy ? 1 : maxRx / maxRy;
    const scaleY = sy > sx ? 1 : maxRy / maxRx;
    const dx = cx + Math.cos(dotAngle) * baseR * scaleX;
    const dy = cy + Math.sin(dotAngle) * baseR * scaleY;
    ctx.fillStyle = hsl(lerp(200, 0, hrT), 80, 50);
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();
    hits.add({
      shape: "circle",
      cx: dx,
      cy: dy,
      r: 8,
      title: formatDate(day.date),
      details: [
        { label: "Steps", value: steps.toLocaleString() },
        {
          label: "Calories",
          value: `${Math.round(cal)} kcal`
        },
        { label: "Resting HR", value: `${Math.round(hr)} bpm` },
        ...day.activity.exerciseMinutes ? [
          {
            label: "Exercise",
            value: `${day.activity.exerciseMinutes} min`
          }
        ] : []
      ],
      payload: day
    });
  });
  ctx.fillStyle = theme.muted;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("inner \u2192 outer", cx, cy - 3);
  ctx.fillText("oldest \u2192 newest", cx, cy + 9);
};

// src/visualizations/walking-symmetry.ts
var renderWalkingSymmetry = (ctx, data, W, H, _config, theme, _statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => d.mobility);
  if (!days.length) return;
  const maxSpeed = Math.max(
    ...days.map((d) => d.mobility.walkingSpeed || 0)
  );
  const maxAsym = Math.max(
    ...days.map((d) => d.mobility.walkingAsymmetryPercentage || 0)
  );
  const barW = (W - 20) / days.length;
  const leftPad = 10;
  const midY = H / 2;
  days.forEach((day, i) => {
    const speed = day.mobility.walkingSpeed || 0;
    const asym = day.mobility.walkingAsymmetryPercentage || 0;
    const x = leftPad + i * barW;
    const speedH = maxSpeed > 0 ? speed / maxSpeed * (midY - 16) : 0;
    const sg = ctx.createLinearGradient(x, midY, x, midY - speedH);
    sg.addColorStop(0, hexToRgba(theme.colors.accent, 0.08));
    sg.addColorStop(1, hexToRgba(theme.colors.accent, 0.75));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.roundRect(x + 1, midY - speedH, barW - 2, speedH, [3, 3, 0, 0]);
    ctx.fill();
    const asymH = maxAsym > 0 ? asym / maxAsym * (midY - 16) : 0;
    const asymT = maxAsym > 0 ? asym / maxAsym : 0;
    const secRgb = hexToRgb(theme.colors.secondary);
    const heartRgb = hexToRgb(theme.colors.heart);
    const ag = ctx.createLinearGradient(x, midY, x, midY + asymH);
    ag.addColorStop(0, hexToRgba(theme.colors.secondary, 0.08));
    ag.addColorStop(
      1,
      `rgba(${Math.round(lerp(secRgb.r, heartRgb.r, asymT))},${Math.round(lerp(secRgb.g, heartRgb.g, asymT))},${Math.round(lerp(secRgb.b, heartRgb.b, asymT))},0.75)`
    );
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.roundRect(x + 1, midY, barW - 2, asymH, [0, 0, 3, 3]);
    ctx.fill();
    const m = day.mobility;
    hits.add({
      shape: "rect",
      x,
      y: 0,
      w: barW,
      h: H,
      title: formatDate(day.date),
      details: [
        { label: "Speed", value: `${speed.toFixed(2)} m/s` },
        { label: "Asymmetry", value: `${asym.toFixed(1)}%` },
        ...m.walkingStepLength ? [
          {
            label: "Step length",
            value: `${m.walkingStepLength.toFixed(2)} m`
          }
        ] : [],
        ...m.walkingDoubleSupportPercentage ? [
          {
            label: "Double support",
            value: `${m.walkingDoubleSupportPercentage.toFixed(1)}%`
          }
        ] : []
      ],
      payload: day
    });
  });
  ctx.strokeStyle = theme.isDark ? "#222" : "#ddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftPad, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();
  ctx.fillStyle = theme.muted;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("\u2191 speed", W / 2, 12);
  ctx.fillText("\u2193 wobble", W / 2, H - 4);
};

// src/visualizations/sleep-architecture.ts
function buildSyntheticStages2(night) {
  var _a, _b, _c, _d;
  const sleep = night.sleep;
  if (!sleep.bedtime || !sleep.wakeTime) return [];
  const isTimeOnly = (s) => /^\d{1,2}:\d{2}$/.test(s);
  let bedMs;
  let wakeMs;
  if (isTimeOnly(sleep.bedtime)) {
    bedMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.bedtime}:00`)).getTime();
    wakeMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.wakeTime}:00`)).getTime();
    if (wakeMs <= bedMs) wakeMs += 864e5;
  } else {
    bedMs = Date.parse(sleep.bedtime);
    wakeMs = Date.parse(sleep.wakeTime);
  }
  if (!isFinite(bedMs) || !isFinite(wakeMs) || wakeMs <= bedMs) return [];
  const stages = [];
  let cursor = bedMs;
  function addStage(stage, secs) {
    if (secs <= 0) return;
    const startDate = new Date(cursor).toISOString();
    cursor += secs * 1e3;
    stages.push({ stage, startDate, endDate: new Date(cursor).toISOString(), durationSeconds: Math.round(secs) });
  }
  const awake = (_a = sleep.awakeTime) != null ? _a : 0;
  const core = (_b = sleep.coreSleep) != null ? _b : 0;
  const deep = (_c = sleep.deepSleep) != null ? _c : 0;
  const rem = (_d = sleep.remSleep) != null ? _d : 0;
  addStage("awake", awake * 0.3);
  addStage("core", core * 0.45);
  addStage("deep", deep);
  addStage("rem", rem);
  addStage("core", core * 0.55);
  addStage("awake", awake * 0.7);
  return stages;
}
function getEffectiveStages2(night) {
  var _a, _b;
  const stages = (_b = (_a = night.sleep) == null ? void 0 : _a.sleepStages) != null ? _b : [];
  if (stages.length > 0) return stages;
  return buildSyntheticStages2(night);
}
var renderSleepArchitecture = (ctx, data, W, H, _config, theme, _statsEl, hits) => {
  const canvas = ctx.canvas;
  const nights = data.filter(
    (d) => d.sleep && (d.sleep.sleepStages.length > 0 || d.sleep.totalDuration > 0)
  );
  if (!nights.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sleep data", W / 2, H / 2);
    return;
  }
  const stripeHeight = 48;
  const gap = 6;
  const labelWidth = 80;
  const rightPad = 20;
  const topPad = 10;
  const totalHeight = topPad + nights.length * (stripeHeight + gap);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = totalHeight * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = totalHeight + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  const barWidth = W - labelWidth - rightPad;
  const nightMeta = nights.map((n) => {
    const stages = getEffectiveStages2(n);
    const start = new Date(stages[0].startDate).getTime();
    const end = new Date(stages[stages.length - 1].endDate).getTime();
    return { start, end, span: end - start, stages };
  });
  const maxSpan = Math.max(...nightMeta.map((m) => m.span));
  nights.forEach((night, i) => {
    const y = topPad + i * (stripeHeight + gap);
    const meta = nightMeta[i];
    const d = /* @__PURE__ */ new Date(night.date + "T00:00:00");
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      weekday: "short"
    });
    ctx.fillStyle = theme.muted;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelWidth - 12, y + stripeHeight / 2);
    ctx.fillStyle = theme.isDark ? "#111118" : "#eeeef2";
    ctx.beginPath();
    ctx.roundRect(labelWidth, y, barWidth, stripeHeight, 4);
    ctx.fill();
    const nightSleep = night.sleep;
    hits.add({
      shape: "rect",
      x: labelWidth,
      y,
      w: barWidth,
      h: stripeHeight,
      title: formatDate(night.date),
      details: [
        { label: "Total", value: formatDuration(nightSleep.totalDuration) },
        { label: "Deep", value: formatDuration(nightSleep.deepSleep) },
        { label: "REM", value: formatDuration(nightSleep.remSleep) },
        { label: "Core", value: formatDuration(nightSleep.coreSleep) }
      ],
      payload: night
    });
    meta.stages.forEach((stage) => {
      const stageStart = new Date(stage.startDate).getTime();
      const stageEnd = new Date(stage.endDate).getTime();
      const x = labelWidth + (stageStart - meta.start) / maxSpan * barWidth;
      const w = Math.max(
        1,
        (stageEnd - stageStart) / maxSpan * barWidth
      );
      ctx.shadowColor = theme.colors.sleep[stage.stage] || "#000";
      ctx.shadowBlur = 8;
      ctx.fillStyle = theme.colors.sleep[stage.stage] || "#333";
      ctx.fillRect(x, y + 2, w, stripeHeight - 4);
      ctx.shadowBlur = 0;
      const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      });
      hits.add({
        shape: "rect",
        x,
        y: y + 2,
        w,
        h: stripeHeight - 4,
        title: `${stage.stage.toUpperCase()} \u2014 ${formatDate(night.date)}`,
        details: [
          { label: "Start", value: fmtTime(stage.startDate) },
          { label: "End", value: fmtTime(stage.endDate) },
          {
            label: "Duration",
            value: formatDuration(stage.durationSeconds)
          }
        ],
        payload: stage
      });
    });
  });
};

// src/visualizations/hrv-trend.ts
var renderHrvTrend = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter(
    (d) => d.heart && (d.heart.hrv != null || d.heart.hrvSamples && d.heart.hrvSamples.length > 0)
  );
  if (!days.length) return;
  const padL = 36, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const values = days.map((d) => {
    var _a;
    const heart = d.heart;
    if (!heart) return 0;
    if (heart.hrv != null) return heart.hrv;
    const samples = (_a = heart.hrvSamples) != null ? _a : [];
    return samples.reduce((s, x) => s + x.value, 0) / samples.length;
  });
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const xFor = (i) => padL + i / (days.length - 1 || 1) * plotW;
  const yFor = (v) => padT + plotH - (v - minVal) / range * plotH;
  const gridCount = 4;
  ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
  ctx.lineWidth = 1;
  for (let g = 0; g <= gridCount; g++) {
    const y = padT + g / gridCount * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    const label = Math.round(maxVal - g / gridCount * range);
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(label), padL - 4, y + 3);
  }
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, hexToRgba(theme.colors.secondary, 0.35));
  grad.addColorStop(1, hexToRgba(theme.colors.secondary, 0.02));
  ctx.beginPath();
  ctx.moveTo(xFor(0), padT + plotH);
  ctx.lineTo(xFor(0), yFor(values[0]));
  for (let i = 1; i < days.length; i++) {
    const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
    const x1 = xFor(i), y1 = yFor(values[i]);
    const mx = (x0 + x1) / 2;
    ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
  }
  ctx.lineTo(xFor(days.length - 1), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(values[0]));
  for (let i = 1; i < days.length; i++) {
    const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
    const x1 = xFor(i), y1 = yFor(values[i]);
    const mx = (x0 + x1) / 2;
    ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
  }
  ctx.strokeStyle = hexToRgba(theme.colors.secondary, 0.9);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  days.forEach((day, i) => {
    var _a, _b;
    const x = xFor(i);
    const y = yFor(values[i]);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = theme.colors.secondary;
    ctx.fill();
    hits.add({
      shape: "circle",
      cx: x,
      cy: y,
      r: 10,
      title: formatDate(day.date),
      details: [
        { label: "HRV", value: `${values[i].toFixed(1)} ms` },
        ...((_a = day.heart) == null ? void 0 : _a.restingHeartRate) ? [{ label: "Resting HR", value: `${day.heart.restingHeartRate} bpm` }] : [],
        ...((_b = day.heart) == null ? void 0 : _b.averageHeartRate) ? [{ label: "Avg HR", value: `${Math.round(day.heart.averageHeartRate)} bpm` }] : []
      ],
      payload: day
    });
  });
  const labelStep = Math.max(1, Math.floor(days.length / 5));
  ctx.fillStyle = theme.muted;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  days.forEach((day, i) => {
    if (i % labelStep !== 0 && i !== days.length - 1) return;
    const d = /* @__PURE__ */ new Date(day.date + "T00:00:00");
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillText(label, xFor(i), H - 6);
  });
  const avg4 = values.reduce((s, v) => s + v, 0) / values.length;
  renderInlineStats(statsEl, [
    [
      { text: "Avg HRV " },
      { text: `${avg4.toFixed(1)} ms`, strong: true }
    ],
    [
      { text: "Min " },
      { text: minVal.toFixed(1), strong: true }
    ],
    [
      { text: "Max " },
      { text: maxVal.toFixed(1), strong: true }
    ]
  ]);
};

// src/visualizations/activity-heatmap.ts
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var renderActivityHeatmap = (ctx, data, W, H, config, theme, statsEl, hits) => {
  var _a, _b, _c, _d;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => d.activity);
  if (!days.length) return;
  const metric = (_a = config.metric) != null ? _a : "steps";
  const getValue = (d) => {
    if (!d.activity) return 0;
    if (metric === "calories") return d.activity.activeCalories || 0;
    if (metric === "distance") return d.activity.walkingRunningDistanceKm || 0;
    return d.activity.steps || 0;
  };
  const byDate = {};
  let firstDate = days[0].date;
  let lastDate = days[days.length - 1].date;
  for (const d of days) {
    byDate[d.date] = getValue(d);
    if (d.date < firstDate) firstDate = d.date;
    if (d.date > lastDate) lastDate = d.date;
  }
  const startDay = /* @__PURE__ */ new Date(firstDate + "T00:00:00");
  startDay.setDate(startDay.getDate() - startDay.getDay());
  const endDay = /* @__PURE__ */ new Date(lastDate + "T00:00:00");
  endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));
  const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / 864e5) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const padL = 28, padR = 8, padT = 20, padB = 8;
  const cellW = (W - padL - padR) / totalWeeks;
  const cellH = (H - padT - padB) / 7;
  const gap = Math.max(1.5, Math.min(cellW, cellH) * 0.12);
  const radius = Math.max(1, Math.min(cellW, cellH) * 0.18);
  const maxVal = Math.max(...Object.values(byDate), 1);
  ctx.fillStyle = theme.muted;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "right";
  for (let dow = 0; dow < 7; dow++) {
    if (dow % 2 === 1) continue;
    const y = padT + dow * cellH + cellH / 2 + 3;
    ctx.fillText(DOW[dow], padL - 3, y);
  }
  let lastMonth = -1;
  ctx.textAlign = "center";
  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(startDay);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const mo = weekStart.getMonth();
    if (mo !== lastMonth) {
      lastMonth = mo;
      const label = weekStart.toLocaleDateString("en-US", { month: "short" });
      ctx.fillText(label, padL + w * cellW + cellW / 2, padT - 5);
    }
  }
  for (let w = 0; w < totalWeeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const cellDate = new Date(startDay);
      cellDate.setDate(cellDate.getDate() + w * 7 + dow);
      const iso = cellDate.toISOString().slice(0, 10);
      const val = (_b = byDate[iso]) != null ? _b : null;
      const x = padL + w * cellW + gap / 2;
      const y = padT + dow * cellH + gap / 2;
      const cw = cellW - gap;
      const ch = cellH - gap;
      if (val === null) {
        ctx.strokeStyle = hexToRgba(theme.fg, 0.06);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(x, y, cw, ch, radius);
        ctx.stroke();
        continue;
      }
      const t = Math.pow(val / maxVal, 0.6);
      ctx.fillStyle = hexToRgba(theme.colors.accent, 0.1 + t * 0.85);
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, radius);
      ctx.fill();
      hits.add({
        shape: "rect",
        x,
        y,
        w: cw,
        h: ch,
        title: formatDate(iso),
        details: [
          { label: metric.charAt(0).toUpperCase() + metric.slice(1), value: formatMetric(metric, val) },
          ...byDate[iso] != null && metric !== "steps" && ((_d = (_c = days.find((d) => d.date === iso)) == null ? void 0 : _c.activity) == null ? void 0 : _d.steps) ? [{ label: "Steps", value: (days.find((d) => d.date === iso).activity.steps || 0).toLocaleString() }] : []
        ],
        payload: iso
      });
    }
  }
  const total = Object.values(byDate).reduce((s, v) => s + v, 0);
  const avg4 = total / Object.keys(byDate).length;
  const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
  renderInlineStats(statsEl, [
    [
      { text: `${metricLabel} \u2014 Avg ` },
      { text: formatMetric(metric, avg4), strong: true },
      { text: " \xB7 Max " },
      { text: formatMetric(metric, maxVal), strong: true },
      { text: " \xB7 Total " },
      { text: formatMetric(metric, total), strong: true }
    ]
  ]);
};
function formatMetric(metric, val) {
  if (metric === "calories") return `${Math.round(val).toLocaleString()} kcal`;
  if (metric === "distance") return `${val.toFixed(1)} km`;
  return Math.round(val).toLocaleString();
}

// src/visualizations/sleep-quality-bars.ts
var renderSleepQualityBars = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => d.sleep && d.sleep.totalDuration > 0);
  if (!days.length) return;
  const padL = 40, padR = 16, padT = 20, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxTotal = Math.max(...days.map((d) => d.sleep.totalDuration));
  const barW = plotW / days.length;
  const gap = Math.max(1, barW * 0.15);
  const maxHours = Math.ceil(maxTotal / 3600);
  const gridStep = maxHours <= 8 ? 2 : 4;
  ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
  ctx.lineWidth = 1;
  for (let h = 0; h <= maxHours; h += gridStep) {
    const y = padT + plotH - h / maxHours * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${h}h`, padL - 4, y + 3);
  }
  const legend = [
    { label: "Deep", color: theme.colors.sleep.deep },
    { label: "REM", color: theme.colors.sleep.rem },
    { label: "Core", color: theme.colors.sleep.core },
    { label: "Awake", color: theme.colors.sleep.awake }
  ];
  let lx = padL;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "left";
  for (const item of legend) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, padT - 12, 8, 6);
    ctx.fillStyle = theme.muted;
    ctx.fillText(item.label, lx + 10, padT - 7);
    lx += 44;
  }
  days.forEach((day, i) => {
    const sl = day.sleep;
    const x = padL + i * barW + gap / 2;
    const bw = barW - gap;
    const segments = [
      { secs: sl.deepSleep || 0, color: theme.colors.sleep.deep, label: "Deep" },
      { secs: sl.remSleep || 0, color: theme.colors.sleep.rem, label: "REM" },
      { secs: sl.coreSleep || 0, color: theme.colors.sleep.core, label: "Core" },
      { secs: sl.awakeTime || 0, color: theme.colors.sleep.awake, label: "Awake" }
    ].filter((s) => s.secs > 0);
    let stackY = padT + plotH;
    segments.forEach(({ secs, color, label }, si) => {
      const segH = secs / maxTotal * plotH;
      stackY -= segH;
      const isTop = si === segments.length - 1;
      const r = isTop ? Math.min(3, bw / 4) : 0;
      ctx.fillStyle = hexToRgba(color, 0.85);
      ctx.beginPath();
      if (isTop) {
        ctx.roundRect(x, stackY, bw, segH, [r, r, 0, 0]);
      } else {
        ctx.rect(x, stackY, bw, segH);
      }
      ctx.fill();
      if (segH > 14) {
        ctx.fillStyle = hexToRgba(theme.bg, 0.7);
        ctx.font = "7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x + bw / 2, stackY + segH / 2 + 2.5);
      }
    });
    const d = /* @__PURE__ */ new Date(day.date + "T00:00:00");
    const lbl = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillStyle = theme.muted;
    ctx.font = "8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(lbl, x + bw / 2, H - 6);
    const barTop = padT + plotH - sl.totalDuration / maxTotal * plotH;
    hits.add({
      shape: "rect",
      x,
      y: barTop,
      w: bw,
      h: plotH - (barTop - padT),
      title: formatDate(day.date),
      details: [
        { label: "Total", value: formatDuration(sl.totalDuration) },
        ...sl.deepSleep ? [{ label: "Deep", value: formatDuration(sl.deepSleep) }] : [],
        ...sl.remSleep ? [{ label: "REM", value: formatDuration(sl.remSleep) }] : [],
        ...sl.coreSleep ? [{ label: "Core", value: formatDuration(sl.coreSleep) }] : [],
        ...sl.awakeTime ? [{ label: "Awake", value: formatDuration(sl.awakeTime) }] : [],
        ...sl.bedtime ? [{
          label: "Bedtime",
          value: new Date(sl.bedtime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })
        }] : []
      ],
      payload: day
    });
  });
  const avgTotal = days.reduce((s, d) => s + d.sleep.totalDuration, 0) / days.length;
  const avgDeep = days.reduce((s, d) => s + (d.sleep.deepSleep || 0), 0) / days.length;
  const avgRem = days.reduce((s, d) => s + (d.sleep.remSleep || 0), 0) / days.length;
  renderInlineStats(statsEl, [
    [
      { text: "Avg sleep " },
      { text: formatDuration(avgTotal), strong: true }
    ],
    [
      { text: "Avg deep " },
      { text: formatDuration(avgDeep), strong: true }
    ],
    [
      { text: "Avg REM " },
      { text: formatDuration(avgRem), strong: true }
    ]
  ]);
};

// src/visualizations/workout-log.ts
var TYPE_LABELS = {
  running: "Run",
  cycling: "Bike",
  walking: "Walk",
  swimming: "Swim",
  hiking: "Hike",
  yoga: "Yoga",
  strength: "Lift",
  "strength training": "Lift",
  elliptical: "Elli",
  rowing: "Row",
  pilates: "Pil",
  "high intensity interval training": "HIIT",
  hiit: "HIIT",
  tennis: "Ten",
  basketball: "Bball",
  soccer: "Soccer",
  dance: "Dance",
  "core training": "Core",
  "functional strength training": "Func"
};
function shortLabel(type) {
  var _a;
  const lower = type.toLowerCase().trim();
  return (_a = TYPE_LABELS[lower]) != null ? _a : type.slice(0, 5);
}
function typeColorIndex(type) {
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = hash * 31 + type.charCodeAt(i) & 65535;
  return hash % 6;
}
var HUE_OFFSETS = [0, 40, 80, 160, 210, 280];
var renderWorkoutLog = (ctx, data, W, H, _config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const entries = [];
  for (const day of data) {
    if (!day.workouts) continue;
    for (const w of day.workouts) {
      if (!w.duration) continue;
      entries.push({
        date: day.date,
        type: w.type || "Workout",
        duration: w.duration,
        calories: w.calories || 0,
        distance: w.distance,
        durationFormatted: w.durationFormatted,
        distanceFormatted: w.distanceFormatted
      });
    }
  }
  if (!entries.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No workouts in range", W / 2, H / 2);
    return;
  }
  const padL = 40, padR = 16, padT = 12, padB = 8;
  const plotW = W - padL - padR;
  const maxDuration = Math.max(...entries.map((e) => e.duration));
  const rowH = Math.min(28, (H - padT - padB) / entries.length);
  const barH = rowH * 0.55;
  const gap = (rowH - barH) / 2;
  const radius = barH / 3;
  const visibleCount = Math.floor((H - padT - padB) / rowH);
  const visible = entries.slice(0, visibleCount);
  const maxMin = Math.ceil(maxDuration / 60);
  const tickStep = maxMin <= 60 ? 15 : maxMin <= 120 ? 30 : 60;
  ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.muted;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  for (let t = 0; t <= maxMin; t += tickStep) {
    const x = padL + t / maxMin * plotW;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + visible.length * rowH);
    ctx.stroke();
    ctx.fillText(`${t}m`, x, padT - 2);
  }
  visible.forEach((entry, i) => {
    var _a, _b;
    const y = padT + i * rowH + gap;
    const barW = entry.duration / (maxMin * 60) * plotW;
    const ci = typeColorIndex(entry.type);
    const hue = HUE_OFFSETS[ci];
    const barColor = `hsl(${hue},60%,${theme.isDark ? 55 : 42}%)`;
    ctx.fillStyle = hexToRgba(barColor, 0.8);
    ctx.beginPath();
    ctx.roundRect(padL, y, Math.max(barW, 4), barH, radius);
    ctx.fill();
    ctx.fillStyle = theme.muted;
    ctx.font = "8px sans-serif";
    ctx.textAlign = "right";
    const d = /* @__PURE__ */ new Date(entry.date + "T00:00:00");
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillText(dateStr, padL - 3, y + barH / 2 + 3);
    ctx.fillStyle = barW > 30 ? hexToRgba(theme.bg, 0.8) : theme.fg;
    ctx.font = `bold 7px sans-serif`;
    ctx.textAlign = barW > 30 ? "left" : "left";
    ctx.fillText(shortLabel(entry.type), barW > 30 ? padL + 4 : padL + barW + 4, y + barH / 2 + 2.5);
    hits.add({
      shape: "rect",
      x: padL,
      y,
      w: Math.max(barW, 24),
      h: barH,
      title: `${formatDate(entry.date)} \u2014 ${entry.type}`,
      details: [
        { label: "Duration", value: (_a = entry.durationFormatted) != null ? _a : formatDuration(entry.duration) },
        ...entry.calories ? [{ label: "Calories", value: `${Math.round(entry.calories)} kcal` }] : [],
        ...entry.distance != null ? [{ label: "Distance", value: (_b = entry.distanceFormatted) != null ? _b : `${entry.distance.toFixed(2)} km` }] : []
      ],
      payload: entry
    });
  });
  if (entries.length > visibleCount) {
    ctx.fillStyle = theme.muted;
    ctx.font = "8px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`+${entries.length - visibleCount} more \u2014 increase height to see all`, padL, H - 2);
  }
  const totalDur = entries.reduce((s, e) => s + e.duration, 0);
  const totalCal = entries.reduce((s, e) => s + e.calories, 0);
  const types = [...new Set(entries.map((e) => e.type))];
  const statRows = [
    [{ text: `${entries.length} workouts` }],
    [
      { text: "Total time " },
      { text: formatDuration(totalDur), strong: true }
    ],
    [
      { text: "Types: " },
      { text: `${types.slice(0, 4).join(", ")}${types.length > 4 ? "\u2026" : ""}`, strong: true }
    ]
  ];
  if (totalCal) {
    statRows.splice(2, 0, [
      { text: "Total cal " },
      { text: `${Math.round(totalCal).toLocaleString()} kcal`, strong: true }
    ]);
  }
  renderInlineStats(statsEl, statRows);
};

// src/visualizations/intro-stats.ts
var renderIntroStats = (data, el, _config, theme) => {
  const totalSteps = data.reduce((s, d) => {
    var _a;
    return s + (((_a = d.activity) == null ? void 0 : _a.steps) || 0);
  }, 0);
  const totalDist = data.reduce(
    (s, d) => {
      var _a;
      return s + (((_a = d.activity) == null ? void 0 : _a.walkingRunningDistanceKm) || 0);
    },
    0
  );
  const heartDays = data.filter((d) => d.heart);
  const avgHR = heartDays.length ? heartDays.reduce((s, d) => s + (d.heart.averageHeartRate || 0), 0) / heartDays.length : 0;
  const sleepNights = data.filter(
    (d) => d.sleep && (d.sleep.sleepStages.length > 0 || d.sleep.totalDuration > 0)
  ).length;
  el.addClass("health-md-intro-grid");
  const stats = [
    { value: `${Math.round(avgHR)}`, label: "Avg BPM", color: theme.colors.heart },
    {
      value: `${(totalSteps / 1e3).toFixed(0)}k`,
      label: "Total Steps",
      color: theme.colors.accent
    },
    {
      value: `${sleepNights}`,
      label: "Nights Tracked",
      color: theme.colors.sleep.rem
    },
    {
      value: `${totalDist.toFixed(0)}km`,
      label: "Distance",
      color: theme.colors.secondary
    }
  ];
  stats.forEach((stat) => {
    const box = el.createDiv({ cls: "health-md-intro-stat" });
    const valEl = box.createDiv({ cls: "health-md-intro-value" });
    valEl.style.color = stat.color;
    valEl.textContent = stat.value;
    const labelEl = box.createDiv({ cls: "health-md-intro-label" });
    labelEl.style.color = theme.muted;
    labelEl.textContent = stat.label;
  });
};

// src/visualizations/summary-card.ts
var METRICS = {
  "heart-rate": {
    category: "HEART",
    color: "#fa114f",
    unit: "BPM",
    decimals: 0,
    extract: (d) => {
      var _a;
      const v = (_a = d.heart) == null ? void 0 : _a.averageHeartRate;
      return v && v > 0 ? v : null;
    },
    min: (d) => {
      var _a, _b;
      return (_b = (_a = d.heart) == null ? void 0 : _a.heartRateMin) != null ? _b : null;
    },
    max: (d) => {
      var _a, _b;
      return (_b = (_a = d.heart) == null ? void 0 : _a.heartRateMax) != null ? _b : null;
    }
  },
  "steps": {
    category: "ACTIVITY",
    color: "#ff8e00",
    unit: "STEPS",
    decimals: 0,
    extract: (d) => {
      var _a;
      const v = (_a = d.activity) == null ? void 0 : _a.steps;
      return v != null && v > 0 ? v : null;
    }
  },
  "sleep-duration": {
    category: "SLEEP",
    color: "#715afc",
    unit: "H",
    decimals: 1,
    extract: (d) => {
      var _a;
      const v = (_a = d.sleep) == null ? void 0 : _a.totalDuration;
      return v != null && v > 0 ? v / 3600 : null;
    }
  },
  "active-calories": {
    category: "ACTIVITY",
    color: "#ff8e00",
    unit: "CAL",
    decimals: 0,
    extract: (d) => {
      var _a;
      const v = (_a = d.activity) == null ? void 0 : _a.activeCalories;
      return v != null && v > 0 ? v : null;
    }
  },
  "hrv": {
    category: "HEART",
    color: "#fa114f",
    unit: "MS",
    decimals: 0,
    extract: (d) => {
      var _a, _b;
      if (((_a = d.heart) == null ? void 0 : _a.hrv) != null) return d.heart.hrv;
      const samples = (_b = d.heart) == null ? void 0 : _b.hrvSamples;
      if (samples && samples.length > 0) {
        return samples.reduce((s, x) => s + x.value, 0) / samples.length;
      }
      return null;
    }
  },
  "blood-oxygen": {
    category: "RESPIRATORY",
    color: "#1eeaef",
    unit: "%",
    decimals: 1,
    extract: (d) => {
      var _a, _b, _c, _d;
      return (_d = (_c = (_a = d.vitals) == null ? void 0 : _a.bloodOxygenAvg) != null ? _c : (_b = d.vitals) == null ? void 0 : _b.bloodOxygenPercent) != null ? _d : null;
    },
    min: (d) => {
      var _a, _b;
      return (_b = (_a = d.vitals) == null ? void 0 : _a.bloodOxygenMin) != null ? _b : null;
    },
    max: (d) => {
      var _a, _b;
      return (_b = (_a = d.vitals) == null ? void 0 : _a.bloodOxygenMax) != null ? _b : null;
    }
  },
  "respiratory-rate": {
    category: "RESPIRATORY",
    color: "#3bb2c1",
    unit: "BRPM",
    decimals: 1,
    extract: (d) => {
      var _a, _b, _c, _d;
      return (_d = (_c = (_a = d.vitals) == null ? void 0 : _a.respiratoryRateAvg) != null ? _c : (_b = d.vitals) == null ? void 0 : _b.respiratoryRate) != null ? _d : null;
    },
    min: (d) => {
      var _a, _b;
      return (_b = (_a = d.vitals) == null ? void 0 : _a.respiratoryRateMin) != null ? _b : null;
    },
    max: (d) => {
      var _a, _b;
      return (_b = (_a = d.vitals) == null ? void 0 : _a.respiratoryRateMax) != null ? _b : null;
    }
  }
};
function splitWindows(data, compareWindow) {
  if (compareWindow === "week") {
    if (data.length < 14) return { current: data, prior: [], label: "vs prior week" };
    return { current: data.slice(-7), prior: data.slice(-14, -7), label: "vs prior week" };
  }
  if (compareWindow === "month") {
    if (data.length < 60) return { current: data, prior: [], label: "vs prior month" };
    return { current: data.slice(-30), prior: data.slice(-60, -30), label: "vs prior month" };
  }
  if (data.length < 2) return { current: data, prior: [], label: "vs prior period" };
  const mid = Math.floor(data.length / 2);
  return { current: data.slice(mid), prior: data.slice(0, mid), label: "vs prior period" };
}
function avg(nums) {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
function formatValue(v, meta) {
  if (meta.unit === "STEPS" || meta.unit === "CAL") {
    return Math.round(v).toLocaleString();
  }
  if (meta.unit === "H") {
    const h = Math.floor(v);
    const m = Math.round((v - h) * 60);
    return `${h}h ${m}m`;
  }
  return v.toFixed(meta.decimals);
}
function buildSparkline(values, color, isDark) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const padY = 3;
  const plotH = H - padY * 2;
  const xFor = (i) => i / (values.length - 1) * W;
  const yFor = (v) => padY + plotH - (v - min) / range * plotH;
  let linePath = `M ${xFor(0).toFixed(2)} ${yFor(values[0]).toFixed(2)}`;
  for (let i = 1; i < values.length; i++) {
    const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
    const x1 = xFor(i), y1 = yFor(values[i]);
    const mx = (x0 + x1) / 2;
    linePath += ` C ${mx.toFixed(2)} ${y0.toFixed(2)}, ${mx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  const fillPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `hmd-spark-${Math.random().toString(36).slice(2, 8)}`;
  const topAlpha = isDark ? 0.45 : 0.38;
  const botAlpha = 0.02;
  return `
		<svg class="health-md-summary-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
			<defs>
				<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="${color}" stop-opacity="${topAlpha}"/>
					<stop offset="100%" stop-color="${color}" stop-opacity="${botAlpha}"/>
				</linearGradient>
			</defs>
			<path d="${fillPath}" fill="url(#${gradId})"/>
			<path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
		</svg>
	`;
}
var renderSummaryCard = (data, el, config, theme) => {
  var _a, _b;
  const metricId = config.metric || "heart-rate";
  const meta = METRICS[metricId];
  if (!meta) {
    el.createEl("p", {
      text: `Unknown metric: ${metricId}`,
      cls: "health-md-error"
    });
    return;
  }
  const compareWindow = String(config.compareWindow || "same-length");
  const { current, prior, label: compareLabel } = splitWindows(data, compareWindow);
  const currentVals = current.map((day) => meta.extract(day)).filter((v) => v != null);
  if (!currentVals.length) {
    el.createEl("p", {
      text: `No ${metricId} data in range.`,
      cls: "health-md-error"
    });
    return;
  }
  const priorVals = prior.map((day) => meta.extract(day)).filter((v) => v != null);
  const card = el.createDiv({ cls: "health-md-summary-card" });
  card.style.setProperty("--hmd-summary-color", meta.color);
  card.style.borderColor = hexToRgba(theme.fg, 0.12);
  const pill = card.createDiv({ cls: "health-md-summary-pill" });
  pill.textContent = meta.category;
  pill.style.color = meta.color;
  const mainAvg = avg(currentVals);
  const kpi = card.createDiv({ cls: "health-md-summary-kpi" });
  kpi.createSpan({
    cls: "health-md-summary-value",
    text: formatValue(mainAvg, meta)
  });
  if (meta.unit !== "H") {
    const unitEl = kpi.createSpan({
      cls: "health-md-summary-unit",
      text: meta.unit
    });
    unitEl.style.color = theme.muted;
  }
  const sparkHtml = buildSparkline(currentVals, meta.color, theme.isDark);
  if (sparkHtml) {
    const sparkWrap = card.createDiv({ cls: "health-md-summary-spark" });
    appendSvgFromMarkup(sparkWrap, sparkHtml);
  }
  if (priorVals.length) {
    const priorAvg = avg(priorVals);
    const delta = priorAvg === 0 ? 0 : (mainAvg - priorAvg) / priorAvg * 100;
    const arrow = Math.abs(delta) < 0.5 ? "\u2014" : delta > 0 ? "\u25B2" : "\u25BC";
    const trendColor = Math.abs(delta) < 0.5 ? theme.muted : delta > 0 ? "#30c26a" : "#ff3b30";
    const trend = card.createDiv({ cls: "health-md-summary-trend" });
    const arrowEl = trend.createSpan({
      cls: "health-md-summary-arrow",
      text: arrow
    });
    arrowEl.style.color = trendColor;
    const deltaEl = trend.createSpan({
      cls: "health-md-summary-delta",
      text: `${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`
    });
    deltaEl.style.color = trendColor;
    const captionEl = trend.createSpan({
      cls: "health-md-summary-caption",
      text: compareLabel
    });
    captionEl.style.color = theme.muted;
  }
  const minFn = (_a = meta.min) != null ? _a : (d) => meta.extract(d);
  const maxFn = (_b = meta.max) != null ? _b : (d) => meta.extract(d);
  const mins = current.map((day) => minFn(day)).filter((v) => v != null && v > 0);
  const maxs = current.map((day) => maxFn(day)).filter((v) => v != null && v > 0);
  if (mins.length && maxs.length) {
    const rangeEl = card.createDiv({ cls: "health-md-summary-meta" });
    rangeEl.style.color = theme.muted;
    const lo = Math.min(...mins);
    const hi = Math.max(...maxs);
    rangeEl.textContent = `Range ${formatValue(lo, meta)}\u2013${formatValue(hi, meta)} ${meta.unit === "H" ? "" : meta.unit}`.trim();
  }
};

// src/visualizations/trend-tile.ts
var METRICS2 = {
  "resting-heart-rate": {
    category: "HEART",
    color: "#fa114f",
    label: "Resting Heart Rate",
    unit: "bpm",
    decimals: 0,
    higherIsBetter: false,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.heart) == null ? void 0 : _a.restingHeartRate) != null ? _b : null;
    }
  },
  "hrv": {
    category: "HEART",
    color: "#fa114f",
    label: "Heart Rate Variability",
    unit: "ms",
    decimals: 1,
    higherIsBetter: true,
    extract: (d) => {
      var _a, _b;
      if (((_a = d.heart) == null ? void 0 : _a.hrv) != null) return d.heart.hrv;
      const s = (_b = d.heart) == null ? void 0 : _b.hrvSamples;
      if (s && s.length) return s.reduce((acc, x) => acc + x.value, 0) / s.length;
      return null;
    }
  },
  "steps": {
    category: "ACTIVITY",
    color: "#ff8e00",
    label: "Steps",
    unit: "steps",
    decimals: 0,
    higherIsBetter: true,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.activity) == null ? void 0 : _a.steps) != null ? _b : 0) > 0 ? d.activity.steps : null;
    }
  },
  "vo2max": {
    category: "HEART",
    color: "#fa114f",
    label: "Cardio Fitness",
    unit: "ml/kg\xB7min",
    decimals: 1,
    higherIsBetter: true,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.vo2Max) != null ? _b : null;
    }
  },
  "walking-speed": {
    category: "ACTIVITY",
    color: "#ff8e00",
    label: "Walking Speed",
    unit: "m/s",
    decimals: 2,
    higherIsBetter: true,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.mobility) == null ? void 0 : _a.walkingSpeed) != null ? _b : null;
    }
  },
  "sleep-duration": {
    category: "SLEEP",
    color: "#715afc",
    label: "Sleep Duration",
    unit: "h",
    decimals: 1,
    higherIsBetter: true,
    extract: (d) => {
      var _a;
      const v = (_a = d.sleep) == null ? void 0 : _a.totalDuration;
      return v != null && v > 0 ? v / 3600 : null;
    }
  },
  "active-calories": {
    category: "ACTIVITY",
    color: "#ff8e00",
    label: "Active Energy",
    unit: "CAL",
    decimals: 0,
    higherIsBetter: true,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.activity) == null ? void 0 : _a.activeCalories) != null ? _b : 0) > 0 ? d.activity.activeCalories : null;
    }
  }
};
function avg2(nums) {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
function formatValue2(v, meta) {
  if (meta.unit === "steps") return Math.round(v).toLocaleString();
  if (meta.unit === "CAL") return `${Math.round(v)}`;
  if (meta.unit === "h") {
    const h = Math.floor(v);
    const m = Math.round((v - h) * 60);
    return `${h}h ${m}m`;
  }
  return v.toFixed(meta.decimals);
}
function buildSparkline2(current, prior, color, isDark) {
  if (!current.length) return "";
  const W = 120, H = 36, padY = 3;
  const plotH = H - padY * 2;
  const combined = [...prior, ...current];
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const range = max - min || 1;
  function pathFor(values, offsetFrac, widthFrac) {
    if (values.length < 2) return "";
    const x0 = offsetFrac * W;
    const x1 = (offsetFrac + widthFrac) * W;
    const xFor = (i) => x0 + i / (values.length - 1) * (x1 - x0);
    const yFor = (v) => padY + plotH - (v - min) / range * plotH;
    let p = `M ${xFor(0).toFixed(2)} ${yFor(values[0]).toFixed(2)}`;
    for (let i = 1; i < values.length; i++) {
      const px0 = xFor(i - 1), py0 = yFor(values[i - 1]);
      const px1 = xFor(i), py1 = yFor(values[i]);
      const mx = (px0 + px1) / 2;
      p += ` C ${mx.toFixed(2)} ${py0.toFixed(2)}, ${mx.toFixed(2)} ${py1.toFixed(2)}, ${px1.toFixed(2)} ${py1.toFixed(2)}`;
    }
    return p;
  }
  const priorFrac = prior.length / (prior.length + current.length || 1);
  const priorPath = pathFor(prior, 0, priorFrac);
  const currentPath = pathFor(current, priorFrac, 1 - priorFrac);
  const priorAlpha = isDark ? 0.4 : 0.35;
  return `
		<svg class="health-md-summary-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
			${priorPath ? `<path d="${priorPath}" fill="none" stroke="${color}" stroke-opacity="${priorAlpha}" stroke-width="1.25" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : ""}
			${currentPath ? `<path d="${currentPath}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ""}
		</svg>
	`;
}
function splitWindows2(data, currentWindow, priorWindow) {
  if (data.length < currentWindow + 1) {
    const mid = Math.floor(data.length / 2);
    return { current: data.slice(mid), prior: data.slice(0, mid) };
  }
  const current = data.slice(-currentWindow);
  const priorEnd = data.length - currentWindow;
  const priorStart = Math.max(0, priorEnd - priorWindow);
  const prior = data.slice(priorStart, priorEnd);
  return { current, prior };
}
function narrative(meta, delta, windowDays) {
  const absPct = Math.abs(delta);
  if (absPct < 1) {
    return `Your ${meta.label.toLowerCase()} has been steady over the past ${windowDays} days.`;
  }
  const direction = delta > 0 ? "higher" : "lower";
  return `Your ${meta.label.toLowerCase()} is ${direction} than it was ${windowDays} days ago.`;
}
var renderTrendTile = (data, el, config, theme) => {
  const metricId = config.metric || "resting-heart-rate";
  const meta = METRICS2[metricId];
  if (!meta) {
    el.createEl("p", {
      text: `Unknown metric: ${metricId}`,
      cls: "health-md-error"
    });
    return;
  }
  const currentWindow = Number(config.currentWindow) || 90;
  const priorWindow = Number(config.priorWindow) || 90;
  const { current, prior } = splitWindows2(data, currentWindow, priorWindow);
  const currentVals = current.map((day) => meta.extract(day)).filter((v) => v != null);
  const priorVals = prior.map((day) => meta.extract(day)).filter((v) => v != null);
  if (!currentVals.length) {
    el.createEl("p", {
      text: `No ${meta.label.toLowerCase()} data in range.`,
      cls: "health-md-error"
    });
    return;
  }
  const card = el.createDiv({ cls: "health-md-summary-card health-md-trend-tile" });
  card.style.setProperty("--hmd-summary-color", meta.color);
  card.style.borderColor = hexToRgba(theme.fg, 0.12);
  const header = card.createDiv({ cls: "health-md-trend-header" });
  const pill = header.createSpan({ cls: "health-md-summary-pill" });
  pill.textContent = meta.category;
  pill.style.color = meta.color;
  const nameEl = header.createSpan({ cls: "health-md-trend-name" });
  nameEl.textContent = meta.label;
  nameEl.style.color = theme.fg;
  const currentAvg = avg2(currentVals);
  const priorAvg = priorVals.length ? avg2(priorVals) : null;
  const delta = priorAvg == null || priorAvg === 0 ? 0 : (currentAvg - priorAvg) / priorAvg * 100;
  const isImprovement = Math.abs(delta) >= 0.5 && (meta.higherIsBetter ? delta > 0 : delta < 0);
  const isRegression = Math.abs(delta) >= 0.5 && (meta.higherIsBetter ? delta < 0 : delta > 0);
  const arrow = Math.abs(delta) < 0.5 ? "\u2192" : delta > 0 ? "\u2191" : "\u2193";
  const arrowColor = isImprovement ? "#30c26a" : isRegression ? "#ff3b30" : theme.muted;
  const deltaRow = card.createDiv({ cls: "health-md-trend-delta-row" });
  const arrowEl = deltaRow.createSpan({ cls: "health-md-trend-arrow" });
  arrowEl.textContent = arrow;
  arrowEl.style.color = arrowColor;
  const pctEl = deltaRow.createSpan({ cls: "health-md-trend-pct" });
  pctEl.textContent = `${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`;
  pctEl.style.color = arrowColor;
  if (priorAvg != null) {
    const absDelta = currentAvg - priorAvg;
    const deltaStr = `${absDelta >= 0 ? "+" : "\u2212"}${formatValue2(Math.abs(absDelta), meta)} ${meta.unit === "h" ? "" : meta.unit}`.trim();
    const absEl = deltaRow.createSpan({ cls: "health-md-trend-abs" });
    absEl.textContent = deltaStr;
    absEl.style.color = theme.muted;
  }
  const narr = card.createDiv({ cls: "health-md-trend-narrative" });
  narr.textContent = priorVals.length ? narrative(meta, delta, currentWindow + priorWindow) : `Your ${meta.label.toLowerCase()}: ${formatValue2(currentAvg, meta)} ${meta.unit === "h" ? "" : meta.unit}`.trim();
  narr.style.color = theme.muted;
  const spark = buildSparkline2(currentVals, priorVals, meta.color, theme.isDark);
  if (spark) {
    const wrap = card.createDiv({ cls: "health-md-summary-spark" });
    appendSvgFromMarkup(wrap, spark);
  }
  if (currentVals.length >= 5) {
    const mean = currentAvg;
    const variance = currentVals.reduce((s, v) => s + (v - mean) ** 2, 0) / currentVals.length;
    const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;
    const label = cv < 0.1 ? "Very consistent" : cv < 0.2 ? "Consistent" : cv < 0.35 ? "Variable" : "Irregular";
    const dotColor = cv < 0.1 ? "#30c26a" : cv < 0.2 ? "#9ecb3f" : cv < 0.35 ? "#ffa534" : "#ff3b30";
    const consistency = card.createDiv({ cls: "health-md-trend-consistency" });
    const dot = consistency.createSpan({ cls: "health-md-trend-dot" });
    dot.style.backgroundColor = dotColor;
    const txt = consistency.createSpan();
    txt.textContent = label;
    txt.style.color = theme.muted;
  }
};

// src/visualizations/activity-rings.ts
var RING_COLORS = {
  move: "#fa114f",
  exercise: "#92e82a",
  stand: "#1eeaef"
};
function extractValues(day) {
  var _a, _b, _c, _d;
  const act = day.activity;
  if (!act) return { move: 0, exercise: 0, stand: 0 };
  const steps = (_a = act.steps) != null ? _a : 0;
  const standProxy = Math.min(12, Math.floor(steps / 1e3));
  return {
    move: (_b = act.activeCalories) != null ? _b : 0,
    exercise: (_c = act.exerciseMinutes) != null ? _c : 0,
    stand: (_d = act.standHours) != null ? _d : standProxy
  };
}
function drawRingSet(ctx, cx, cy, outerR, stroke, values, goals, theme, hits, day, label) {
  const rings = [
    { key: "move", color: RING_COLORS.move, value: values.move, goal: goals.move, unit: "CAL" },
    { key: "exercise", color: RING_COLORS.exercise, value: values.exercise, goal: goals.exercise, unit: "MIN" },
    { key: "stand", color: RING_COLORS.stand, value: values.stand, goal: goals.stand, unit: "HR" }
  ];
  const gap = Math.max(2, stroke * 0.18);
  rings.forEach((ring, i) => {
    const r = outerR - i * (stroke + gap);
    if (r < stroke) return;
    const progress = ring.goal > 0 ? ring.value / ring.goal : 0;
    ctx.strokeStyle = hexToRgba(ring.color, theme.isDark ? 0.18 : 0.15);
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (progress <= 0) return;
    const startA = -Math.PI / 2;
    const clamped = Math.min(progress, 1);
    const endA = startA + clamped * Math.PI * 2;
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, ring.color);
    grad.addColorStop(1, hexToRgba(ring.color, 0.75));
    ctx.strokeStyle = grad;
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.stroke();
    if (progress > 1) {
      const excess = Math.min(progress - 1, 1);
      const excessEnd = startA + excess * Math.PI * 2;
      ctx.strokeStyle = hexToRgba(ring.color, 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, excessEnd);
      ctx.stroke();
    }
    hits.add({
      shape: "sector",
      cx,
      cy,
      r0: r - stroke / 2,
      r1: r + stroke / 2,
      a0: 0,
      a1: Math.PI * 2,
      title: `${label} \u2014 ${ring.key.toUpperCase()}`,
      details: [
        { label: "Value", value: `${Math.round(ring.value)} ${ring.unit}` },
        { label: "Goal", value: `${ring.goal} ${ring.unit}` },
        { label: "Progress", value: `${Math.round(progress * 100)}%` }
      ],
      payload: day
    });
  });
}
var renderActivityRings = (ctx, data, W, H, config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const days = data.filter((d) => d.activity);
  if (!days.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No activity data", W / 2, H / 2);
    return;
  }
  const goals = {
    move: Number(config.moveGoal) || 500,
    exercise: Number(config.exerciseGoal) || 30,
    stand: Number(config.standGoal) || 12
  };
  if (days.length === 1) {
    const day = days[0];
    const values = extractValues(day);
    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.min(W, H) / 2 - 12;
    const stroke = Math.max(10, outerR * 0.14);
    drawRingSet(ctx, cx, cy, outerR, stroke, values, goals, theme, hits, day, formatDate(day.date));
    const innerR = outerR - 3 * (stroke + stroke * 0.18) - stroke;
    const lines = [
      { text: `${Math.round(values.move)}/${goals.move} CAL`, color: RING_COLORS.move },
      { text: `${Math.round(values.exercise)}/${goals.exercise} MIN`, color: RING_COLORS.exercise },
      { text: `${Math.round(values.stand)}/${goals.stand} HR`, color: RING_COLORS.stand }
    ];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineH = Math.max(12, innerR * 0.42);
    const fontSize = Math.max(9, Math.min(14, innerR * 0.28));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const startY = cy - (lines.length - 1) * lineH / 2;
    lines.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx, startY + i * lineH);
    });
    renderStatBoxes(statsEl, [
      {
        value: String(Math.round(values.move)),
        label: `Move / ${goals.move}`,
        color: RING_COLORS.move
      },
      {
        value: String(Math.round(values.exercise)),
        label: `Exercise / ${goals.exercise}`,
        color: RING_COLORS.exercise
      },
      {
        value: String(Math.round(values.stand)),
        label: `Stand / ${goals.stand}`,
        color: RING_COLORS.stand
      }
    ]);
    return;
  }
  const canvas = ctx.canvas;
  const n = days.length;
  const cols = Math.min(n, Math.max(3, Math.round(Math.sqrt(n * (W / H)))));
  const rows = Math.ceil(n / cols);
  const gap = 10;
  const cellW = (W - gap * (cols - 1)) / cols;
  const dateLabelH = 16;
  const cellH = cellW + dateLabelH;
  const neededH = rows * cellH + (rows - 1) * gap + 8;
  if (neededH > H) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = neededH * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = neededH + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, neededH);
  }
  days.forEach((day, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const x0 = col * (cellW + gap);
    const y0 = row * (cellH + gap);
    const cx = x0 + cellW / 2;
    const cy = y0 + cellW / 2;
    const outerR = cellW / 2 - 4;
    const stroke = Math.max(4, outerR * 0.18);
    const values = extractValues(day);
    drawRingSet(ctx, cx, cy, outerR, stroke, values, goals, theme, hits, day, formatDate(day.date));
    const d = /* @__PURE__ */ new Date(day.date + "T00:00:00");
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillStyle = theme.muted;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, y0 + cellW + dateLabelH / 2 + 1);
  });
  const totalMove = days.reduce((s, d) => s + extractValues(d).move, 0);
  const totalEx = days.reduce((s, d) => s + extractValues(d).exercise, 0);
  const closedMove = days.filter((d) => extractValues(d).move >= goals.move).length;
  const closedEx = days.filter((d) => extractValues(d).exercise >= goals.exercise).length;
  const closedStand = days.filter((d) => extractValues(d).stand >= goals.stand).length;
  renderStatBoxes(statsEl, [
    {
      value: `${closedMove}/${days.length}`,
      label: "Move closed",
      color: RING_COLORS.move
    },
    {
      value: `${closedEx}/${days.length}`,
      label: "Exercise closed",
      color: RING_COLORS.exercise
    },
    {
      value: `${closedStand}/${days.length}`,
      label: "Stand closed",
      color: RING_COLORS.stand
    },
    {
      value: Math.round(totalMove).toLocaleString(),
      label: "Total CAL"
    },
    {
      value: String(Math.round(totalEx)),
      label: "Total min"
    }
  ]);
};

// src/visualizations/range-chart-core.ts
function renderRangeChart(ctx, data, W, H, theme, statsEl, hits, spec) {
  var _a, _b, _c, _d, _e, _f;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const points = data.map((d) => {
    const v = spec.extract(d);
    return v ? { day: d, date: d.date, ...v } : null;
  });
  const present = points.filter((p) => p !== null);
  if (!present.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`No ${spec.label.toLowerCase()} data`, W / 2, H / 2);
    return;
  }
  const padL = (_a = spec.padL) != null ? _a : 36;
  const padR = 16, padT = 14, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const observedMin = Math.min(...present.map((p) => p.min));
  const observedMax = Math.max(...present.map((p) => p.max));
  const { yMin, yMax, gridStep } = spec.yAxis({ min: observedMin, max: observedMax });
  const yRange = yMax - yMin || 1;
  const n = points.length;
  const xFor = (i) => padL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW);
  const yFor = (v) => padT + plotH - (v - yMin) / yRange * plotH;
  if (spec.warn) {
    ctx.fillStyle = hexToRgba(spec.warn.color, theme.isDark ? 0.12 : 0.08);
    if (spec.warn.lo != null) {
      const yThreshold = yFor(spec.warn.lo);
      ctx.fillRect(padL, yThreshold, plotW, padT + plotH - yThreshold);
    }
    if (spec.warn.hi != null) {
      const yThreshold = yFor(spec.warn.hi);
      ctx.fillRect(padL, padT, plotW, yThreshold - padT);
    }
  }
  ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.muted;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const startGrid = Math.ceil(yMin / gridStep) * gridStep;
  for (let v = startGrid; v <= yMax; v += gridStep) {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(spec.formatAxisLabel(v), padL - 4, y);
  }
  if (spec.warn) {
    const thresholdV = (_b = spec.warn.lo) != null ? _b : spec.warn.hi;
    const y = yFor(thresholdV);
    ctx.save();
    ctx.strokeStyle = hexToRgba(spec.warn.color, 0.55);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = spec.warn.color;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(spec.warn.note, padL + 4, y - 2);
  }
  if (spec.overlays) {
    spec.overlays({ ctx, data, yFor, yMin, yMax, padL, padR, W });
  }
  const capW = Math.max(4, Math.min(10, plotW / Math.max(1, n) * 0.45));
  const capRadius = capW / 2;
  const avgDotInnerLight = (_c = spec.avgDotInnerLightFill) != null ? _c : "#000";
  points.forEach((p, i) => {
    if (!p) return;
    const x = xFor(i);
    const yTop = yFor(p.max);
    const yBot = yFor(p.min);
    const h = Math.max(capW, yBot - yTop);
    const grad = ctx.createLinearGradient(0, yTop, 0, yTop + h);
    grad.addColorStop(0, hexToRgba(spec.capsuleColor, 1));
    grad.addColorStop(1, hexToRgba(spec.capsuleColor, 0.55));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - capW / 2, yTop, capW, h, capRadius);
    ctx.fill();
    const yAvg = yFor(p.avg);
    ctx.fillStyle = theme.isDark ? "#fff" : avgDotInnerLight;
    ctx.beginPath();
    ctx.arc(x, yAvg, Math.max(2, capW * 0.38), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = spec.capsuleColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, yAvg, Math.max(2, capW * 0.38), 0, Math.PI * 2);
    ctx.stroke();
    hits.add({
      shape: "rect",
      x: x - capW,
      y: yTop - 4,
      w: capW * 2,
      h: h + 8,
      title: formatDate(p.date),
      details: [
        { label: "Avg", value: `${spec.formatValue(p.avg)} ${spec.unit}` },
        { label: "Min", value: `${spec.formatValue(p.min)} ${spec.unit}` },
        { label: "Max", value: `${spec.formatValue(p.max)} ${spec.unit}` }
      ],
      payload: p.day
    });
  });
  const labelStep = Math.max(1, Math.floor(n / 6));
  ctx.fillStyle = theme.muted;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < n; i++) {
    if (i % labelStep !== 0 && i !== n - 1) continue;
    const iso = (_f = (_d = points[i]) == null ? void 0 : _d.date) != null ? _f : (_e = data[i]) == null ? void 0 : _e.date;
    if (!iso) continue;
    const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillText(label, xFor(i), H - padB + 6);
  }
  const overallMin = Math.min(...present.map((p) => p.min));
  const overallMax = Math.max(...present.map((p) => p.max));
  const overallAvg = present.reduce((s, p) => s + p.avg, 0) / present.length;
  renderStatBoxes(statsEl, [
    {
      value: spec.formatValue(overallMin),
      label: "Lowest",
      color: spec.stats.lowColor
    },
    {
      value: spec.formatValue(overallAvg),
      label: `${spec.label} avg`,
      color: spec.stats.avgColor
    },
    {
      value: spec.formatValue(overallMax),
      label: "Highest",
      color: spec.stats.highColor
    }
  ]);
}

// src/visualizations/heart-range.ts
var CAP_COLOR = "#ff3b30";
var RESTING_COLOR = "#4488ff";
function extractForMetric(day, metric) {
  if (!day.heart) return null;
  if (metric === "resting") {
    const v = day.heart.restingHeartRate;
    if (v == null || v <= 0) return null;
    return { min: v, max: v, avg: v };
  }
  if (metric === "walking") {
    const v = day.heart.walkingHeartRateAverage;
    if (v == null || v <= 0) return null;
    return { min: v, max: v, avg: v };
  }
  const min = day.heart.heartRateMin;
  const max = day.heart.heartRateMax;
  const avg4 = day.heart.averageHeartRate;
  if (avg4 == null || avg4 <= 0) return null;
  return { min: min > 0 ? min : avg4, max: max > 0 ? max : avg4, avg: avg4 };
}
function labelFor(m) {
  if (m === "resting") return "Resting HR";
  if (m === "walking") return "Walking HR";
  return "Heart Rate";
}
function restingOverlay({ ctx, data, yFor, yMin, yMax, padL, padR, W }) {
  const vals = data.map((d) => {
    var _a;
    return (_a = d.heart) == null ? void 0 : _a.restingHeartRate;
  }).filter((v) => v != null && v > 0);
  if (!vals.length) return;
  const rest = vals.reduce((s, x) => s + x, 0) / vals.length;
  if (rest < yMin || rest > yMax) return;
  const y = yFor(rest);
  ctx.save();
  ctx.strokeStyle = hexToRgba(RESTING_COLOR, 0.55);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, y);
  ctx.lineTo(W - padR, y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = RESTING_COLOR;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`resting ~${Math.round(rest)}`, padL + 4, y - 2);
}
var renderHeartRange = (ctx, data, W, H, config, theme, statsEl, hits) => {
  const metric = config.metric || "heart-rate";
  const spec = {
    label: labelFor(metric),
    unit: "bpm",
    capsuleColor: CAP_COLOR,
    padL: 36,
    avgDotInnerLightFill: "#1a0000",
    extract: (d) => extractForMetric(d, metric),
    yAxis: ({ min, max }) => {
      const yMin = Math.max(0, Math.floor((min - 20) / 10) * 10);
      const yMax = Math.ceil((max + 20) / 10) * 10;
      const range = yMax - yMin || 1;
      return { yMin, yMax, gridStep: range > 120 ? 40 : 20 };
    },
    formatAxisLabel: (v) => String(v),
    formatValue: (v) => String(Math.round(v)),
    stats: { lowColor: RESTING_COLOR, avgColor: CAP_COLOR, highColor: CAP_COLOR },
    overlays: metric === "heart-rate" ? restingOverlay : void 0
  };
  renderRangeChart(ctx, data, W, H, theme, statsEl, hits, spec);
};

// src/visualizations/bar-chart.ts
var METRICS3 = {
  steps: {
    label: "Steps",
    unit: "steps",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.steps) != null ? _b : 0;
    },
    formatTotal: (sum) => sum.toLocaleString(),
    formatValue: (v) => Math.round(v).toLocaleString(),
    aggregate: "sum"
  },
  activeCalories: {
    label: "Active Energy",
    unit: "CAL",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.activeCalories) != null ? _b : 0;
    },
    formatTotal: (sum) => Math.round(sum).toLocaleString(),
    formatValue: (v) => `${Math.round(v)}`,
    aggregate: "sum"
  },
  exerciseMinutes: {
    label: "Exercise",
    unit: "min",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.exerciseMinutes) != null ? _b : 0;
    },
    formatTotal: (sum) => `${Math.round(sum)}`,
    formatValue: (v) => `${Math.round(v)}`,
    aggregate: "sum"
  },
  distance: {
    label: "Distance",
    unit: "km",
    color: (t) => t.colors.secondary,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.walkingRunningDistanceKm) != null ? _b : 0;
    },
    formatTotal: (sum) => sum.toFixed(1),
    formatValue: (v) => v.toFixed(2),
    aggregate: "sum"
  },
  sleepHours: {
    label: "Sleep",
    unit: "h",
    color: (t) => t.colors.sleep.rem,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.sleep) == null ? void 0 : _a.totalDuration) != null ? _b : 0) / 3600;
    },
    formatTotal: (sum) => sum.toFixed(1),
    formatValue: (v) => {
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60);
      return `${h}h ${m}m`;
    },
    aggregate: "avg"
  },
  flightsClimbed: {
    label: "Flights Climbed",
    unit: "flights",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return (_b = (_a = d.activity) == null ? void 0 : _a.flightsClimbed) != null ? _b : 0;
    },
    formatTotal: (sum) => `${Math.round(sum)}`,
    formatValue: (v) => `${Math.round(v)}`,
    aggregate: "sum"
  }
};
var WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];
var renderBarChart = (ctx, data, W, H, config, theme, statsEl, hits) => {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const metricId = config.metric || "steps";
  const meta = METRICS3[metricId];
  if (!meta) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Unknown metric: ${metricId}`, W / 2, H / 2);
    return;
  }
  const days = data;
  if (!days.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data in range", W / 2, H / 2);
    return;
  }
  const values = days.map((d) => meta.extract(d));
  const n = values.length;
  const max = Math.max(...values, 0);
  const nonZero = values.filter((v) => v > 0);
  const total = values.reduce((s, v) => s + v, 0);
  const average = nonZero.length ? total / nonZero.length : 0;
  const goal = config.goal != null ? Number(config.goal) : void 0;
  const showAverage = config.showAverage === void 0 || config.showAverage === "true" || config.showAverage === 1 || config.showAverage === "1";
  const chartEffectiveMax = goal && goal > max ? goal : max;
  const denom = chartEffectiveMax > 0 ? chartEffectiveMax : 1;
  const kpiH = 46;
  const axisH = 18;
  const padT = 8;
  const padB = axisH + 8;
  const padL = 16;
  const padR = 36;
  const plotTop = padT + kpiH;
  const plotH = H - plotTop - padB;
  const headline = meta.aggregate === "sum" ? meta.formatTotal(total) : meta.formatValue(average);
  const subtitle = `${formatDate(days[0].date)} \u2013 ${formatDate(days[n - 1].date)}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.fg;
  ctx.font = "600 22px sans-serif";
  const headlineMetrics = ctx.measureText(headline);
  ctx.fillText(headline, padL, padT + 22);
  ctx.fillStyle = theme.muted;
  ctx.font = "11px sans-serif";
  ctx.fillText(` ${meta.unit}`, padL + headlineMetrics.width + 2, padT + 22);
  ctx.fillText(subtitle, padL, padT + 40);
  const accent = meta.color(theme);
  if (chartEffectiveMax > 0) {
    ctx.fillStyle = theme.muted;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(meta.formatValue(chartEffectiveMax), W - 4, plotTop);
  }
  if (showAverage && average > 0 && chartEffectiveMax > 0) {
    const y = plotTop + plotH - average / denom * plotH;
    ctx.save();
    ctx.strokeStyle = hexToRgba(theme.fg, 0.4);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`avg ${meta.formatValue(average)}`, W - padR - 4, y - 2);
  }
  if (goal && chartEffectiveMax > 0) {
    const y = plotTop + plotH - goal / denom * plotH;
    ctx.save();
    ctx.strokeStyle = hexToRgba(accent, 0.8);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = accent;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`goal ${meta.formatValue(goal)}`, padL + 2, y - 2);
  }
  const chartW = W - padL - padR;
  const slot = chartW / n;
  const barW = Math.max(3, Math.min(slot * 0.72, 28));
  const cornerR = Math.min(barW / 2, 6);
  const highlightIdx = n - 1;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = padL + i * slot + (slot - barW) / 2;
    const isHighlight = i === highlightIdx;
    const h = v / denom * plotH;
    const y = plotTop + plotH - h;
    if (h <= 0.5) {
      ctx.fillStyle = hexToRgba(accent, 0.12);
      ctx.beginPath();
      ctx.roundRect(x, plotTop + plotH - 2, barW, 2, 1);
      ctx.fill();
    } else {
      ctx.fillStyle = isHighlight ? accent : hexToRgba(accent, 0.35);
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, [cornerR, cornerR, 0, 0]);
      ctx.fill();
    }
    hits.add({
      shape: "rect",
      x: padL + i * slot,
      y: plotTop,
      w: slot,
      h: plotH + axisH,
      title: formatDate(days[i].date),
      details: [
        { label: meta.label, value: `${meta.formatValue(v)} ${meta.unit}` }
      ],
      payload: days[i]
    });
  }
  ctx.fillStyle = theme.muted;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (n <= 7) {
    for (let i = 0; i < n; i++) {
      const d = /* @__PURE__ */ new Date(days[i].date + "T00:00:00");
      const ch = WEEKDAY_INITIAL[d.getDay()];
      const cx = padL + i * slot + slot / 2;
      ctx.fillStyle = i === highlightIdx ? theme.fg : theme.muted;
      ctx.fillText(ch, cx, plotTop + plotH + 4);
    }
  } else {
    const labelStep = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i++) {
      if (i % labelStep !== 0 && i !== n - 1) continue;
      const d = /* @__PURE__ */ new Date(days[i].date + "T00:00:00");
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const cx = padL + i * slot + slot / 2;
      ctx.fillStyle = i === highlightIdx ? theme.fg : theme.muted;
      ctx.fillText(label, cx, plotTop + plotH + 4);
    }
  }
  const bestIdx = values.reduce(
    (best2, v, i) => v > values[best2] ? i : best2,
    0
  );
  const best = values[bestIdx];
  const bestLabel = (/* @__PURE__ */ new Date(days[bestIdx].date + "T00:00:00")).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  );
  renderStatBoxes(statsEl, [
    {
      value: meta.aggregate === "sum" ? meta.formatTotal(total) : meta.formatValue(total),
      label: `Total ${meta.unit}`
    },
    { value: meta.formatValue(average), label: "Daily avg" },
    { value: meta.formatValue(best), label: `Best (${bestLabel})` }
  ]);
};

// src/visualizations/sleep-schedule.ts
function parseWindow(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || "");
  if (!m) return { h: 0, m: 0 };
  return { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) };
}
function resolveBedWake(night) {
  const sleep = night.sleep;
  if (!sleep || !sleep.bedtime || !sleep.wakeTime) return null;
  const isTimeOnly = (s) => /^\d{1,2}:\d{2}$/.test(s);
  let bedMs, wakeMs;
  if (isTimeOnly(sleep.bedtime)) {
    bedMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.bedtime}:00`)).getTime();
    wakeMs = (/* @__PURE__ */ new Date(`${night.date}T${sleep.wakeTime}:00`)).getTime();
    if (wakeMs <= bedMs) wakeMs += 864e5;
  } else {
    bedMs = Date.parse(sleep.bedtime);
    wakeMs = Date.parse(sleep.wakeTime);
  }
  if (!isFinite(bedMs) || !isFinite(wakeMs) || wakeMs <= bedMs) return null;
  return { bedMs, wakeMs };
}
function formatHour(ms) {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}
function hourLabel(h) {
  const hr = (h % 24 + 24) % 24;
  if (hr === 0) return "12A";
  if (hr === 12) return "12P";
  if (hr < 12) return `${hr}A`;
  return `${hr - 12}P`;
}
var renderSleepSchedule = (ctx, data, W, H, config, theme, statsEl, hits) => {
  const canvas = ctx.canvas;
  const sleepGoalHours = Number(config.sleepGoal) || 8;
  const windowStart = parseWindow(String(config.windowStart || "18:00"));
  const windowEnd = parseWindow(String(config.windowEnd || "10:00"));
  const nights = [];
  for (const d of data) {
    if (!d.sleep) continue;
    if (!(d.sleep.sleepStages.length > 0 || d.sleep.totalDuration > 0)) continue;
    const bw = resolveBedWake(d);
    if (!bw) continue;
    nights.push({
      date: d.date,
      day: d,
      bedMs: bw.bedMs,
      wakeMs: bw.wakeMs,
      totalSeconds: d.sleep.totalDuration || (bw.wakeMs - bw.bedMs) / 1e3
    });
  }
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  if (!nights.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sleep data", W / 2, H / 2);
    return;
  }
  const rowH = 26;
  const rowGap = 6;
  const padT = 10;
  const axisH = 20;
  const gutterW = 104;
  const rightPad = 16;
  const barAreaX = gutterW;
  const barAreaW = W - gutterW - rightPad;
  const neededH = padT + nights.length * (rowH + rowGap) + axisH + 8;
  if (neededH !== H) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = neededH * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = neededH + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, neededH);
  }
  function windowBoundsFor(dateIso) {
    const startMs = (/* @__PURE__ */ new Date(`${dateIso}T${String(windowStart.h).padStart(2, "0")}:${String(windowStart.m).padStart(2, "0")}:00`)).getTime();
    const base = (/* @__PURE__ */ new Date(`${dateIso}T00:00:00`)).getTime();
    let endMs = base + 864e5 + windowEnd.h * 36e5 + windowEnd.m * 6e4;
    if (endMs <= startMs) endMs += 864e5;
    return { startMs, endMs };
  }
  const sampleBounds = windowBoundsFor(nights[0].date);
  const windowSpan = sampleBounds.endMs - sampleBounds.startMs;
  const windowHours = windowSpan / 36e5;
  const plotTop = padT;
  const plotH = nights.length * (rowH + rowGap) - rowGap;
  const bgGrad = ctx.createLinearGradient(barAreaX, 0, barAreaX + barAreaW, 0);
  const cSunset = theme.isDark ? "#3a1a3a" : "#f5dccc";
  const cNight = theme.isDark ? "#0b0b22" : "#d6dbe8";
  const cSunrise = theme.isDark ? "#3a2a14" : "#fee7c8";
  bgGrad.addColorStop(0, cSunset);
  bgGrad.addColorStop(0.45, cNight);
  bgGrad.addColorStop(0.65, cNight);
  bgGrad.addColorStop(1, cSunrise);
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(barAreaX, plotTop, barAreaW, plotH, 8);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
  ctx.lineWidth = 1;
  const startHour = windowStart.h;
  const numTicks = Math.max(2, Math.round(windowHours / 2));
  for (let k = 0; k <= numTicks; k++) {
    const frac = k / numTicks;
    const x = barAreaX + frac * barAreaW;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotTop + plotH);
    ctx.stroke();
    const h = startHour + frac * windowHours;
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(hourLabel(h), x, plotTop + plotH + 4);
  }
  const meanBedOffset = nights.reduce((s, nn) => {
    const wb = windowBoundsFor(nn.date);
    return s + (nn.bedMs - wb.startMs);
  }, 0) / nights.length;
  const goalSpan = sleepGoalHours * 36e5;
  const goalStartFrac = meanBedOffset / windowSpan;
  const goalEndFrac = (meanBedOffset + goalSpan) / windowSpan;
  if (goalEndFrac > 0 && goalStartFrac < 1) {
    const gx0 = barAreaX + Math.max(0, goalStartFrac) * barAreaW;
    const gx1 = barAreaX + Math.min(1, goalEndFrac) * barAreaW;
    ctx.save();
    ctx.strokeStyle = hexToRgba(theme.colors.sleep.rem, 0.8);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(gx0, plotTop + plotH + 10);
    ctx.lineTo(gx1, plotTop + plotH + 10);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.colors.sleep.rem;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`goal ${sleepGoalHours}h`, (gx0 + gx1) / 2, plotTop + plotH + 14);
  }
  nights.forEach((n, i) => {
    const wb = windowBoundsFor(n.date);
    const y = padT + i * (rowH + rowGap);
    const d = /* @__PURE__ */ new Date(n.date + "T00:00:00");
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    const datepart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillStyle = theme.fg;
    ctx.font = "600 11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(weekday, 10, y + rowH / 2 - 6);
    ctx.fillStyle = theme.muted;
    ctx.font = "10px sans-serif";
    ctx.fillText(datepart, 10, y + rowH / 2 + 7);
    const bedFrac = Math.max(0, Math.min(1, (n.bedMs - wb.startMs) / windowSpan));
    const wakeFrac = Math.max(0, Math.min(1, (n.wakeMs - wb.startMs) / windowSpan));
    if (wakeFrac <= bedFrac) return;
    const bx = barAreaX + bedFrac * barAreaW;
    const bw2 = (wakeFrac - bedFrac) * barAreaW;
    const sleptHours = n.totalSeconds / 3600;
    let barColor = theme.colors.sleep.core;
    if (sleptHours >= sleepGoalHours * 0.95 && sleptHours <= sleepGoalHours * 1.15) {
      barColor = theme.colors.sleep.rem;
    } else if (sleptHours < sleepGoalHours * 0.85) {
      barColor = theme.colors.sleep.awake;
    } else {
      barColor = theme.colors.sleep.deep;
    }
    ctx.fillStyle = hexToRgba(barColor, 0.45);
    ctx.beginPath();
    ctx.roundRect(bx, y + 3, bw2, rowH - 6, 4);
    ctx.fill();
    const bedWindowSec = (n.wakeMs - n.bedMs) / 1e3;
    const asleepFrac = bedWindowSec > 0 ? Math.min(1, n.totalSeconds / bedWindowSec) : 1;
    if (asleepFrac < 1 && asleepFrac > 0) {
      const innerW = bw2 * asleepFrac;
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(bx, y + 6, innerW, rowH - 12, 3);
      ctx.fill();
    } else {
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(bx, y + 6, bw2, rowH - 12, 3);
      ctx.fill();
    }
    hits.add({
      shape: "rect",
      x: bx,
      y,
      w: bw2,
      h: rowH,
      title: formatDate(n.date),
      details: [
        { label: "Bedtime", value: formatHour(n.bedMs) },
        { label: "Wake", value: formatHour(n.wakeMs) },
        { label: "Total sleep", value: formatDuration(n.totalSeconds) },
        { label: "Goal", value: `${sleepGoalHours}h` }
      ],
      payload: n.day
    });
  });
  const bedOffsets = nights.map((n) => {
    const wb = windowBoundsFor(n.date);
    return (n.bedMs - wb.startMs) / 36e5;
  });
  const wakeOffsets = nights.map((n) => {
    const wb = windowBoundsFor(n.date);
    return (n.wakeMs - wb.startMs) / 36e5;
  });
  const meanBedH = bedOffsets.reduce((s, v) => s + v, 0) / bedOffsets.length;
  const meanWakeH = wakeOffsets.reduce((s, v) => s + v, 0) / wakeOffsets.length;
  const variance = bedOffsets.reduce((s, v) => s + (v - meanBedH) ** 2, 0) / bedOffsets.length;
  const stdev = Math.sqrt(variance);
  function offsetToHourStr(offsetH) {
    const abs = new Date(windowBoundsFor(nights[0].date).startMs + offsetH * 36e5);
    return abs.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const consistencyLabel = stdev < 0.5 ? "Very consistent" : stdev < 1 ? "Consistent" : stdev < 2 ? "Variable" : "Irregular";
  renderStatBoxes(statsEl, [
    { value: offsetToHourStr(meanBedH), label: "Avg bedtime" },
    { value: offsetToHourStr(meanWakeH), label: "Avg wake" },
    { value: consistencyLabel, label: `\xB1${stdev.toFixed(1)}h stdev` }
  ]);
};

// src/visualizations/weekday-average.ts
var METRICS4 = {
  steps: {
    label: "Steps",
    unit: "steps",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.activity) == null ? void 0 : _a.steps) != null ? _b : 0) > 0 ? d.activity.steps : null;
    },
    format: (v) => Math.round(v).toLocaleString()
  },
  activeCalories: {
    label: "Active Calories",
    unit: "CAL",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.activity) == null ? void 0 : _a.activeCalories) != null ? _b : 0) > 0 ? d.activity.activeCalories : null;
    },
    format: (v) => `${Math.round(v)}`
  },
  exerciseMinutes: {
    label: "Exercise",
    unit: "min",
    color: (t) => t.colors.accent,
    extract: (d) => {
      var _a, _b;
      return ((_b = (_a = d.activity) == null ? void 0 : _a.exerciseMinutes) != null ? _b : 0) > 0 ? d.activity.exerciseMinutes : null;
    },
    format: (v) => `${Math.round(v)}`
  },
  sleepHours: {
    label: "Sleep",
    unit: "h",
    color: (t) => t.colors.sleep.rem,
    extract: (d) => {
      var _a;
      const v = (_a = d.sleep) == null ? void 0 : _a.totalDuration;
      return v != null && v > 0 ? v / 3600 : null;
    },
    format: (v) => {
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60);
      return `${h}h ${m}m`;
    }
  },
  heartRate: {
    label: "Avg HR",
    unit: "bpm",
    color: (t) => t.colors.heart,
    extract: (d) => {
      var _a;
      const v = (_a = d.heart) == null ? void 0 : _a.averageHeartRate;
      return v != null && v > 0 ? v : null;
    },
    format: (v) => `${Math.round(v)}`
  },
  hrv: {
    label: "HRV",
    unit: "ms",
    color: (t) => t.colors.secondary,
    extract: (d) => {
      var _a, _b;
      if (((_a = d.heart) == null ? void 0 : _a.hrv) != null) return d.heart.hrv;
      const s = (_b = d.heart) == null ? void 0 : _b.hrvSamples;
      if (s && s.length) return s.reduce((acc, x) => acc + x.value, 0) / s.length;
      return null;
    },
    format: (v) => v.toFixed(1)
  }
};
var renderWeekdayAverage = (ctx, data, W, H, config, theme, statsEl, hits) => {
  var _a, _b;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const metricId = config.metric || "steps";
  const meta = METRICS4[metricId];
  if (!meta) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Unknown metric: ${metricId}`, W / 2, H / 2);
    return;
  }
  const weekStart = String(config.weekStart || "monday").toLowerCase() === "sunday" ? "sunday" : "monday";
  if (data.length < 7) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Weekday averages need at least 7 days of data.", W / 2, H / 2);
    return;
  }
  const buckets = Array.from(
    { length: 7 },
    () => ({ values: [], dates: [] })
  );
  data.forEach((day) => {
    const v = meta.extract(day);
    if (v == null) return;
    const dow = (/* @__PURE__ */ new Date(day.date + "T00:00:00")).getDay();
    buckets[dow].values.push(v);
    buckets[dow].dates.push(day.date);
  });
  const orderIdx = weekStart === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const initials = orderIdx.map((d) => ["S", "M", "T", "W", "T", "F", "S"][d]);
  const avgs = orderIdx.map((dow) => {
    const b = buckets[dow];
    return b.values.length ? b.values.reduce((s, v) => s + v, 0) / b.values.length : null;
  });
  const counts = orderIdx.map((dow) => buckets[dow].values.length);
  const hasAny = avgs.some((a) => a != null);
  if (!hasAny) {
    ctx.fillStyle = theme.muted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`No ${meta.label.toLowerCase()} data`, W / 2, H / 2);
    return;
  }
  const maxAvg = Math.max(...avgs.map((a) => a != null ? a : 0));
  const allValues = avgs.filter((a) => a != null);
  const overallMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
  const totalSamples = counts.reduce((s, c) => s + c, 0);
  const weeksApprox = Math.max(1, Math.round(totalSamples / 7));
  const padT = 14;
  const kpiH = 40;
  const axisH = 18;
  const padL = 16;
  const padR = 16;
  const valueLabelH = 14;
  const plotTop = padT + kpiH;
  const plotBottom = H - axisH - 6;
  const plotH = plotBottom - plotTop - valueLabelH;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.fg;
  ctx.font = "600 20px sans-serif";
  const headlineText = `${meta.format(overallMean)} ${meta.unit}`;
  ctx.fillText(headlineText, padL, padT + 20);
  ctx.fillStyle = theme.muted;
  ctx.font = "11px sans-serif";
  ctx.fillText(`Avg ${meta.label.toLowerCase()} across ${weeksApprox} week${weeksApprox === 1 ? "" : "s"}`, padL, padT + 38);
  const color = meta.color(theme);
  if (overallMean > 0 && maxAvg > 0) {
    const y = plotTop + valueLabelH + plotH - overallMean / maxAvg * plotH;
    ctx.save();
    ctx.strokeStyle = hexToRgba(theme.fg, 0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.muted;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`mean ${meta.format(overallMean)}`, W - padR - 2, y - 2);
  }
  let maxIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (((_a = avgs[i]) != null ? _a : 0) > ((_b = avgs[maxIdx]) != null ? _b : 0)) maxIdx = i;
  }
  const chartW = W - padL - padR;
  const slot = chartW / 7;
  const barW = Math.min(46, slot * 0.7);
  const cornerR = Math.min(barW / 2, 8);
  for (let i = 0; i < 7; i++) {
    const v = avgs[i];
    const x = padL + i * slot + (slot - barW) / 2;
    const dow = orderIdx[i];
    const isWeekend = dow === 0 || dow === 6;
    const isMax = i === maxIdx && v != null;
    let fill = hexToRgba(color, 0.55);
    if (isWeekend) fill = hexToRgba(color, 0.4);
    if (isMax) fill = color;
    if (v != null && maxAvg > 0) {
      const h = v / maxAvg * plotH;
      const y = plotTop + valueLabelH + plotH - h;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, [cornerR, cornerR, 0, 0]);
      ctx.fill();
      ctx.fillStyle = isMax ? theme.fg : theme.muted;
      ctx.font = isMax ? "600 10px sans-serif" : "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(meta.format(v), x + barW / 2, y - 3);
    } else {
      ctx.fillStyle = hexToRgba(color, 0.1);
      ctx.beginPath();
      ctx.roundRect(x, plotBottom - 3, barW, 3, 2);
      ctx.fill();
    }
    ctx.fillStyle = isWeekend ? theme.muted : theme.fg;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(initials[i], x + barW / 2, plotBottom + 4);
    hits.add({
      shape: "rect",
      x: padL + i * slot,
      y: plotTop,
      w: slot,
      h: plotBottom - plotTop,
      title: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow],
      details: v != null ? [
        { label: "Average", value: `${meta.format(v)} ${meta.unit}` },
        { label: "Samples", value: `${counts[i]}` }
      ] : [
        { label: "Status", value: "No data" }
      ],
      payload: buckets[dow].dates
    });
  }
  const bestLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][orderIdx[maxIdx]];
  const worstIdx = avgs.reduce(
    (best, v, i) => {
      var _a2;
      return v != null && (avgs[best] == null || v < ((_a2 = avgs[best]) != null ? _a2 : Infinity)) ? i : best;
    },
    0
  );
  const worstLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][orderIdx[worstIdx]];
  const bestValue = avgs[maxIdx];
  const worstValue = avgs[worstIdx];
  renderStatBoxes(statsEl, [
    { value: meta.format(overallMean), label: "Overall mean" },
    {
      value: bestLabel,
      label: `Best (${bestValue != null ? meta.format(bestValue) : "\u2014"})`
    },
    {
      value: worstLabel,
      label: `Lowest (${worstValue != null ? meta.format(worstValue) : "\u2014"})`
    },
    { value: String(totalSamples), label: "Days sampled" }
  ]);
};

// src/visualizations/oxygen-range.ts
function specFor(metric) {
  if (metric === "respiratory-rate") {
    return {
      label: "Respiratory Rate",
      unit: "brpm",
      capsuleColor: "#3bb2c1",
      padL: 40,
      avgDotInnerLightFill: "#0a1a22",
      extract: (d) => {
        var _a, _b, _c;
        const v = d.vitals;
        if (!v) return null;
        const avg4 = (_a = v.respiratoryRateAvg) != null ? _a : v.respiratoryRate;
        if (avg4 == null || avg4 <= 0) return null;
        return { min: (_b = v.respiratoryRateMin) != null ? _b : avg4, max: (_c = v.respiratoryRateMax) != null ? _c : avg4, avg: avg4 };
      },
      yAxis: ({ min, max }) => ({
        yMin: Math.min(10, Math.floor(min - 1)),
        yMax: Math.max(25, Math.ceil(max + 1)),
        gridStep: 5
      }),
      formatAxisLabel: (v) => String(v),
      formatValue: (v) => v.toFixed(1),
      warn: { hi: 20, color: "#ff3b30", note: "Elevated >20 brpm" },
      stats: { lowColor: "#3bb2c1", avgColor: "#3bb2c1", highColor: "#3bb2c1" }
    };
  }
  return {
    label: "Blood Oxygen",
    unit: "%",
    capsuleColor: "#1eeaef",
    padL: 40,
    avgDotInnerLightFill: "#0a1a22",
    extract: (d) => {
      var _a, _b, _c;
      const v = d.vitals;
      if (!v) return null;
      const avg4 = (_a = v.bloodOxygenAvg) != null ? _a : v.bloodOxygenPercent;
      if (avg4 == null || avg4 <= 0) return null;
      return { min: (_b = v.bloodOxygenMin) != null ? _b : avg4, max: (_c = v.bloodOxygenMax) != null ? _c : avg4, avg: avg4 };
    },
    yAxis: ({ min, max }) => ({
      yMin: Math.min(90, Math.floor(min - 1)),
      yMax: Math.max(100, Math.ceil(max + 1)),
      gridStep: 2
    }),
    formatAxisLabel: (v) => String(v),
    formatValue: (v) => v.toFixed(1),
    warn: { lo: 95, color: "#ff3b30", note: "Low SpO\u2082 <95%" },
    stats: { lowColor: "#1eeaef", avgColor: "#1eeaef", highColor: "#1eeaef" }
  };
}
var renderOxygenRange = (ctx, data, W, H, config, theme, statsEl, hits) => {
  const metric = config.metric || "blood-oxygen";
  renderRangeChart(ctx, data, W, H, theme, statsEl, hits, specFor(metric));
};

// src/visualizations/index.ts
var VISUALIZATIONS = {
  "heart-terrain": renderHeartTerrain,
  "sleep-polar": renderSleepPolar,
  "step-spiral": renderStepSpiral,
  "oxygen-river": renderOxygenRiver,
  "breathing-wave": renderBreathingWave,
  "vitals-rings": renderVitalsRings,
  "walking-symmetry": renderWalkingSymmetry,
  "sleep-architecture": renderSleepArchitecture,
  "hrv-trend": renderHrvTrend,
  "activity-heatmap": renderActivityHeatmap,
  "sleep-quality-bars": renderSleepQualityBars,
  "workout-log": renderWorkoutLog,
  "activity-rings": renderActivityRings,
  "heart-range": renderHeartRange,
  "bar-chart": renderBarChart,
  "sleep-schedule": renderSleepSchedule,
  "weekday-average": renderWeekdayAverage,
  "oxygen-range": renderOxygenRange
};
var HTML_VISUALIZATIONS = {
  "intro-stats": renderIntroStats,
  "summary-card": renderSummaryCard,
  "trend-tile": renderTrendTile
};

// src/renderer.ts
function parseConfig(source) {
  const config = { type: "" };
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    const num = Number(val);
    config[key] = isNaN(num) ? val : num;
  }
  return config;
}
var DATE_OR_DATETIME = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseBoundary(raw, field) {
  const v = String(raw);
  const m = DATE_OR_DATETIME.exec(v);
  if (!m) {
    return {
      error: `Invalid "${field}" value: ${v}. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS].`
    };
  }
  const date = m[1];
  if (!m[2]) return { date, label: v };
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) {
    return { error: `Invalid "${field}" datetime: ${v}.` };
  }
  return { date, ms, label: v };
}
function resolveDateRange(config) {
  const fromRaw = config.from;
  const toRaw = config.to;
  const lastRaw = config.last;
  const range = {};
  if (fromRaw !== void 0) {
    const parsed = parseBoundary(fromRaw, "from");
    if ("error" in parsed) return { error: parsed.error };
    range.fromDate = parsed.date;
    range.fromMs = parsed.ms;
    range.fromLabel = parsed.label;
  }
  if (toRaw !== void 0) {
    const parsed = parseBoundary(toRaw, "to");
    if ("error" in parsed) return { error: parsed.error };
    range.toDate = parsed.date;
    range.toMs = parsed.ms;
    range.toLabel = parsed.label;
  }
  if (lastRaw !== void 0) {
    const n = typeof lastRaw === "number" ? lastRaw : Number(lastRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: `Invalid "last": ${lastRaw}. Use a positive number of days.` };
    }
    const anchor = range.toDate ? /* @__PURE__ */ new Date(range.toDate + "T00:00:00") : /* @__PURE__ */ new Date();
    const start = new Date(anchor);
    start.setDate(start.getDate() - (Math.floor(n) - 1));
    range.fromDate = toISODate(start);
    range.fromMs = void 0;
    range.fromLabel = range.fromDate;
    if (!range.toDate) {
      range.toDate = toISODate(anchor);
      range.toLabel = range.toDate;
    }
  }
  if (range.fromDate && range.toDate) {
    if (range.fromDate > range.toDate || range.fromDate === range.toDate && range.fromMs !== void 0 && range.toMs !== void 0 && range.fromMs > range.toMs) {
      return {
        error: `"from" (${range.fromLabel}) is after "to" (${range.toLabel}).`
      };
    }
  }
  return range;
}
function sliceTimestamped(arr, fromMs, toMs) {
  if (!arr) return arr;
  return arr.filter((s) => {
    const ms = Date.parse(s.timestamp);
    if (Number.isNaN(ms)) return true;
    if (fromMs !== void 0 && ms < fromMs) return false;
    if (toMs !== void 0 && ms > toMs) return false;
    return true;
  });
}
function avg3(nums) {
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}
function sampleValues(arr) {
  const out = [];
  for (const s of arr) {
    if (Number.isFinite(s.value)) out.push(s.value);
  }
  return out;
}
function recomputeHeart(original, sliced) {
  var _a, _b;
  const next = { ...sliced };
  const hadHrSamples = !!original.heartRateSamples && original.heartRateSamples.length > 0;
  if (hadHrSamples) {
    const values = sampleValues((_a = sliced.heartRateSamples) != null ? _a : []);
    if (values.length) {
      next.averageHeartRate = avg3(values);
      next.heartRateMin = Math.min(...values);
      next.heartRateMax = Math.max(...values);
    } else {
      next.averageHeartRate = 0;
      next.heartRateMin = 0;
      next.heartRateMax = 0;
    }
  }
  const hadHrvSamples = !!original.hrvSamples && original.hrvSamples.length > 0;
  if (hadHrvSamples) {
    const values = sampleValues((_b = sliced.hrvSamples) != null ? _b : []);
    next.hrv = values.length ? avg3(values) : void 0;
  }
  return next;
}
function recomputeVitals(original, sliced) {
  var _a, _b;
  const next = { ...sliced };
  const hadOxSamples = !!original.bloodOxygenSamples && original.bloodOxygenSamples.length > 0;
  if (hadOxSamples) {
    const values = sampleValues((_a = sliced.bloodOxygenSamples) != null ? _a : []);
    if (values.length) {
      const a = avg3(values);
      next.bloodOxygenAvg = a;
      next.bloodOxygenMin = Math.min(...values);
      next.bloodOxygenMax = Math.max(...values);
      next.bloodOxygenPercent = a;
    } else {
      next.bloodOxygenAvg = void 0;
      next.bloodOxygenMin = void 0;
      next.bloodOxygenMax = void 0;
      next.bloodOxygenPercent = void 0;
    }
  }
  const hadRespSamples = !!original.respiratoryRateSamples && original.respiratoryRateSamples.length > 0;
  if (hadRespSamples) {
    const values = sampleValues((_b = sliced.respiratoryRateSamples) != null ? _b : []);
    if (values.length) {
      const a = avg3(values);
      next.respiratoryRateAvg = a;
      next.respiratoryRateMin = Math.min(...values);
      next.respiratoryRateMax = Math.max(...values);
      next.respiratoryRate = a;
    } else {
      next.respiratoryRateAvg = void 0;
      next.respiratoryRateMin = void 0;
      next.respiratoryRateMax = void 0;
      next.respiratoryRate = void 0;
    }
  }
  return next;
}
function recomputeSleep(original, sliced) {
  if (!original.sleepStages || original.sleepStages.length === 0) {
    return sliced;
  }
  let deep = 0;
  let rem = 0;
  let core = 0;
  let awake = 0;
  let hasAwake = false;
  let firstStartMs = Infinity;
  let lastEndMs = -Infinity;
  let bedtime = "";
  let wakeTime = "";
  for (const s of sliced.sleepStages) {
    const stage = s.stage.toLowerCase();
    const dur = s.durationSeconds || 0;
    if (stage === "deep") deep += dur;
    else if (stage === "rem") rem += dur;
    else if (stage === "core" || stage === "light") core += dur;
    else if (stage === "awake") {
      awake += dur;
      hasAwake = true;
    }
    const startMs = Date.parse(s.startDate);
    if (Number.isFinite(startMs) && startMs < firstStartMs) {
      firstStartMs = startMs;
      bedtime = s.startDate;
    }
    const endMs = Date.parse(s.endDate);
    if (Number.isFinite(endMs) && endMs > lastEndMs) {
      lastEndMs = endMs;
      wakeTime = s.endDate;
    }
  }
  const total = deep + rem + core;
  const next = {
    ...sliced,
    totalDuration: total,
    totalDurationFormatted: formatDuration(total),
    deepSleep: deep,
    deepSleepFormatted: formatDuration(deep),
    remSleep: rem,
    remSleepFormatted: formatDuration(rem),
    coreSleep: core,
    coreSleepFormatted: formatDuration(core),
    bedtime: bedtime || sliced.bedtime,
    wakeTime: wakeTime || sliced.wakeTime
  };
  if (hasAwake) {
    next.awakeTime = awake;
    next.awakeTimeFormatted = formatDuration(awake);
  }
  return next;
}
function sliceBoundaryDay(d, fromMs, toMs) {
  var _a;
  const next = { ...d };
  if (d.heart) {
    const sliced = {
      ...d.heart,
      heartRateSamples: (_a = sliceTimestamped(d.heart.heartRateSamples, fromMs, toMs)) != null ? _a : [],
      hrvSamples: sliceTimestamped(d.heart.hrvSamples, fromMs, toMs)
    };
    next.heart = recomputeHeart(d.heart, sliced);
  }
  if (d.vitals) {
    const sliced = {
      ...d.vitals,
      bloodOxygenSamples: sliceTimestamped(
        d.vitals.bloodOxygenSamples,
        fromMs,
        toMs
      ),
      respiratoryRateSamples: sliceTimestamped(
        d.vitals.respiratoryRateSamples,
        fromMs,
        toMs
      )
    };
    next.vitals = recomputeVitals(d.vitals, sliced);
  }
  if (d.sleep) {
    const sliced = {
      ...d.sleep,
      sleepStages: d.sleep.sleepStages.filter((s) => {
        const ms = Date.parse(s.startDate);
        if (Number.isNaN(ms)) return true;
        if (fromMs !== void 0 && ms < fromMs) return false;
        if (toMs !== void 0 && ms > toMs) return false;
        return true;
      })
    };
    next.sleep = recomputeSleep(d.sleep, sliced);
  }
  if (d.workouts) {
    next.workouts = d.workouts.filter((w) => {
      if (!w.startTime) return true;
      const ms = Date.parse(w.startTime);
      if (Number.isNaN(ms)) return true;
      if (fromMs !== void 0 && ms < fromMs) return false;
      if (toMs !== void 0 && ms > toMs) return false;
      return true;
    });
  }
  return next;
}
function filterByDateRange(data, range) {
  if (!range.fromDate && !range.toDate) return data;
  const result = [];
  for (const d of data) {
    if (range.fromDate && d.date < range.fromDate) continue;
    if (range.toDate && d.date > range.toDate) continue;
    const sliceFrom = range.fromMs !== void 0 && d.date === range.fromDate ? range.fromMs : void 0;
    const sliceTo = range.toMs !== void 0 && d.date === range.toDate ? range.toMs : void 0;
    if (sliceFrom !== void 0 || sliceTo !== void 0) {
      result.push(sliceBoundaryDay(d, sliceFrom, sliceTo));
    } else {
      result.push(d);
    }
  }
  return result;
}
function describeRange(range) {
  if (range.fromLabel && range.toLabel)
    return `${range.fromLabel} to ${range.toLabel}`;
  if (range.fromLabel) return `from ${range.fromLabel}`;
  if (range.toLabel) return `up to ${range.toLabel}`;
  return "";
}
function hitTest(r, x, y) {
  if (r.shape === "rect") {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  if (r.shape === "circle") {
    const dx2 = x - r.cx;
    const dy2 = y - r.cy;
    return dx2 * dx2 + dy2 * dy2 <= r.r * r.r;
  }
  const dx = x - r.cx;
  const dy = y - r.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < r.r0 || dist > r.r1) return false;
  if (r.a1 - r.a0 >= Math.PI * 2 - 1e-3) return true;
  let angle = Math.atan2(dy, dx);
  let a0 = r.a0;
  let a1 = r.a1;
  while (a1 <= a0) a1 += Math.PI * 2;
  while (angle < a0) angle += Math.PI * 2;
  return angle <= a1;
}
function findRegion(regions, x, y) {
  for (let i = regions.length - 1; i >= 0; i--) {
    if (hitTest(regions[i], x, y)) return regions[i];
  }
  return null;
}
function renderTooltipContent(tooltipEl, region) {
  tooltipEl.empty();
  tooltipEl.createDiv({
    cls: "health-md-tooltip-title",
    text: region.title
  });
  const body = tooltipEl.createDiv({ cls: "health-md-tooltip-details" });
  region.details.forEach(({ label, value }) => {
    const row = body.createDiv({ cls: "health-md-tooltip-row" });
    row.createSpan({ cls: "health-md-tooltip-label", text: label });
    row.createSpan({ cls: "health-md-tooltip-value", text: value });
  });
}
var VizRenderChild = class extends import_obsidian2.MarkdownRenderChild {
  constructor() {
    super(...arguments);
    this.observer = null;
    this.unregisterDraw = null;
  }
  setObserver(obs) {
    this.observer = obs;
  }
  setUnregisterDraw(fn) {
    this.unregisterDraw = fn;
  }
  onunload() {
    var _a, _b;
    (_a = this.observer) == null ? void 0 : _a.disconnect();
    (_b = this.unregisterDraw) == null ? void 0 : _b.call(this);
  }
};
async function renderCodeBlock(plugin, source, el, ctx) {
  var _a, _b;
  const config = parseConfig(source);
  if (!config.type) {
    el.createEl("p", {
      text: "Missing type. Example: type: heart-terrain",
      cls: "health-md-error"
    });
    return;
  }
  const range = resolveDateRange(config);
  if (range.error) {
    el.createEl("p", { text: range.error, cls: "health-md-error" });
    return;
  }
  const htmlRenderFn = HTML_VISUALIZATIONS[config.type];
  if (htmlRenderFn) {
    let drawHtml = function() {
      container2.empty();
      htmlRenderFn(data2, container2, config, resolveTheme(plugin.settings));
    };
    const allData2 = await plugin.dataLoader.load();
    if (!allData2.length) {
      el.createEl("p", {
        text: `No health data found in ${plugin.settings.dataFolder}/. Supported formats: JSON, CSV, or Markdown/Bases with YAML frontmatter.`
      });
      return;
    }
    const data2 = filterByDateRange(allData2, range);
    if (!data2.length) {
      el.createEl("p", {
        text: `No health data in range (${describeRange(range)}).`
      });
      return;
    }
    const container2 = el.createDiv({ cls: "health-md-container" });
    drawHtml();
    const htmlChild = new VizRenderChild(container2);
    htmlChild.setUnregisterDraw(plugin.registerDraw(drawHtml));
    ctx.addChild(htmlChild);
    return;
  }
  const renderFn = VISUALIZATIONS[config.type];
  if (!renderFn) {
    el.createEl("p", {
      text: `Unknown chart type: ${config.type}`,
      cls: "health-md-error"
    });
    return;
  }
  const allData = await plugin.dataLoader.load();
  if (!allData.length) {
    el.createEl("p", {
      text: `No health data found in ${plugin.settings.dataFolder}/. Supported formats: JSON, CSV, or Markdown/Bases with YAML frontmatter.`
    });
    return;
  }
  const data = filterByDateRange(allData, range);
  if (!data.length) {
    el.createEl("p", {
      text: `No health data in range (${describeRange(range)}).`
    });
    return;
  }
  const defaultWidth = (_a = config.width) != null ? _a : plugin.settings.defaultWidth;
  const height = (_b = config.height) != null ? _b : plugin.settings.defaultHeight;
  const container = el.createDiv({ cls: "health-md-container" });
  const canvas = container.createEl("canvas");
  const tooltipEl = container.createDiv({ cls: "health-md-tooltip is-hidden" });
  const statsEl = container.createDiv({ cls: "health-md-stats" });
  const regions = [];
  const hits = { add: (r) => regions.push(r) };
  let pinned = null;
  function showTooltip() {
    tooltipEl.removeClass("is-hidden");
  }
  function hideTooltip() {
    tooltipEl.addClass("is-hidden");
  }
  function placeTooltip(x, y) {
    showTooltip();
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    let tx = x + 14;
    let ty = y + 14;
    if (tx + tw > cw) tx = x - 14 - tw;
    if (ty + th > ch) ty = y - 14 - th;
    if (tx < 0) tx = 0;
    if (ty < 0) ty = 0;
    tooltipEl.style.left = `${tx}px`;
    tooltipEl.style.top = `${ty}px`;
  }
  canvas.addEventListener("mousemove", (e) => {
    if (pinned) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const region = findRegion(regions, x, y);
    if (region) {
      canvas.addClass("health-md-canvas-pointer");
      renderTooltipContent(tooltipEl, region);
      placeTooltip(x, y);
    } else {
      canvas.removeClass("health-md-canvas-pointer");
      hideTooltip();
    }
  });
  canvas.addEventListener("mouseleave", () => {
    if (pinned) return;
    canvas.removeClass("health-md-canvas-pointer");
    hideTooltip();
  });
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const region = findRegion(regions, x, y);
    if (region) {
      pinned = region;
      renderTooltipContent(tooltipEl, region);
      placeTooltip(x, y);
    } else if (pinned) {
      pinned = null;
      hideTooltip();
    }
  });
  const renderChild = new VizRenderChild(container);
  ctx.addChild(renderChild);
  function draw() {
    const width = Math.min(
      container.clientWidth || defaultWidth,
      defaultWidth
    );
    statsEl.empty();
    regions.length = 0;
    pinned = null;
    hideTooltip();
    canvas.removeClass("health-md-canvas-pointer");
    const canvasCtx = setupCanvas(canvas, width, height);
    renderFn(canvasCtx, data, width, height, config, resolveTheme(plugin.settings), statsEl, hits);
  }
  draw();
  const observer = new ResizeObserver(() => draw());
  observer.observe(container);
  renderChild.setObserver(observer);
  renderChild.setUnregisterDraw(plugin.registerDraw(draw));
}

// src/main.ts
var COLOR_SCHEMES = {
  default: {
    label: "Default",
    accent: "#2dd4bf",
    secondary: "#f59e0b",
    heart: "#ef4444",
    sleepDeep: "#312e81",
    sleepRem: "#7c3aed",
    sleepCore: "#2dd4bf",
    sleepAwake: "#f59e0b"
  },
  ocean: {
    label: "Ocean",
    accent: "#0ea5e9",
    secondary: "#38bdf8",
    heart: "#e11d48",
    sleepDeep: "#0c2461",
    sleepRem: "#1d4ed8",
    sleepCore: "#0ea5e9",
    sleepAwake: "#7dd3fc"
  },
  forest: {
    label: "Forest",
    accent: "#22c55e",
    secondary: "#84cc16",
    heart: "#ef4444",
    sleepDeep: "#14532d",
    sleepRem: "#15803d",
    sleepCore: "#4ade80",
    sleepAwake: "#bbf7d0"
  },
  sunset: {
    label: "Sunset",
    accent: "#f97316",
    secondary: "#ec4899",
    heart: "#ef4444",
    sleepDeep: "#7f1d1d",
    sleepRem: "#be185d",
    sleepCore: "#f97316",
    sleepAwake: "#fbbf24"
  },
  aurora: {
    label: "Aurora",
    accent: "#a855f7",
    secondary: "#06b6d4",
    heart: "#f43f5e",
    sleepDeep: "#1e1b4b",
    sleepRem: "#6d28d9",
    sleepCore: "#a855f7",
    sleepAwake: "#818cf8"
  },
  monochrome: {
    label: "Monochrome",
    accent: "#94a3b8",
    secondary: "#64748b",
    heart: "#475569",
    sleepDeep: "#0f172a",
    sleepRem: "#334155",
    sleepCore: "#64748b",
    sleepAwake: "#cbd5e1"
  }
};
var DEFAULT_SETTINGS = {
  dataFolder: "Health",
  filePattern: "*",
  dataFormat: "auto",
  theme: "auto",
  defaultWidth: 800,
  defaultHeight: 400,
  colorScheme: "default",
  colorAccent: "#2dd4bf",
  colorSecondary: "#f59e0b",
  colorHeart: "#ef4444",
  colorSleepDeep: "#312e81",
  colorSleepRem: "#7c3aed",
  colorSleepCore: "#2dd4bf",
  colorSleepAwake: "#f59e0b"
};
var HealthMdPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.drawCallbacks = /* @__PURE__ */ new Set();
  }
  registerDraw(fn) {
    this.drawCallbacks.add(fn);
    return () => this.drawCallbacks.delete(fn);
  }
  redrawAll() {
    this.drawCallbacks.forEach((fn) => fn());
  }
  async onload() {
    await this.loadSettings();
    this.dataLoader = new DataLoader(this.app.vault, this.settings);
    this.registerMarkdownCodeBlockProcessor(
      "health-viz",
      (source, el, ctx) => renderCodeBlock(this, source, el, ctx)
    );
    this.addSettingTab(new HealthMdSettingTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file.path.startsWith(this.settings.dataFolder + "/")) {
          this.dataLoader.invalidate();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.path.startsWith(this.settings.dataFolder + "/")) {
          this.dataLoader.invalidate();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file.path.startsWith(this.settings.dataFolder + "/")) {
          this.dataLoader.invalidate();
        }
      })
    );
    this.addCommand({
      id: "insert-health-chart",
      name: "Insert health visualization",
      editorCallback: (editor) => {
        editor.replaceSelection(
          "```health-viz\ntype: heart-terrain\n```\n"
        );
      }
    });
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  refreshViews() {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      if (leaf.view instanceof import_obsidian3.MarkdownView) {
        leaf.view.previewMode.rerender(true);
      }
    });
  }
};
var FolderInputSuggest = class extends import_obsidian3.AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    this.limit = 200;
  }
  getFolderPaths() {
    return this.app.vault.getAllLoadedFiles().filter((f) => f instanceof import_obsidian3.TFolder).map((f) => f.path).filter((path) => path.length > 0 && path !== "/").sort((a, b) => a.localeCompare(b));
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    const folders = this.getFolderPaths();
    if (!q) return folders;
    return folders.filter((path) => path.toLowerCase().includes(q));
  }
  renderSuggestion(value, el) {
    el.setText(value);
  }
};
var HealthMdSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const updateDataFolder = async (value) => {
      const next = value.trim().replace(/^\/+|\/+$/g, "");
      if (next === this.plugin.settings.dataFolder) return;
      this.plugin.settings.dataFolder = next;
      this.plugin.dataLoader.invalidate();
      await this.plugin.saveSettings();
      this.plugin.refreshViews();
    };
    new import_obsidian3.Setting(containerEl).setName("Data folder").setDesc(
      "Path to the folder containing health data files. Start typing to pick an existing folder."
    ).addSearch((search) => {
      search.setPlaceholder("Health").setValue(this.plugin.settings.dataFolder).onChange(async (value) => {
        await updateDataFolder(value);
      });
      const folderSuggest = new FolderInputSuggest(this.app, search.inputEl);
      folderSuggest.onSelect((value) => {
        void updateDataFolder(value);
      });
      search.inputEl.addEventListener("focus", () => folderSuggest.open());
      search.inputEl.addEventListener("click", () => folderSuggest.open());
    });
    new import_obsidian3.Setting(containerEl).setName("File pattern").setDesc(
      "Glob pattern to match files (for example: *.json, 2026-*.md, health-*.csv); use * to include all supported files."
    ).addText(
      (text) => text.setPlaceholder("*").setValue(this.plugin.settings.filePattern).onChange(async (value) => {
        this.plugin.settings.filePattern = value.trim();
        this.plugin.dataLoader.invalidate();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Data format").setDesc(
      "Automatically detect file format by extension. Markdown and bases files must include YAML frontmatter."
    ).addDropdown(
      (dropdown) => dropdown.addOption("auto", "Auto-detect by extension").addOption("json", "JSON").addOption("csv", "CSV").addOption("markdown", "Markdown (YAML frontmatter required)").addOption("bases", "Obsidian bases (YAML frontmatter)").setValue(this.plugin.settings.dataFormat).onChange(async (value) => {
        this.plugin.settings.dataFormat = value;
        this.plugin.dataLoader.invalidate();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Theme").setDesc("Color theme for visualizations").addDropdown(
      (dropdown) => dropdown.addOption("auto", "Auto (match Obsidian)").addOption("dark", "Dark").addOption("light", "Light").setValue(this.plugin.settings.theme).onChange(async (value) => {
        this.plugin.settings.theme = value;
        await this.plugin.saveSettings();
        this.plugin.redrawAll();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Default width").setDesc("Default canvas width in pixels").addText(
      (text) => text.setValue(String(this.plugin.settings.defaultWidth)).onChange(async (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          this.plugin.settings.defaultWidth = num;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Default height").setDesc("Default canvas height in pixels").addText(
      (text) => text.setValue(String(this.plugin.settings.defaultHeight)).onChange(async (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          this.plugin.settings.defaultHeight = num;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Colors").setHeading();
    const colorInputs = {};
    const applyScheme = async (schemeId) => {
      this.plugin.settings.colorScheme = schemeId;
      if (schemeId !== "custom") {
        const scheme = COLOR_SCHEMES[schemeId];
        this.plugin.settings.colorAccent = scheme.accent;
        this.plugin.settings.colorSecondary = scheme.secondary;
        this.plugin.settings.colorHeart = scheme.heart;
        this.plugin.settings.colorSleepDeep = scheme.sleepDeep;
        this.plugin.settings.colorSleepRem = scheme.sleepRem;
        this.plugin.settings.colorSleepCore = scheme.sleepCore;
        this.plugin.settings.colorSleepAwake = scheme.sleepAwake;
        if (colorInputs["colorAccent"]) colorInputs["colorAccent"].value = scheme.accent;
        if (colorInputs["colorSecondary"]) colorInputs["colorSecondary"].value = scheme.secondary;
        if (colorInputs["colorHeart"]) colorInputs["colorHeart"].value = scheme.heart;
        if (colorInputs["colorSleepDeep"]) colorInputs["colorSleepDeep"].value = scheme.sleepDeep;
        if (colorInputs["colorSleepRem"]) colorInputs["colorSleepRem"].value = scheme.sleepRem;
        if (colorInputs["colorSleepCore"]) colorInputs["colorSleepCore"].value = scheme.sleepCore;
        if (colorInputs["colorSleepAwake"]) colorInputs["colorSleepAwake"].value = scheme.sleepAwake;
      }
      await this.plugin.saveSettings();
      this.plugin.redrawAll();
    };
    let schemeDropdown;
    new import_obsidian3.Setting(containerEl).setName("Color scheme").setDesc("Choose a preset palette or customize individual colors below").addDropdown((dropdown) => {
      Object.keys(COLOR_SCHEMES).forEach((id) => {
        dropdown.addOption(id, COLOR_SCHEMES[id].label);
      });
      dropdown.addOption("custom", "Custom");
      dropdown.setValue(this.plugin.settings.colorScheme);
      dropdown.onChange(async (value) => {
        await applyScheme(value);
      });
      schemeDropdown = dropdown.selectEl;
    });
    const colorSettings = [
      { key: "colorAccent", name: "Accent", desc: "Primary color for activity charts (steps, breathing, rings)" },
      { key: "colorSecondary", name: "Secondary", desc: "Secondary color for calories, asymmetry, and distance" },
      { key: "colorHeart", name: "Heart rate", desc: "Color for heart rate stats" },
      { key: "colorSleepDeep", name: "Deep sleep", desc: "Color for deep sleep stages" },
      { key: "colorSleepRem", name: "REM sleep", desc: "Color for REM sleep stages" },
      { key: "colorSleepCore", name: "Core sleep", desc: "Color for core sleep stages" },
      { key: "colorSleepAwake", name: "Awake", desc: "Color for awake periods in sleep charts" }
    ];
    colorSettings.forEach(({ key, name, desc }) => {
      const setting = new import_obsidian3.Setting(containerEl).setName(name).setDesc(desc);
      const input = setting.controlEl.createEl("input");
      input.type = "color";
      input.value = this.plugin.settings[key];
      colorInputs[key] = input;
      input.addEventListener("change", () => {
        void (async () => {
          this.plugin.settings[key] = input.value;
          this.plugin.settings.colorScheme = "custom";
          if (schemeDropdown) schemeDropdown.value = "custom";
          await this.plugin.saveSettings();
          this.plugin.redrawAll();
        })();
      });
    });
  }
};
