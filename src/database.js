// This is our database. Instead of SQLite (which needs a C++ compiler on Windows),
// we use a plain JSON file on disk. It's simpler, has zero install headaches,
// and is more than fast enough for a recruitment bot's amount of data.
//
// The file lives at data/bot.json. Don't edit it by hand while the bot is running.

const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'bot.json');

function defaultData() {
  return {
    recruits: {},
    mailLog: [],
    knownNationIds: {},
    knownDepartureIds: {},
    templates: {},
    blacklist: {},
    personalApiKeys: {},
    settings: {
      autoRecruitEnabled: false,
    },
  };
}

function loadData() {
  if (!fs.existsSync(dbPath)) {
    const initial = defaultData();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(dbPath, 'utf8');
  const parsed = JSON.parse(raw);
  // Fill in any new fields that didn't exist in older versions of the data file.
  return { ...defaultData(), ...parsed };
}

function saveData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ---------- Recruits ----------

function getRecruit(nationId) {
  const data = loadData();
  return data.recruits[String(nationId)] || null;
}

function getAllRecruits() {
  const data = loadData();
  return Object.values(data.recruits);
}

/**
 * Creates the recruit record if it doesn't exist, or updates the given fields if it does.
 */
function upsertRecruit(nationId, fields) {
  const data = loadData();
  const key = String(nationId);
  const existing = data.recruits[key] || {
    nation_id: nationId,
    nation_name: null,
    discord_thread_id: null,
    stage: 'New',
    assigned_staff_id: null,
    notes: null,
    last_contacted_at: null,
    created_at: new Date().toISOString(),
    follow_up_stage: 0, // 0 = none sent, 1/2/3 = which follow-up has been sent
    initial_template_id: null, // which template first contacted this recruit (for A/B testing)
    initial_sent_by: null, // who/what sent that first contact ('system' for automated)
  };
  data.recruits[key] = { ...existing, ...fields };
  saveData(data);
  return data.recruits[key];
}

function setRecruitThread(nationId, threadId) {
  return upsertRecruit(nationId, { discord_thread_id: threadId });
}

function touchLastContacted(nationId) {
  return upsertRecruit(nationId, { last_contacted_at: new Date().toISOString() });
}

/**
 * Records which template and sender first contacted this recruit - but only
 * if that hasn't already been recorded. This is what powers A/B testing and
 * join attribution: we want the FIRST contact's template, not any follow-up.
 */
function setInitialAttributionIfMissing(nationId, templateId, sentBy) {
  const existing = getRecruit(nationId);
  if (existing && existing.initial_template_id) return; // already recorded, don't overwrite
  upsertRecruit(nationId, { initial_template_id: templateId, initial_sent_by: sentBy });
}

function setFollowUpStage(nationId, stage) {
  return upsertRecruit(nationId, { follow_up_stage: stage });
}

// ---------- Mail log ----------

function addMailLog({ nationId, direction, subject, message, sentBy }) {
  const data = loadData();
  data.mailLog.push({
    id: data.mailLog.length + 1,
    nation_id: nationId,
    direction, // 'outgoing' or 'incoming'
    subject,
    message,
    sent_by: sentBy,
    created_at: new Date().toISOString(),
  });
  saveData(data);
}

function getMailLog(nationId) {
  const data = loadData();
  return data.mailLog
    .filter((row) => row.nation_id === nationId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

// ---------- Known nation IDs (so the scanner never mails the same new nation twice) ----------

function isKnownNation(nationId) {
  const data = loadData();
  return Boolean(data.knownNationIds[String(nationId)]);
}

function markNationKnown(nationId) {
  const data = loadData();
  data.knownNationIds[String(nationId)] = new Date().toISOString();
  saveData(data);
}

// ---------- Known departure IDs (for the alliance-exit recruiting scanner) ----------
// Separate tracking set from knownNationIds above - this one tracks established,
// currently-unaligned nations so we can detect when a NEW one shows up (meaning
// they likely just left an alliance, since we'd already know about them otherwise
// if they'd been unaligned all along).

function isKnownDeparture(nationId) {
  const data = loadData();
  return Boolean(data.knownDepartureIds[String(nationId)]);
}

function markDepartureKnown(nationId) {
  const data = loadData();
  data.knownDepartureIds[String(nationId)] = new Date().toISOString();
  saveData(data);
}

function isDepartureBackfillDone() {
  return Boolean(getSetting('departureBackfillDone'));
}

function setDepartureBackfillDone() {
  setSetting('departureBackfillDone', true);
}

// ---------- Applicant/demotion tracker ----------
// Stores snapshots of who was a full member last time we checked,
// and who was already known as an applicant, so we can detect:
// 1. NEW applicants (weren't in the applicant list before)
// 2. DEMOTED members (were full members, now appear as applicant)

function getKnownApplicants() {
  const data = loadData();
  return data.knownApplicants || {};
}

function setKnownApplicants(applicantsMap) {
  const data = loadData();
  data.knownApplicants = applicantsMap;
  saveData(data);
}

function getKnownMembers() {
  const data = loadData();
  return data.knownMembers || {};
}

function setKnownMembers(membersMap) {
  const data = loadData();
  data.knownMembers = membersMap;
  saveData(data);
}

function isApplicantBackfillDone() {
  return Boolean(getSetting('applicantBackfillDone'));
}

function setApplicantBackfillDone() {
  setSetting('applicantBackfillDone', true);
}

// ---------- Configurable applicant/demotion messages ----------

function setApplicantMessage(subject, body) {
  setSetting('applicantMessageSubject', subject);
  setSetting('applicantMessageBody', body);
}

function getApplicantMessage() {
  return {
    subject: getSetting('applicantMessageSubject') || null,
    body: getSetting('applicantMessageBody') || null,
  };
}

function setDemotionMessage(subject, body) {
  setSetting('demotionMessageSubject', subject);
  setSetting('demotionMessageBody', body);
}

function getDemotionMessage() {
  return {
    subject: getSetting('demotionMessageSubject') || null,
    body: getSetting('demotionMessageBody') || null,
  };
}

// ---------- Recruitment templates ----------
// type can be: 'initial' (default - used for new-nation/bulk recruiting),
// 'followup1' (sent ~3 days after first contact), 'followup2' (~7 days),
// or 'followup3' (~14 days, final follow-up).

function addTemplate(id, { name, subject, body, type }) {
  const data = loadData();
  data.templates[id] = {
    id,
    name,
    subject,
    body,
    type: type || 'initial',
    created_at: new Date().toISOString(),
  };
  saveData(data);
  return data.templates[id];
}

function getTemplate(id) {
  const data = loadData();
  return data.templates[id] || null;
}

function getAllTemplates() {
  const data = loadData();
  return Object.values(data.templates);
}

function getTemplatesByType(type) {
  const data = loadData();
  // Templates saved before this feature existed have no `type` field at all -
  // treat those as 'initial' so nothing old silently stops working.
  return Object.values(data.templates).filter((t) => (t.type || 'initial') === type);
}

function deleteTemplate(id) {
  const data = loadData();
  const existed = Boolean(data.templates[id]);
  delete data.templates[id];
  saveData(data);
  return existed;
}

/**
 * Picks a random template of the given type. Defaults to 'initial' (the
 * pool used by new-nation auto-recruit and bulk recruiting).
 * Returns null if no templates of that type exist.
 */
function getRandomTemplate(type = 'initial') {
  const pool = getTemplatesByType(type);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * A/B testing report: for each template, how many recruits it first-contacted,
 * and how many of those recruits ended up at stage "Joined".
 */
function getTemplateStats() {
  const data = loadData();
  const recruits = Object.values(data.recruits);
  const templates = Object.values(data.templates);

  return templates.map((t) => {
    const contacted = recruits.filter((r) => r.initial_template_id === t.id);
    const joined = contacted.filter((r) => r.stage === 'Joined');
    const conversion = contacted.length > 0 ? ((joined.length / contacted.length) * 100).toFixed(1) : '0.0';
    return {
      templateId: t.id,
      type: t.type || 'initial',
      sentAsFirstContact: contacted.length,
      joins: joined.length,
      conversionRate: conversion,
    };
  });
}

/**
 * Join attribution report: for every recruit currently at stage "Joined",
 * which template and which sender (staff member or "system") first reached them.
 */
function getJoinAttribution() {
  const data = loadData();
  return Object.values(data.recruits)
    .filter((r) => r.stage === 'Joined')
    .map((r) => ({
      nationId: r.nation_id,
      nationName: r.nation_name,
      initialTemplateId: r.initial_template_id,
      initialSentBy: r.initial_sent_by,
      assignedStaffId: r.assigned_staff_id,
    }));
}

// ---------- Settings ----------

function getSetting(key) {
  const data = loadData();
  return data.settings[key];
}

function setSetting(key, value) {
  const data = loadData();
  data.settings[key] = value;
  saveData(data);
}

// ---------- Blacklist ----------

function addToBlacklist(nationId, reason, addedBy) {
  const data = loadData();
  data.blacklist[String(nationId)] = {
    nation_id: nationId,
    reason: reason || null,
    added_by: addedBy,
    added_at: new Date().toISOString(),
  };
  saveData(data);
}

function removeFromBlacklist(nationId) {
  const data = loadData();
  const existed = Boolean(data.blacklist[String(nationId)]);
  delete data.blacklist[String(nationId)];
  saveData(data);
  return existed;
}

function isBlacklisted(nationId) {
  const data = loadData();
  return Boolean(data.blacklist[String(nationId)]);
}

function getBlacklistEntry(nationId) {
  const data = loadData();
  return data.blacklist[String(nationId)] || null;
}

function getAllBlacklisted() {
  const data = loadData();
  return Object.values(data.blacklist);
}

// ---------- Stats ----------

function getStats() {
  const data = loadData();
  const recruits = Object.values(data.recruits);
  const mailLog = data.mailLog;

  const sentCount = mailLog.filter((m) => m.direction === 'outgoing').length;
  const byStage = {};
  for (const r of recruits) {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  }
  const joined = byStage['Joined'] || 0;
  const conversion = sentCount > 0 ? ((joined / sentCount) * 100).toFixed(1) : '0.0';

  return {
    totalRecruitsTracked: recruits.length,
    mailsSent: sentCount,
    byStage,
    joined,
    conversionRate: conversion,
  };
}

// ---------- Personal API keys ----------
// Lets individual staff members register their OWN PnW API key, so when
// THEY send recruitment mail, it appears in-game as sent from their nation
// instead of the bot owner's. Stored in the same local data file as
// everything else - see the security note in the README before relying on
// this for anything highly sensitive.

function setPersonalApiKey(discordUserId, apiKey) {
  const data = loadData();
  data.personalApiKeys[discordUserId] = {
    api_key: apiKey,
    added_at: new Date().toISOString(),
  };
  saveData(data);
}

function getPersonalApiKey(discordUserId) {
  const data = loadData();
  return data.personalApiKeys[discordUserId]?.api_key || null;
}

function removePersonalApiKey(discordUserId) {
  const data = loadData();
  const existed = Boolean(data.personalApiKeys[discordUserId]);
  delete data.personalApiKeys[discordUserId];
  saveData(data);
  return existed;
}

function hasPersonalApiKey(discordUserId) {
  return Boolean(getPersonalApiKey(discordUserId));
}

// ---------- Recruiter role gating ----------
// Optional: if an admin sets a "recruiter role", only Administrators and
// members with that role can use the mail-sending commands. If never set,
// the commands stay open to everyone (same as before this feature existed).

function setRecruiterRoleId(roleId) {
  setSetting('recruiterRoleId', roleId);
}

function getRecruiterRoleId() {
  return getSetting('recruiterRoleId') || null;
}

function setMailLogChannelId(channelId) {
  setSetting('mailLogChannelId', channelId);
}

/**
 * Returns the mail log channel ID - database setting takes priority over
 * the .env value, so /config mail-log-channel overrides the original setup
 * without requiring a restart or .env edit.
 */
function getMailLogChannelId() {
  return getSetting('mailLogChannelId') || process.env.MAIL_LOG_CHANNEL_ID || null;
}

module.exports = {
  getRecruit,
  getAllRecruits,
  upsertRecruit,
  setRecruitThread,
  touchLastContacted,
  setInitialAttributionIfMissing,
  setFollowUpStage,
  addMailLog,
  getMailLog,
  isKnownNation,
  markNationKnown,
  isKnownDeparture,
  markDepartureKnown,
  isDepartureBackfillDone,
  setDepartureBackfillDone,
  getKnownApplicants,
  setKnownApplicants,
  getKnownMembers,
  setKnownMembers,
  isApplicantBackfillDone,
  setApplicantBackfillDone,
  setApplicantMessage,
  getApplicantMessage,
  setDemotionMessage,
  getDemotionMessage,
  addTemplate,
  getTemplate,
  getAllTemplates,
  getTemplatesByType,
  deleteTemplate,
  getRandomTemplate,
  getTemplateStats,
  getJoinAttribution,
  getSetting,
  setSetting,
  setPersonalApiKey,
  getPersonalApiKey,
  removePersonalApiKey,
  hasPersonalApiKey,
  setRecruiterRoleId,
  getRecruiterRoleId,
  setMailLogChannelId,
  getMailLogChannelId,
  addToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  getBlacklistEntry,
  getAllBlacklisted,
  getStats,
};
