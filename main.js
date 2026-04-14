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
  return typeof v === "string" ? v : v !== void 0 ? String(v) : void 0;
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
        col[bucket].push(s.value);
      }
    });
    const averaged = col.map(
      (b) => b ? b.reduce((a, c) => a + c, 0) / b.length : null
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
      statsEl.innerHTML = `<p style="color:var(--text-muted)">No heart rate data available.</p>`;
      return;
    }
    const allAvg = heartDays.map((d) => d.heart.averageHeartRate);
    const globalMin = Math.min(...heartDays.map((d) => d.heart.heartRateMin || d.heart.averageHeartRate));
    const globalMax = Math.max(...heartDays.map((d) => d.heart.heartRateMax || d.heart.averageHeartRate));
    const colW2 = W / heartDays.length;
    heartDays.forEach((day, x) => {
      const avg2 = day.heart.averageHeartRate;
      const lo = day.heart.heartRateMin || avg2;
      const hi = day.heart.heartRateMax || avg2;
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      const tLo = (lo - globalMin) / (globalMax - globalMin || 1);
      const tHi = (hi - globalMin) / (globalMax - globalMin || 1);
      const tAvg = (avg2 - globalMin) / (globalMax - globalMin || 1);
      grad.addColorStop(0, `hsl(${lerp(220, 0, tLo)},70%,${theme.isDark ? 30 : 45}%)`);
      grad.addColorStop(0.5, `hsl(${lerp(220, 0, tAvg)},80%,${theme.isDark ? 45 : 55}%)`);
      grad.addColorStop(1, `hsl(${lerp(220, 0, tHi)},90%,${theme.isDark ? 55 : 65}%)`);
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
          { label: "Avg", value: `${Math.round(avg2)} bpm` },
          { label: "Min", value: `${lo} bpm` },
          { label: "Max", value: `${hi} bpm` }
        ],
        payload: day
      });
    });
    const overallAvg = Math.round(allAvg.reduce((a, b) => a + b, 0) / allAvg.length);
    statsEl.innerHTML = `
			<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#4488ff">${globalMin}</div><div class="health-md-stat-label">Lowest</div></div>
			<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#cc6666">${overallAvg}</div><div class="health-md-stat-label">Average</div></div>
			<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#ff4444">${globalMax}</div><div class="health-md-stat-label">Highest</div></div>
		`;
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
        {
          label: "Avg",
          value: `${Math.round(dayObj.heart.averageHeartRate)} bpm`
        },
        {
          label: "Min",
          value: `${dayObj.heart.heartRateMin} bpm`
        },
        {
          label: "Max",
          value: `${dayObj.heart.heartRateMax} bpm`
        },
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
  statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#4488ff">${minHR}</div><div class="health-md-stat-label">Lowest</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#cc6666">${avgHR}</div><div class="health-md-stat-label">Average</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#ff4444">${maxHR}</div><div class="health-md-stat-label">Highest</div></div>
	`;
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
    const h = lerp(140, 185, distT);
    const s = lerp(40, 95, distT);
    const l = lerp(theme.isDark ? 18 : 30, theme.isDark ? 55 : 60, distT);
    ctx.shadowColor = hsl(h, s, l + 20);
    ctx.shadowBlur = dotSize;
    ctx.fillStyle = hsl(h, s, l);
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
      ctx.strokeStyle = hsl(h, s, l * 0.3);
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
  statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${avgSteps.toLocaleString()}</div><div class="health-md-stat-label">Avg/Day</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${bestDay.activity.steps.toLocaleString()}</div><div class="health-md-stat-label">Best Day</div></div>
	`;
};

// src/visualizations/oxygen-river.ts
function getBloodOxygenValues(day) {
  var _a, _b, _c, _d, _e, _f, _g;
  if ((_b = (_a = day.vitals) == null ? void 0 : _a.bloodOxygenSamples) == null ? void 0 : _b.length) {
    return day.vitals.bloodOxygenSamples.map((s) => s.value || s.percent || 0);
  }
  const avg2 = (_e = (_c = day.vitals) == null ? void 0 : _c.bloodOxygenAvg) != null ? _e : (_d = day.vitals) == null ? void 0 : _d.bloodOxygenPercent;
  if (avg2 !== void 0) {
    const min = (_f = day.vitals) == null ? void 0 : _f.bloodOxygenMin;
    const max = (_g = day.vitals) == null ? void 0 : _g.bloodOxygenMax;
    if (min !== void 0 && max !== void 0 && min !== max) {
      return [min, avg2, max];
    }
    return [avg2];
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
  statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#4488ff">${avgO2.toFixed(1)}%</div><div class="health-md-stat-label">Avg SpO2</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#6688cc">${minO2.toFixed(1)}%</div><div class="health-md-stat-label">Min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#88aaee">${maxO2.toFixed(1)}%</div><div class="health-md-stat-label">Max</div></div>
	`;
};

// src/visualizations/breathing-wave.ts
function getRespiratoryValues(day) {
  var _a, _b, _c, _d, _e, _f, _g;
  if ((_b = (_a = day.vitals) == null ? void 0 : _a.respiratoryRateSamples) == null ? void 0 : _b.length) {
    return day.vitals.respiratoryRateSamples.map((s) => s.value);
  }
  const avg2 = (_e = (_c = day.vitals) == null ? void 0 : _c.respiratoryRate) != null ? _e : (_d = day.vitals) == null ? void 0 : _d.respiratoryRateAvg;
  if (avg2 !== void 0) {
    const min = (_f = day.vitals) == null ? void 0 : _f.respiratoryRateMin;
    const max = (_g = day.vitals) == null ? void 0 : _g.respiratoryRateMax;
    if (min !== void 0 && max !== void 0 && min !== max) {
      return [min, avg2, max];
    }
    return [avg2];
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
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
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
  const avg2 = (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(
    1
  );
  statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${avg2}</div><div class="health-md-stat-label">Avg br/min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.muted}">${minR.toFixed(1)}</div><div class="health-md-stat-label">Min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${maxR.toFixed(1)}</div><div class="health-md-stat-label">Max</div></div>
	`;
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

// src/visualizations/index.ts
var VISUALIZATIONS = {
  "heart-terrain": renderHeartTerrain,
  "sleep-polar": renderSleepPolar,
  "step-spiral": renderStepSpiral,
  "oxygen-river": renderOxygenRiver,
  "breathing-wave": renderBreathingWave,
  "vitals-rings": renderVitalsRings,
  "walking-symmetry": renderWalkingSymmetry,
  "sleep-architecture": renderSleepArchitecture
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
function avg(nums) {
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
      next.averageHeartRate = avg(values);
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
    next.hrv = values.length ? avg(values) : void 0;
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
      const a = avg(values);
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
      const a = avg(values);
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
  }
  setObserver(obs) {
    this.observer = obs;
  }
  onunload() {
    var _a;
    (_a = this.observer) == null ? void 0 : _a.disconnect();
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
  if (config.type === "intro-stats") {
    const allData2 = await plugin.dataLoader.load();
    if (!allData2.length) {
      el.createEl("p", {
        text: `No health data found in ${plugin.settings.dataFolder}/`
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
    const theme2 = resolveTheme(plugin.settings);
    const container2 = el.createDiv({ cls: "health-md-container" });
    renderIntroStats(data2, container2, config, theme2);
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
      text: `No health data found in ${plugin.settings.dataFolder}/`
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
  const theme = resolveTheme(plugin.settings);
  const container = el.createDiv({ cls: "health-md-container" });
  const canvas = container.createEl("canvas");
  const tooltipEl = container.createDiv({ cls: "health-md-tooltip" });
  tooltipEl.style.display = "none";
  const statsEl = container.createDiv({ cls: "health-md-stats" });
  const regions = [];
  const hits = { add: (r) => regions.push(r) };
  let pinned = null;
  function placeTooltip(x, y) {
    tooltipEl.style.display = "";
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
      canvas.style.cursor = "pointer";
      renderTooltipContent(tooltipEl, region);
      placeTooltip(x, y);
    } else {
      canvas.style.cursor = "";
      tooltipEl.style.display = "none";
    }
  });
  canvas.addEventListener("mouseleave", () => {
    if (pinned) return;
    canvas.style.cursor = "";
    tooltipEl.style.display = "none";
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
      tooltipEl.style.display = "none";
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
    tooltipEl.style.display = "none";
    const canvasCtx = setupCanvas(canvas, width, height);
    renderFn(canvasCtx, data, width, height, config, theme, statsEl, hits);
  }
  draw();
  const observer = new ResizeObserver(() => draw());
  observer.observe(container);
  renderChild.setObserver(observer);
}

// src/main.ts
var DEFAULT_SETTINGS = {
  dataFolder: "Health",
  filePattern: "*",
  dataFormat: "auto",
  theme: "auto",
  defaultWidth: 800,
  defaultHeight: 400,
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
var HealthMdSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Data folder").setDesc("Path to the folder containing health data files").addText(
      (text) => text.setPlaceholder("Health").setValue(this.plugin.settings.dataFolder).onChange(async (value) => {
        this.plugin.settings.dataFolder = value.trim();
        this.plugin.dataLoader.invalidate();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("File pattern").setDesc(
      "Glob pattern to match files (e.g. *.json, 2026-*.md, health-*.csv). Use * for all supported files."
    ).addText(
      (text) => text.setPlaceholder("*").setValue(this.plugin.settings.filePattern).onChange(async (value) => {
        this.plugin.settings.filePattern = value.trim();
        this.plugin.dataLoader.invalidate();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Data format").setDesc(
      "Auto-detect reads JSON, CSV, and Markdown/Bases by file extension. Or force a specific format."
    ).addDropdown(
      (dropdown) => dropdown.addOption("auto", "Auto-detect by extension").addOption("json", "JSON").addOption("csv", "CSV").addOption("markdown", "Markdown (frontmatter)").addOption("bases", "Obsidian Bases (YAML frontmatter)").setValue(this.plugin.settings.dataFormat).onChange(async (value) => {
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
    containerEl.createEl("h3", { text: "Colors" });
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
      input.addEventListener("change", async () => {
        this.plugin.settings[key] = input.value;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      });
    });
  }
};
