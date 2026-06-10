(function () {
  if (window.__bossAiAutoFavLoaded) return;
  window.__bossAiAutoFavLoaded = true;

  const DEFAULT_TARGET_KEYWORDS = [];
  const DEFAULT_PER_KEYWORD_MAX = 100;
  const EXTENSION_VERSION = "0.1.3";
  const RULE_VERSION = "rough-screen-v16";
  const AI_PROVIDERS = {
    deepseek: { label: "DeepSeek", model: "deepseek-chat" },
    qwen: { label: "通义千问", model: "qwen-plus" },
    zhipu: { label: "智谱 GLM", model: "glm-4-flash" },
    moonshot: { label: "Kimi", model: "moonshot-v1-8k" },
    siliconflow: { label: "硅基流动", model: "Qwen/Qwen2.5-72B-Instruct" }
  };
  const REVIEW_THRESHOLD = 50;
  const RULE_SEED_LIMIT = 5;
  const MAX_EMPTY_SCROLL_ATTEMPTS = 5;
  const MAX_DUPLICATE_SCROLL_ATTEMPTS = 80;
  const MAX_CONSECUTIVE_ERRORS = 5;
  const KEYWORD_SWITCH_MIN_SEC = 3;
  const KEYWORD_SWITCH_MAX_SEC = 6;
  const SEARCH_PAGE_LOAD_WAIT_MS = 2500;

  const config = {
    threshold: 60,
    maxJobs: 300,
    delayMin: 1800,
    delayMax: 3600,
    positive: {
      high: [],
      medium: [],
      low: []
    },
    negative: {
      hard: [
        "保险", "贷款", "互联网金融", "计算机相关专业必需", "纯地推",
        "会销", "招商", "自带资源", "自带行业", "加盟", "金融线",
        "美业", "日结", "资源变现", "漫剧", "AI漫剧", "短剧",
        "GEO", "Geo", "geo优化", "AI精准引流", "金融销售",
        "管培生", "实习生", "储备干部", "招生", "提分",
        "To C", "个人（To C）", "C端销售", "对接c端",
        "社交网络与媒体", "文化传媒", "网络传媒", "AI双红利",
        "双红利赛道", "自带客户", "单休", "大小周", "周日单休"
      ],
      soft: [
        "网站建设", "小程序", "网络推广", "外包", "定制开发",
        "课程", "培训类产品", "招商",
        "销冠", "月入", "精准客资", "精准客源", "薪资无上限",
        "接受应届生", "高中", "圈层", "KOL", "媒体", "渠道资源"
      ]
    },
    filters: {
      salaryMin: "",
      salaryMax: "",
      customPositive: [],
      customNegative: [],
      skipRecorded: true,
      jobNature: "",
      targetKeywords: []
    },
    safety: {
      dailyScanLimit: 500,
      dailyFavoriteLimit: 80,
      pauseEvery: 25,
      pauseMinSec: 180,
      pauseMaxSec: 360
    },
    ai: {
      provider: "deepseek",
      apiKey: "",
      model: AI_PROVIDERS.deepseek.model
    }
  };

  const STORAGE_KEY = "bossAiAutoFavRecordsV1";
  const PANEL_POS_KEY = "bossAiAutoFavPanelPosV1";
  const PANEL_COLLAPSED_KEY = "bossAiAutoFavPanelCollapsedV1";
  const CAMPAIGN_KEY = "bossAiAutoFavCampaignV4";
  const DAILY_KEY = "bossAiAutoFavDailyStatsV1";
  const SETTINGS_KEY = "bossAiAutoFavSettingsV4";
  const USER_PREF_KEY = "bossAiAutoFavUserPrefsV1";
  const AI_SETTINGS_KEY = "bossAiAutoFavAiSettingsV1";
  const AI_STRATEGY_KEY = "bossAiAutoFavAiStrategyV1";
  const DEBUG_LOG_KEY = "bossAiAutoFavDebugLogsV1";
  const SETTINGS_VERSION = 7;
  const SCALE_OPTIONS = [
    { code: "301", label: "0-20人" },
    { code: "302", label: "20-99人" },
    { code: "303", label: "100-499人" },
    { code: "304", label: "500-999人" },
    { code: "305", label: "1000-9999人" },
    { code: "306", label: "10000人以上" }
  ];
  const state = {
    running: false,
    processed: new Set(),
    logs: [],
    records: loadRecords(),
    scanned: 0,
    favorited: 0,
    reviewed: 0,
    skipped: 0,
    errors: 0,
    campaign: loadCampaign(),
    daily: loadDailyStats(),
    settings: loadSettings(),
    userPrefs: loadUserPrefs(),
    aiSettings: loadAiSettings(),
    aiStrategy: loadAiStrategy(),
    debugLogs: loadDebugLogs(),
    settingsTimer: null,
    autoTimer: null,
    countdownTimer: null
  };

  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records.slice(-1200)));
  }

  function loadDebugLogs() {
    try {
      return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveDebugLogs() {
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(state.debugLogs.slice(-400)));
  }

  function loadCampaign() {
    try {
      return JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!saved) return null;
      if (saved.version !== SETTINGS_VERSION) {
        const previousVersion = Number(saved.version || 0);
        if (Number(saved.threshold) === 75) saved.threshold = 60;
        if (Number(saved.maxJobs) === 80) saved.maxJobs = 500;
        if (Number(saved.safety?.dailyScanLimit) === 300) saved.safety.dailyScanLimit = 1000;
        if (previousVersion < 7 && saved.filters) {
          saved.filters.customPositive = [];
          saved.filters.customNegative = [];
        }
        saved.version = SETTINGS_VERSION;
        saveSettings(saved);
      }
      return saved;
    } catch (_) {
      return null;
    }
  }

  function loadUserPrefs() {
    try {
      return JSON.parse(localStorage.getItem(USER_PREF_KEY) || "null") || {
        likedWords: [],
        dislikedWords: [],
        feedbackHistory: []
      };
    } catch (_) {
      return { likedWords: [], dislikedWords: [], feedbackHistory: [] };
    }
  }

  function saveUserPrefs() {
    state.userPrefs = {
      likedWords: [...new Set(state.userPrefs.likedWords || [])],
      dislikedWords: [...new Set(state.userPrefs.dislikedWords || [])],
      feedbackHistory: (state.userPrefs.feedbackHistory || []).slice(-80)
    };
    localStorage.setItem(USER_PREF_KEY, JSON.stringify(state.userPrefs));
  }

  function loadAiSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "null") || {};
      return {
        provider: AI_PROVIDERS[saved.provider] ? saved.provider : "deepseek",
        apiKey: saved.apiKey || "",
        model: saved.model || AI_PROVIDERS[saved.provider]?.model || AI_PROVIDERS.deepseek.model
      };
    } catch (_) {
      return { provider: "deepseek", apiKey: "", model: AI_PROVIDERS.deepseek.model };
    }
  }

  function saveAiSettings() {
    state.aiSettings = {
      provider: AI_PROVIDERS[state.aiSettings.provider] ? state.aiSettings.provider : "deepseek",
      apiKey: String(state.aiSettings.apiKey || "").trim(),
      model: String(state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model).trim() || AI_PROVIDERS.deepseek.model
    };
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(state.aiSettings));
  }

  function loadAiStrategy() {
    try {
      return JSON.parse(localStorage.getItem(AI_STRATEGY_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveAiStrategy() {
    if (!state.aiStrategy) {
      localStorage.removeItem(AI_STRATEGY_KEY);
      return;
    }
    localStorage.setItem(AI_STRATEGY_KEY, JSON.stringify(state.aiStrategy));
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadDailyStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
      if (saved?.date === todayKey()) return saved;
    } catch (_) {}
    return { date: todayKey(), scanned: 0, favorited: 0 };
  }

  function saveDailyStats() {
    if (state.daily.date !== todayKey()) {
      state.daily = { date: todayKey(), scanned: 0, favorited: 0 };
    }
    localStorage.setItem(DAILY_KEY, JSON.stringify(state.daily));
  }

  function saveCampaign() {
    if (!state.campaign) {
      localStorage.removeItem(CAMPAIGN_KEY);
      return;
    }
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(state.campaign));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function jitter() {
    return config.delayMin + Math.random() * (config.delayMax - config.delayMin);
  }

  function randomBetweenSec(min, max) {
    const safeMin = Math.max(0, Number(min || 0));
    const safeMax = Math.max(safeMin, Number(max || safeMin));
    return Math.round(safeMin + Math.random() * (safeMax - safeMin));
  }

  function norm(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function escapeAttr(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseKeywordList(text) {
    return [...new Set((text || "")
      .split(/[\n,，、;；]+/)
      .map(s => norm(s))
      .filter(Boolean))];
  }

  function keywordLabel(keyword) {
    return keyword ? keyword : "推荐流";
  }

  function isBroadTargetKeyword(word) {
    const lower = norm(word).toLowerCase();
    if (!lower) return true;
    const broadWords = [
      "ai", "人工智能", "智能", "软件", "互联网", "科技", "it",
      "saas", "crm", "erp", "oa", "tob", "to b", "b端",
      "销售", "运营", "客户成功", "售前", "产品", "技术", "岗位", "职位"
    ];
    return broadWords.includes(lower);
  }

  function targetDirectionIssue() {
    const rawTargets = (config.filters.targetKeywords || []).map(norm).filter(Boolean);
    if (!rawTargets.length) return "未填写目标方向";
    if (!rawTargets.some(word => !isBroadTargetKeyword(word))) return "目标方向太泛";
    return "";
  }

  function usefulTargetKeywords() {
    return (config.filters.targetKeywords || [])
      .map(norm)
      .filter(word => word && !isBroadTargetKeyword(word));
  }

  function conflictsWithTargetDirection(word) {
    const value = norm(word).toLowerCase();
    if (!value) return false;
    return usefulTargetKeywords().some(target => {
      const lowerTarget = target.toLowerCase();
      if (!lowerTarget || lowerTarget.length < 2) return false;
      if (!value.includes(lowerTarget)) return false;
      if (value.startsWith(`非${lowerTarget}`)) return false;
      if (value.startsWith(`不${lowerTarget}`)) return false;
      if (value.startsWith(`无${lowerTarget}`)) return false;
      if (value.startsWith(`无关${lowerTarget}`)) return false;
      if (value.includes(`非${lowerTarget}`)) return false;
      return true;
    });
  }

  function filterConflictingNegativeWords(words, options = {}) {
    return (words || []).filter(word => {
      if (!conflictsWithTargetDirection(word)) return true;
      return Boolean(options.keepManual);
    });
  }

  function expandSearchKeywords(keywords, options = {}) {
    const nature = options.nature || resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "");
    const expanded = [];
    const add = words => {
      for (const word of words) {
        const value = norm(word);
        if (value) expanded.push(value);
      }
    };
    for (const keyword of keywords) {
      add([keyword]);
      const lower = keyword.toLowerCase();
      if (/ai|人工智能|智能/.test(lower) && /销售|商务|bd|大客户|客户经理/.test(lower)) {
        add(["AI应用销售", "AI客服销售", "智能客服销售", "AI客户成功", "AI解决方案销售", "Agent销售", "Agent售前", "大模型销售"]);
      }
      if (/saas|软件/.test(lower) && /销售|商务|bd|大客户|客户经理/.test(lower)) {
        add(["SaaS销售", "软件销售", "企业服务销售", "解决方案销售"]);
      }
      if (nature !== "operations" && /客户成功|客户运营|续费|续签/.test(keyword)) {
        add(["AI客户成功", "SaaS客户成功", "客户运营", "续费续签", "交付顾问"]);
      }
      if (/售前|解决方案|方案/.test(keyword)) {
        add(["售前解决方案", "解决方案顾问", "AI售前", "SaaS售前", "实施顾问"]);
      }
      if (/agent|智能体/i.test(keyword)) {
        if (nature === "sales" || nature === "any") add(["Agent销售", "智能体销售", "AI Agent"]);
        if (nature === "presales") add(["Agent售前", "智能体解决方案", "AI Agent"]);
      }
    }
    return expanded;
  }

  function keywordProfileFromPanel() {
    const natureText = document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "";
    const targetText = document.querySelector("#baf-target-keywords")?.value || "";
    const targets = parseKeywordList(targetText);
    return {
      nature: resolveJobNature(natureText),
      natureText: jobNatureDisplayValue(natureText || config.filters.jobNature || ""),
      targets
    };
  }

  function searchKeywordsFromProfile() {
    const { nature, targets } = keywordProfileFromPanel();
    const words = [];
    const add = list => {
      for (const word of list) {
        const value = norm(word);
        if (value) words.push(value);
      }
    };
    const addByNature = target => {
      if (nature === "customer_success") {
        add([`${target}客户成功`, `${target}客户运营`, `${target}续费`, `${target}交付`, `${target}实施顾问`, `${target}客户经理`, `${target}服务顾问`, `${target}培训顾问`, `${target}复购`, `${target}扩容`]);
      } else if (nature === "presales") {
        add([`${target}售前`, `${target}解决方案`, `${target}方案顾问`, `${target}售前顾问`, `${target}产品顾问`, `${target}技术销售`, `${target}销售工程师`, `${target}项目售前`, `${target}POC`, `${target}需求顾问`]);
      } else if (nature === "operations") {
        add([`${target}运营`, `${target}客户运营`, `${target}商家运营`, `${target}用户运营`, `${target}增长运营`, `${target}渠道运营`, `${target}平台运营`, `${target}项目运营`, `${target}产品运营`, `${target}销售运营`]);
      } else if (nature === "product") {
        add([`${target}产品`, `${target}产品经理`, `${target}产品运营`, `${target}需求分析`, `${target}产品规划`, `${target}项目产品`, `${target}平台产品`, `${target}增长产品`]);
      } else if (nature === "tech") {
        add([`${target}工程师`, `${target}开发`, `${target}技术支持`, `${target}应用工程师`, `${target}解决方案工程师`, `${target}测试`, `${target}实施`, `${target}运维`, `${target}架构`, `${target}算法`]);
      } else {
        add([`${target}销售`, `${target}商务`, `${target}大客户销售`, `${target}客户经理`, `${target}销售经理`, `${target}销售顾问`, `${target}BD`, `${target}渠道销售`, `${target}解决方案销售`, `${target}销售工程师`, `${target}区域销售`, `${target}项目销售`]);
      }
    };

    for (const target of targets) {
      const lower = target.toLowerCase();
      if (nature === "sales" || nature === "any") {
        if (/ai应用|ai销售|人工智能/.test(lower)) add(["AI应用销售", "AI销售"]);
        if (/ai客服|智能客服|aicc|客服/.test(lower)) add(["AI客服销售", "智能客服销售", "AICC销售"]);
        if (/agent|智能体/i.test(target)) add(["Agent销售", "AI Agent销售", "智能体销售"]);
        if (/知识库/.test(target)) add(["AI知识库销售", "企业知识库销售"]);
        if (/销售助手/.test(target)) add(["AI销售助手", "AI销售助手销售"]);
        if (/大模型|maas/i.test(target)) add(["大模型销售", "MaaS销售"]);
        if (/ai产品|ai软件|ai平台/i.test(target)) add(["AI软件销售", "AI产品销售", "AI平台销售"]);
      }
      addByNature(target);
    }

    return [...new Set(words)].slice(0, 30);
  }

  function ruleWordsFromKeywords(keywords) {
    const positive = [];
    const negative = [];
    const add = (target, words) => {
      for (const word of words) {
        const value = norm(word);
        if (value) target.push(value);
      }
    };
    const sourceKeywords = keywords.length ? keywords : [currentSearchKeyword()].filter(Boolean);
    const nature = resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "");
    const profile = keywordProfileFromPanel();
    add(positive, sourceKeywords);
    for (const keyword of sourceKeywords) {
      const lower = keyword.toLowerCase();
      if (/教育|课程|培训/.test(lower)) {
        add(negative, ["招生", "课程销售"]);
      }
    }
    if (nature === "sales") {
      add(positive, profile.targets.flatMap(target => [`${target}销售`, `${target}商务`, `${target}大客户销售`]));
      add(negative, ["保险", "贷款", "营业员", "店员", "电话销售"]);
    }
    if (nature === "customer_success") {
      add(positive, profile.targets.flatMap(target => [`${target}客户成功`, `${target}客户运营`, `${target}续费`]));
      add(negative, ["纯销售", "电话销售", "客服坐席"]);
    }
    if (nature === "presales") {
      add(positive, profile.targets.flatMap(target => [`${target}售前`, `${target}解决方案`, `${target}方案顾问`]));
      add(negative, ["纯电销", "客服坐席", "电话客服"]);
    }
    if (nature === "operations") {
      add(positive, profile.targets.flatMap(target => [`${target}运营`, `${target}客户运营`, `${target}用户运营`, `${target}增长运营`, `${target}平台运营`]));
      add(negative, ["纯销售", "电话销售", "客服专员"]);
    }
    if (nature === "product") {
      add(positive, profile.targets.flatMap(target => [`${target}产品`, `${target}产品经理`, `${target}产品运营`, `${target}需求分析`, `${target}平台产品`]));
      add(negative, ["纯销售", "电话销售", "客服专员"]);
    }
    if (nature === "tech") {
      add(positive, profile.targets.flatMap(target => [`${target}工程师`, `${target}开发`, `${target}技术支持`]));
      add(negative, ["销售代表", "客户经理", "电话销售"]);
    }
    add(negative, ["保险", "贷款", "营业员", "店员"]);
    return {
      positive: sanitizePositiveWordsByNature(positive, RULE_SEED_LIMIT),
      negative: [...new Set(filterConflictingNegativeWords(negative))].slice(0, RULE_SEED_LIMIT)
    };
  }

  function currentSearchKeyword() {
    const url = new URL(location.href);
    const fromUrl = url.searchParams.get("query");
    if (fromUrl !== null) return norm(decodeURIComponent(fromUrl));
    return "";
  }

  function parseSearchKeywords() {
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const expandedKeywords = document.querySelector("#baf-expand-keywords")?.checked
      ? expandSearchKeywords(keywords, { nature: resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "") })
      : keywords;
    if (document.querySelector("#baf-include-blank")?.checked) {
      expandedKeywords.unshift("");
    }
    const unique = [];
    const seen = new Set();
    for (const keyword of expandedKeywords) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(keyword);
    }
    if (!unique.length) unique.push(currentSearchKeyword());
    return unique;
  }

  function currentQueryLabel() {
    return keywordLabel(currentSearchKeyword());
  }

  function collectSalaryRanges(text) {
    const source = norm(text)
      .replace(/,/g, "")
      .replace(/[－—–~～至到]/g, "-")
      .replace(/[Ｋｋ]/g, "K");
    const ranges = [];
    const toK = (num, unit, fallbackUnit = "") => {
      const value = Number(num);
      const finalUnit = unit || fallbackUnit;
      if (!Number.isFinite(value)) return null;
      if (/万|w/i.test(finalUnit)) return value * 10;
      if (/元/.test(finalUnit)) return value / 1000;
      return value;
    };
    const add = (match, minRaw, minUnit, maxRaw, maxUnit, options = {}) => {
      const fallbackUnit = maxUnit || minUnit || "";
      let min = toK(minRaw, minUnit, fallbackUnit);
      let max = toK(maxRaw, maxUnit, fallbackUnit);
      if (min === null || max === null) return;
      if (!fallbackUnit && min < 200 && max < 200) {
        min = Number(minRaw);
        max = Number(maxRaw);
      }
      if (options.isYearly) {
        min = min / 12;
        max = max / 12;
      }
      if (min > max) [min, max] = [max, min];
      ranges.push({
        min,
        max,
        raw: match[0],
        index: match.index ?? source.indexOf(match[0]),
        confidence: options.confidence || 50,
        type: options.type || "monthly"
      });
    };

    const dayPay = source.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*元\s*\/?\s*(?:天|日|小时|时)/);
    if (dayPay) {
      ranges.push({
        min: Number(dayPay[1]),
        max: Number(dayPay[2]),
        raw: dayPay[0],
        index: dayPay.index ?? source.indexOf(dayPay[0]),
        confidence: 100,
        type: "day"
      });
    }

    for (const match of source.matchAll(/年薪\s*(\d+(?:\.\d+)?)\s*(?:万|w|W)\s*-\s*(\d+(?:\.\d+)?)\s*(?:万|w|W)/g)) {
      add(match, match[1], "万", match[2], "万", { isYearly: true, confidence: 95 });
    }

    for (const match of source.matchAll(/年薪\s*(\d+(?:\.\d+)?)\s*(?:万|w|W)\+?/g)) {
      add(match, match[1], "万", match[1], "万", { isYearly: true, confidence: 90 });
    }

    for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*万\s*-\s*(\d+(?:\.\d+)?)\s*万\s*\/?\s*年/g)) {
      add(match, match[1], "万", match[2], "万", { isYearly: true, confidence: 92 });
    }

    for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*([kK千]?)\s*-\s*(\d+(?:\.\d+)?)\s*([kK千])\s*(?:·?\s*\d+\s*薪)?/g)) {
      add(match, match[1], match[2] || match[4], match[3], match[4], { confidence: 90 });
    }

    for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*([万wW]?)\s*-\s*(\d+(?:\.\d+)?)\s*([万wW])\s*(?:·?\s*\d+\s*薪)?/g)) {
      const yearly = Number(match[1]) >= 10 && Number(match[3]) >= 10 && !/\/?\s*月/.test(match[0]);
      add(match, match[1], match[2] || match[4], match[3], match[4], { isYearly: yearly, confidence: yearly ? 78 : 88 });
    }

    for (const match of source.matchAll(/(\d{3,6})\s*(?:元)?\s*-\s*(\d{3,6})\s*元\s*\/?\s*月?/g)) {
      add(match, match[1], "元", match[2], "元", { confidence: 75 });
    }

    for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*([kK千万wW])\s*-\s*(\d+(?:\.\d+)?)\s*([kK千万wW])?\s*\/?\s*月/g)) {
      add(match, match[1], match[2], match[3], match[4] || match[2], { confidence: 92 });
    }

    for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*([kK千万wW])\s*(?:·?\s*\d+\s*薪)?/g)) {
      const value = toK(match[1], match[2]);
      if (value === null) continue;
      const raw = match[0];
      const before = source.slice(Math.max(0, match.index - 8), match.index);
      const isYearly = /年薪/.test(before) || (/万|w/i.test(match[2]) && value >= 100 && !/月/.test(raw));
      ranges.push({
        min: isYearly ? value / 12 : value,
        max: isYearly ? value / 12 : value,
        raw,
        index: match.index ?? source.indexOf(raw),
        confidence: isYearly ? 70 : 55,
        type: "monthly"
      });
    }

    return ranges;
  }

  function parseSalaryRange(text) {
    const ranges = collectSalaryRanges(text);
    if (!ranges.length) return null;
    const salaryMin = Number(config.filters.salaryMin || 0);
    const salaryMax = Number(config.filters.salaryMax || 0);
    const targetMin = salaryMin || 0;
    const targetMax = salaryMax || 999;
    const daily = ranges.find(range => range.type === "day");
    const monthly = ranges.filter(range => range.type !== "day");
    if (!monthly.length) return daily || null;
    return monthly
      .map(range => {
        const overlaps = range.max >= targetMin && range.min <= targetMax;
        return {
          ...range,
          rank: range.confidence + (overlaps ? 100 : 0) + Math.min(20, range.max) - Math.min(10, range.index / 80)
        };
      })
      .sort((a, b) => b.rank - a.rank || a.index - b.index)[0];
  }

  function parseRecruiterActivity(text) {
    const source = norm(text);
    const online = source.match(/(?:当前)?在线|刚刚活跃|今日活跃|今天活跃/);
    if (online) return { raw: online[0], days: 0 };

    const day = source.match(/(\d+)\s*(?:日|天)内活跃/);
    if (day) return { raw: day[0], days: Number(day[1]) };

    const week = source.match(/(\d+)\s*周内活跃/);
    if (week) return { raw: week[0], days: Number(week[1]) * 7 };

    const month = source.match(/(\d+)\s*月内活跃/);
    if (month) return { raw: month[0], days: Number(month[1]) * 30 };

    const stale = source.match(/半年前活跃|很久未活跃|半年内活跃/);
    if (stale) return { raw: stale[0], days: 180 };

    return null;
  }

  function evaluateFilters(text) {
    const notes = [];
    const negatives = [];
    let hardExcluded = false;
    const activity = parseRecruiterActivity(text);
    if (activity) {
      if (activity.days > 3) {
        hardExcluded = true;
        negatives.push(`招聘者超过3日未活跃(${activity.raw})`);
      } else {
        notes.push(`招聘者活跃(${activity.raw})`);
      }
    } else {
      notes.push("招聘者活跃度未识别");
    }

    const salaryMin = Number(config.filters.salaryMin || 0);
    const salaryMax = Number(config.filters.salaryMax || 0);
    if (salaryMin || salaryMax) {
      const parsed = parseSalaryRange(text);
      if (!parsed) {
        notes.push("薪资未识别，未参与薪资过滤");
      } else if (parsed.type === "day") {
        hardExcluded = true;
        negatives.push(`薪资为日薪/时薪(${parsed.raw})`);
      } else {
        const targetMin = salaryMin || 0;
        const targetMax = salaryMax || 999;
        const overlaps = parsed.max >= targetMin && parsed.min <= targetMax;
        if (!overlaps) {
          hardExcluded = true;
          negatives.push(`薪资不匹配(${parsed.raw}≈${parsed.min.toFixed(1)}-${parsed.max.toFixed(1)}K/月)`);
        } else {
          notes.push(`薪资匹配(${parsed.raw}≈${parsed.min.toFixed(1)}-${parsed.max.toFixed(1)}K/月)`);
        }
      }
    }
    return { hardExcluded, negatives, notes };
  }

  function currentCompanyScaleLabel() {
    const codes = (new URL(location.href).searchParams.get("scale") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (!codes.length) return "不限";
    return SCALE_OPTIONS
      .filter(x => codes.includes(x.code))
      .map(x => x.label)
      .join("、") || "未识别";
  }

  function scoreJob(text) {
    const source = norm(text);
    const lower = source.toLowerCase();
    const titlePart = source.slice(0, 120);
    let score = 0;
    let globalScoreCap = 100;
    const hits = [];
    const negatives = [];
    const requiredWords = activeTargetKeywords();
    const hasRequired = requiredWords.length > 0 && requiredWords.some(word => targetKeywordMatches(source, word));

    for (const k of config.positive.high) {
      if (lower.includes(k.toLowerCase())) {
        score += 22;
        hits.push(k);
      }
    }
    for (const k of config.positive.medium) {
      if (lower.includes(k.toLowerCase())) {
        score += 10;
        hits.push(k);
      }
    }
    for (const k of config.positive.low) {
      if (lower.includes(k.toLowerCase())) {
        score += 5;
        hits.push(k);
      }
    }
    for (const k of config.filters.customPositive) {
      if (lower.includes(k.toLowerCase())) {
        score += 12;
        hits.push(`自定义正向:${k}`);
      }
    }

    let hardExcluded = false;
    for (const k of filterConflictingNegativeWords(config.negative.hard)) {
      if (lower.includes(k.toLowerCase())) {
        score -= 40;
        hardExcluded = true;
        negatives.push(k);
      }
    }
    for (const k of filterConflictingNegativeWords(config.negative.soft)) {
      if (lower.includes(k.toLowerCase())) {
        score -= 12;
        negatives.push(k);
      }
    }
    for (const k of config.filters.customNegative) {
      if (lower.includes(k.toLowerCase())) {
        score -= 25;
        negatives.push(`自定义反向:${k}`);
      }
    }
    const aiStrategy = activeAiStrategy()?.strategy;
    for (const k of sanitizeAiWords(aiStrategy?.positiveReference || [], 80)) {
      if (lower.includes(k.toLowerCase())) {
        score += 8;
        hits.push(`策略加分:${k}`);
      }
    }
    for (const k of filterConflictingNegativeWords(sanitizeAiWords(aiStrategy?.directExclude || [], 80))) {
      if (lower.includes(k.toLowerCase())) {
        score -= 35;
        hardExcluded = true;
        negatives.push(`策略排除:${k}`);
      }
    }
    if (!requiredWords.length) {
      score -= 25;
      negatives.push(targetDirectionIssue());
    } else if (!hasRequired) {
      score -= 25;
      negatives.push("缺少目标方向关键词");
    }
    const targetResult = scoreByTargetDirection(source);
    score += targetResult.scoreDelta;
    if (Number.isFinite(targetResult.scoreCap)) globalScoreCap = Math.min(globalScoreCap, targetResult.scoreCap);
    hits.push(...targetResult.hits);
    negatives.push(...targetResult.negatives);
    const natureResult = scoreByJobNature(source, titlePart);
    score += natureResult.scoreDelta;
    hits.push(...natureResult.hits);
    negatives.push(...natureResult.negatives);
    hardExcluded = hardExcluded || natureResult.hardExcluded;
    const fitResult = scoreByFitGate(source, titlePart, score);
    score += fitResult.scoreDelta;
    if (Number.isFinite(fitResult.scoreCap)) globalScoreCap = Math.min(globalScoreCap, fitResult.scoreCap);
    hits.push(...fitResult.hits);
    negatives.push(...fitResult.negatives);
    hardExcluded = hardExcluded || fitResult.hardExcluded;
    score = Math.max(0, Math.min(100, globalScoreCap, score));
    return {
      score,
      hits: [...new Set(hits)],
      negatives: [...new Set(negatives)],
      hardExcluded,
      reviewNotes: [...new Set([...targetResult.reviewNotes, ...fitResult.reviewNotes])]
    };
  }

  function hasAny(text, words) {
    const source = norm(text).toLowerCase();
    return words.some(word => source.includes(word.toLowerCase()));
  }

  function activeTargetKeywords() {
    const words = config.filters.targetKeywords?.length
      ? config.filters.targetKeywords
      : [];
    return [...new Set([
      ...words,
      ...targetHintsFromSearchKeyword(currentSearchKeyword()),
      ...targetHintsFromSearchKeyword(keywordFromCampaign())
    ].map(norm).filter(Boolean))];
  }

  function targetHintsFromSearchKeyword(keyword) {
    const source = norm(keyword);
    if (!source) return [];
    const nature = resolveJobNature(config.filters.jobNature || "");
    const roleWordsByNature = {
      sales: ["大客户销售", "销售顾问", "销售经理", "销售代表", "客户经理", "渠道销售", "解决方案销售", "销售工程师", "项目销售", "销售", "商务", "BD", "bd", "KA", "ka", "大客户"],
      customer_success: ["客户成功经理", "客户成功", "客户运营", "续费", "交付"],
      presales: ["解决方案销售", "解决方案", "售前", "方案顾问", "方案"],
      operations: ["用户运营", "商家运营", "增长运营", "渠道运营", "平台运营", "项目运营", "产品运营", "销售运营", "客户运营", "运营"],
      product: ["产品经理", "产品运营", "产品"],
      tech: ["应用工程师", "开发工程师", "算法工程师", "工程师", "开发", "技术支持"]
    };
    const roleWords = roleWordsByNature[nature] || Object.values(roleWordsByNature).flat();
    const hints = [source];
    let stripped = source;
    for (const role of roleWords) {
      stripped = stripped.replace(new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
    }
    stripped = norm(stripped);
    if (stripped && stripped !== source) hints.push(stripped);
    return hints;
  }

  function scoreByTargetDirection(source) {
    const targetWords = activeTargetKeywords();
    const usefulTargetWords = targetWords.filter(word => !isBroadTargetKeyword(word));
    const broadTargetWords = targetWords.filter(isBroadTargetKeyword);
    const hits = [];
    const negatives = [];
    const reviewNotes = [];
    let scoreDelta = 0;
    let scoreCap = 100;
    if (!targetWords.length) {
      scoreCap = 0;
      const issue = targetDirectionIssue();
      negatives.push(issue);
      reviewNotes.push("先填写目标方向，再扫描岗位");
      return { scoreDelta, scoreCap, hits, negatives, reviewNotes };
    }

    const matchedUseful = usefulTargetWords.filter(word => targetKeywordMatches(source, word));
    const matchedBroad = broadTargetWords.filter(word => targetKeywordMatches(source, word));
    const matched = matchedUseful.length ? matchedUseful : matchedBroad;
    if (matched.length) {
      if (matchedUseful.length) {
        scoreDelta += 24;
      } else {
        scoreDelta += 8;
        scoreCap = Math.min(scoreCap, 55);
        reviewNotes.push("目标方向太泛，已降级为人工复核");
      }
      hits.push(`目标方向:${matched.slice(0, 3).join("/")}`);
    } else {
      scoreCap = 45;
      negatives.push("缺少目标方向关键词");
      reviewNotes.push("岗位性质可能匹配，但没有命中目标方向");
    }
    return { scoreDelta, scoreCap, hits, negatives, reviewNotes };
  }

  function targetKeywordMatches(source, word) {
    const text = norm(source);
    const lower = text.toLowerCase();
    const keyword = norm(word);
    const keywordLower = keyword.toLowerCase();
    if (!keyword) return false;
    if (keywordLower === "agent") {
      if (/专利\s*agent/i.test(text)) return false;
      return /ai\s*agent/i.test(text) ||
        /agent\s*(销售|售前|解决方案|应用|产品|客服|智能体)/i.test(text) ||
        /(销售|售前|解决方案|应用|产品|客服)\s*agent/i.test(text) ||
        /智能体/.test(text);
    }
    return lower.includes(keywordLower);
  }

  function scoreByJobNature(source, titlePart) {
    const nature = resolveJobNature(config.filters.jobNature || "");
    const hits = [];
    const negatives = [];
    let scoreDelta = 0;
    let hardExcluded = false;
    if (nature === "any") return { scoreDelta, hits, negatives, hardExcluded };

    const salesWords = ["销售", "BD", "商务", "大客户", "客户经理", "客户代表", "客户开发", "销售顾问", "商务拓展", "渠道", "KA"];
    const csWords = ["客户成功", "客户运营", "续费", "续签", "交付", "培训", "复购", "扩容", "客户满意度"];
    const presalesWords = ["售前", "解决方案", "方案顾问", "实施顾问", "POC", "需求调研", "产品演示", "方案演示"];
    const opsWords = ["运营", "商家运营", "平台运营", "用户运营", "增长运营", "数据运营", "活动运营", "渠道运营"];
    const productWords = ["产品经理", "产品运营", "产品负责人", "产品总监", "产品Leader", "产品设计", "PM"];
    const techWords = ["工程师", "开发", "研发", "算法", "前端", "后端", "Java", "Python", "测试", "运维", "架构", "模型训练", "技术支持", "应用工程师"];
    const titleHasTech = hasAny(titlePart, techWords);
    const titleHasBusiness = hasAny(titlePart, [...salesWords, ...csWords, ...presalesWords, "顾问"]);
    const sourceHasTech = hasAny(source, techWords);
    const sourceHasSales = hasAny(source, salesWords);
    const sourceHasCs = hasAny(source, csWords);
    const sourceHasPresales = hasAny(source, presalesWords);
    const sourceHasOps = hasAny(source, opsWords);
    const sourceHasProduct = hasAny(source, productWords);

    if (nature === "sales") {
      if (sourceHasSales) {
        scoreDelta += 18;
        hits.push("岗位性质:销售");
      }
      if (sourceHasCs || sourceHasPresales) {
        scoreDelta += 5;
        hits.push("岗位性质相近");
      }
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 55;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      } else if (sourceHasTech && !sourceHasSales && !sourceHasCs && !sourceHasPresales) {
        scoreDelta -= 30;
        negatives.push("岗位性质偏技术");
      }
    }

    if (nature === "customer_success") {
      if (sourceHasCs) {
        scoreDelta += 18;
        hits.push("岗位性质:客户成功");
      }
      if (sourceHasPresales || sourceHasSales) scoreDelta += 4;
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 45;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      }
    }

    if (nature === "presales") {
      if (sourceHasPresales) {
        scoreDelta += 18;
        hits.push("岗位性质:售前/方案");
      }
      if (sourceHasCs || sourceHasSales) scoreDelta += 4;
      if (titleHasTech && !titleHasBusiness && !hasAny(titlePart, ["售前", "解决方案", "方案"])) {
        scoreDelta -= 35;
        negatives.push("岗位性质偏纯技术");
      }
    }

    if (nature === "operations") {
      if (sourceHasOps) {
        scoreDelta += 18;
        hits.push("岗位性质:运营");
      }
      if (sourceHasSales && !sourceHasOps) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏销售");
      }
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 45;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      }
    }

    if (nature === "product") {
      if (sourceHasProduct) {
        scoreDelta += 18;
        hits.push("岗位性质:产品");
      }
      if (sourceHasSales && !sourceHasProduct) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏销售");
      }
      if (sourceHasTech && !sourceHasProduct) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏技术");
      }
    }

    if (nature === "tech") {
      if (sourceHasTech) {
        scoreDelta += 18;
        hits.push("岗位性质:技术");
      }
      if (sourceHasSales && !sourceHasTech) {
        scoreDelta -= 30;
        negatives.push("岗位性质偏销售");
      }
    }

    return { scoreDelta, hits, negatives, hardExcluded };
  }

  function scoreByFitGate(source, titlePart, currentScore) {
    const hits = [];
    const negatives = [];
    const reviewNotes = [];
    let scoreDelta = 0;
    let scoreCap = 100;
    let hardExcluded = false;
    const title = norm(titlePart);
    const configuredNature = resolveJobNature(config.filters.jobNature || "");

    const targetSalesRoles = [
      "AI销售", "AI应用销售", "AI客服销售", "SaaS销售", "saas销售", "软件销售",
      "销售", "销售岗", "销售专员", "销售主管", "销售经理", "销售顾问", "销售代表",
      "销售团队", "销售管理", "大客户销售", "客户经理", "客户代表", "商务拓展",
      "商务经理", "BD", "KA销售"
    ];
    const acceptableRoles = [
      "客户成功", "客户运营", "售前", "解决方案", "方案顾问",
      "交付顾问", "实施顾问", "传统SaaS销售", "普通软件销售"
    ];
    const opsRoles = ["运营", "商家运营", "平台运营", "用户运营", "增长运营", "数据运营", "活动运营", "渠道运营"];
    const productRoles = ["产品经理", "产品运营", "产品负责人", "产品总监", "产品Leader", "产品设计", "PM"];
    const techRoles = ["工程师", "开发", "研发", "算法", "前端", "后端", "Java", "Python", "测试", "运维", "架构", "技术支持"];
    const badTitleRoles = [
      "全栈工程师", "AI应用工程师", "AI应用开发工程师", "应用开发工程师",
      "应用工程师", "开发工程师", "算法工程师", "研发工程师",
      "前端工程师", "后端工程师", "测试工程师", "运维工程师",
      "解决方案工程师", "技术支持", "产品经理", "项目经理",
      "产品总监", "产品Leader", "产品运营", "增长运营", "直播运营",
      "营销策划", "行业顾问", "训练师", "客服专员", "售后客服",
      "架构师", "Java", "Python"
    ];
    const targetScenes = activeTargetKeywords();
    const supportScenes = ["SaaS", "saas", "CRM", "ERP", "OA", "飞书", "钉钉", "办公协同", "企业微信", "企业软件", "软件系统", "呼叫中心"];
    const weakScenes = ["AI", "人工智能", "智能", "软件", "企业服务", "数字化"];
    const nonTargetVerticals = ["口腔", "汽车", "智能制造", "电力", "电网", "中医", "医生", "医美"];
    const outsourcingWords = ["外包", "定制开发", "网站建设", "小程序"];
    const phoneWords = ["电话销售", "电销"];

    const titleHasSales = hasAny(title, targetSalesRoles);
    const titleHasAcceptable = hasAny(title, acceptableRoles);
    const titleHasOps = hasAny(title, opsRoles);
    const titleHasProduct = hasAny(title, productRoles);
    const titleHasTech = hasAny(title, techRoles) || (/工程师/.test(title) && !/销售工程师/.test(title));
    const titleHasConfiguredRole =
      configuredNature === "any" ||
      (configuredNature === "sales" && titleHasSales) ||
      (configuredNature === "customer_success" && titleHasAcceptable) ||
      (configuredNature === "presales" && titleHasAcceptable) ||
      (configuredNature === "operations" && titleHasOps) ||
      (configuredNature === "product" && titleHasProduct) ||
      (configuredNature === "tech" && titleHasTech);
    const titleHasBadRole = (hasAny(title, badTitleRoles) || titleHasTech) && !titleHasConfiguredRole;
    const hasStrongScene = hasAny(source, targetScenes);
    const hasSupportScene = hasAny(source, supportScenes);
    const hasWeakScene = hasAny(source, weakScenes);
    const hasNonTargetVertical = hasAny(title, nonTargetVerticals);
    const hasOutsourcing = hasAny(source, outsourcingWords);
    const hasPhoneSales = hasAny(source, phoneWords);

    if (titleHasBadRole && !titleHasConfiguredRole) {
      hardExcluded = true;
      scoreDelta -= 70;
      negatives.push("岗位角色不匹配");
    }

    if (hasNonTargetVertical && !hasStrongScene) {
      hardExcluded = true;
      scoreDelta -= 55;
      negatives.push("非目标行业场景");
    }

    if (hasOutsourcing) {
      if (hasStrongScene && titleHasConfiguredRole) {
        scoreDelta -= 8;
        scoreCap = Math.min(scoreCap, 59);
        reviewNotes.push("含外包/定制开发，但有目标场景，建议人工看");
      } else {
        hardExcluded = true;
        scoreDelta -= 45;
        negatives.push("外包/定制开发且目标场景不明确");
      }
    }

    if (titleHasConfiguredRole && hasStrongScene) {
      scoreDelta += 18;
      hits.push("目标岗位匹配");
    } else if (titleHasConfiguredRole && (hasSupportScene || hasWeakScene)) {
      scoreCap = Math.min(scoreCap, 58);
      reviewNotes.push("岗位性质匹配，但目标方向不够明确");
    } else if (titleHasAcceptable && hasStrongScene) {
      scoreDelta -= 4;
      scoreCap = Math.min(scoreCap, 59);
      reviewNotes.push("可接受岗位，优先级低");
    } else if (!titleHasConfiguredRole && !titleHasAcceptable && !hardExcluded) {
      scoreCap = Math.min(scoreCap, 45);
      negatives.push("岗位性质不匹配");
    }

    if (!hasStrongScene) {
      scoreCap = Math.min(scoreCap, titleHasConfiguredRole && hasWeakScene ? 58 : 45);
      negatives.push("缺少明确目标方向场景");
    }

    if (hasPhoneSales) {
      if (hasStrongScene) {
        scoreDelta -= 4;
        reviewNotes.push("电话销售，但有目标方向场景");
      } else {
        scoreCap = Math.min(scoreCap, 50);
        negatives.push("电销但目标方向不明确");
      }
    }

    if (!hardExcluded && currentScore + scoreDelta >= 50 && currentScore + scoreDelta < config.threshold) {
      reviewNotes.push("接近收藏分，建议人工复核");
    }

    return { scoreDelta, scoreCap, hits, negatives, reviewNotes, hardExcluded };
  }

  function resolveJobNature(value) {
    const source = norm(value).toLowerCase();
    if (!source || /不限|任意|全部|any/.test(source)) return "any";
    if (/客户成功|客户运营|续费|续签|交付|实施|培训|复购|扩容/.test(source)) return "customer_success";
    if (/售前|解决方案|方案|顾问|poc|pre[-\s]?sales/i.test(source)) return "presales";
    if (/产品经理|产品运营|产品负责人|产品总监|产品leader|产品设计|pm/i.test(source)) return "product";
    if (/运营|增长|用户|商家运营|平台运营|渠道运营|活动/.test(source)) return "operations";
    if (/技术|工程师|开发|研发|算法|前端|后端|测试|运维|架构|java|python/.test(source)) return "tech";
    if (/销售|bd|商务|大客户|客户经理|客户代表|ka|渠道|拓展/.test(source)) return "sales";
    return "any";
  }

  function jobNatureDisplayValue(value) {
    const raw = norm(value);
    const lower = raw.toLowerCase();
    if (lower === "sales") return "销售";
    if (lower === "customer_success") return "客户成功";
    if (lower === "presales") return "售前";
    if (lower === "operations") return "运营";
    if (lower === "product") return "产品";
    if (lower === "tech") return "技术";
    if (lower === "any") return "";
    return raw;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 120 && r.top < window.innerHeight - 20;
  }

  function getJobLinks() {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="/job_detail/"]'))
      .filter(a => visible(a))
      .map(a => {
        const href = a.href;
        const title = norm(a.textContent);
        if (!href || !title || seen.has(href)) return null;
        seen.add(href);
        let card = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          const parentText = norm(card.parentElement.textContent);
          if (parentText.length > norm(card.textContent).length + 20 && parentText.length < 1200) {
            card = card.parentElement;
          }
        }
        return { href, title, card, cardText: norm(card.textContent) };
      })
      .filter(Boolean);
  }

  function extractRelevantDetail(text) {
    let source = norm(text);
    const startMarkers = ["职位描述", "职位详情", "岗位职责", "岗位要求", "职位要求"];
    const startIndexes = startMarkers
      .map(k => source.indexOf(k))
      .filter(i => i >= 0);
    if (startIndexes.length) {
      source = source.slice(Math.min(...startIndexes));
    }

    const endMarkers = [
      "工作地址", "查看更多信息", "求职工具", "热门职位", "热门城市",
      "热门企业", "附近城市", "BOSS岗位粗筛助手"
    ];
    const endIndexes = endMarkers
      .map(k => source.indexOf(k))
      .filter(i => i > 0);
    if (endIndexes.length) {
      source = source.slice(0, Math.min(...endIndexes));
    }
    return norm(source);
  }

  function rightPanelText() {
    const vw = window.innerWidth;
    const candidates = Array.from(document.querySelectorAll("div,section,main,article"))
      .map(el => {
        const r = el.getBoundingClientRect();
        return { el, r, text: extractRelevantDetail(el.textContent) };
      })
      .filter(x =>
        x.r.left > vw * 0.33 &&
        x.r.top > 170 &&
        x.r.width > 280 &&
        x.r.height > 180 &&
        x.text.length > 80
      )
      .sort((a, b) => {
        const aHasDetail = /职位描述|职位详情|岗位职责|岗位要求|职位要求/.test(a.text) ? 1 : 0;
        const bHasDetail = /职位描述|职位详情|岗位职责|岗位要求|职位要求/.test(b.text) ? 1 : 0;
        if (aHasDetail !== bHasDetail) return bHasDetail - aHasDetail;
        return b.text.length - a.text.length;
      });
    return candidates[0]?.text || "";
  }

  function favoriteButtonCandidates() {
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll("a,button,[role='button']"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
        return {
          el,
          r,
          text,
          tagScore: /^(A|BUTTON)$/i.test(el.tagName) ? 1 : 0,
          exactScore: /^(收藏|已收藏)$/.test(text) ? 1 : 0
        };
      })
      .filter(x =>
        x.r.left > vw * 0.45 &&
        x.r.top > 120 &&
        x.r.top < 560 &&
        x.r.width >= 20 &&
        x.r.width <= 180 &&
        x.r.height >= 16 &&
        x.r.height <= 80 &&
        /收藏/.test(x.text)
      )
      .sort((a, b) =>
        b.exactScore - a.exactScore ||
        b.tagScore - a.tagScore ||
        a.r.top - b.r.top ||
        (a.r.width * a.r.height) - (b.r.width * b.r.height)
      );
  }

  function favoriteButtonState() {
    const candidate = favoriteButtonCandidates()[0];
    if (!candidate) return { found: false, ok: false, text: "", status: "未找到收藏按钮" };
    if (candidate.text.includes("已收藏") || candidate.text.includes("取消收藏")) {
      return { found: true, ok: true, text: candidate.text, status: "已收藏", el: candidate.el };
    }
    return { found: true, ok: false, text: candidate.text, status: "待收藏", el: candidate.el };
  }

  async function clickFavoriteButton() {
    const before = favoriteButtonState();
    if (!before.found) return before;
    if (before.ok) return before;

    before.el.scrollIntoView({ block: "center", inline: "nearest" });
    before.el.click();
    await sleep(900);

    const after = favoriteButtonState();
    if (after.ok) return { ...after, status: "点击后已收藏" };
    if (after.found && after.text !== before.text && (after.text.includes("已收藏") || after.text.includes("取消收藏"))) {
      return { ...after, ok: true, status: "点击后已收藏" };
    }
    return {
      found: after.found,
      ok: false,
      text: after.text || before.text,
      status: `点击后未确认收藏状态：${after.text || before.text || "无按钮文本"}`
    };
  }

  function findJobScroller() {
    const els = Array.from(document.querySelectorAll("div,ul,section"));
    return els
      .map(el => ({
        el,
        count: el.querySelectorAll('a[href*="/job_detail/"]').length,
        scrollable: el.scrollHeight > el.clientHeight + 80,
        r: el.getBoundingClientRect()
      }))
      .filter(x => x.count >= 4 && x.scrollable && x.r.left < window.innerWidth * 0.45)
      .sort((a, b) => b.count - a.count)[0]?.el || document.scrollingElement;
  }

  function countProcessedAttempt() {
    state.scanned += 1;
    state.daily.scanned += 1;
    if (state.campaign?.active || state.campaign?.paused) {
      state.campaign.keywordScanned = Number(state.campaign.keywordScanned || 0) + 1;
      state.campaign.totalScanned = Number(state.campaign.totalScanned || 0) + 1;
      saveCampaign();
    }
    saveDailyStats();
  }

  function log(record) {
    persistRecord(record);
    state.logs.unshift(record);
    state.logs = state.logs.slice(0, 120);
    try {
      updatePanel();
    } catch (error) {
      debugLog("update_panel_error", { error: String(error?.message || error) });
    }
  }

  function actionLabel(action) {
    if (action === "favorite") return "已收藏";
    if (action === "review") return "待复核";
    if (action === "exclude") return "已排除";
    if (action === "favorite_failed") return "收藏失败";
    if (action === "user_like") return "用户想看";
    if (action === "user_dislike") return "用户不想看";
    if (action === "error") return "错误";
    return "未收藏";
  }

  function recommendedActionFor(record) {
    if (record.action === "favorite") return "已自动收藏";
    if (record.action === "favorite_failed") return "人工检查收藏状态";
    if (record.action === "review") return "人工复核";
    if (record.action === "exclude") return "跳过";
    if (record.action === "user_like") return "保留并提高相似岗位权重";
    if (record.action === "user_dislike") return "排除相似岗位";
    if (record.action === "error") return "检查页面或规则";
    return record.needsReview ? "人工复核" : "跳过";
  }

  function mainReasonFor(record) {
    const negatives = record.negatives || [];
    const reviewNotes = record.reviewNotes || [];
    const filterNotes = record.filterNotes || [];
    const hits = record.hits || [];
    if (record.action === "favorite_failed") return record.favoriteResult || "点击收藏后未确认状态";
    if (reviewNotes.length) return reviewNotes[0];
    if (negatives.length) return negatives[0];
    if (filterNotes.length) return filterNotes[0];
    if (hits.length) return hits[0];
    if (record.action === "favorite") return "达到收藏分";
    if (record.action === "review") return "分数处于复核区间";
    if (record.action === "exclude") return "分数低于复核线";
    return "";
  }

  function buildDecisionLog(record, context = {}) {
    const parts = [
      `分数${record.score}，收藏线${config.threshold}，复核线${REVIEW_THRESHOLD}`,
      `硬排除:${context.blocked ? "是" : "否"}`
    ];
    if (context.blockReason) parts.push(context.blockReason);
    if (context.existingFavorite) {
      parts.push(`岗位已显示收藏，本次跳过重复点击:${record.favoriteResult || "已收藏"}`);
    } else if (record.action === "favorite") {
      parts.push(`达到收藏线，已点击收藏成功:${record.favoriteResult || "已收藏"}`);
    } else if (record.action === "favorite_failed") {
      parts.push(`达到收藏线，但收藏未确认:${record.favoriteResult || "未知"}`);
    } else if (record.action === "review") {
      parts.push(context.reviewReason || "未自动收藏，进入待复核");
    } else if (record.action === "exclude") {
      parts.push(context.excludeReason || "低于复核线或命中排除，未收藏");
    }
    const mainReason = record.mainReason || mainReasonFor(record);
    if (mainReason) parts.push(`主因:${mainReason}`);
    if ((record.reviewNotes || []).length) parts.push(`复核:${record.reviewNotes.slice(0, 2).join("、")}`);
    return parts.join("；");
  }

  function persistRecord(record) {
    const processingStatus = record.processingStatus || actionLabel(record.action);
    const recommendedAction = record.recommendedAction || recommendedActionFor(record);
    const needsReview = Boolean(record.needsReview || record.action === "review" || record.action === "favorite_failed");
    const mainReason = record.mainReason || mainReasonFor(record);
    const saved = {
      time: record.time,
      query: currentQueryLabel(),
      result: actionLabel(record.action),
      processingStatus,
      recommendedAction,
      needsReview: needsReview ? "是" : "否",
      mainReason,
      ruleVersion: record.ruleVersion || RULE_VERSION,
      score: record.score,
      title: record.title,
      companyScale: record.companyScale || currentCompanyScaleLabel(),
      cardText: norm(record.cardText || "").slice(0, 260),
      hits: (record.hits || []).join("、"),
      negatives: (record.negatives || []).join("、"),
      filterNotes: (record.filterNotes || []).join("、"),
      reviewNotes: (record.reviewNotes || []).join("、"),
      decisionLog: record.decisionLog || "",
      favoriteResult: record.favoriteResult || "",
      favoriteButtonText: record.favoriteButtonText || "",
      href: record.href
    };
    const index = state.records.findIndex(r => r.href === saved.href);
    if (index >= 0) {
      state.records[index] = saved;
    } else {
      state.records.push(saved);
    }
    state.records = state.records.slice(-1200);
    saveRecords();
  }

  function tableText() {
    const headers = ["时间", "搜索词", "结果", "处理状态", "推荐动作", "是否需要人工看", "主要原因", "规则版本", "分数", "岗位", "公司规模", "岗位卡片", "命中关键词", "扣分关键词", "筛选备注", "复核建议", "决策日志", "收藏状态", "收藏按钮文本", "链接"];
    const clean = value => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
    const rows = state.records.map(r => [
      r.time,
      r.query,
      r.result,
      r.processingStatus || r.result,
      r.recommendedAction || "",
      r.needsReview || "",
      r.mainReason || "",
      r.ruleVersion || "",
      r.score,
      r.title,
      r.companyScale,
      r.cardText,
      r.hits,
      r.negatives,
      r.filterNotes,
      r.reviewNotes,
      r.decisionLog,
      r.favoriteResult,
      r.favoriteButtonText,
      r.href
    ].map(clean).join("\t"));
    return [headers.join("\t"), ...rows].join("\n");
  }

  function recordsJson() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      ruleVersion: RULE_VERSION,
      config: configSchemaSnapshot(),
      records: state.records
    }, null, 2);
  }

  function readPanelConfig() {
    config.threshold = Math.max(REVIEW_THRESHOLD + 1, Number(document.querySelector("#baf-threshold")?.value || config.threshold));
    setPanelValue("#baf-threshold", config.threshold);
    config.maxJobs = Number(document.querySelector("#baf-max")?.value || config.maxJobs);
    config.filters.jobNature = norm(document.querySelector("#baf-job-nature")?.value || "");
    config.filters.targetKeywords = parseKeywordList(document.querySelector("#baf-target-keywords")?.value || "");
    config.filters.salaryMin = norm(document.querySelector("#baf-salary-min")?.value || "");
    config.filters.salaryMax = norm(document.querySelector("#baf-salary-max")?.value || "");
    config.filters.customPositive = parseKeywordList(document.querySelector("#baf-positive")?.value || "");
    config.filters.customNegative = parseKeywordList(document.querySelector("#baf-negative")?.value || "");
    config.filters.skipRecorded = Boolean(document.querySelector("#baf-skip-recorded")?.checked);
    config.safety.dailyScanLimit = Math.max(0, Number(document.querySelector("#baf-daily-scan-limit")?.value || config.safety.dailyScanLimit));
    config.safety.dailyFavoriteLimit = Math.max(0, Number(document.querySelector("#baf-daily-favorite-limit")?.value || config.safety.dailyFavoriteLimit));
    config.safety.pauseEvery = Math.max(0, Number(document.querySelector("#baf-pause-every")?.value || config.safety.pauseEvery));
    config.safety.pauseMinSec = Math.max(0, Number(document.querySelector("#baf-pause-min")?.value || config.safety.pauseMinSec));
    config.safety.pauseMaxSec = Math.max(0, Number(document.querySelector("#baf-pause-max")?.value || config.safety.pauseMaxSec));
    state.aiSettings.provider = String(document.querySelector("#baf-ai-provider")?.value || state.aiSettings.provider || "deepseek").trim();
    state.aiSettings.apiKey = String(document.querySelector("#baf-ai-key")?.value || state.aiSettings.apiKey || "").trim();
    state.aiSettings.model = String(document.querySelector("#baf-ai-model")?.value || state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model).trim();
    saveAiSettings();
    state.settings = panelSettingsSnapshot();
    saveSettings(state.settings);
    updateConfigSummary();
  }

  function schedulePanelSettingsSave() {
    if (state.settingsTimer) window.clearTimeout(state.settingsTimer);
    state.settingsTimer = window.setTimeout(() => {
      readPanelConfig();
      state.settingsTimer = null;
    }, 400);
  }

  function panelSettingsSnapshot() {
    return {
      version: SETTINGS_VERSION,
      threshold: config.threshold,
      reviewThreshold: REVIEW_THRESHOLD,
      ruleVersion: RULE_VERSION,
      maxJobs: config.maxJobs,
      filters: {
        jobNature: config.filters.jobNature,
        targetKeywords: [...(config.filters.targetKeywords || [])],
        salaryMin: config.filters.salaryMin,
        salaryMax: config.filters.salaryMax,
        customPositive: [...config.filters.customPositive],
        customNegative: [...config.filters.customNegative],
        skipRecorded: config.filters.skipRecorded
      },
      safety: {
        dailyScanLimit: config.safety.dailyScanLimit,
        dailyFavoriteLimit: config.safety.dailyFavoriteLimit,
        pauseEvery: config.safety.pauseEvery,
        pauseMinSec: config.safety.pauseMinSec,
        pauseMaxSec: config.safety.pauseMaxSec
      },
      search: {
        keywords: document.querySelector("#baf-keywords")?.value || "",
        includeRecommendation: Boolean(document.querySelector("#baf-include-blank")?.checked),
        expandKeywords: Boolean(document.querySelector("#baf-expand-keywords")?.checked),
        perKeywordMax: Math.max(1, Number(document.querySelector("#baf-per-keyword")?.value || DEFAULT_PER_KEYWORD_MAX))
      }
    };
  }

  function strategyProfileKey() {
    const profile = keywordProfileFromPanel();
    const salaryMin = norm(document.querySelector("#baf-salary-min")?.value || config.filters.salaryMin || "");
    const salaryMax = norm(document.querySelector("#baf-salary-max")?.value || config.filters.salaryMax || "");
    return JSON.stringify({
      jobNature: profile.natureText || config.filters.jobNature || "",
      normalizedNature: profile.nature,
      targetDirections: profile.targets,
      salaryMin,
      salaryMax,
      threshold: Number(config.threshold || 60),
      reviewThreshold: REVIEW_THRESHOLD
    });
  }

  function activeAiStrategy() {
    if (!state.aiStrategy) return null;
    if (state.aiStrategy.ruleVersion !== RULE_VERSION) return null;
    return state.aiStrategy.profileKey === strategyProfileKey() ? state.aiStrategy : null;
  }

  function screeningStrategySnapshot() {
    const targetWords = activeTargetKeywords();
    const nature = resolveJobNature(config.filters.jobNature || "");
    const natureLabel = jobNatureDisplayValue(config.filters.jobNature) || "不限";
    const directions = targetWords.length ? targetWords : [];
    const usefulDirections = directions.filter(word => !isBroadTargetKeyword(word));
    const broadDirections = directions.filter(isBroadTargetKeyword);
    const targetPositive = [];
    for (const target of directions) {
      if (!target) continue;
      targetPositive.push(target);
      if (nature === "sales") targetPositive.push(`${target}销售`, `${target}商务`, `${target}大客户`);
      if (nature === "customer_success") targetPositive.push(`${target}客户成功`, `${target}客户运营`, `${target}续费`);
      if (nature === "presales") targetPositive.push(`${target}售前`, `${target}解决方案`, `${target}方案顾问`);
      if (nature === "operations") targetPositive.push(`${target}运营`, `${target}增长`, `${target}用户运营`);
      if (nature === "product") targetPositive.push(`${target}产品`, `${target}产品经理`, `${target}产品运营`);
      if (nature === "tech") targetPositive.push(`${target}工程师`, `${target}开发`, `${target}技术支持`);
    }
    const rolePositive = {
      sales: ["销售", "BD", "商务", "大客户", "客户经理", "客户开发", "商务谈判"],
      customer_success: ["客户成功", "客户运营", "交付", "培训", "续费", "续签", "复购"],
      presales: ["售前", "解决方案", "方案顾问", "POC", "产品演示", "需求调研"],
      operations: ["运营", "增长运营", "客户运营", "商家运营", "数据运营", "活动运营"],
      product: ["产品经理", "产品运营", "需求分析", "产品规划", "原型"],
      tech: ["工程师", "开发", "研发", "架构", "技术支持", "技术方案"]
    }[nature] || [];
    const positive = [...new Set([...(config.filters.customPositive || []), ...targetPositive, ...rolePositive])];
    const directExclude = filterConflictingNegativeWords(config.filters.customNegative || [], { keepManual: true });
    const systemExclude = filterConflictingNegativeWords([...(config.negative.hard || []), ...(config.negative.soft || [])]);
    const localStrategy = {
      target: {
        jobNature: natureLabel,
        normalizedNature: nature,
        directions,
        usefulDirections,
        broadDirections
      },
      mustHave: [
        `岗位性质必须匹配：${natureLabel}`,
        usefulDirections.length
          ? `必须命中具体目标方向：${usefulDirections.slice(0, 8).join("、")}`
          : "目标方向暂时偏泛，只能进入复核，不能直接强收藏"
      ],
      acceptable: [
        "岗位性质相近，并且命中目标场景的岗位可以进入待复核",
        "标题不完全命中，但职责里有明确业务场景的岗位可以进入待复核"
      ],
      reviewOnly: [
        "目标方向相关但岗位性质不完全匹配",
        "行业相关但标题不够明确"
      ],
      directExclude: [...new Set(directExclude)].slice(0, 40),
      systemExclude: [...new Set(systemExclude)].slice(0, 60),
      scoring: {
        favoriteScore: Number(config.threshold || 60),
        reviewScore: REVIEW_THRESHOLD,
        excludeBelow: REVIEW_THRESHOLD,
        broadTargetPolicy: "目标方向只有 ai、互联网、软件、SaaS、CRM 等泛词时，不直接强收藏，优先进入待复核"
      },
      salary: {
        minK: config.filters.salaryMin || "",
        maxK: config.filters.salaryMax || ""
      },
      positiveReference: positive.slice(0, 40),
      generatedBy: "local",
      safety: {
        dailyScanLimit: Number(config.safety.dailyScanLimit || 0),
        dailyFavoriteLimit: Number(config.safety.dailyFavoriteLimit || 0),
        pauseEvery: Number(config.safety.pauseEvery || 0),
        pauseRangeSec: [Number(config.safety.pauseMinSec || 0), Number(config.safety.pauseMaxSec || 0)]
      },
      boundary: "只做岗位粗筛、收藏、记录和复核；不自动打招呼、不自动投递、不读取聊天"
    };
    const aiStrategy = activeAiStrategy();
    if (!aiStrategy?.strategy) return localStrategy;
    const merged = {
      ...localStrategy,
      ...aiStrategy.strategy,
      target: {
        ...localStrategy.target,
        ...(aiStrategy.strategy.target || {})
      },
      scoring: {
        ...localStrategy.scoring,
        ...(aiStrategy.strategy.scoring || {})
      },
      salary: {
        ...localStrategy.salary,
        ...(aiStrategy.strategy.salary || {})
      },
      safety: {
        ...localStrategy.safety,
        ...(aiStrategy.strategy.safety || {})
      },
      generatedBy: state.aiSettings.provider || "ai",
      generatedAt: aiStrategy.createdAt
    };
    return {
      ...merged,
      directExclude: filterConflictingNegativeWords(sanitizeAiWords(merged.directExclude || [], 80)),
      positiveReference: sanitizePositiveWordsByNature(merged.positiveReference || [], 80)
    };
  }

  function configSchemaSnapshot() {
    const strategy = screeningStrategySnapshot();
    const targetWords = activeTargetKeywords();
    const nature = resolveJobNature(config.filters.jobNature || "");
    const positive = [...new Set([...(config.filters.customPositive || []), ...config.positive.high, ...config.positive.medium])];
    const customNegative = filterConflictingNegativeWords(config.filters.customNegative || [], { keepManual: true });
    const systemNegative = filterConflictingNegativeWords([...(config.negative.hard || []), ...(config.negative.soft || [])]);
    return {
      product: "BOSS岗位粗筛助手",
      mode: "low_risk_rough_screen",
      boundary: "只做岗位粗筛、收藏、记录和复核；不自动打招呼、不自动投递、不读取聊天",
      ruleVersion: RULE_VERSION,
      target: {
        jobNature: jobNatureDisplayValue(config.filters.jobNature) || "不限",
        normalizedNature: nature,
        directions: targetWords
      },
      thresholds: {
        favoriteScore: Number(config.threshold || 60),
        reviewScore: REVIEW_THRESHOLD,
        excludeBelow: REVIEW_THRESHOLD
      },
      salary: {
        minK: config.filters.salaryMin || "",
        maxK: config.filters.salaryMax || ""
      },
      keywords: {
        positive: positive.slice(0, 80),
        negative: customNegative.slice(0, 80),
        systemNegative: systemNegative.slice(0, 80),
        search: parseKeywordList(document.querySelector("#baf-keywords")?.value || "")
      },
      screeningStrategy: strategy,
      userPreferences: {
        likedWords: [...(state.userPrefs.likedWords || [])],
        dislikedWords: [...(state.userPrefs.dislikedWords || [])]
      },
      ai: {
        provider: state.aiSettings.provider || "deepseek",
        providerLabel: AI_PROVIDERS[state.aiSettings.provider]?.label || state.aiSettings.provider || "DeepSeek",
        enabled: Boolean(state.aiSettings.apiKey),
        model: state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model
      },
      safety: {
        dailyScanLimit: Number(config.safety.dailyScanLimit || 0),
        dailyFavoriteLimit: Number(config.safety.dailyFavoriteLimit || 0),
        pauseEvery: Number(config.safety.pauseEvery || 0),
        pauseRangeSec: [Number(config.safety.pauseMinSec || 0), Number(config.safety.pauseMaxSec || 0)]
      },
      outputStatuses: ["已收藏", "待复核", "已排除", "收藏失败", "用户想看", "用户不想看"]
    };
  }

  function configSummaryText() {
    const aiStrategy = activeAiStrategy();
    if (aiStrategy?.summaryText) return aiStrategy.summaryText;
    const snapshot = configSchemaSnapshot();
    const strategy = snapshot.screeningStrategy;
    const directions = snapshot.target.directions.slice(0, 6).join("、") || "未填写";
    const positive = strategy.positiveReference.slice(0, RULE_SEED_LIMIT).join("、") || "按岗位性质和目标方向自动加分";
    const avoidWords = strategy.directExclude.slice(0, RULE_SEED_LIMIT).join("、") || "未填写本次避开词";
    return [
      `当前目标：${snapshot.target.jobNature} + ${directions}`,
      `开始前确认：搜索词、加分词、排除词没有跑偏或互相冲突。`,
      `本次避开：${avoidWords}`,
      `说明：这些词只服务于当前方向，不是所有用户的通用排除项。`,
      `安全边界：只做粗筛、收藏和记录；不打招呼、不投递、不读聊天。`,
      ``,
      `详细规则：必须匹配${snapshot.target.jobNature}岗位，并命中${directions}方向。收藏标准按上方宽松/标准/严格按钮执行。`,
      `加分参考：${positive}`,
      `今日上限：最多扫${strategy.safety.dailyScanLimit || "不限"}，最多藏${strategy.safety.dailyFavoriteLimit || "不限"}，每扫${strategy.safety.pauseEvery}个休息${strategy.safety.pauseRangeSec[0]}-${strategy.safety.pauseRangeSec[1]}秒。`
    ].join("\n");
  }

  function updateConfigSummary() {
    const el = document.querySelector("#baf-config-summary");
    if (!el) return;
    const text = configSummaryText();
    el.textContent = text;
  }

  function applySavedPanelSettings(settings) {
    if (!settings) return;
    config.threshold = Number(settings.threshold || config.threshold);
    config.maxJobs = Number(settings.maxJobs || config.maxJobs);
    config.filters = {
      ...config.filters,
      ...(settings.filters || {}),
      targetKeywords: [...(settings.filters?.targetKeywords || config.filters.targetKeywords || DEFAULT_TARGET_KEYWORDS)],
      customPositive: [...(settings.filters?.customPositive || [])],
      customNegative: [...(settings.filters?.customNegative || [])]
    };
    config.safety = {
      ...config.safety,
      ...(settings.safety || {})
    };
  }

  function setPanelValue(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.value = value ?? "";
  }

  function setPanelChecked(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.checked = Boolean(value);
  }

  function hydratePanelFromSettings(settings) {
    if (!settings) return;
    applySavedPanelSettings(settings);
    setPanelValue("#baf-threshold", config.threshold);
    setPanelValue("#baf-max", config.maxJobs);
    setPanelValue("#baf-job-nature", jobNatureDisplayValue(config.filters.jobNature));
    setPanelValue("#baf-target-keywords", (config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"));
    setPanelValue("#baf-salary-min", config.filters.salaryMin);
    setPanelValue("#baf-salary-max", config.filters.salaryMax);
    setPanelValue("#baf-positive", (config.filters.customPositive || []).join("\n"));
    setPanelValue("#baf-negative", (config.filters.customNegative || []).join("\n"));
    setPanelChecked("#baf-skip-recorded", config.filters.skipRecorded);
    setPanelValue("#baf-daily-scan-limit", config.safety.dailyScanLimit);
    setPanelValue("#baf-daily-favorite-limit", config.safety.dailyFavoriteLimit);
    setPanelValue("#baf-pause-every", config.safety.pauseEvery);
    setPanelValue("#baf-pause-min", config.safety.pauseMinSec);
    setPanelValue("#baf-pause-max", config.safety.pauseMaxSec);
    setPanelValue("#baf-ai-provider", state.aiSettings.provider || "deepseek");
    setPanelValue("#baf-ai-key", state.aiSettings.apiKey);
    setPanelValue("#baf-ai-model", state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model);
    setPanelValue("#baf-keywords", settings.search?.keywords || currentSearchKeyword());
    setPanelChecked("#baf-include-blank", settings.search?.includeRecommendation ?? true);
    setPanelChecked("#baf-expand-keywords", settings.search?.expandKeywords ?? true);
    setPanelValue("#baf-per-keyword", settings.search?.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
  }

  function safetyStopReason() {
    saveDailyStats();
    const scanLimit = Number(config.safety.dailyScanLimit || 0);
    const favoriteLimit = Number(config.safety.dailyFavoriteLimit || 0);
    if (scanLimit > 0 && state.daily.scanned >= scanLimit) {
      return `达到今日扫描安全上限 ${scanLimit}`;
    }
    if (favoriteLimit > 0 && state.daily.favorited >= favoriteLimit) {
      return `达到今日收藏安全上限 ${favoriteLimit}`;
    }
    return "";
  }

  function favoriteLimitReached() {
    saveDailyStats();
    const limit = Number(config.safety.dailyFavoriteLimit || 0);
    return limit > 0 && state.daily.favorited >= limit;
  }

  function campaignProgressLabel() {
    if (state.campaign?.paused) {
      const total = state.campaign.keywords?.length || 0;
      const index = Math.min((state.campaign.index || 0) + 1, total || 1);
      const keyword = keywordLabel(keywordFromCampaign());
      const scanned = Number(state.campaign.keywordScanned || 0);
      const limit = Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
      return `多词任务已暂停 ${index}/${total}｜当前：${keyword}｜本词 ${scanned}/${limit}`;
    }
    if (!state.campaign?.active) return "当前列表｜不会自动换关键词";
    const total = state.campaign.keywords?.length || 0;
    const index = Math.min((state.campaign.index || 0) + 1, total || 1);
    const keyword = keywordLabel(keywordFromCampaign());
    const scanned = Number(state.campaign.keywordScanned || 0);
    const limit = Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
    const totalTarget = total * limit;
    const totalScanned = Number(state.campaign.totalScanned ?? ((index - 1) * limit + scanned));
    return `多词任务 ${index}/${total}｜当前：${keyword}｜本词 ${scanned}/${limit}｜总进度 ${totalScanned}/${totalTarget}`;
  }

  function statusSummary(prefix = "") {
    const mode = state.campaign?.active
      ? "多词任务"
      : state.campaign?.paused
        ? "多词已暂停"
      : "当前列表";
    const progress = campaignProgressLabel();
    const stats = [
      `本次 ${state.scanned}`,
      `藏 ${state.favorited}`,
      `复 ${state.reviewed}`,
      `跳 ${state.skipped}`,
      `错 ${state.errors}`,
      `今日扫 ${state.daily.scanned}/${config.safety.dailyScanLimit || "不限"}`,
      `今日藏 ${state.daily.favorited}/${config.safety.dailyFavoriteLimit || "不限"}`,
      `表 ${state.records.length}`
    ].join("｜");
    return [prefix, `${mode}｜${progress}`, stats].filter(Boolean).join("\n");
  }

  function debugLog(event, data = {}) {
    const campaign = state.campaign || null;
    const entry = {
      time: new Date().toISOString(),
      event,
      url: location.href,
      running: state.running,
      mode: campaign?.active ? "task" : campaign?.paused ? "paused" : "current",
      keyword: campaign ? keywordLabel(keywordFromCampaign()) : currentQueryLabel(),
      campaign: campaign ? {
        active: Boolean(campaign.active),
        paused: Boolean(campaign.paused),
        index: Number(campaign.index || 0),
        total: Number(campaign.keywords?.length || 0),
        keywordScanned: Number(campaign.keywordScanned || 0),
        totalScanned: Number(campaign.totalScanned || 0),
        perKeywordMax: Number(campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX)
      } : null,
      counters: {
        scanned: state.scanned,
        favorited: state.favorited,
        reviewed: state.reviewed,
        skipped: state.skipped,
        errors: state.errors,
        dailyScanned: state.daily.scanned,
        dailyFavorited: state.daily.favorited,
        records: state.records.length
      },
      data
    };
    state.debugLogs.push(entry);
    state.debugLogs = state.debugLogs.slice(-400);
    saveDebugLogs();
  }

  function diagnosticsJson() {
    const configSnapshot = (() => {
      try {
        readPanelConfig();
        return configSchemaSnapshot();
      } catch (error) {
        return { error: String(error?.message || error) };
      }
    })();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      product: "BOSS岗位粗筛助手",
      ruleVersion: RULE_VERSION,
      url: location.href,
      userAgent: navigator.userAgent,
      status: statusSummary(),
      config: configSnapshot,
      campaign: state.campaign ? {
        active: Boolean(state.campaign.active),
        paused: Boolean(state.campaign.paused),
        index: Number(state.campaign.index || 0),
        keywords: state.campaign.keywords || [],
        keywordScanned: Number(state.campaign.keywordScanned || 0),
        totalScanned: Number(state.campaign.totalScanned || 0),
        perKeywordMax: Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX),
        startedAt: state.campaign.startedAt || null
      } : null,
      counters: {
        scanned: state.scanned,
        favorited: state.favorited,
        reviewed: state.reviewed,
        skipped: state.skipped,
        errors: state.errors,
        daily: state.daily
      },
      recentRuntimeLogs: state.debugLogs.slice(-160),
      recentJobLogs: state.logs.slice(0, 60),
      recentRecords: state.records.slice(-60)
    }, null, 2);
  }

  function progressPercent() {
    if (state.campaign?.active || state.campaign?.paused) {
      const total = Math.max(1, Number(state.campaign.keywords?.length || 1));
      const index = Math.min(Number(state.campaign.index || 0), total - 1);
      const limit = Math.max(1, Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX));
      const scanned = Math.min(limit, Number(state.campaign.keywordScanned || 0));
      return Math.min(100, Math.round(((index * limit + scanned) / (total * limit)) * 100));
    }
    const limit = Math.max(1, Number(config.maxJobs || 80));
    return Math.min(100, Math.round((state.scanned / limit) * 100));
  }

  async function waitWithCountdown(seconds, label) {
    const total = Math.max(0, Number(seconds || 0));
    for (let left = total; left > 0; left -= 1) {
      if (!state.running && !state.campaign?.active) break;
      updateStatus(statusSummary(`${label}，剩余 ${left} 秒`));
      await sleep(1000);
    }
  }

  function readCampaignConfig() {
    return {
      active: true,
      paused: false,
      keywords: parseSearchKeywords(),
      index: 0,
      perKeywordMax: Math.max(1, Number(document.querySelector("#baf-per-keyword")?.value || DEFAULT_PER_KEYWORD_MAX)),
      keywordScanned: 0,
      totalScanned: 0,
      restMinSec: Number(config.safety.pauseMinSec || 0),
      restMaxSec: Number(config.safety.pauseMaxSec || config.safety.pauseMinSec || 0),
      settings: panelSettingsSnapshot(),
      startedAt: Date.now()
    };
  }

  function sameKeywordList(a = [], b = []) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  function resumeOrCreateCampaign() {
    const next = readCampaignConfig();
    if (state.campaign?.paused && sameKeywordList(state.campaign.keywords || [], next.keywords || [])) {
      state.campaign = {
        ...state.campaign,
        active: true,
        paused: false,
        perKeywordMax: next.perKeywordMax,
        restMinSec: next.restMinSec,
        restMaxSec: next.restMaxSec,
        settings: next.settings
      };
      saveCampaign();
      return { resumed: true };
    }
    state.campaign = next;
    saveCampaign();
    return { resumed: false };
  }

  function keywordFromCampaign() {
    return state.campaign?.keywords?.[state.campaign.index] ?? currentSearchKeyword();
  }

  function navigateToKeyword(keyword) {
    const url = new URL(location.href);
    if (keyword) {
      url.searchParams.set("query", keyword);
    } else {
      url.searchParams.delete("query");
    }
    location.href = url.toString();
  }

  function randomRestMs() {
    const min = Number(state.campaign?.restMinSec || 0);
    const max = Number(state.campaign?.restMaxSec || min);
    const safeMax = Math.max(min, max);
    return (min + Math.random() * (safeMax - min)) * 1000;
  }

  function clearTimers() {
    if (state.autoTimer) {
      window.clearTimeout(state.autoTimer);
      state.autoTimer = null;
    }
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function moveToNextKeyword() {
    if (!state.campaign?.active) return false;
    const fromKeyword = keywordLabel(keywordFromCampaign());
    state.campaign.index += 1;
    state.campaign.keywordScanned = 0;
    if (state.campaign.index >= state.campaign.keywords.length) {
      state.campaign.active = false;
      state.campaign.paused = false;
      saveCampaign();
      debugLog("campaign_complete", { fromKeyword });
      showFeedbackPanel("多关键词任务已完成。");
      return false;
    }
    saveCampaign();
    const keyword = keywordFromCampaign();
    const rest = randomBetweenSec(KEYWORD_SWITCH_MIN_SEC, KEYWORD_SWITCH_MAX_SEC);
    let left = rest;
    clearTimers();
    debugLog("keyword_finished_waiting", { fromKeyword, nextKeyword: keywordLabel(keyword), restSec: rest });
    updateStatus(statusSummary(`本关键词完成，${left} 秒后切换到：${keywordLabel(keyword)}`));
    state.countdownTimer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (state.countdownTimer) {
          window.clearInterval(state.countdownTimer);
          state.countdownTimer = null;
        }
        debugLog("navigate_next_keyword", { keyword: keywordLabel(keyword) });
        navigateToKeyword(keyword);
        return;
      }
      updateStatus(statusSummary(`本关键词完成，${left} 秒后切换到：${keywordLabel(keyword)}`));
    }, 1000);
    return true;
  }

  function seedProcessedFromRecords() {
    if (!config.filters.skipRecorded) return;
    const before = state.processed.size;
    for (const record of state.records) {
      const status = `${record.result || ""} ${record.processingStatus || ""} ${record.recommendedAction || ""}`;
      const shouldSkip =
        /已排除|已收藏|用户不想看/.test(status) ||
        /跳过/.test(status);
      if (record.href && shouldSkip) state.processed.add(record.href);
    }
    const added = state.processed.size - before;
    if (added > 0) updateStatus(`已载入 ${added} 条明确结果岗位，启动后会跳过；待复核会重新判断。`);
  }

  function hydratePanelFromCampaign() {
    if (!state.campaign?.active && !state.campaign?.paused) return;
    applySavedPanelSettings(state.campaign.settings);
    setPanelValue("#baf-threshold", config.threshold);
    setPanelValue("#baf-max", config.maxJobs);
    setPanelValue("#baf-job-nature", jobNatureDisplayValue(config.filters.jobNature));
    setPanelValue("#baf-target-keywords", (config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"));
    setPanelValue("#baf-salary-min", config.filters.salaryMin);
    setPanelValue("#baf-salary-max", config.filters.salaryMax);
    setPanelValue("#baf-keywords", state.campaign.settings?.search?.keywords || (state.campaign.keywords || []).filter(Boolean).join("\n"));
    setPanelValue("#baf-per-keyword", state.campaign.perKeywordMax);
    setPanelValue("#baf-daily-scan-limit", config.safety.dailyScanLimit);
    setPanelValue("#baf-daily-favorite-limit", config.safety.dailyFavoriteLimit);
    setPanelValue("#baf-pause-every", config.safety.pauseEvery);
    setPanelValue("#baf-pause-min", config.safety.pauseMinSec);
    setPanelValue("#baf-pause-max", config.safety.pauseMaxSec);
    setPanelValue("#baf-ai-provider", state.aiSettings.provider || "deepseek");
    setPanelValue("#baf-ai-key", state.aiSettings.apiKey);
    setPanelValue("#baf-ai-model", state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model);
    setPanelValue("#baf-positive", (config.filters.customPositive || []).join("\n"));
    setPanelValue("#baf-negative", (config.filters.customNegative || []).join("\n"));
    setPanelChecked("#baf-include-blank", (state.campaign.keywords || []).includes(""));
    setPanelChecked("#baf-expand-keywords", state.campaign.settings?.search?.expandKeywords ?? true);
    setPanelChecked("#baf-skip-recorded", config.filters.skipRecorded);
  }

  function makeDraggable(panel) {
    const title = panel.querySelector(".baf-title");
    const clampPanelPosition = () => {
      const r = panel.getBoundingClientRect();
      const nextLeft = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - panel.offsetWidth - 8));
      const nextTop = Math.min(Math.max(8, r.top), Math.max(8, window.innerHeight - panel.offsetHeight - 8));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left: nextLeft, top: nextTop }));
    };
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(PANEL_POS_KEY) || "null"); } catch (_) { return null; }
    })();
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      panel.style.left = `${saved.left}px`;
      panel.style.top = `${saved.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      requestAnimationFrame(clampPanelPosition);
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    title.addEventListener("mousedown", e => {
      dragging = true;
      const r = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = r.left;
      startTop = r.top;
      panel.style.left = `${r.left}px`;
      panel.style.top = `${r.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const nextLeft = Math.min(Math.max(8, startLeft + e.clientX - startX), window.innerWidth - panel.offsetWidth - 8);
      const nextTop = Math.min(Math.max(8, startTop + e.clientY - startY), window.innerHeight - panel.offsetHeight - 8);
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      clampPanelPosition();
    });
    window.addEventListener("resize", clampPanelPosition);
  }

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "boss-ai-autofav-panel";
    panel.innerHTML = `
      <div class="baf-title">
        <div class="baf-title-main">
          <strong>BOSS岗位粗筛助手</strong>
          <span>v${EXTENSION_VERSION} / ${RULE_VERSION}</span>
        </div>
        <button id="baf-toggle" type="button">收起</button>
      </div>
      <div class="baf-status-card">
        <div id="baf-status" class="baf-status-line">待启动</div>
        <div class="baf-progress"><span id="baf-progress-fill"></span></div>
      </div>
      <div class="baf-body">
        <div class="baf-section baf-primary-section">
          <div class="baf-section-head">
            <div>
              <div class="baf-section-title">我要找什么岗位</div>
              <div class="baf-hint">先卡岗位性质，再卡目标方向。两者都过了才会考虑收藏。</div>
            </div>
            <button id="baf-generate-profile" type="button" class="baf-mini-primary">生成搜索词</button>
          </div>
          <div class="baf-grid">
            <label>岗位性质<input id="baf-job-nature" class="baf-full-input" value="${escapeAttr(jobNatureDisplayValue(config.filters.jobNature))}" placeholder="销售 / 运营 / 客户成功 / 产品" /></label>
            <label>目标方向<input id="baf-target-keywords" class="baf-full-input" value="${escapeAttr((config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"))}" placeholder="AI客服 / 跨境电商 / 教育SaaS" /></label>
          </div>
          <div class="baf-salary-row">
            <label>薪资<input id="baf-salary-min" placeholder="最低" /></label>
            <span>-</span>
            <input id="baf-salary-max" placeholder="最高" />
            <span>K</span>
            <label><input id="baf-skip-recorded" type="checkbox" checked />跳过已扫</label>
          </div>
          <div class="baf-hint baf-block-hint">目标方向尽量写到行业、产品或场景。只写“互联网”“软件”会很宽。</div>
          <details class="baf-config-preview">
            <summary>本次扫描确认</summary>
            <pre id="baf-config-summary"></pre>
            <div class="baf-field baf-preview-actions">
              <button id="baf-copy-config" type="button" class="baf-muted">复制配置</button>
              <span class="baf-hint">用于备份当前筛选设置，排查问题时再复制。</span>
            </div>
          </details>
        </div>

        <div class="baf-section">
          <div class="baf-section-title">怎么扫</div>
          <div class="baf-segments" role="group" aria-label="扫描模式">
            <button id="baf-mode-current" type="button" class="baf-segment active">当前列表</button>
            <button id="baf-mode-task" type="button" class="baf-segment">多关键词</button>
          </div>
          <div class="baf-hint baf-block-hint">搜索词在上面生成；这里负责选择扫描方式和手动删改搜索词。</div>
          <label class="baf-keywords-label">搜索词</label>
          <textarea id="baf-keywords" placeholder="每行一个关键词，也可以用逗号隔开，如：AI客服销售, 跨境电商运营, SaaS客户成功">${currentSearchKeyword()}</textarea>
          <div id="baf-keyword-note" class="baf-note"></div>
          <div class="baf-hint baf-block-hint">多关键词模式才会自动切换搜索词；当前列表模式只扫当前页面。</div>
          <div class="baf-field">
            <label><input id="baf-include-blank" type="checkbox" checked />先扫推荐流</label>
            <label><input id="baf-expand-keywords" type="checkbox" checked />自动扩展关键词</label>
            <label>每词</label>
            <input id="baf-per-keyword" value="${DEFAULT_PER_KEYWORD_MAX}" />
          </div>
        </div>

        <div class="baf-section baf-threshold-section">
          <div class="baf-threshold-row">
            <span class="baf-section-title baf-inline-title">收藏标准</span>
            <div class="baf-segments baf-threshold-segments" role="group" aria-label="收藏标准">
              <button type="button" class="baf-threshold-mode" data-threshold="55">宽松</button>
              <button type="button" class="baf-threshold-mode active" data-threshold="60">标准</button>
              <button type="button" class="baf-threshold-mode" data-threshold="70">严格</button>
            </div>
            <label class="baf-score-inline">收藏分<input id="baf-threshold" value="${config.threshold}" /></label>
          </div>
        </div>

        <details class="baf-section baf-advanced">
          <summary>高级规则</summary>
          <div class="baf-ai-box">
            <div class="baf-section-title">AI 生成</div>
            <div class="baf-field">
              <label>服务商</label>
              <select id="baf-ai-provider" class="baf-ai-provider">${Object.entries(AI_PROVIDERS).map(([key, item]) => `<option value="${key}" ${key === (state.aiSettings.provider || "deepseek") ? "selected" : ""}>${item.label}</option>`).join("")}</select>
              <label>API Key</label>
              <input id="baf-ai-key" class="baf-ai-key" type="password" placeholder="填对应服务商的 Key" />
              <label>模型</label>
              <input id="baf-ai-model" class="baf-ai-model" value="${escapeAttr(state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model)}" />
            </div>
            <div class="baf-hint">支持 DeepSeek、通义千问、智谱 GLM、Kimi、硅基流动。填对应服务商的 Key 后，生成搜索词和规则会优先用 AI；生成后仍建议手动删减。</div>
          </div>
          <div class="baf-field">
            <label>当前列表最多扫</label>
            <input id="baf-max" value="${config.maxJobs}" />
            <label>今日最多扫</label>
            <input id="baf-daily-scan-limit" value="${config.safety.dailyScanLimit}" />
            <label>今日最多藏</label>
            <input id="baf-daily-favorite-limit" value="${config.safety.dailyFavoriteLimit}" />
          </div>
          <div class="baf-field">
            <label>每扫</label>
            <input id="baf-pause-every" value="${config.safety.pauseEvery}" />
            <span>个休息</span>
            <input id="baf-pause-min" value="${config.safety.pauseMinSec}" />
            <span>-</span>
            <input id="baf-pause-max" value="${config.safety.pauseMaxSec}" />
            <span>秒</span>
          </div>
          <div class="baf-field">
            <button id="baf-generate-rules" type="button" class="baf-muted">生成加分词/排除词</button>
            <span class="baf-hint">先优化搜索词，再生成少量加分词和排除词。</span>
          </div>
          <div class="baf-textareas">
            <label>正向词<textarea id="baf-positive" placeholder="每行一个，如：AI客服&#10;客户成功&#10;Agent"></textarea></label>
            <label>反向词<textarea id="baf-negative" placeholder="每行一个，如：保险&#10;贷款&#10;营业员&#10;招生&#10;课程销售"></textarea></label>
          </div>
          <div id="baf-rules-note" class="baf-note"></div>
        </details>

        <div class="baf-section baf-recent">
          <div class="baf-section-title">最近判断</div>
          <div id="baf-log"></div>
        </div>
        <div class="baf-section baf-boundary">
          <div class="baf-section-title">使用边界</div>
          <div class="baf-hint">第一版只做岗位粗筛、收藏、记录和复核；不自动打招呼、不自动投递、不读取聊天。遇到验证、登录异常或账号提示，立即停止。</div>
        </div>
      </div>
      <div class="baf-actions">
        <button id="baf-start" class="baf-secondary">开始扫描</button>
        <button id="baf-stop" class="baf-warn">暂停</button>
        <button id="baf-table" class="baf-blue">复制表格</button>
        <button id="baf-json" class="baf-blue">复制JSON</button>
        <button id="baf-debug" class="baf-muted">复制诊断</button>
        <button id="baf-clear" class="baf-muted">清空表</button>
      </div>
      <div id="baf-feedback" class="baf-feedback">
        <div class="baf-section-title">本次筛选反馈</div>
        <div class="baf-field">
          <button id="baf-feedback-wide" type="button">收藏太宽了</button>
          <button id="baf-feedback-narrow" type="button">漏掉好岗位</button>
        </div>
        <div class="baf-feedback-grid">
          <label>这个词我想多看<textarea id="baf-more-words" placeholder="如：客户成功、售前解决方案、AI客服实施"></textarea></label>
          <label>这个词我不想看<textarea id="baf-less-words" placeholder="如：金融、课程、短剧、单休"></textarea></label>
        </div>
        <div class="baf-field">
          <button id="baf-apply-feedback" type="button">应用反馈到规则</button>
          <span class="baf-hint">会更新正向词、反向词、搜索词和收藏分</span>
        </div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #boss-ai-autofav-panel {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: 520px;
        max-height: 84vh;
        z-index: 2147483647;
        background: #ffffff;
        color: #111827;
        border: 1px solid #d8dee8;
        border-radius: 12px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, .18);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      #boss-ai-autofav-panel.baf-collapsed {
        width: 390px;
        max-height: none;
      }
      #boss-ai-autofav-panel.baf-collapsed .baf-body,
      #boss-ai-autofav-panel.baf-collapsed .baf-actions,
      #boss-ai-autofav-panel.baf-collapsed .baf-feedback {
        display: none !important;
      }
      #boss-ai-autofav-panel.baf-collapsed .baf-status-card {
        display: block;
        max-height: 132px;
        border-bottom: 0;
      }
      #boss-ai-autofav-panel .baf-title {
        padding: 10px 12px;
        background: #0f766e;
        color: #ffffff;
        cursor: move;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      #boss-ai-autofav-panel .baf-title-main {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      #boss-ai-autofav-panel .baf-title-main strong {
        font-size: 14px;
        line-height: 1.2;
      }
      #boss-ai-autofav-panel .baf-title span {
        color: #ccfbf1;
        font-weight: 500;
        font-size: 12px;
      }
      #boss-ai-autofav-panel #baf-toggle {
        flex: 0 0 auto;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.45);
        background: rgba(255,255,255,.12);
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      #boss-ai-autofav-panel .baf-actions {
        display: flex;
        gap: 7px;
        align-items: center;
      }
      #boss-ai-autofav-panel .baf-actions {
        flex: 0 0 auto;
        padding: 9px 10px;
        border-top: 1px solid #e5e7eb;
        background: #f8fafc;
        flex-wrap: wrap;
        box-shadow: 0 -8px 22px rgba(15, 23, 42, .06);
      }
      #boss-ai-autofav-panel .baf-body {
        padding: 10px;
        overflow: auto;
        flex: 1 1 auto;
        min-height: 160px;
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-section {
        padding: 10px;
        margin-bottom: 9px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      #boss-ai-autofav-panel .baf-section-title {
        font-weight: 700;
        color: #0f766e;
        margin-bottom: 8px;
        font-size: 13px;
      }
      #boss-ai-autofav-panel .baf-section-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 9px;
      }
      #boss-ai-autofav-panel .baf-primary-section {
        border-color: #99f6e4;
        box-shadow: 0 0 0 1px rgba(20, 184, 166, .08);
      }
      #boss-ai-autofav-panel .baf-grid {
        display: grid;
        grid-template-columns: 1fr 1.35fr;
        gap: 8px;
        align-items: end;
      }
      #boss-ai-autofav-panel .baf-grid label {
        color: #374151;
        font-weight: 700;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      #boss-ai-autofav-panel input {
        width: 58px;
        padding: 6px 7px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        outline: none;
      }
      #boss-ai-autofav-panel input:focus,
      #boss-ai-autofav-panel textarea:focus {
        border-color: #14b8a6;
        box-shadow: 0 0 0 3px rgba(20, 184, 166, .14);
      }
      #boss-ai-autofav-panel .baf-nature-input {
        width: 142px;
      }
      #boss-ai-autofav-panel .baf-target-input {
        width: 190px;
      }
      #boss-ai-autofav-panel .baf-full-input {
        width: 100%;
        box-sizing: border-box;
      }
      #boss-ai-autofav-panel .baf-field {
        display: flex;
        gap: 7px;
        align-items: center;
        margin-bottom: 7px;
        flex-wrap: wrap;
      }
      #boss-ai-autofav-panel .baf-field label {
        color: #374151;
        font-weight: 600;
      }
      #boss-ai-autofav-panel .baf-salary-row {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 8px 0 4px;
        flex-wrap: wrap;
      }
      #boss-ai-autofav-panel .baf-salary-row label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-salary-row input {
        width: 64px;
      }
      #boss-ai-autofav-panel .baf-threshold-section {
        padding: 8px 10px;
      }
      #boss-ai-autofav-panel .baf-threshold-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px;
        align-items: center;
      }
      #boss-ai-autofav-panel .baf-inline-title {
        margin: 0;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-threshold-segments {
        margin: 0;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      #boss-ai-autofav-panel .baf-score-inline {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        font-weight: 700;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-score-inline input {
        width: 48px;
      }
      #boss-ai-autofav-panel .baf-hint {
        color: #6b7280;
        font-size: 12px;
      }
      #boss-ai-autofav-panel .baf-note {
        display: none;
        margin: 6px 0 8px;
        padding: 7px 8px;
        border-radius: 8px;
        background: #fefce8;
        border: 1px solid #fde68a;
        color: #854d0e;
        font-size: 12px;
        white-space: pre-line;
      }
      #boss-ai-autofav-panel .baf-config-preview {
        margin-top: 8px;
        border: 1px solid #dbeafe;
        border-radius: 9px;
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-config-preview summary {
        padding: 7px 8px;
        cursor: pointer;
        color: #0f766e;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-config-preview pre {
        margin: 0;
        padding: 0 8px 8px;
        color: #475569;
        white-space: pre-line;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #boss-ai-autofav-panel .baf-preview-actions {
        padding: 0 8px 8px;
        margin-bottom: 0;
      }
      #boss-ai-autofav-panel .baf-ai-box {
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
      }
      #boss-ai-autofav-panel input.baf-ai-key {
        width: 185px;
      }
      #boss-ai-autofav-panel select.baf-ai-provider {
        width: 150px;
      }
      #boss-ai-autofav-panel input.baf-ai-model {
        width: 135px;
      }
      #boss-ai-autofav-panel .baf-boundary {
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-block-hint {
        margin: -2px 0 8px;
      }
      #boss-ai-autofav-panel .baf-top-gap {
        margin-top: 9px;
      }
      #boss-ai-autofav-panel .baf-segments {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-segments button {
        background: #eef2f7;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      #boss-ai-autofav-panel .baf-segments button.active {
        background: #0f766e;
        color: #ffffff;
        border-color: #0f766e;
      }
      #boss-ai-autofav-panel .baf-keywords-label {
        display: block;
        margin: 2px 0 3px;
        color: #334155;
        font-weight: 700;
        font-size: 12px;
      }
      #boss-ai-autofav-panel input[type="checkbox"] {
        width: auto;
        padding: 0;
      }
      #boss-ai-autofav-panel .baf-textareas {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #boss-ai-autofav-panel textarea {
        width: 100%;
        height: 56px;
        margin-top: 4px;
        box-sizing: border-box;
        resize: vertical;
        padding: 7px 8px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        font: inherit;
        outline: none;
      }
      #boss-ai-autofav-panel textarea:disabled {
        background: #f1f5f9;
        color: #94a3b8;
        cursor: not-allowed;
      }
      #boss-ai-autofav-panel #baf-keywords {
        height: 58px;
        margin: 5px 0 8px;
      }
      #boss-ai-autofav-panel button {
        padding: 7px 10px;
        border-radius: 8px;
        border: 0;
        cursor: pointer;
        background: #e5e7eb;
        color: #111827;
        font-weight: 700;
        font-size: 12px;
      }
      #boss-ai-autofav-panel button:hover {
        filter: brightness(.96);
      }
      #boss-ai-autofav-panel button.baf-primary { background: #0f766e; color: #ffffff; }
      #boss-ai-autofav-panel button.baf-secondary { background: #e0f2fe; color: #075985; }
      #boss-ai-autofav-panel button.baf-warn { background: #f97316; color: #fff; }
      #boss-ai-autofav-panel button.baf-blue { background: #2563eb; color: #fff; }
      #boss-ai-autofav-panel button.baf-muted { background: #e5e7eb; color: #374151; }
      #boss-ai-autofav-panel button.baf-mini-primary {
        background: #ecfeff;
        color: #0f766e;
        border: 1px solid #99f6e4;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-status-card {
        padding: 6px 10px 7px;
        color: #334155;
        background: #ecfeff;
        border-bottom: 1px solid #ccfbf1;
        flex: 0 0 auto;
        max-height: 86px;
        overflow: hidden;
        white-space: pre-line;
        font-size: 12px;
        line-height: 1.28;
      }
      #boss-ai-autofav-panel .baf-progress {
        height: 4px;
        margin-top: 5px;
        border-radius: 999px;
        background: #cffafe;
        overflow: hidden;
      }
      #boss-ai-autofav-panel .baf-progress span {
        display: block;
        height: 100%;
        width: 0%;
        background: #0f766e;
        transition: width .25s ease;
      }
      #baf-log {
        padding: 0;
        max-height: 188px;
        overflow: auto;
        background: #ffffff;
      }
      #boss-ai-autofav-panel .baf-advanced {
        padding: 0;
      }
      #boss-ai-autofav-panel .baf-advanced summary {
        padding: 10px;
        cursor: pointer;
        font-weight: 700;
        color: #0f766e;
      }
      #boss-ai-autofav-panel .baf-advanced[open] {
        padding: 0 10px 10px;
      }
      #boss-ai-autofav-panel .baf-advanced[open] summary {
        padding: 10px 0 0;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-feedback {
        display: none;
        flex: 0 0 auto;
        padding: 9px 10px;
        border-bottom: 1px solid #e5e7eb;
        background: #fffbeb;
      }
      #boss-ai-autofav-panel .baf-feedback-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-feedback textarea {
        height: 44px;
      }
      #boss-ai-autofav-panel .baf-feedback button {
        background: #f59e0b;
        color: #ffffff;
      }
      #boss-ai-autofav-panel .baf-feedback button#baf-apply-feedback {
        background: #2563eb;
        color: #fff;
      }
      .baf-item {
        border-bottom: 1px solid #e5e7eb;
        padding: 7px 0;
      }
      .baf-action { font-weight: 700; }
      .baf-action.favorite { color: #0f766e; }
      .baf-action.review { color: #d97706; }
      .baf-action.exclude { color: #64748b; }
      .baf-action.skip { color: #dc2626; }
      .baf-small { color: #64748b; font-size: 12px; }
    `;
    document.body.appendChild(style);
    document.body.appendChild(panel);
    makeDraggable(panel);
    const toggleButton = panel.querySelector("#baf-toggle");
    const applyCollapsed = collapsed => {
      panel.classList.toggle("baf-collapsed", collapsed);
      if (toggleButton) toggleButton.textContent = collapsed ? "展开" : "收起";
      localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
    };
    applyCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === "1");
    toggleButton?.addEventListener("mousedown", event => {
      event.stopPropagation();
    });
    toggleButton?.addEventListener("click", event => {
      event.stopPropagation();
      applyCollapsed(!panel.classList.contains("baf-collapsed"));
    });
    if (state.campaign?.active) {
      hydratePanelFromCampaign();
    } else if (state.campaign?.paused) {
      hydratePanelFromCampaign();
    } else {
      hydratePanelFromSettings(state.settings);
    }
    panel.addEventListener("input", event => {
      if (event.target.closest(".baf-feedback")) return;
      schedulePanelSettingsSave();
    });
    panel.addEventListener("change", event => {
      if (event.target.closest(".baf-feedback")) return;
      if (event.target.id === "baf-ai-provider") {
        const provider = event.target.value;
        const modelInput = panel.querySelector("#baf-ai-model");
        if (modelInput && AI_PROVIDERS[provider]) modelInput.value = AI_PROVIDERS[provider].model;
      }
      schedulePanelSettingsSave();
    });

    const setScanMode = mode => {
      panel.dataset.scanMode = mode;
      panel.querySelector("#baf-mode-current")?.classList.toggle("active", mode === "current");
      panel.querySelector("#baf-mode-task")?.classList.toggle("active", mode === "task");
      const keywords = panel.querySelector("#baf-keywords");
      if (keywords) keywords.disabled = mode === "current";
      const startButton = panel.querySelector("#baf-start");
      if (startButton) {
        startButton.textContent = mode === "task" ? "启动/继续多词" : "开始扫描";
        startButton.classList.toggle("baf-primary", mode === "task");
        startButton.classList.toggle("baf-secondary", mode !== "task");
      }
    };
    const setThresholdMode = value => {
      const threshold = Number(value || 60);
      setPanelValue("#baf-threshold", threshold);
      panel.querySelectorAll(".baf-threshold-mode").forEach(button => {
        button.classList.toggle("active", Number(button.dataset.threshold) === threshold);
      });
      readPanelConfig();
    };
    panel.querySelector("#baf-mode-current")?.addEventListener("click", () => setScanMode("current"));
    panel.querySelector("#baf-mode-task")?.addEventListener("click", () => setScanMode("task"));
    panel.querySelectorAll(".baf-threshold-mode").forEach(button => {
      button.addEventListener("click", () => setThresholdMode(button.dataset.threshold));
    });
    panel.querySelector("#baf-generate-profile")?.addEventListener("click", async () => {
      readPanelConfig();
      const issue = targetDirectionIssue();
      if (issue === "未填写目标方向") {
        setNote("#baf-keyword-note", "先填写目标方向，比如：AI客服、跨境电商、教育SaaS。");
        updateStatus(statusSummary("缺少目标方向，暂时不能生成配置。"));
        return;
      }
      setThresholdMode(60);
      await generateSearchKeywordsFromProfile();
      setScanMode("task");
      readPanelConfig();
      if (issue === "目标方向太泛") {
        setNote("#baf-keyword-note", "已生成搜索词，但目标方向太泛。建议先手动删掉太宽的词，再点“生成加分词/排除词”。");
      }
      updateStatus(statusSummary(issue === "目标方向太泛" ? "目标方向太泛，先优化搜索词。" : "已生成搜索词，先手动优化后再生成规则。"));
    });
    setScanMode((state.campaign?.active || state.campaign?.paused) ? "task" : "current");
    setThresholdMode(config.threshold);
    panel.querySelector("#baf-start").addEventListener("click", () => {
      const mode = panel.dataset.scanMode || "current";
      debugLog("start_click", { mode });
      start({ campaignMode: mode === "task" });
    });
    panel.querySelector("#baf-stop").addEventListener("click", () => {
      debugLog("stop_click");
      state.running = false;
      clearTimers();
      if (state.campaign?.active || state.campaign?.paused) {
        state.campaign.active = false;
        state.campaign.paused = true;
        saveCampaign();
      }
      updateStatus(statusSummary("正在暂停，当前岗位处理完成后停下。"));
    });
    panel.querySelector("#baf-copy")?.addEventListener("click", async () => {
      const text = JSON.stringify(state.logs.slice().reverse(), null, 2);
      await navigator.clipboard.writeText(text);
      updateStatus("日志已复制。");
    });
    panel.querySelector("#baf-table").addEventListener("click", async () => {
      await navigator.clipboard.writeText(tableText());
      updateStatus(`表格已复制，共 ${state.records.length} 条。可直接粘贴到飞书表格/Excel。`);
    });
    panel.querySelector("#baf-json").addEventListener("click", async () => {
      await navigator.clipboard.writeText(recordsJson());
      updateStatus(`JSON已复制，共 ${state.records.length} 条。后续可交给智能体精筛。`);
    });
    panel.querySelector("#baf-debug").addEventListener("click", async () => {
      debugLog("diagnostics_copy");
      await navigator.clipboard.writeText(diagnosticsJson());
      updateStatus(statusSummary(`诊断日志已复制，共 ${state.debugLogs.length} 条。`));
    });
    panel.querySelector("#baf-copy-config")?.addEventListener("click", async () => {
      readPanelConfig();
      await navigator.clipboard.writeText(JSON.stringify(configSchemaSnapshot(), null, 2));
      updateStatus(statusSummary("当前配置已复制。"));
    });
    panel.querySelector("#baf-clear").addEventListener("click", () => {
      if (!window.confirm("确认清空已保存的岗位表格记录？")) return;
      state.records = [];
      saveRecords();
      updatePanel();
      updateStatus("表格记录已清空。");
    });
    panel.querySelector("#baf-feedback-wide").addEventListener("click", () => {
      const next = adjustThreshold(5);
      updateStatus(statusSummary(`已提高收藏分到 ${next}，下次会更严格。`));
    });
    panel.querySelector("#baf-feedback-narrow").addEventListener("click", () => {
      const next = adjustThreshold(-5);
      updateStatus(statusSummary(`已降低收藏分到 ${next}，下次会更宽松。`));
    });
    panel.querySelector("#baf-apply-feedback").addEventListener("click", applyFeedbackWords);
    panel.querySelector("#baf-generate-rules").addEventListener("click", async () => {
      await generateRulesFromPanelKeywords();
    });
    updateConfigSummary();
  }

  function updateStatus(text) {
    const el = document.querySelector("#baf-status");
    if (el) el.textContent = text;
    const fill = document.querySelector("#baf-progress-fill");
    if (fill) fill.style.width = `${progressPercent()}%`;
  }

  function mergeTextareaWords(selector, words) {
    const el = document.querySelector(selector);
    if (!el) return;
    const merged = parseKeywordList(`${el.value || ""}\n${(words || []).join("\n")}`);
    el.value = merged.join("\n");
  }

  function setNote(selector, text) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
  }

  function resetRulesForNewProfile() {
    setPanelValue("#baf-positive", "");
    setPanelValue("#baf-negative", "");
    config.filters.customPositive = [];
    config.filters.customNegative = [];
    state.aiStrategy = null;
    saveAiStrategy();
    updateConfigSummary();
  }

  function profileNotePrefix() {
    const profile = keywordProfileFromPanel();
    const targetPreview = profile.targets.slice(0, 5).join("、") || "不限";
    return `${profile.natureText || "不限"} + ${targetPreview}`;
  }

  function parseAiJson(content) {
    const raw = String(content || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(raw);
    } catch (_) {
      const objectStart = raw.indexOf("{");
      const objectEnd = raw.lastIndexOf("}");
      if (objectStart >= 0 && objectEnd > objectStart) {
        return JSON.parse(raw.slice(objectStart, objectEnd + 1));
      }
      throw new Error("AI 没有返回可解析的 JSON");
    }
  }

  function aiConfigured() {
    return Boolean(String(document.querySelector("#baf-ai-key")?.value || state.aiSettings.apiKey || "").trim());
  }

  function currentAiProviderLabel() {
    return AI_PROVIDERS[state.aiSettings.provider]?.label || state.aiSettings.provider || "AI";
  }

  function callAiProvider(messages, maxTokens = 1400) {
    readPanelConfig();
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        reject(new Error("当前扩展环境不支持后台请求"));
        return;
      }
      chrome.runtime.sendMessage({
        type: "ai-chat",
        provider: state.aiSettings.provider || "deepseek",
        apiKey: state.aiSettings.apiKey,
        model: state.aiSettings.model || AI_PROVIDERS[state.aiSettings.provider]?.model || AI_PROVIDERS.deepseek.model,
        messages,
        maxTokens
      }, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || `${currentAiProviderLabel()} 调用失败`));
          return;
        }
        resolve(response.content);
      });
    });
  }

  function aiProfilePayload() {
    const profile = keywordProfileFromPanel();
    const currentKeywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const screeningStrategy = screeningStrategySnapshot();
    return {
      jobNature: profile.natureText || config.filters.jobNature || "不限",
      normalizedNature: profile.nature,
      targetDirections: profile.targets,
      screeningStrategy,
      configSummary: configSummaryText(),
      salary: {
        minK: document.querySelector("#baf-salary-min")?.value || "",
        maxK: document.querySelector("#baf-salary-max")?.value || ""
      },
      currentSearchKeywords: currentKeywords,
      likedWords: state.userPrefs.likedWords || [],
      dislikedWords: state.userPrefs.dislikedWords || []
    };
  }

  function sanitizeAiWords(words, limit = 40) {
    return [...new Set((words || [])
      .map(word => norm(String(word || "")))
      .filter(word => word && word.length <= 28 && !/[。！？]/.test(word)))]
      .slice(0, limit);
  }

  function sanitizePositiveWordsByNature(words, limit = 60) {
    const nature = resolveJobNature(config.filters.jobNature || "");
    const businessMarkers = ["销售", "商务", "BD", "bd", "客户", "大客户", "渠道", "经理", "顾问", "售前", "解决方案", "方案", "项目"];
    const techOnlyMarkers = ["编程", "调试", "算法", "开发", "研发", "测试", "运维", "训练", "标注"];
    return sanitizeAiWords(words, limit).filter(word => {
      if (nature === "tech") return true;
      const hasTechOnly = techOnlyMarkers.some(marker => word.includes(marker));
      if (!hasTechOnly) return true;
      return businessMarkers.some(marker => word.includes(marker));
    });
  }

  function sanitizeAiTextList(words, limit = 20) {
    return [...new Set((words || [])
      .map(word => norm(String(word || "")))
      .filter(Boolean))]
      .slice(0, limit);
  }

  function normalizeAiScreeningStrategy(parsed) {
    const source = parsed?.screening_strategy || {};
    const local = screeningStrategySnapshot();
    return {
      target: local.target,
      mustHave: sanitizeAiTextList(source.must_have || source.mustHave || local.mustHave, 8),
      acceptable: sanitizeAiTextList(source.acceptable || local.acceptable, 8),
      reviewOnly: sanitizeAiTextList(source.review_only || source.reviewOnly || local.reviewOnly, 8),
      directExclude: filterConflictingNegativeWords(sanitizeAiWords(source.direct_exclude || source.directExclude || local.directExclude, RULE_SEED_LIMIT)),
      positiveReference: sanitizePositiveWordsByNature(source.positive_reference || source.positiveReference || local.positiveReference, RULE_SEED_LIMIT),
      scoring: {
        favoriteScore: Number(source.scoring?.favorite_score || source.scoring?.favoriteScore || config.threshold || 60),
        reviewScore: Number(source.scoring?.review_score || source.scoring?.reviewScore || REVIEW_THRESHOLD),
        excludeBelow: Number(source.scoring?.exclude_below || source.scoring?.excludeBelow || REVIEW_THRESHOLD),
        broadTargetPolicy: norm(source.scoring?.broad_target_policy || source.scoring?.broadTargetPolicy || local.scoring.broadTargetPolicy)
      },
      salary: local.salary,
      safety: local.safety,
      boundary: local.boundary,
      generatedBy: state.aiSettings.provider || "ai"
    };
  }

  function buildAiSummaryText(parsed, strategy) {
    const directions = strategy.target.directions.slice(0, 6).join("、") || "未填写";
    const positive = strategy.positiveReference.slice(0, RULE_SEED_LIMIT).join("、") || "按岗位性质和目标方向自动加分";
    const avoidWords = strategy.directExclude.slice(0, RULE_SEED_LIMIT).join("、") || "未填写本次避开词";
    return [
      `当前目标：${strategy.target.jobNature} + ${directions}`,
      `${currentAiProviderLabel()} 已生成规则，已做目标方向冲突清洗。`,
      `开始前确认：搜索词、加分词、排除词没有跑偏或互相冲突。`,
      `本次避开：${avoidWords}`,
      `说明：这些词只服务于当前方向，不是所有用户的通用排除项。`,
      `安全边界：只做粗筛、收藏和记录；不打招呼、不投递、不读聊天。`,
      ``,
      `详细规则：必须匹配${strategy.target.jobNature}岗位，并命中${directions}方向。收藏标准按上方宽松/标准/严格按钮执行。`,
      `加分参考：${positive}`,
      `今日上限：最多扫${strategy.safety.dailyScanLimit || "不限"}，最多藏${strategy.safety.dailyFavoriteLimit || "不限"}，每扫${strategy.safety.pauseEvery}个休息${strategy.safety.pauseRangeSec[0]}-${strategy.safety.pauseRangeSec[1]}秒。`
    ].join("\n");
  }

  function applyAiStrategy(parsed) {
    const strategy = normalizeAiScreeningStrategy(parsed);
    state.aiStrategy = {
      ruleVersion: RULE_VERSION,
      profileKey: strategyProfileKey(),
      createdAt: new Date().toISOString(),
      strategy,
      summaryText: buildAiSummaryText(parsed, strategy)
    };
    saveAiStrategy();
    updateConfigSummary();
  }

  async function generateSearchKeywordsWithAi() {
    if (!aiConfigured()) return null;
    const payload = aiProfilePayload();
    const messages = [
      {
        role: "system",
        content: [
          "你是招聘网站搜索标题词专家，服务对象是普通求职者。",
          "本任务只负责生成“搜索标题词”，目标是覆盖 HR 在 BOSS 直聘里真实会写的岗位标题和相邻叫法，不负责生成正向词/反向词。",
          "只输出严格 JSON，不要解释。",
          "必须先在 JSON 的 analysis 字段里做简短判断：岗位性质是什么、目标方向对应哪些产品/行业/场景、HR 可能怎么写标题、哪些相邻标题值得搜。",
          "搜索词规则：数量 12-18 个；必须是可直接放进 BOSS 搜索框的岗位标题关键词；按优先级排序；不要只机械拼“目标方向 + 岗位性质”。",
          "搜索词要覆盖 3 类：1. 用户直写目标词 + 岗位性质；2. HR 常见同义标题；3. 目标方向的相邻产品或行业叫法。",
          "例子：岗位性质=销售，目标方向=ai应用时，除 ai应用销售 外，还应联想到 Agent销售、智能体销售、AI软件销售、AI SaaS销售、AI解决方案销售、AI产品销售、大模型销售、AIGC销售、智能客服销售、AI知识库销售。",
          "例子：岗位性质=运营，目标方向=ai教育时，可生成 ai教育运营、ai教育客户运营、ai教育用户运营、ai教育增长运营、ai教育平台运营、ai教育产品运营等，但不要生成 AI应用销售。",
          "禁止输出 ai、互联网、软件、企业服务、运营、销售 这类过泛单词；禁止输出纯技能词、行业概念词或不能当岗位标题搜索的词。",
          "必须同时生成 config_summary 和 screening_strategy，但其中正向/反向只是摘要参考：正向参考最多 5 个评分锚点，直接排除最多 5 个明显不想看的岗位类型。",
          "收藏策略：favorite_score 使用 input.screeningStrategy.scoring.favoriteScore；review_score 固定 50；50 分以下跳过。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          input: payload,
          output_format: {
            analysis: {
              role_nature: "岗位性质分析",
              target_domain: "目标方向分析",
              hr_title_logic: "HR 可能使用哪些岗位标题",
              adjacent_title_logic: "哪些相邻产品或标题值得一起搜索",
              not_rule_words: "说明这些不是正向词/反向词，只是搜索标题词"
            },
            search_keywords: ["搜索标题词1", "搜索标题词2", "至少12个，最多18个"],
            config_summary: "面板展示用扫描确认，按当前目标、规则来源、开始前确认、本次避开、说明、安全边界、详细规则分行输出；不要展示具体收藏分数，收藏标准由宽松/标准/严格按钮控制。",
            screening_strategy: {
              must_have: ["必须满足1"],
              acceptable: ["可以接受1"],
              review_only: ["需要人工复核1"],
              direct_exclude: ["明显不想看的岗位类型，最多5个"],
              positive_reference: ["评分锚点，最多5个，不复制搜索标题词列表"],
              scoring: {
                favorite_score: 60,
                review_score: 50,
                exclude_below: 50,
                broad_target_policy: "泛词只进复核"
              }
            },
            manual_review_tip: "提醒用户生成后先手动删减和补充关键词",
            note: "给用户的简短提醒"
          }
        })
      }
    ];
    const content = await callAiProvider(messages, 1100);
    const parsed = parseAiJson(content);
    const keywords = sanitizeAiWords(parsed.search_keywords, 30);
    if (!keywords.length) throw new Error("AI 没有返回有效搜索词");
    applyAiStrategy(parsed);
    return { keywords, note: norm(parsed.note || parsed.manual_review_tip || "") };
  }

  async function generateRulesWithAi() {
    if (!aiConfigured()) return null;
    const profile = aiProfilePayload();
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const messages = [
      {
        role: "system",
        content: [
          "你是招聘岗位评分锚点专家。",
          "本任务只负责生成“评分/排除锚点”，不要再生成搜索标题词。",
          "目标：根据岗位性质、目标方向、用户已优化的搜索标题词、配置摘要，生成少量、精准、可人工继续优化的加分词和排除词。",
          "只输出严格 JSON，不要解释。",
          "必须遵守 input.screeningStrategy 和 input.configSummary。",
          "先在 analysis 字段里判断：用户要找的岗位性质、目标行业/产品、哪些词适合作为加分锚点、哪些岗位类型应该排除。",
          "加分词规则：只输出 3-5 个评分锚点，必须紧贴“岗位性质 + 目标方向”。它们用于判断岗位是否更相关，不是搜索词列表，不要复制 optimizedSearchKeywords。",
          "加分词可以是目标产品/场景词、岗位性质词、少量强相关组合词。例如销售+ai应用可用 AI应用、Agent、AI软件、AI SaaS、解决方案销售；运营+ai教育可用 ai教育运营、用户运营、增长运营、平台运营、产品运营。",
          "不要输出 To B、企业服务、产品演示、商务谈判这类泛泛加分词，除非它们就是用户目标方向。",
          "排除词规则：只输出 3-5 个用户明显不想看的岗位类型，例如保险、贷款、营业员、招生、课程销售、电话销售。不要输出行业技术词、硬件词、算力、GPU、CPU、金融线这类大词库词。",
          "关键例子：目标方向=机器人时，不要把 机器人硬件、人形机器人、工业机器人、协作机器人 放进 negative_keywords；如果不确定，放进 review_only，不要放排除词。",
          "输出数量：positive_keywords 3-5 个，negative_keywords 3-5 个，review_only 0-5 个。少而准，按重要度排序。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          input: {
            ...profile,
            optimizedSearchKeywords: keywords,
            existingPositive: parseKeywordList(document.querySelector("#baf-positive")?.value || ""),
            existingNegative: parseKeywordList(document.querySelector("#baf-negative")?.value || "")
          },
          output_format: {
            analysis: {
              role_nature: "岗位性质分析",
              target_domain: "目标方向分析",
              positive_logic: "加分词生成逻辑",
              negative_logic: "排除词生成逻辑"
            },
            positive_keywords: ["加分词1", "加分词2", "最多5个"],
            negative_keywords: ["排除词1", "排除词2", "最多5个"],
            review_only: ["边界词1"],
            note: "给用户的简短提醒"
          }
        })
      }
    ];
    const content = await callAiProvider(messages, 700);
    const parsed = parseAiJson(content);
    const positive = sanitizePositiveWordsByNature(parsed.positive_keywords, RULE_SEED_LIMIT);
    const negative = filterConflictingNegativeWords(sanitizeAiWords(parsed.negative_keywords, RULE_SEED_LIMIT));
    if (!positive.length && !negative.length) throw new Error("AI 没有返回有效规则词");
    return { positive, negative, note: norm(parsed.note || "") };
  }

  async function generateSearchKeywordsFromProfile() {
    let generated = [];
    let aiNote = "";
    let aiUsed = false;
    resetRulesForNewProfile();
    if (aiConfigured()) {
      try {
        updateStatus(statusSummary(`${currentAiProviderLabel()} 正在生成搜索词...`));
        const aiResult = await generateSearchKeywordsWithAi();
        generated = [...new Set([...aiResult.keywords, ...searchKeywordsFromProfile()])].slice(0, 18);
        aiNote = aiResult.note;
        aiUsed = true;
      } catch (error) {
        setNote("#baf-keyword-note", `AI 生成失败，已改用本地规则：${String(error?.message || error)}`);
      }
    }
    if (!generated.length) generated = searchKeywordsFromProfile();
    if (!generated.length) {
      const issue = targetDirectionIssue();
      setNote("#baf-keyword-note", issue === "目标方向太泛"
        ? "目标方向太泛，当前会按原词搜索并降低自动收藏倾向。建议后续补成具体场景。"
        : "没有生成搜索词。先填写岗位性质和目标方向，比如：销售 + AI客服，运营 + 跨境电商。");
      return false;
    }
    setPanelValue("#baf-keywords", generated.join("\n"));
    setPanelChecked("#baf-expand-keywords", true);
    readPanelConfig();
    setNote(
      "#baf-keyword-note",
      `${aiUsed ? `已用 ${currentAiProviderLabel()}` : "已按本地规则"}按「${profileNotePrefix()}」生成 ${generated.length} 个搜索词。\n${aiNote ? `${aiNote}\n` : ""}重要：先人工确认这一框，删掉不想看的词，补上你知道的岗位叫法；确认后再生成加分词/排除词。第一次每词先跑 100-200。`
    );
    updateStatus(statusSummary(`已生成搜索词：${generated.length} 个。`));
    return true;
  }

  async function generateRulesFromPanelKeywords(options = {}) {
    const positiveEl = document.querySelector("#baf-positive");
    const negativeEl = document.querySelector("#baf-negative");
    const hasManualRules = parseKeywordList(`${positiveEl?.value || ""}\n${negativeEl?.value || ""}`).length > 0;
    if (options.onlyIfEmpty && hasManualRules) return false;
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    if (!keywords.length && !options.allowEmpty) {
      setNote("#baf-rules-note", "先生成或填写搜索词，并手动删改后，再生成加分词/排除词。");
      updateStatus(statusSummary("缺少搜索词，暂时不能生成规则。"));
      return false;
    }
    let generated = null;
    let aiNote = "";
    let aiUsed = false;
    if (!options.onlyIfEmpty && aiConfigured()) {
      try {
        updateStatus(statusSummary(`${currentAiProviderLabel()} 正在生成加分词/排除词...`));
        const aiResult = await generateRulesWithAi();
        generated = { positive: aiResult.positive, negative: aiResult.negative };
        aiNote = aiResult.note;
        aiUsed = true;
      } catch (error) {
        setNote("#baf-rules-note", `AI 生成失败，已改用本地规则：${String(error?.message || error)}`);
      }
    }
    if (!generated) generated = ruleWordsFromKeywords(keywords);
    mergeTextareaWords("#baf-positive", generated.positive);
    mergeTextareaWords("#baf-negative", generated.negative);
    readPanelConfig();
    setNote(
      "#baf-rules-note",
      `${aiUsed ? `已用 ${currentAiProviderLabel()}` : "已按本地规则"}按「${profileNotePrefix()}」生成少量种子词：加分 ${generated.positive.length} 个、排除 ${generated.negative.length} 个。\n${aiNote ? `${aiNote}\n` : ""}建议手动看一眼：加分词只保留最贴近目标的岗位叫法；排除词只放明显不想看的岗位类型。`
    );
    if (!options.silent) {
      updateStatus(statusSummary(`已生成加分词/排除词：加分 ${generated.positive.length} 个，排除 ${generated.negative.length} 个。`));
    }
    return true;
  }

  function adjustThreshold(delta) {
    const el = document.querySelector("#baf-threshold");
    const current = Number(el?.value || config.threshold || 60);
    const next = Math.max(40, Math.min(95, current + delta));
    if (el) el.value = next;
    readPanelConfig();
    return next;
  }

  function showFeedbackPanel(message = "任务已完成，可以做一次整体反馈。") {
    const panel = document.querySelector("#baf-feedback");
    if (panel) panel.style.display = "block";
    updateStatus(statusSummary(message));
  }

  function applyFeedbackWords() {
    const moreWords = parseKeywordList(document.querySelector("#baf-more-words")?.value || "");
    const lessWords = parseKeywordList(document.querySelector("#baf-less-words")?.value || "");
    if (moreWords.length) {
      mergeTextareaWords("#baf-positive", moreWords);
      mergeTextareaWords("#baf-keywords", moreWords);
    }
    if (lessWords.length) {
      mergeTextareaWords("#baf-negative", lessWords);
    }
    state.userPrefs.likedWords = [...new Set([...(state.userPrefs.likedWords || []), ...moreWords])];
    state.userPrefs.dislikedWords = [...new Set([...(state.userPrefs.dislikedWords || []), ...lessWords])];
    state.userPrefs.feedbackHistory = [
      ...(state.userPrefs.feedbackHistory || []),
      { time: new Date().toISOString(), likedWords: moreWords, dislikedWords: lessWords, threshold: config.threshold }
    ].slice(-80);
    saveUserPrefs();
    readPanelConfig();
    const moreInput = document.querySelector("#baf-more-words");
    const lessInput = document.querySelector("#baf-less-words");
    if (moreInput) moreInput.value = "";
    if (lessInput) lessInput.value = "";
    updateStatus(statusSummary(`已应用反馈：新增想多看 ${moreWords.length} 个，不想看 ${lessWords.length} 个。`));
  }

  function updatePanel() {
    updateStatus(statusSummary(`状态：${state.running ? "运行中" : "停止"}`));
    const box = document.querySelector("#baf-log");
    if (!box) return;
    const actionClass = action => {
      if (action === "favorite") return "favorite";
      if (action === "review" || action === "favorite_failed") return "review";
      if (action === "exclude") return "exclude";
      return "skip";
    };
    box.innerHTML = state.logs.slice(0, 18).map(r => {
      const hits = (r.hits || []).slice(0, 5).join("、") || "-";
      const negatives = (r.negatives || []).slice(0, 4).join("、") || "-";
      const reviewNotes = (r.reviewNotes || []).slice(0, 2).join("、");
      return `
      <div class="baf-item">
        <div><span class="baf-action ${actionClass(r.action)}">${escapeHtml(actionLabel(r.action))}</span> ${escapeHtml(r.score)}分｜${escapeHtml(r.title)}</div>
        ${r.mainReason ? `<div class="baf-small">原因：${escapeHtml(r.mainReason)}</div>` : ""}
        <div class="baf-small">命中：${escapeHtml(hits)}</div>
        <div class="baf-small">扣分：${escapeHtml(negatives)}</div>
        ${reviewNotes ? `<div class="baf-small">复核：${escapeHtml(reviewNotes)}</div>` : ""}
        ${r.decisionLog ? `<div class="baf-small">决策：${escapeHtml(r.decisionLog)}</div>` : ""}
        ${r.favoriteResult ? `<div class="baf-small">收藏：${escapeHtml(r.favoriteResult)}</div>` : ""}
      </div>
    `;
    }).join("");
  }

  async function processJob(job) {
    debugLog("process_job_start", { title: job.title, href: job.href });
    job.card.scrollIntoView({ block: "center", inline: "nearest" });
    job.card.click();
    await sleep(jitter());
    const detail = rightPanelText();
    const combined = `${job.title} ${job.cardText} ${detail}`;
    const existingFavorite = favoriteButtonState();
    if (existingFavorite.ok) {
      const record = {
        time: new Date().toISOString(),
        title: job.title,
        href: job.href,
        cardText: job.cardText,
        companyScale: currentCompanyScaleLabel(),
        score: 100,
        hits: ["BOSS显示已收藏"],
        negatives: [],
        filterNotes: [`收藏按钮状态:${existingFavorite.status}`],
        reviewNotes: [],
        action: "favorite",
        ruleVersion: RULE_VERSION,
        needsReview: false,
        favoriteResult: "BOSS已显示收藏，跳过重复处理",
        favoriteButtonText: existingFavorite.text || ""
      };
      record.processingStatus = actionLabel(record.action);
      record.recommendedAction = "跳过，岗位已收藏";
      record.mainReason = "BOSS显示已收藏";
      record.decisionLog = buildDecisionLog(record, { existingFavorite: true });
      countProcessedAttempt();
      state.skipped += 1;
      state.processed.add(job.href);
      log(record);
      debugLog("process_job_done", {
        title: job.title,
        href: job.href,
        action: "skip_existing_favorite",
        score: record.score,
        mainReason: record.mainReason
      });
      await sleep(500 + Math.random() * 700);
      return;
    }
    const result = scoreJob(combined);
    const filterResult = evaluateFilters(combined);
    const record = {
      time: new Date().toISOString(),
      title: job.title,
      href: job.href,
      cardText: job.cardText,
      companyScale: currentCompanyScaleLabel(),
      score: result.score,
      hits: result.hits,
      negatives: [...result.negatives, ...filterResult.negatives],
      filterNotes: filterResult.notes,
      reviewNotes: result.reviewNotes || [],
      action: "exclude",
      ruleVersion: RULE_VERSION,
      needsReview: false
    };
    const blocked = result.hardExcluded || filterResult.hardExcluded;
    const blockReason = blocked
      ? `命中硬排除或硬过滤:${[...result.negatives, ...filterResult.negatives].slice(0, 3).join("、") || "未记录"}`
      : "";
    const shouldFavorite = result.score >= config.threshold && !blocked;
    const shouldReview = result.score >= REVIEW_THRESHOLD && result.score < config.threshold && !blocked;
    let decisionContext = { blocked, blockReason };
    if (shouldFavorite && favoriteLimitReached()) {
      record.filterNotes.push(`达到今日收藏安全上限 ${config.safety.dailyFavoriteLimit}`);
      record.action = "review";
      record.needsReview = true;
      record.recommendedAction = "人工复核，今日收藏达到安全上限";
      decisionContext.reviewReason = `达到收藏线，但今日收藏达到安全上限 ${config.safety.dailyFavoriteLimit}，转待复核`;
      state.reviewed += 1;
    } else if (shouldFavorite) {
      const fav = await clickFavoriteButton();
      record.favoriteResult = fav.status;
      record.favoriteButtonText = fav.text;
      record.action = fav.ok ? "favorite" : "favorite_failed";
      record.needsReview = !fav.ok;
      decisionContext.reviewReason = fav.ok ? "" : "达到收藏线，但点击后未确认收藏状态，转待复核";
      if (record.action === "favorite") {
        state.favorited += 1;
        state.daily.favorited += 1;
      } else {
        state.reviewed += 1;
      }
    } else if (shouldReview) {
      record.action = "review";
      record.needsReview = true;
      record.recommendedAction = "人工复核";
      decisionContext.reviewReason = `分数达到复核线但低于收藏线，未自动收藏`;
      state.reviewed += 1;
    } else {
      record.action = "exclude";
      decisionContext.excludeReason = blocked
        ? "命中硬排除或硬过滤，直接排除"
        : `分数低于复核线 ${REVIEW_THRESHOLD}，未收藏`;
      state.skipped += 1;
    }
    record.processingStatus = actionLabel(record.action);
    record.recommendedAction = record.recommendedAction || recommendedActionFor(record);
    record.mainReason = mainReasonFor(record);
    record.decisionLog = buildDecisionLog(record, decisionContext);
    countProcessedAttempt();
    state.processed.add(job.href);
    log(record);
    debugLog("process_job_done", {
      title: job.title,
      href: job.href,
      action: record.action,
      score: record.score,
      mainReason: record.mainReason
    });
    await sleep(700 + Math.random() * 900);
  }

  async function start(options = {}) {
    if (state.running) return;
    clearTimers();
    readPanelConfig();
    saveDailyStats();
    debugLog("start_called", { options });
    if (options.campaignMode) {
      const campaignStart = resumeOrCreateCampaign();
      const firstKeyword = keywordFromCampaign();
      if (firstKeyword !== currentSearchKeyword()) {
        const actionText = campaignStart.resumed ? "准备继续" : "准备切换";
        debugLog("navigate_first_keyword", { resumed: campaignStart.resumed, keyword: keywordLabel(firstKeyword) });
        updateStatus(statusSummary(`${actionText}到关键词：${keywordLabel(firstKeyword)}`));
        navigateToKeyword(firstKeyword);
        return;
      }
    } else if (!options.resumeCampaign) {
      state.campaign = null;
      saveCampaign();
    }
    seedProcessedFromRecords();
    const initialStopReason = safetyStopReason();
    if (initialStopReason) {
      if (state.campaign?.active) {
        state.campaign.active = false;
        state.campaign.paused = false;
        saveCampaign();
      }
      updateStatus(statusSummary(initialStopReason));
      debugLog("initial_stop", { reason: initialStopReason });
      return;
    }
    state.running = true;
    debugLog("scan_loop_started");
    updatePanel();

    let staleRounds = 0;
    let emptyRounds = 0;
    let duplicateRounds = 0;
    let lowResultWaitRounds = 0;
    let consecutiveErrors = 0;
    let finishCurrentKeyword = false;
    const startedScanned = state.scanned;
    if (state.campaign?.active && currentSearchKeyword() === keywordFromCampaign()) {
      updateStatus(statusSummary(`正在加载搜索结果：${keywordLabel(keywordFromCampaign())}`));
      debugLog("search_page_load_wait", { keyword: keywordLabel(keywordFromCampaign()), waitMs: SEARCH_PAGE_LOAD_WAIT_MS });
      await sleep(SEARCH_PAGE_LOAD_WAIT_MS);
    }
    while (state.running && !finishCurrentKeyword) {
      const stopReason = safetyStopReason();
      if (stopReason) {
        if (state.campaign?.active) {
          state.campaign.active = false;
          state.campaign.paused = false;
          saveCampaign();
        }
        updateStatus(statusSummary(stopReason));
        debugLog("safety_stop", { reason: stopReason });
        break;
      }
      const scannedThisRun = state.campaign?.active
        ? Number(state.campaign.keywordScanned || 0)
        : state.scanned - startedScanned;
      const currentLimit = state.campaign?.active
        ? Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX)
        : Number(config.maxJobs || 80);
      if (scannedThisRun >= currentLimit) {
        debugLog("keyword_limit_reached", { scannedThisRun, currentLimit });
        break;
      }
      const visibleJobs = getJobLinks();
      const jobs = visibleJobs.filter(j => !state.processed.has(j.href));
      const duplicateVisibleCount = visibleJobs.length - jobs.length;
      debugLog("job_links_found", { count: jobs.length, visibleCount: visibleJobs.length, duplicateVisibleCount, scannedThisRun, currentLimit });
      if (!jobs.length) {
        const onlySeenJobs = visibleJobs.length > 0 && duplicateVisibleCount > 0;
        if (onlySeenJobs) {
          duplicateRounds += 1;
          emptyRounds = 0;
        } else {
          emptyRounds += 1;
        }
        const scroller = findJobScroller();
        if (!scroller || typeof scroller.scrollBy !== "function") {
          updateStatus(statusSummary("没有找到岗位列表，准备切换到下一个搜索词。"));
          debugLog("job_scroller_missing", { emptyRounds, duplicateRounds, visibleCount: visibleJobs.length });
          break;
        }
        const before = scroller.scrollTop;
        if (onlySeenJobs) {
          updateStatus(statusSummary(`当前屏都是已扫过岗位，继续往下翻 ${duplicateRounds}/${MAX_DUPLICATE_SCROLL_ATTEMPTS}。`));
          debugLog("duplicate_scroll_attempt", { duplicateRounds, staleRounds, visibleCount: visibleJobs.length, duplicateVisibleCount, scrollTop: before });
        } else {
          updateStatus(statusSummary(`暂时没有岗位，尝试滚动 ${emptyRounds}/${MAX_EMPTY_SCROLL_ATTEMPTS}。`));
          debugLog("empty_scroll_attempt", { emptyRounds, staleRounds, scrollTop: before });
        }
        scroller.scrollBy({ top: 720, behavior: "auto" });
        await sleep(1200);
        const afterVisibleJobs = getJobLinks();
        const afterJobs = afterVisibleJobs.filter(j => !state.processed.has(j.href));
        if (afterJobs.length) {
          debugLog("empty_scroll_found_jobs", { count: afterJobs.length });
          staleRounds = 0;
          emptyRounds = 0;
          duplicateRounds = 0;
          continue;
        }
        if (scroller.scrollTop === before) staleRounds += 1;
        if (onlySeenJobs) {
          const stillOnlySeenJobs = afterVisibleJobs.length > 0 && afterJobs.length === 0;
          if (staleRounds >= 5 || (stillOnlySeenJobs && duplicateRounds >= MAX_DUPLICATE_SCROLL_ATTEMPTS)) {
            updateStatus(statusSummary("已连续翻过大量已扫岗位，当前搜索词暂时没有更多新岗位，准备切换。"));
            debugLog("keyword_no_more_new_jobs_after_duplicates", {
              duplicateRounds,
              staleRounds,
              visibleCount: afterVisibleJobs.length
            });
            break;
          }
          continue;
        }
        if (state.campaign?.active && scannedThisRun < 3 && emptyRounds >= MAX_EMPTY_SCROLL_ATTEMPTS && lowResultWaitRounds < 2) {
          lowResultWaitRounds += 1;
          emptyRounds = 0;
          staleRounds = 0;
          updateStatus(statusSummary(`当前搜索词结果较少，继续等待加载 ${lowResultWaitRounds}/2。`));
          debugLog("low_result_extra_wait", { scannedThisRun, lowResultWaitRounds });
          await sleep(SEARCH_PAGE_LOAD_WAIT_MS);
          continue;
        }
        if (staleRounds >= 3 || emptyRounds >= MAX_EMPTY_SCROLL_ATTEMPTS) {
          updateStatus(statusSummary("当前搜索词没有更多新岗位，准备切换。"));
          debugLog("keyword_no_more_jobs", { emptyRounds, staleRounds });
          break;
        }
        continue;
      }
      staleRounds = 0;
      emptyRounds = 0;
      duplicateRounds = 0;
      for (const job of jobs) {
        const scannedNow = state.campaign?.active
          ? Number(state.campaign.keywordScanned || 0)
          : state.scanned - startedScanned;
        if (!state.running || scannedNow >= currentLimit) break;
        const stopReason = safetyStopReason();
        if (stopReason) {
          updateStatus(statusSummary(stopReason));
          debugLog("safety_stop_inside_job_loop", { reason: stopReason });
          if (state.campaign?.active) {
            state.campaign.active = false;
            state.campaign.paused = false;
            saveCampaign();
          }
          state.running = false;
          break;
        }
        try {
          await processJob(job);
          consecutiveErrors = 0;
          const pauseEvery = Number(config.safety.pauseEvery || 0);
          if (
            state.running &&
            pauseEvery > 0 &&
            state.daily.scanned > 0 &&
            state.daily.scanned % pauseEvery === 0
          ) {
            const rest = randomBetweenSec(config.safety.pauseMinSec, config.safety.pauseMaxSec);
            await waitWithCountdown(rest, `已扫 ${state.daily.scanned} 个，安全休息`);
          }
        } catch (err) {
          state.errors += 1;
          consecutiveErrors += 1;
          countProcessedAttempt();
          state.processed.add(job.href);
          debugLog("process_job_error", {
            title: job.title,
            href: job.href,
            error: String(err && err.message || err),
            consecutiveErrors
          });
          log({
            time: new Date().toISOString(),
            title: job.title,
            href: job.href,
            cardText: job.cardText,
            score: 0,
            hits: [],
            negatives: [String(err && err.message || err)],
            action: "error",
            ruleVersion: RULE_VERSION,
            needsReview: true,
            processingStatus: "错误",
            recommendedAction: "跳过当前岗位，继续扫描",
            mainReason: "页面处理失败"
          });
          saveDailyStats();
          updateStatus(statusSummary("处理单条岗位出错，已跳过并继续。"));
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            updateStatus(statusSummary(`连续 ${consecutiveErrors} 条岗位处理失败，准备切换到下一个搜索词。`));
            debugLog("too_many_consecutive_errors", { consecutiveErrors });
            finishCurrentKeyword = true;
            break;
          }
        }
      }
    }
    state.running = false;
    debugLog("scan_loop_finished", { campaignActive: Boolean(state.campaign?.active), campaignPaused: Boolean(state.campaign?.paused) });
    updatePanel();
    if (state.campaign?.active) {
      moveToNextKeyword();
    } else if (state.campaign?.paused) {
      updateStatus(statusSummary("多词任务已暂停。下次点击“启动/继续多词”会从当前关键词继续。"));
    } else {
      showFeedbackPanel("本次扫描已完成。");
    }
  }

  createPanel();
  if (state.campaign?.active) {
    const keyword = keywordFromCampaign();
    const delay = 3000 + Math.random() * 2500;
    updateStatus(`检测到未完成任务，${Math.round(delay / 1000)} 秒后继续：${keywordLabel(keyword)}`);
    state.autoTimer = window.setTimeout(() => start({ resumeCampaign: true }), delay);
  }
})();
