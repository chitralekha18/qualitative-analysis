const defaultTopics = [
  "Context",
  "Process",
  "Experience",
  "Challenge",
  "Outcome",
];

const specialExampleCodes = ["Postive example", "Negative example"];

const defaultResearchQuestions = `Interview Questions:
Semi-Structured Interview
How was your experience using the system?
Was there anything that stood out to you while using the system?
Was there any difference between the first few days of using the system vs the last few days of using the system?

How did you use the system?
When did you typically use the system?
Were there any specific situations that you preferred to use the system?
Were there any situations that you chose not to turn it on?
Which features did you use most and least often? - watch explanation, inspecting the claims on the phone, clicking on sources, diving deeper/doing their own research. All Claims, Flagged Claims, Statement Detail information?)
Why did you interact/not interact with these features?

Abridging attempt
2. How did you use the system?
Were there any situations where you prefer to use the system more? Less?
When were you more comfortable using the watch? When were you less comfortable?
Which features did you use most and least often? - watch explanation, inspecting the claims on the phone, clicking on sources, diving deeper/doing their own research. All Claims, Flagged Claims, Statement Detail information?)6
Why did you interact/not interact with these features?
Typically when did you refer to the phone app?

Reliability
How reliable did you find the system overall?
Were there specific situations where you found the system performance was better?
Were there any situations where you found the system performance to struggle?
Were there any situations where you found the system helpful or unhelpful?
Did you find any challenges while using the system?
Does the system reliability affect your trust in the system?
Does the system reliability affect your usage of the system?

Abridging
3. Reliability
How reliable did you find the system overall?
How does that affect how you use the system?
Were there specific situations where you found the system performance was better or worse? - Did you ever disagree with the system?
Did you find any challenges while using the system?
Did you think the watch responded fast enough?

How did you respond to the system?
What did you feel or do when you received the flagged claims alert?
If you ignored the vibration, why did you do so?
Did the vibration alone affect your judgment, before looking at the watch?
Was there anything that affected how you responded to the alerts/system?
What did you feel or do when you didn’t receive an alert when the system was on?
How was your thought process when deciding whether to believe or not believe the system?
Can you recall any moment where you thought it should buzz, and it did, or it did not?

How did people around you react to the system?
Did using the system affect how you interacted with other people?

Would you continue to use the system if it were available? How often would you use it?

Do you have any feedback regarding the system?
What was missing? Did you want to add a new feature you want to add?

Hypotheses:
Device Reliability
H1: Participants will self-report the device as reliable, even though occasional errors in speech-to-text or fact-checking are expected in natural environments.

Usability, Acceptability, and Social Impact
H2: Participants will report real-time fact-checking nudges as useful, and usefulness varies by context (e.g., watching news, casually chatting, discussions at work, decision-making).
H3: Participants will report the system is socially acceptable

Behavioral and Cognitive Outcomes
H4: Exposure to nudges is associated with verification of claims.
H5: Exposure to nudges is associated with low belief in false claims.
H6: The effectiveness of nudges (belief and verification of behaviour) will vary by context.`;

const state = {
  projectName: "Qualitative coding project",
  coderId: "",
  researchQuestions: defaultResearchQuestions,
  transcripts: [],
  recordings: [],
  topics: [...defaultTopics],
  activeId: null,
  activeRecordingId: null,
  annotations: [],
  generatedCodeSuggestions: [],
  selectedAiSuggestionIndex: null,
  generatedCodeHistory: [],
  generatedSpecialHighlights: [],
  selectedRange: null,
  editingId: null,
  editingTranscript: false,
  setupComplete: false,
};

const storageKey = "localQualCodingDesk.v2";
const sidebarCollapsedKey = "localQualCodingDesk.sidebarCollapsed";
let runtimeSettings = {};
let generationProgressTimer = null;
let filteredCodeOptions = [];
let activeCodeOptionIndex = -1;
let comparisonData = null;
let draggedComparisonCode = null;
let selectedComparisonMove = null;
let activeComparisonParticipantId = null;
let sessionComparison = { sessionA: null, sessionB: null, participants: [], activeParticipantId: null, candidate: null, accepted: [] };

const els = {
  appShell: document.querySelector(".app-shell"),
  collapseSidebarButton: document.querySelector("#collapseSidebarButton"),
  restoreSidebarButton: document.querySelector("#restoreSidebarButton"),
  workspaceTabs: [...document.querySelectorAll("[data-workspace-tab]")],
  codingWorkspace: document.querySelector("#codingWorkspace"),
  compareWorkspace: document.querySelector("#compareWorkspace"),
  coderASessionInput: document.querySelector("#coderASessionInput"),
  coderBSessionInput: document.querySelector("#coderBSessionInput"),
  coderASessionName: document.querySelector("#coderASessionName"),
  coderBSessionName: document.querySelector("#coderBSessionName"),
  loadSessionComparisonButton: document.querySelector("#loadSessionComparisonButton"),
  sessionParticipantTabs: document.querySelector("#sessionParticipantTabs"),
  sessionComparisonView: document.querySelector("#sessionComparisonView"),
  sessionCoderAName: document.querySelector("#sessionCoderAName"),
  sessionCoderBName: document.querySelector("#sessionCoderBName"),
  sessionCoderACount: document.querySelector("#sessionCoderACount"),
  sessionCoderBCount: document.querySelector("#sessionCoderBCount"),
  sessionTranscriptA: document.querySelector("#sessionTranscriptA"),
  sessionTranscriptB: document.querySelector("#sessionTranscriptB"),
  sessionBubbleA: document.querySelector("#sessionBubbleA"),
  sessionBubbleB: document.querySelector("#sessionBubbleB"),
  sessionDecisionParticipant: document.querySelector("#sessionDecisionParticipant"),
  sessionDecisionEmpty: document.querySelector("#sessionDecisionEmpty"),
  sessionDecisionEditor: document.querySelector("#sessionDecisionEditor"),
  sessionFinalCode: document.querySelector("#sessionFinalCode"),
  sessionFinalQuote: document.querySelector("#sessionFinalQuote"),
  sessionDecisionSource: document.querySelector("#sessionDecisionSource"),
  acceptSessionDecision: document.querySelector("#acceptSessionDecision"),
  acceptedSessionDecisions: document.querySelector("#acceptedSessionDecisions"),
  finalSessionCoderId: document.querySelector("#finalSessionCoderId"),
  finalSessionDownloads: document.querySelector("#finalSessionDownloads"),
  downloadFinalSessionButton: document.querySelector("#downloadFinalSessionButton"),
  downloadFinalExcelButton: document.querySelector("#downloadFinalExcelButton"),
  coderAWorkbook: document.querySelector("#coderAWorkbook"),
  coderBWorkbook: document.querySelector("#coderBWorkbook"),
  coderAFileName: document.querySelector("#coderAFileName"),
  coderBFileName: document.querySelector("#coderBFileName"),
  compareWorkbooksButton: document.querySelector("#compareWorkbooksButton"),
  useGptAlignment: document.querySelector("#useGptAlignment"),
  participantAlignment: document.querySelector("#participantAlignment"),
  comparisonParticipantTabs: document.querySelector("#comparisonParticipantTabs"),
  comparisonResults: document.querySelector("#comparisonResults"),
  comparisonTableBody: document.querySelector("#comparisonTableBody"),
  downloadComparisonButton: document.querySelector("#downloadComparisonButton"),
  newComparisonGroupDropzone: document.querySelector("#newComparisonGroupDropzone"),
  comparisonMoveBar: document.querySelector("#comparisonMoveBar"),
  comparisonMoveCode: document.querySelector("#comparisonMoveCode"),
  comparisonMoveCoder: document.querySelector("#comparisonMoveCoder"),
  moveComparisonToNewGroup: document.querySelector("#moveComparisonToNewGroup"),
  cancelComparisonMove: document.querySelector("#cancelComparisonMove"),
  comparisonTableWrap: document.querySelector("#comparisonTableWrap"),
  transcriptList: document.querySelector("#transcriptList"),
  researchQuestionsInput: document.querySelector("#researchQuestionsInput"),
  transcriptCount: document.querySelector("#transcriptCount"),
  recordingList: document.querySelector("#recordingList"),
  recordingCount: document.querySelector("#recordingCount"),
  refreshRecordingsButton: document.querySelector("#refreshRecordingsButton"),
  transcriptionProgress: document.querySelector("#transcriptionProgress"),
  transcriptionProgressText: document.querySelector("#transcriptionProgressText"),
  activeTitle: document.querySelector("#activeTitle"),
  coderIdInput: document.querySelector("#coderIdInput"),
  generateCodesButton: document.querySelector("#generateCodesButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  cancelSettingsButton: document.querySelector("#cancelSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  recordingsFolderInput: document.querySelector("#recordingsFolderInput"),
  defaultRecordingsFolderHint: document.querySelector("#defaultRecordingsFolderHint"),
  openaiApiKeyInput: document.querySelector("#openaiApiKeyInput"),
  deepgramApiKeyInput: document.querySelector("#deepgramApiKeyInput"),
  openaiKeyStatus: document.querySelector("#openaiKeyStatus"),
  deepgramKeyStatus: document.querySelector("#deepgramKeyStatus"),
  editTranscriptButton: document.querySelector("#editTranscriptButton"),
  transcriptEditor: document.querySelector("#transcriptEditor"),
  transcriptEditorInput: document.querySelector("#transcriptEditorInput"),
  saveTranscriptEdit: document.querySelector("#saveTranscriptEdit"),
  cancelTranscriptEdit: document.querySelector("#cancelTranscriptEdit"),
  setupModal: document.querySelector("#setupModal"),
  projectNameInput: document.querySelector("#projectNameInput"),
  useDefaultSetupButton: document.querySelector("#useDefaultSetupButton"),
  finishSetupButton: document.querySelector("#finishSetupButton"),
  reader: document.querySelector("#reader"),
  emptyState: document.querySelector("#emptyState"),
  selectedQuote: document.querySelector("#selectedQuote"),
  highlightEditHint: document.querySelector("#highlightEditHint"),
  highlightExpandActions: document.querySelector("#highlightExpandActions"),
  includePreviousSentence: document.querySelector("#includePreviousSentence"),
  includeNextSentence: document.querySelector("#includeNextSentence"),
  codeInput: document.querySelector("#codeInput"),
  codeCombobox: document.querySelector("#codeCombobox"),
  codeDropdownToggle: document.querySelector("#codeDropdownToggle"),
  codeSuggestionsList: document.querySelector("#codeSuggestionsList"),
  memoInput: document.querySelector("#memoInput"),
  applyCode: document.querySelector("#applyCode"),
  deleteCode: document.querySelector("#deleteCode"),
  cancelSelection: document.querySelector("#cancelSelection"),
  annotationTable: document.querySelector("#annotationTable"),
  annotationCount: document.querySelector("#annotationCount"),
  saveState: document.querySelector("#saveState"),
  saveButton: document.querySelector("#saveButton"),
  loadSessionButton: document.querySelector("#loadSessionButton"),
  sessionFileInput: document.querySelector("#sessionFileInput"),
  sampleButton: document.querySelector("#sampleButton"),
  exportButton: document.querySelector("#exportButton"),
  clearButton: document.querySelector("#clearButton"),
  aiSuggestions: document.querySelector("#aiSuggestions"),
  aiSuggestionCount: document.querySelector("#aiSuggestionCount"),
};

function selectWorkspaceTab(name) {
  els.workspaceTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.workspaceTab === name));
  els.codingWorkspace.hidden = name !== "coding";
  els.compareWorkspace.hidden = name !== "compare";
}

function setSidebarCollapsed(collapsed, persist = true) {
  els.appShell.classList.toggle("sidebar-is-collapsed", collapsed);
  els.collapseSidebarButton.setAttribute("aria-expanded", String(!collapsed));
  els.restoreSidebarButton.hidden = !collapsed;
  if (persist) localStorage.setItem(sidebarCollapsedKey, collapsed ? "true" : "false");
}

function sessionParticipantId(value) {
  const name = String(value || "").split(/[\\/]/).pop() || "";
  return name.replace(/\.txt$/i, "").replace(/\.[^.]+$/, "");
}

function prepareCodingSession(payload, fallbackName) {
  if (!payload || !Array.isArray(payload.transcripts) || !Array.isArray(payload.annotations)) {
    throw new Error(`${fallbackName} is not a valid QualCodeDesk session file.`);
  }
  const coderId = String(payload.coderId || fallbackName).trim() || fallbackName;
  // The uploaded session is the comparison boundary. Imported or reconciled
  // annotations may retain a different original coderId, so keep them visible
  // and use their embedded coderId only as provenance.
  const annotations = payload.annotations;
  const transcriptsByParticipant = new Map();
  payload.transcripts.forEach((transcript) => {
    const participantId = sessionParticipantId(transcript.name || transcript.id);
    if (participantId) transcriptsByParticipant.set(participantId, transcript);
  });
  const annotationsByParticipant = new Map();
  annotations.forEach((annotation, index) => {
    const participantId = sessionParticipantId(annotation.transcriptName || annotation.transcriptId);
    if (!participantId || !transcriptsByParticipant.has(participantId)) return;
    const prepared = { ...annotation, comparisonId: `${fallbackName}_${index}`, participantId };
    if (!annotationsByParticipant.has(participantId)) annotationsByParticipant.set(participantId, []);
    annotationsByParticipant.get(participantId).push(prepared);
  });
  return { coderId, transcriptsByParticipant, annotationsByParticipant, payload };
}

function renderSessionTranscript(container, transcript, annotations, side) {
  const text = String(transcript?.text || "");
  const valid = annotations.filter((item) => Number.isInteger(Number(item.start)) && Number.isInteger(Number(item.end)) && Number(item.end) > Number(item.start) && Number(item.start) >= 0 && Number(item.end) <= text.length);
  const boundaries = new Set([0, text.length]);
  valid.forEach((item) => { boundaries.add(Number(item.start)); boundaries.add(Number(item.end)); });
  const points = [...boundaries].sort((left, right) => left - right);
  const pieces = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const active = valid.filter((item) => Number(item.start) <= start && Number(item.end) >= end);
    const content = escapeHtml(text.slice(start, end));
    pieces.push(active.length
      ? `<mark class="session-highlight session-highlight-${side.toLowerCase()}" data-session-side="${side}" data-annotation-ids="${active.map((item) => item.comparisonId).join("|")}">${content}</mark>`
      : content);
  }
  container.innerHTML = pieces.join("");
}

function activeSessionParticipant() {
  return sessionComparison.participants.find((item) => item.participantId === sessionComparison.activeParticipantId);
}

function renderAcceptedSessionDecisions() {
  const decisions = sessionComparison.accepted.filter((item) => item.participantId === sessionComparison.activeParticipantId);
  els.acceptedSessionDecisions.innerHTML = decisions.length ? decisions.map((item) => `
    <article class="accepted-decision-card">
      <strong>${escapeHtml(item.code)}</strong>
      <p>“${escapeHtml(truncate(item.quote, 150))}”</p>
      <small>Chosen from ${escapeHtml(item.sourceCoder)}</small>
      <button type="button" data-remove-session-decision="${escapeHtml(item.id)}">Remove</button>
    </article>`).join("") : '<p class="decision-empty">No accepted decisions for this participant yet.</p>';
}

function renderSessionComparisonParticipant() {
  const participant = activeSessionParticipant();
  if (!participant) return;
  sessionComparison.candidate = null;
  els.sessionParticipantTabs.innerHTML = sessionComparison.participants.map((item) => `
    <button type="button" class="comparison-participant-tab ${item.participantId === participant.participantId ? "is-active" : ""}" data-session-participant="${escapeHtml(item.participantId)}">
      <span>${escapeHtml(item.participantId)}</span>
      <small>${sessionComparison.accepted.filter((decision) => decision.participantId === item.participantId).length} accepted</small>
    </button>`).join("");
  els.sessionCoderAName.textContent = sessionComparison.sessionA.coderId;
  els.sessionCoderBName.textContent = sessionComparison.sessionB.coderId;
  els.sessionCoderACount.textContent = `${participant.annotationsA.length} coded highlight${participant.annotationsA.length === 1 ? "" : "s"}`;
  els.sessionCoderBCount.textContent = `${participant.annotationsB.length} coded highlight${participant.annotationsB.length === 1 ? "" : "s"}`;
  els.sessionDecisionParticipant.textContent = `Participant ${participant.participantId}`;
  renderSessionTranscript(els.sessionTranscriptA, participant.transcriptA, participant.annotationsA, "A");
  renderSessionTranscript(els.sessionTranscriptB, participant.transcriptB, participant.annotationsB, "B");
  els.sessionTranscriptA.scrollTop = 0;
  els.sessionTranscriptB.scrollTop = 0;
  els.sessionBubbleA.hidden = true;
  els.sessionBubbleB.hidden = true;
  els.sessionDecisionEmpty.hidden = false;
  els.sessionDecisionEditor.hidden = true;
  renderAcceptedSessionDecisions();
  els.sessionParticipantTabs.hidden = false;
  els.sessionComparisonView.hidden = false;
}

async function loadSessionComparison() {
  const fileA = els.coderASessionInput.files?.[0];
  const fileB = els.coderBSessionInput.files?.[0];
  if (!fileA || !fileB) { alert("Choose both coding session files first."); return; }
  els.loadSessionComparisonButton.disabled = true;
  els.loadSessionComparisonButton.textContent = "Loading…";
  try {
    const [payloadA, payloadB] = await Promise.all([fileA.text().then(JSON.parse), fileB.text().then(JSON.parse)]);
    const sessionA = prepareCodingSession(payloadA, "Coder A");
    const sessionB = prepareCodingSession(payloadB, "Coder B");
    const commonParticipants = [...sessionA.annotationsByParticipant.keys()]
      .filter((participantId) => sessionB.annotationsByParticipant.has(participantId))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    if (!commonParticipants.length) throw new Error("The sessions do not contain any participant coded by both coders.");
    const participants = commonParticipants.map((participantId) => ({
      participantId,
      transcriptA: sessionA.transcriptsByParticipant.get(participantId),
      transcriptB: sessionB.transcriptsByParticipant.get(participantId),
      annotationsA: sessionA.annotationsByParticipant.get(participantId) || [],
      annotationsB: sessionB.annotationsByParticipant.get(participantId) || [],
    }));
    sessionComparison = { sessionA, sessionB, participants, activeParticipantId: commonParticipants[0], candidate: null, accepted: [] };
    els.finalSessionCoderId.value = "reconciled";
    els.finalSessionDownloads.hidden = false;
    renderSessionComparisonParticipant();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not load the coding sessions.");
  } finally {
    els.loadSessionComparisonButton.disabled = false;
    els.loadSessionComparisonButton.textContent = "Compare sessions";
  }
}

function sessionAnnotationById(side, annotationId) {
  const participant = activeSessionParticipant();
  return (side === "A" ? participant?.annotationsA : participant?.annotationsB)?.find((item) => item.comparisonId === annotationId);
}

function showSessionCodeBubble(event, side) {
  const highlight = event.target.closest(".session-highlight");
  if (!highlight) return;
  const ids = String(highlight.dataset.annotationIds || "").split("|").filter(Boolean);
  const annotations = ids.map((id) => sessionAnnotationById(side, id)).filter(Boolean);
  const bubble = side === "A" ? els.sessionBubbleA : els.sessionBubbleB;
  const panel = bubble.closest(".session-coder-panel");
  const panelRect = panel.getBoundingClientRect();
  bubble.innerHTML = annotations.map((item) => `
    <div><span>${escapeHtml(item.code)}</span><button type="button" data-choose-session-code="${escapeHtml(item.comparisonId)}" data-choose-session-side="${side}">Choose</button></div>`).join("");
  bubble.style.left = `${Math.max(8, Math.min(event.clientX - panelRect.left, panelRect.width - 240))}px`;
  bubble.style.top = `${Math.max(48, Math.min(event.clientY - panelRect.top + 8, panelRect.height - 150))}px`;
  bubble.hidden = false;
}

function chooseSessionAnnotation(side, annotationId) {
  const annotation = sessionAnnotationById(side, annotationId);
  if (!annotation) return;
  const sessionCoder = side === "A" ? sessionComparison.sessionA.coderId : sessionComparison.sessionB.coderId;
  sessionComparison.candidate = {
    ...annotation,
    side,
    sourceCoder: String(annotation.coderId || "").trim() || sessionCoder,
    sourceSessionCoder: sessionCoder,
  };
  els.sessionFinalCode.value = annotation.code || "";
  els.sessionFinalQuote.value = annotation.quote || "";
  els.sessionDecisionSource.textContent = `Selected from ${sessionComparison.candidate.sourceCoder}`;
  els.sessionDecisionEmpty.hidden = true;
  els.sessionDecisionEditor.hidden = false;
  els.sessionBubbleA.hidden = true;
  els.sessionBubbleB.hidden = true;
}

function acceptSessionDecision() {
  const candidate = sessionComparison.candidate;
  const code = els.sessionFinalCode.value.trim();
  if (!candidate || !code) { alert("Choose a highlighted code and enter the final code label first."); return; }
  sessionComparison.accepted.push({ id: uid("decision"), participantId: sessionComparison.activeParticipantId, code, quote: candidate.quote || "", start: candidate.start, end: candidate.end, startTimeSec: candidate.startTimeSec ?? null, endTimeSec: candidate.endTimeSec ?? null, sourceCoder: candidate.sourceCoder, sourceAnnotationId: candidate.id || candidate.comparisonId });
  sessionComparison.candidate = null;
  els.sessionDecisionEmpty.hidden = false;
  els.sessionDecisionEditor.hidden = true;
  renderAcceptedSessionDecisions();
  const activeTabCount = els.sessionParticipantTabs.querySelector(`[data-session-participant="${CSS.escape(sessionComparison.activeParticipantId)}"] small`);
  if (activeTabCount) activeTabCount.textContent = `${sessionComparison.accepted.filter((decision) => decision.participantId === sessionComparison.activeParticipantId).length} accepted`;
}

function buildFinalSessionPayload() {
  if (!sessionComparison.sessionA || !sessionComparison.participants.length) throw new Error("Load and compare two sessions first.");
  if (!sessionComparison.accepted.length) throw new Error("Accept at least one final code and highlight before downloading.");
  const coderId = els.finalSessionCoderId.value.trim();
  if (!coderId) throw new Error("Enter a final coder ID before downloading.");
  const transcriptByParticipant = new Map(sessionComparison.participants.map((item) => [item.participantId, item.transcriptA]));
  const annotations = sessionComparison.accepted.map((decision) => {
    const transcript = transcriptByParticipant.get(decision.participantId);
    return {
      id: decision.id,
      transcriptId: transcript.id,
      transcriptName: transcript.name,
      category: "",
      code: decision.code,
      quote: decision.quote,
      memo: `Reconciled from ${decision.sourceCoder}`,
      coderId,
      start: decision.start,
      end: decision.end,
      startTimeSec: decision.startTimeSec,
      endTimeSec: decision.endTimeSec,
      createdAt: new Date().toISOString(),
    };
  });
  const source = sessionComparison.sessionA.payload;
  const transcripts = sessionComparison.participants.map((item) => item.transcriptA);
  return {
    projectName: `Reconciled ${sessionComparison.sessionA.coderId} + ${sessionComparison.sessionB.coderId}`,
    coderId,
    researchQuestions: source.researchQuestions || "",
    transcripts,
    recordings: source.recordings || [],
    topics: source.topics || [...defaultTopics],
    activeId: transcripts[0]?.id || null,
    activeRecordingId: null,
    annotations,
    generatedCodeSuggestions: [],
    selectedAiSuggestionIndex: null,
    generatedCodeHistory: [],
    generatedSpecialHighlights: [],
    selectedRange: null,
    editingId: null,
    editingTranscript: false,
    setupComplete: true,
    savedAt: new Date().toISOString(),
    sessionFormat: "qual-code-desk-session",
    sessionVersion: 2,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadFinalSession() {
  try {
    const payload = buildFinalSessionPayload();
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
    const safeCoderId = payload.coderId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[_\.]+|[_\.]+$/g, "") || "reconciled";
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${safeCoderId}-${stamp}.session.json`);
  } catch (error) {
    alert(error.message || "Could not build the final session.");
  }
}

async function downloadFinalExcel() {
  try {
    const payload = buildFinalSessionPayload();
    const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Final Excel export failed.");
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${payload.coderId}_reconciled.xlsx`;
    downloadBlob(blob, filename);
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not export the final Excel file.");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Could not read workbook."));
    reader.readAsDataURL(file);
  });
}

function renderComparison() {
  if (!comparisonData) return;
  const shared = comparisonData.sharedParticipants || [];
  const onlyA = comparisonData.onlyParticipantsA || [];
  const onlyB = comparisonData.onlyParticipantsB || [];
  const alignmentMethod = comparisonData.method === "gpt"
    ? "OpenAI semantic alignment completed. Review semantic matches before merging labels."
    : comparisonData.method === "local_fallback"
      ? `OpenAI semantic matching was unavailable, so the local matcher completed the comparison. ${comparisonData.fallbackReason || "No error detail was returned."}`
      : "Local label-similarity alignment completed.";
  const workbookWarning = comparisonData.workbooksIdentical
    ? "These workbooks contain the same coded rows. Choose two genuinely separate coder exports to compare independent coding."
    : comparisonData.rowOverlap >= 0.9
      ? `These workbooks share ${Math.round(comparisonData.rowOverlap * 100)}% of their coded rows, so most results will be identical.`
      : comparisonData.mixedCoderWarning
        ? "At least one workbook contains multiple coder IDs. For a clean comparison, export one coder's rows per workbook."
        : "";
  els.participantAlignment.innerHTML = `
    <div><strong>${escapeHtml(comparisonData.coderA)}</strong><span>${comparisonData.participantsA.length} participants</span></div>
    <div class="alignment-shared"><strong>${shared.length} aligned participant ID${shared.length === 1 ? "" : "s"}</strong><span>${escapeHtml(shared.join(", ") || "None")}</span></div>
    <div><strong>${escapeHtml(comparisonData.coderB)}</strong><span>${comparisonData.participantsB.length} participants</span></div>
    ${(onlyA.length || onlyB.length) ? `<p class="alignment-warning">Not shared — A only: ${escapeHtml(onlyA.join(", ") || "none")}; B only: ${escapeHtml(onlyB.join(", ") || "none")}</p>` : ""}
    ${workbookWarning ? `<p class="workbook-warning">${escapeHtml(workbookWarning)}</p>` : ""}
    <p class="alignment-method ${comparisonData.method === "local_fallback" ? "is-fallback" : ""}">${escapeHtml(alignmentMethod)}</p>`;
  els.participantAlignment.hidden = false;
  const participantComparisons = comparisonData.participantComparisons || [];
  els.comparisonParticipantTabs.innerHTML = participantComparisons.map((comparison) => `
    <button type="button" class="comparison-participant-tab ${comparison.participantId === activeComparisonParticipantId ? "is-active" : ""}" data-comparison-participant="${escapeHtml(comparison.participantId)}">
      <span>${escapeHtml(comparison.participantId)} ${comparison.participantStatus === "a_only" ? '<em>A only</em>' : comparison.participantStatus === "b_only" ? '<em>B only</em>' : ""}</span>
      <small>${comparison.groups.filter((group) => group.accepted).length}/${comparison.groups.length} accepted</small>
    </button>`).join("");
  els.comparisonParticipantTabs.hidden = participantComparisons.length === 0;
  const codeButtons = (codes, side, groupIndex) => codes.length
    ? codes.map((code) => `<div class="code-chip-row ${selectedComparisonMove?.code === code && selectedComparisonMove?.side === side ? "is-selected-for-move" : ""}"><button type="button" draggable="true" class="code-label-choice draggable-code" data-label-value="${escapeHtml(code)}" data-code="${escapeHtml(code)}" data-side="${side}" data-group-index="${groupIndex}" title="Drag to another group, or click to use as the merged label">${escapeHtml(code)}</button><button type="button" class="move-code-button" data-move-code="${escapeHtml(code)}" data-move-side="${side}" data-move-group-index="${groupIndex}">Move</button></div>`).join("")
    : "—";
  comparisonData.groups.sort((left, right) => {
    const rank = (group) => group.accepted ? 2 : ((group.codesA || []).length && (group.codesB || []).length ? 0 : 1);
    return rank(left) - rank(right) || String(left.label || "").localeCompare(String(right.label || ""));
  });
  els.comparisonTableBody.innerHTML = comparisonData.groups.map((group, index) => `
    <tr data-comparison-index="${index}" class="${group.accepted ? "is-accepted" : ""}">
      <td class="code-drop-cell" data-drop-side="A" data-drop-group-index="${index}"><div class="code-cluster">${codeButtons(group.codesA || [], "A", index)}</div>${selectedComparisonMove?.side === "A" && selectedComparisonMove.groupIndex !== index ? `<button class="move-here-button" type="button" data-move-here-index="${index}">Move here</button>` : ""}</td>
      <td class="code-drop-cell" data-drop-side="B" data-drop-group-index="${index}"><div class="code-cluster">${codeButtons(group.codesB || [], "B", index)}</div>${selectedComparisonMove?.side === "B" && selectedComparisonMove.groupIndex !== index ? `<button class="move-here-button" type="button" data-move-here-index="${index}">Move here</button>` : ""}</td>
      <td><span class="participant-pills">${escapeHtml((group.participantOverlap || []).join(", ") || "—")}</span></td>
      <td><span class="match-score">${Math.round((group.similarity || 0) * 100)}%</span><small>${escapeHtml(group.reason || "")}</small></td>
      <td><div class="merged-label-controls"><input class="merged-label-input" type="text" value="${escapeHtml(group.label || [...(group.codesA || []), ...(group.codesB || [])][0] || "")}" aria-label="Merged label for code cluster"><button class="accept-row-button ${group.accepted ? "is-accepted" : ""}" type="button" data-accept-row-index="${index}">${group.accepted ? "✓ Accepted — undo" : "Accept row"}</button></div></td>
    </tr>`).join("");
  els.comparisonResults.hidden = false;
  els.comparisonMoveBar.hidden = !selectedComparisonMove;
  if (selectedComparisonMove) {
    els.comparisonMoveCode.textContent = selectedComparisonMove.code;
    els.comparisonMoveCoder.textContent = selectedComparisonMove.side === "A" ? comparisonData.coderA : comparisonData.coderB;
  }
}

function activateComparisonParticipant(participantId) {
  const comparison = (comparisonData?.participantComparisons || []).find((item) => item.participantId === participantId);
  if (!comparison) return;
  activeComparisonParticipantId = participantId;
  comparisonData.groups = comparison.groups;
  comparisonData.codesA = comparison.codesA;
  comparisonData.codesB = comparison.codesB;
  comparisonData.method = comparison.method;
  comparisonData.fallbackReason = comparison.fallbackReason;
  selectedComparisonMove = null;
  draggedComparisonCode = null;
  renderComparison();
}

function comparisonCodeParticipants(side, code) {
  const summaries = side === "A" ? comparisonData.codesA : comparisonData.codesB;
  return new Set((summaries || []).find((item) => item.code === code)?.participants || []);
}

function refreshComparisonGroup(group) {
  const participantsA = new Set();
  const participantsB = new Set();
  (group.codesA || []).forEach((code) => comparisonCodeParticipants("A", code).forEach((pid) => participantsA.add(pid)));
  (group.codesB || []).forEach((code) => comparisonCodeParticipants("B", code).forEach((pid) => participantsB.add(pid)));
  group.participantOverlap = [...participantsA].filter((pid) => participantsB.has(pid)).sort();
  group.similarity = 0;
  group.reason = "Manually arranged by reviewer.";
  group.accepted = false;
  const availableCodes = [...(group.codesA || []), ...(group.codesB || [])];
  if (!availableCodes.includes(group.label)) group.label = availableCodes[0] || "";
}

function moveComparisonCode(targetGroupIndex = null) {
  const move = draggedComparisonCode || selectedComparisonMove;
  if (!comparisonData || !move) return;
  const { code, side, groupIndex: sourceGroupIndex } = move;
  const source = comparisonData.groups[sourceGroupIndex];
  if (!source) return;
  const key = side === "A" ? "codesA" : "codesB";
  source[key] = (source[key] || []).filter((value) => value !== code);
  refreshComparisonGroup(source);

  if (targetGroupIndex === null) {
    const newGroup = { codesA: [], codesB: [], label: code, similarity: 0, participantOverlap: [], reason: "New group created manually." };
    newGroup[key].push(code);
    comparisonData.groups.push(newGroup);
    refreshComparisonGroup(newGroup);
  } else {
    const target = comparisonData.groups[targetGroupIndex];
    if (target && !target[key].includes(code)) target[key].push(code);
    if (target) {
      target[key].sort((left, right) => left.localeCompare(right));
      refreshComparisonGroup(target);
    }
  }
  comparisonData.groups = comparisonData.groups.filter((group) => (group.codesA || []).length || (group.codesB || []).length);
  draggedComparisonCode = null;
  selectedComparisonMove = null;
  renderComparison();
}

async function compareWorkbooks() {
  const fileA = els.coderAWorkbook.files?.[0];
  const fileB = els.coderBWorkbook.files?.[0];
  if (!fileA || !fileB) {
    alert("Choose both QualCodeDesk Excel exports first.");
    return;
  }
  els.compareWorkbooksButton.disabled = true;
  els.compareWorkbooksButton.textContent = "Aligning…";
  try {
    const [workbookA, workbookB] = await Promise.all([fileToBase64(fileA), fileToBase64(fileB)]);
    const response = await fetch("/api/compare-codebooks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workbookA, workbookB, useGpt: els.useGptAlignment.checked }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Workbook comparison failed.");
    comparisonData = payload;
    const firstParticipant = payload.participantComparisons?.[0]?.participantId;
    if (!firstParticipant) throw new Error("The workbooks do not contain any shared participant IDs.");
    activateComparisonParticipant(firstParticipant);
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not compare the workbooks.");
  } finally {
    els.compareWorkbooksButton.disabled = false;
    els.compareWorkbooksButton.textContent = "Align workbooks";
  }
}

function downloadComparisonCsv() {
  if (!comparisonData) return;
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["participant_id", "coder_a", "codes_a", "coder_b", "codes_b", "merged_label", "accepted", "similarity", "review_note"]];
  (comparisonData.participantComparisons || []).forEach((comparison) => comparison.groups.forEach((group) => rows.push([
    comparison.participantId, comparisonData.coderA, (group.codesA || []).join(" | "), comparisonData.coderB, (group.codesB || []).join(" | "), group.label, group.accepted ? "yes" : "no",
    group.similarity, group.reason,
  ])));
  const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "coder_reconciliation.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function activeTranscript() {
  return state.transcripts.find((item) => item.id === state.activeId);
}

function requireCoderId() {
  const coderId = els.coderIdInput.value.trim();
  if (!coderId) {
    els.coderIdInput.classList.add("is-required");
    els.coderIdInput.focus();
    setStatus("Enter coder ID first");
    return false;
  }
  state.coderId = coderId;
  els.coderIdInput.classList.remove("is-required");
  return true;
}

function renderCoderState() {
  if (document.activeElement !== els.coderIdInput && els.coderIdInput.value !== state.coderId) {
    els.coderIdInput.value = state.coderId || "";
  }
  const locked = !String(state.coderId || "").trim();
  els.editTranscriptButton.disabled = locked;
  els.generateCodesButton.disabled = locked;
  els.applyCode.disabled = locked;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value, length = 86) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token) {
  let value = String(token || "").toLowerCase();
  if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

function extractKeywords(value) {
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our", "she", "so", "that", "the", "their", "them", "there", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "why", "with", "you", "your",
  ]);

  const tokens = normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));

  const unique = [...new Set(tokens)];
  return unique.map((token) => ({ token, stem: stemToken(token) }));
}

function splitIntoSegments(text) {
  const content = String(text || "");
  const segments = [];
  const regex = /[^\n.!?]+[\n.!?]*/g;
  let match;
  while ((match = regex.exec(content))) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const localStart = raw.indexOf(trimmed);
    const start = match.index + (localStart >= 0 ? localStart : 0);
    const end = start + trimmed.length;
    segments.push({ start, end, quote: content.slice(start, end) });
  }

  if (!segments.length && content.trim()) {
    const trimmed = content.trim();
    const start = content.indexOf(trimmed);
    segments.push({ start: start >= 0 ? start : 0, end: (start >= 0 ? start : 0) + trimmed.length, quote: trimmed });
  }

  return segments;
}

function findFuzzyRange(text, query) {
  const content = String(text || "");
  const keywords = extractKeywords(query);
  if (!content || !keywords.length) return null;

  const segments = splitIntoSegments(content);
  if (!segments.length) return null;

  let best = null;
  for (const segment of segments) {
    const normalized = normalizeForMatch(segment.quote);
    if (!normalized) continue;

    const segmentTokens = new Set(normalized.split(" ").filter(Boolean));
    const segmentStems = new Set([...segmentTokens].map((token) => stemToken(token)));

    let matches = 0;
    for (const key of keywords) {
      if (segmentTokens.has(key.token) || segmentStems.has(key.stem)) {
        matches += 1;
      }
    }

    const coverage = matches / keywords.length;
    if (!best || coverage > best.coverage || (coverage === best.coverage && segment.quote.length > best.quote.length)) {
      best = { ...segment, coverage, matches };
    }
  }

  if (!best) return null;
  if (best.matches >= 2 || best.coverage >= 0.34) {
    return { start: best.start, end: best.end, quote: content.slice(best.start, best.end) };
  }
  return null;
}

function normalizeTranscriptText(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function parseTurnTimeSec(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatSecondsToTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timeForTranscriptOffset(transcript, offset) {
  const turns = transcript?.turns || [];
  if (!turns.length || !Number.isFinite(Number(offset))) return null;
  const point = Number(offset);
  let turn = turns.find((item) => point >= item.start && point <= item.end);
  if (!turn) {
    turn = point < turns[0].start ? turns[0] : turns[turns.length - 1];
  }
  const localPoint = point - turn.start;
  const wordTimings = turn.wordTimings || [];
  let word = wordTimings.find((item) => localPoint >= item.start && localPoint <= item.end);
  if (!word && wordTimings.length) {
    word = localPoint < wordTimings[0].start ? wordTimings[0] : wordTimings[wordTimings.length - 1];
  }
  if (word) {
    const wordStartTime = Number(word.startTimeSec);
    const wordEndTime = Number(word.endTimeSec);
    if (Number.isFinite(wordStartTime)) {
      if (!Number.isFinite(wordEndTime) || word.end <= word.start) return wordStartTime;
      const wordRatio = Math.max(0, Math.min(1, (localPoint - word.start) / (word.end - word.start)));
      return wordStartTime + wordRatio * (wordEndTime - wordStartTime);
    }
  }
  const startTime = Number(turn.startTimeSec);
  const endTime = Number(turn.endTimeSec);
  if (!Number.isFinite(startTime)) return null;
  if (!Number.isFinite(endTime) || turn.end <= turn.start) return startTime;
  const ratio = Math.max(0, Math.min(1, (point - turn.start) / (turn.end - turn.start)));
  return startTime + ratio * (endTime - startTime);
}

function annotationsForExport() {
  const transcriptsById = new Map(state.transcripts.map((item) => [item.id, item]));
  return state.annotations.map((annotation) => {
    const transcript = transcriptsById.get(annotation.transcriptId);
    const hasStartTime = annotation.startTimeSec !== null && annotation.startTimeSec !== "" && Number.isFinite(Number(annotation.startTimeSec));
    const hasEndTime = annotation.endTimeSec !== null && annotation.endTimeSec !== "" && Number.isFinite(Number(annotation.endTimeSec));
    const derivedStartTime = timeForTranscriptOffset(transcript, annotation.start);
    const derivedEndTime = timeForTranscriptOffset(transcript, annotation.end);
    const allowStoredTime = !transcript?.locallyEdited;
    return {
      ...annotation,
      coderId: annotation.coderId || state.coderId || "",
      startTimeSec: derivedStartTime ?? (allowStoredTime && hasStartTime ? Number(annotation.startTimeSec) : null),
      endTimeSec: derivedEndTime ?? (allowStoredTime && hasEndTime ? Number(annotation.endTimeSec) : null),
    };
  });
}

function findEvidenceRange(text, evidence, fallbackContext = "") {
  const content = String(text || "");
  const rawEvidence = String(evidence || "").trim();
  if (!content || (!rawEvidence && !fallbackContext.trim())) return null;

  if (rawEvidence) {
    let start = content.indexOf(rawEvidence);
    if (start >= 0) {
      return { start, end: start + rawEvidence.length, quote: content.slice(start, start + rawEvidence.length) };
    }

    const loweredText = content.toLowerCase();
    const loweredEvidence = rawEvidence.toLowerCase();
    start = loweredText.indexOf(loweredEvidence);
    if (start >= 0) {
      return { start, end: start + rawEvidence.length, quote: content.slice(start, start + rawEvidence.length) };
    }

    const normalizedEvidence = rawEvidence.replace(/\s+/g, " ").trim();
    if (normalizedEvidence) {
      const words = normalizedEvidence.split(" ").map(escapeRegex).filter(Boolean);
      if (words.length) {
        const whitespaceFlexible = new RegExp(words.join("\\s+"), "i");
        const match = whitespaceFlexible.exec(content);
        if (match && typeof match.index === "number") {
          return {
            start: match.index,
            end: match.index + match[0].length,
            quote: content.slice(match.index, match.index + match[0].length),
          };
        }
      }

      const shortEvidence = normalizedEvidence.slice(0, 80);
      start = loweredText.indexOf(shortEvidence.toLowerCase());
      if (start >= 0) {
        return { start, end: start + shortEvidence.length, quote: content.slice(start, start + shortEvidence.length) };
      }
    }
  }

  const fuzzy = findFuzzyRange(content, `${rawEvidence} ${fallbackContext}`.trim());
  if (fuzzy) return fuzzy;

  return null;
}

function normalizeTurns(turns) {
  return (turns || [])
    .map((turn) => ({
      ...turn,
      text: normalizeTranscriptText(turn.text),
      speakerLabel: turn.speakerLabel || (Number.isFinite(Number(turn.speakerId)) ? `Speaker ${Number(turn.speakerId) + 1}` : "Speaker"),
      speakerRole: turn.speakerRole || turn.speakerLabel || (Number.isFinite(Number(turn.speakerId)) ? `Speaker ${Number(turn.speakerId) + 1}` : "Speaker"),
      startTimeSec: parseTurnTimeSec(turn.startTimeSec),
      endTimeSec: parseTurnTimeSec(turn.endTimeSec),
    }))
    .filter((turn) => turn.text.trim().length);
}

function transcriptDisplayText(transcript) {
  if (transcript?.turns?.length) {
    return transcript.turns.map((turn) => turn.text).join("\n\n");
  }
  return transcript?.text || "";
}

function updateStructuredTurnsAfterEdit(transcript, newText) {
  const oldTurns = normalizeTurns(transcript?.turns);
  if (!oldTurns.length) return false;

  const editedBlocks = newText.split(/\n\s*\n/).filter((block) => block.trim());
  if (!editedBlocks.length) return false;

  let cursor = 0;
  transcript.turns = editedBlocks.map((block, index) => {
    const sourceIndex = editedBlocks.length === 1
      ? 0
      : Math.round(index * (oldTurns.length - 1) / (editedBlocks.length - 1));
    const turn = oldTurns[sourceIndex];
    const text = normalizeTranscriptText(block);
    const changed = editedBlocks.length !== oldTurns.length || text !== turn.text;
    const updated = {
      ...turn,
      text,
      start: cursor,
      end: cursor + text.length,
      ...(changed ? { wordTimings: [] } : {}),
    };
    cursor = updated.end + 2;
    return updated;
  });
  transcript.text = transcriptDisplayText(transcript);
  return true;
}

function normalizeTopics(topics) {
  const cleaned = (topics || [])
    .map((topic) => String(topic || "").trim())
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  return unique.length ? unique : [...defaultTopics];
}

function normalizeCodeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSuggestionList(suggestions) {
  return (suggestions || [])
    .map((suggestion) => ({
      code: String(suggestion.code || "").trim(),
      rationale: String(suggestion.rationale || "").trim(),
      evidence: String(suggestion.evidence || "").trim(),
      transcriptId: String(suggestion.transcriptId || "").trim(),
      transcriptName: String(suggestion.transcriptName || "").trim(),
    }))
    .filter((suggestion) => suggestion.code.length);
}

function mergeSuggestionHistory(history, suggestions, transcript) {
  const merged = new Map();

  (history || []).forEach((item) => {
    const code = String(item.code || "").trim();
    if (!code) return;
    const key = normalizeCodeKey(code);
    if (!key) return;
    merged.set(key, {
      code,
      rationale: String(item.rationale || "").trim(),
      evidence: String(item.evidence || "").trim(),
      lastSeenTranscriptId: String(item.lastSeenTranscriptId || "").trim(),
      lastSeenTranscriptName: String(item.lastSeenTranscriptName || "").trim(),
    });
  });

  (suggestions || []).forEach((item) => {
    const code = String(item.code || "").trim();
    if (!code) return;
    const key = normalizeCodeKey(code);
    if (!key) return;

    const existing = merged.get(key) || {};
    merged.set(key, {
      code,
      rationale: String(item.rationale || "").trim() || existing.rationale || "",
      evidence: String(item.evidence || "").trim() || existing.evidence || "",
      lastSeenTranscriptId: transcript?.id || existing.lastSeenTranscriptId || "",
      lastSeenTranscriptName: transcript?.name || existing.lastSeenTranscriptName || "",
    });
  });

  return [...merged.values()];
}

function collectReusableCodes() {
  return [...new Set(state.annotations
    .map((item) => String(item.code || "").trim())
    .filter(Boolean))];
}

function collectAvailableCodes() {
  const optionsByKey = new Map();

  const addOption = (code, description = "") => {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) return;
    const key = normalizeCodeKey(normalizedCode);
    if (!key) return;

    const existing = optionsByKey.get(key);
    if (!existing) {
      optionsByKey.set(key, {
        code: normalizedCode,
        description: String(description || "").trim(),
      });
      return;
    }

    if (!existing.description && description) {
      existing.description = String(description).trim();
    }
  };

  state.annotations.forEach((item) => addOption(item.code, item.memo));
  (state.generatedCodeHistory || []).forEach((item) => addOption(item.code, item.rationale));
  (state.generatedCodeSuggestions || []).forEach((item) => addOption(item.code, item.rationale));

  return [...optionsByKey.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function collectSpecialHighlights(transcript, suggestions) {
  if (!transcript || !transcript.text) return [];

  const highlights = [];
  for (const [suggestionIndex, suggestion] of (suggestions || []).entries()) {
    const code = String(suggestion.code || "").trim();

    const matched = findEvidenceRange(
      transcript.text,
      suggestion.evidence || suggestion.code,
      `${suggestion.rationale || ""} ${suggestion.code || ""}`,
    );
    if (!matched) continue;

    highlights.push({
      id: uid("autohighlight"),
      transcriptId: transcript.id,
      code,
      start: matched.start,
      end: matched.end,
      quote: matched.quote,
      suggestionIndex,
    });
  }

  const byRange = new Map();
  for (const item of highlights) {
    const key = `${item.transcriptId}:${item.start}:${item.end}:${item.code}`;
    if (!byRange.has(key)) byRange.set(key, item);
  }
  return [...byRange.values()];
}

function setStatus(text) {
  els.saveState.textContent = text;
}

function persistLocal() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    setStatus("Saved");
  } catch (error) {
    setStatus("Use Save Session File");
    console.warn("Browser storage could not hold this session. Use Save Session File for a local backup.", error);
  }
}

function restoreLocal() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    state.projectName = parsed.projectName || state.projectName;
    state.coderId = String(parsed.coderId || "");
    state.researchQuestions = String(parsed.researchQuestions || "").trim()
      ? String(parsed.researchQuestions)
      : defaultResearchQuestions;
    state.transcripts = (parsed.transcripts || []).map((transcript) => ({
      ...transcript,
      text: normalizeTranscriptText(transcript.text),
      turns: normalizeTurns(transcript.turns),
    }));
    state.topics = normalizeTopics(parsed.topics || parsed.categories);
    state.activeId = parsed.activeId || state.transcripts[0]?.id || null;
    state.annotations = parsed.annotations || [];
    state.generatedCodeSuggestions = normalizeSuggestionList(parsed.generatedCodeSuggestions);
    state.generatedCodeHistory = mergeSuggestionHistory(
      parsed.generatedCodeHistory,
      parsed.generatedCodeSuggestions,
    );
    state.generatedSpecialHighlights = (parsed.generatedSpecialHighlights || [])
      .map((item) => ({
        id: String(item.id || uid("autohighlight")),
        transcriptId: String(item.transcriptId || "").trim(),
        code: String(item.code || "").trim(),
        start: Number(item.start),
        end: Number(item.end),
        quote: String(item.quote || ""),
        suggestionIndex: item.suggestionIndex !== null && item.suggestionIndex !== undefined && Number.isInteger(Number(item.suggestionIndex))
          ? Number(item.suggestionIndex)
          : null,
      }))
      .filter((item) => item.transcriptId && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.code);
    state.setupComplete = Boolean(parsed.setupComplete);
  } catch (error) {
    console.warn("Could not restore browser session.", error);
    setStatus("Could not restore");
  }
}

async function loadDefaultTranscripts() {
  try {
    const response = await fetch("/api/transcripts");
    if (!response.ok) return;
    const payload = await response.json();
    const defaults = (payload.transcripts || []).map((transcript) => ({
      ...transcript,
      text: normalizeTranscriptText(transcript.text),
      turns: normalizeTurns(transcript.turns),
      loadedAt: transcript.loadedAt || new Date().toISOString(),
    }));
    const existingById = new Map(state.transcripts.map((transcript) => [transcript.id, transcript]));
    const defaultIds = new Set(defaults.map((transcript) => transcript.id));
    const retained = state.transcripts.filter((transcript) => (
      transcript.locallyEdited && transcript.source !== "sample"
    ) && !defaultIds.has(transcript.id));
    const refreshed = new Map(retained.map((transcript) => [transcript.id, transcript]));
    for (const transcript of defaults) {
      const existing = existingById.get(transcript.id);
      let localEdit = {};
      if (existing?.locallyEdited) {
        const repaired = {
          ...transcript,
          text: existing.text,
          turns: existing.turns?.length ? existing.turns : transcript.turns,
        };
        updateStructuredTurnsAfterEdit(repaired, existing.text);
        localEdit = {
          text: repaired.text || existing.text,
          turns: repaired.turns,
          locallyEdited: true,
        };
      }
      refreshed.set(transcript.id, {
        ...existing,
        ...transcript,
        ...localEdit,
      });
    }
    state.transcripts = [...refreshed.values()].sort((a, b) => transcriptSortValue(a.name) - transcriptSortValue(b.name) || a.name.localeCompare(b.name));
    state.annotations = state.annotations.filter((item) => !String(item.transcriptId || "").startsWith("sample:"));
    state.generatedSpecialHighlights = state.generatedSpecialHighlights
      .filter((item) => !String(item.transcriptId || "").startsWith("sample:"));
    if (!state.activeId || !state.transcripts.some((transcript) => transcript.id === state.activeId)) {
      state.activeId = state.transcripts[0]?.id || null;
    }
    renderAll();
    persistLocal();
    setStatus("Loaded transcripts");
  } catch (error) {
    console.warn("Could not load default transcripts.", error);
  }
}

async function loadDefaultRecordings() {
  try {
    const response = await fetch("/api/recordings");
    if (!response.ok) return;
    const payload = await response.json();
    const defaults = (payload.recordings || []).map((recording) => ({
      ...recording,
      loadedAt: recording.loadedAt || new Date().toISOString(),
    }));
    state.recordings = defaults.sort((a, b) => a.name.localeCompare(b.name));
    if (!state.activeRecordingId || !state.recordings.some((recording) => recording.id === state.activeRecordingId)) {
      state.activeRecordingId = state.recordings[0]?.id || null;
    }
    if (activeTranscript()) syncRecordingToTranscript(activeTranscript());
    renderAll();
    setStatus("Loaded recordings");
  } catch (error) {
    console.warn("Could not load recordings.", error);
  }
}

function matchingStem(item) {
  if (item?.recordingStem) return String(item.recordingStem).toLowerCase();
  return String(item?.name || "").replace(/\.deepgram\.json$/i, "").replace(/\.[^.]+$/, "").toLowerCase();
}

function syncRecordingToTranscript(transcript) {
  const stem = matchingStem(transcript);
  const recording = state.recordings.find((item) => matchingStem(item) === stem);
  state.activeRecordingId = recording?.id || null;
}

function syncTranscriptToRecording(recording) {
  const stem = matchingStem(recording);
  const transcript = state.transcripts.find((item) => matchingStem(item) === stem);
  if (transcript) state.activeId = transcript.id;
}

async function openSettings() {
  els.settingsModal.hidden = false;
  els.researchQuestionsInput.value = state.researchQuestions;
  els.openaiApiKeyInput.value = "";
  els.deepgramApiKeyInput.value = "";
  els.openaiKeyStatus.textContent = "Checking configuration...";
  els.deepgramKeyStatus.textContent = "Checking configuration...";
  setStatus("Loading settings...");
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) throw new Error(`Settings endpoint returned HTTP ${response.status}.`);
    runtimeSettings = await response.json();
    els.recordingsFolderInput.value = runtimeSettings.recordingsFolder || "";
    els.defaultRecordingsFolderHint.textContent = `Default: ${runtimeSettings.defaultRecordingsFolder || "QualCodeDesk/recordings"}`;
    els.openaiKeyStatus.textContent = runtimeSettings.openaiConfigured ? "A key is configured." : "No key is configured.";
    els.deepgramKeyStatus.textContent = runtimeSettings.deepgramConfigured ? "A key is configured." : "No key is configured.";
    setStatus("Settings open");
  } catch (error) {
    console.error(error);
    runtimeSettings = {};
    els.recordingsFolderInput.value = "";
    els.defaultRecordingsFolderHint.textContent = "Restart the local Python server to load and save server settings.";
    els.openaiKeyStatus.textContent = "Server settings unavailable until restart.";
    els.deepgramKeyStatus.textContent = "Server settings unavailable until restart.";
    setStatus("Restart server for settings");
  }
}

function closeSettings() {
  els.settingsModal.hidden = true;
}

async function saveSettings() {
  els.saveSettingsButton.disabled = true;
  setStatus("Saving settings...");
  const previousFolder = runtimeSettings.recordingsFolder || "";
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingsFolder: els.recordingsFolderInput.value.trim(),
        openaiApiKey: els.openaiApiKeyInput.value.trim(),
        deepgramApiKey: els.deepgramApiKeyInput.value.trim(),
      }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Settings could not be saved.");
    state.researchQuestions = els.researchQuestionsInput.value;
    persistLocal();
    saveSession(true);
    runtimeSettings = { ...runtimeSettings, ...payload };
    closeSettings();
    if (payload.recordingsFolder !== previousFolder) await refreshRecordings();
    setStatus("Settings saved");
  } catch (error) {
    console.error(error);
    setStatus("Settings save failed");
    alert(error.message || "Could not save settings.");
  } finally {
    els.saveSettingsButton.disabled = false;
  }
}

async function refreshRecordings() {
  els.refreshRecordingsButton.disabled = true;
  els.transcriptionProgress.hidden = false;
  els.transcriptionProgressText.textContent = "Checking for new recordings and generating missing transcripts...";
  setStatus("Refreshing recordings...");
  try {
    const response = await fetch("/api/refresh-recordings", { method: "POST" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.summary?.error || payload.error || "Refresh failed.");
    await loadDefaultTranscripts();
    await loadDefaultRecordings();
    if (activeTranscript()) syncRecordingToTranscript(activeTranscript());
    const summary = payload.summary || {};
    if (summary.failed) {
      setStatus(`Refresh finished: ${summary.created || 0} created, ${summary.failed} failed`);
    } else {
      setStatus(summary.created ? `Created ${summary.created} transcript${summary.created === 1 ? "" : "s"}` : "Recordings refreshed");
    }
  } catch (error) {
    console.error(error);
    setStatus("Recording refresh failed");
    alert(error.message || "Could not refresh recordings.");
  } finally {
    els.transcriptionProgress.hidden = true;
    els.refreshRecordingsButton.disabled = false;
  }
}

function transcriptSortValue(name) {
  const match = String(name || "").match(/P(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function applySessionPayload(payload) {
  state.projectName = payload.projectName || state.projectName;
  state.coderId = String(payload.coderId || state.coderId || "");
  state.researchQuestions = String(payload.researchQuestions || "").trim()
    ? String(payload.researchQuestions)
    : defaultResearchQuestions;
  state.transcripts = (payload.transcripts || []).map((transcript) => ({
    ...transcript,
    text: normalizeTranscriptText(transcript.text),
    turns: normalizeTurns(transcript.turns),
  }));
  state.topics = normalizeTopics(payload.topics || payload.categories);
  state.annotations = payload.annotations || [];
  state.generatedCodeSuggestions = normalizeSuggestionList(payload.generatedCodeSuggestions);
  state.generatedCodeHistory = mergeSuggestionHistory(
    payload.generatedCodeHistory,
    payload.generatedCodeSuggestions,
  );
  state.generatedSpecialHighlights = (payload.generatedSpecialHighlights || [])
    .map((item) => ({
      id: String(item.id || uid("autohighlight")),
      transcriptId: String(item.transcriptId || "").trim(),
      code: String(item.code || "").trim(),
      start: Number(item.start),
      end: Number(item.end),
      quote: String(item.quote || ""),
      suggestionIndex: item.suggestionIndex !== null && item.suggestionIndex !== undefined && Number.isInteger(Number(item.suggestionIndex))
        ? Number(item.suggestionIndex)
        : null,
    }))
    .filter((item) => item.transcriptId && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.code);
  state.activeId = payload.activeId || state.transcripts[0]?.id || null;
  state.selectedRange = null;
  state.editingId = null;
  state.setupComplete = Boolean(payload.setupComplete || state.topics.length);
  renderAll();
  persistLocal();
}

async function getSavedSession() {
  const response = await fetch("/api/session");
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.exists ? payload : null;
}

async function promptForSavedSession() {
  try {
    const saved = await getSavedSession();
    const savedAnnotations = saved?.session?.annotations?.length || 0;
    const savedSuggestions = saved?.session?.generatedCodeSuggestions?.length || 0;
    if (!savedAnnotations && !savedSuggestions) return;
    const savedAt = saved.savedAt ? ` from ${new Date(saved.savedAt).toLocaleString()}` : "";
    if (confirm(`Load your saved coding session${savedAt}? Choose Cancel to start fresh with the transcript files.`)) {
      applySessionPayload(saved.session);
      await loadDefaultTranscripts();
      saveSession(true);
      setStatus("Loaded saved");
    } else {
      startFresh(false);
    }
  } catch (error) {
    console.warn("Could not check saved session.", error);
  }
}



function showSetupModal() {
  els.projectNameInput.value = state.projectName || "";
  els.setupModal.hidden = false;
}

function finishSetup(useDefaults = false) {
  state.projectName = els.projectNameInput.value.trim() || "Qualitative coding project";
  state.setupComplete = true;
  els.setupModal.hidden = true;
  renderAll();
  persistLocal();
  saveSession(true);
  setStatus("Project ready");
}

function renderTranscriptList() {
  els.transcriptCount.textContent = state.transcripts.length;
  els.transcriptList.innerHTML = state.transcripts
    .map((transcript) => {
      const count = state.annotations.filter((item) => item.transcriptId === transcript.id).length;
      return `
        <button class="transcript-item ${transcript.id === state.activeId ? "active" : ""}" type="button" data-id="${transcript.id}">
          ${escapeHtml(transcript.name)}
          <small>${count} coded excerpts</small>
        </button>
      `;
    })
    .join("");
}

function renderStudyContext() {
  if (els.settingsModal.hidden && els.researchQuestionsInput.value !== state.researchQuestions) {
    els.researchQuestionsInput.value = state.researchQuestions;
  }
}

function renderAiSuggestions() {
  const suggestions = (state.generatedCodeSuggestions || [])
    .map((suggestion, stateIndex) => ({ ...suggestion, stateIndex }))
    .filter((suggestion) => suggestion.transcriptId === state.activeId);
  els.aiSuggestionCount.textContent = suggestions.length;
  if (!suggestions.length) {
    els.aiSuggestions.innerHTML = '<p class="suggestion-hint">Generate codes from the active transcript.</p>';
    return;
  }

  els.aiSuggestions.innerHTML = suggestions
    .map((suggestion) => `
      <div class="suggestion-row">
        <button class="suggestion-card ${suggestion.stateIndex === state.selectedAiSuggestionIndex ? "selected" : ""}" type="button" data-suggestion-index="${suggestion.stateIndex}">
          <span>${escapeHtml(suggestion.code || "Untitled code")}</span>
          <small>${escapeHtml(suggestion.rationale || suggestion.evidence || "Suggested by AI")}</small>
        </button>
        <button class="suggestion-delete" type="button" data-delete-suggestion-index="${suggestion.stateIndex}" aria-label="Delete AI suggestion" title="Delete suggestion">x</button>
      </div>
    `)
    .join("");
}

function renderRecordingList() {
  els.recordingCount.textContent = state.recordings.length;
  els.recordingList.innerHTML = state.recordings
    .map((recording) => {
      const active = recording.id === state.activeRecordingId;
      const label = recording.name;
      return `
        <div class="recording-item-wrap">
          <button class="transcript-item ${active ? "active" : ""}" type="button" data-recording-id="${recording.id}">
            ${escapeHtml(label)}
            <small>audio recording</small>
          </button>
          ${active ? `<audio class="recording-player" controls preload="none" src="${escapeHtml(recording.url)}" title="${escapeHtml(recording.name)}"></audio>` : ""}
        </div>
      `;
    })
    .join("");
}

function renderSectionState(sectionName, expanded) {
  const section = document.querySelector(`.collapsible-section[data-section="${sectionName}"]`);
  if (!section) return;
  section.classList.toggle("is-collapsed", !expanded);
  section.classList.toggle("is-expanded", expanded);
  const toggle = section.querySelector(".section-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(expanded));
  }
}

function initCollapsibleSections() {
  document.querySelectorAll(".section-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const sectionName = button.dataset.collapseTarget;
      const section = document.querySelector(`.collapsible-section[data-section="${sectionName}"]`);
      if (!section) return;
      const expanded = !section.classList.contains("is-collapsed");
      renderSectionState(sectionName, !expanded);
    });
  });
}

function renderReader() {
  const transcript = activeTranscript();
  els.reader.innerHTML = "";
  els.emptyState.hidden = Boolean(transcript);
  els.reader.hidden = !transcript;
  els.editTranscriptButton.disabled = !transcript;
  els.transcriptEditor.hidden = !transcript || !state.editingTranscript;
  if (transcript) els.reader.hidden = state.editingTranscript;
  els.activeTitle.textContent = transcript ? transcript.name : "No transcript loaded";
  els.reader.classList.toggle("structured", Boolean(transcript?.turns?.length));

  if (!transcript) return;

  transcript.turns = normalizeTurns(transcript.turns);
  if (transcript.turns.length) {
    transcript.text = transcriptDisplayText(transcript);
  } else {
    const normalizedText = normalizeTranscriptText(transcript.text);
    if (transcript.text !== normalizedText) {
      transcript.text = normalizedText;
    }
  }

  const text = transcript.text || "";
  if (!text.length) {
    els.reader.innerHTML = '<p class="reader-notice">This transcript loaded, but the file did not contain readable text.</p>';
    return;
  }

  const selectedRange = state.selectedRange && state.activeId === transcript.id ? state.selectedRange : null;
  const annotations = state.annotations
    .filter((item) => item.transcriptId === transcript.id)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const specialHighlights = (state.generatedSpecialHighlights || [])
    .filter((item) => item.transcriptId === transcript.id)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  if (transcript.turns?.length) {
    const blocks = transcript.turns.map((turn) => {
      const turnAnnotations = annotations.filter((item) => item.start < turn.end && item.end > turn.start);
      const points = new Set([turn.start, turn.end]);
      turnAnnotations.forEach((item) => {
        points.add(Math.max(turn.start, Math.min(turn.end, item.start)));
        points.add(Math.max(turn.start, Math.min(turn.end, item.end)));
      });
      specialHighlights.forEach((item) => {
        if (item.start < turn.end && item.end > turn.start) {
          points.add(Math.max(turn.start, Math.min(turn.end, item.start)));
          points.add(Math.max(turn.start, Math.min(turn.end, item.end)));
        }
      });
      if (selectedRange && selectedRange.start < turn.end && selectedRange.end > turn.start) {
        points.add(Math.max(turn.start, Math.min(turn.end, selectedRange.start)));
        points.add(Math.max(turn.start, Math.min(turn.end, selectedRange.end)));
      }

      const ordered = [...points].sort((a, b) => a - b);
      const chunks = [];
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const start = ordered[index];
        const end = ordered[index + 1];
        if (start === end) continue;
        const covering = turnAnnotations.find((item) => item.start <= start && item.end >= end);
        const special = specialHighlights.find((item) => item.start <= start && item.end >= end);
        const selected = selectedRange && selectedRange.start <= start && selectedRange.end >= end;
        const content = escapeHtml(text.slice(start, end));
        if (selected) {
          chunks.push(`<mark class="selected-mark" data-start="${start}" data-end="${end}">${content}</mark>`);
        } else if (covering) {
          chunks.push(`<mark class="coded-mark" data-id="${covering.id}" data-start="${start}" data-end="${end}" title="${escapeHtml(covering.category)}: ${escapeHtml(covering.code)}">${content}</mark>`);
        } else if (special) {
          chunks.push(`<mark class="special-example-mark" data-highlight-id="${special.id}" data-start="${start}" data-end="${end}" title="AI match: ${escapeHtml(special.code)}">${content}</mark>`);
        } else {
          chunks.push(`<span data-start="${start}" data-end="${end}">${content}</span>`);
        }
      }

      return `
        <section class="turn-block" data-speaker="${escapeHtml(turn.speakerRole || turn.speakerLabel || "Speaker")}">
          <div class="turn-label">
            ${escapeHtml(turn.speakerLabel || turn.speakerRole || "Speaker")}
            ${Number.isFinite(turn.startTimeSec) ? `<span class="turn-time">${escapeHtml(formatSecondsToTimestamp(turn.startTimeSec))}</span>` : ""}
          </div>
          <div class="turn-text">${chunks.join("")}</div>
        </section>
      `;
    });

    els.reader.innerHTML = blocks.join("");
    return;
  }

  const points = new Set([0, text.length]);
  annotations.forEach((item) => {
    points.add(Math.max(0, Math.min(text.length, item.start)));
    points.add(Math.max(0, Math.min(text.length, item.end)));
  });
  specialHighlights.forEach((item) => {
    points.add(Math.max(0, Math.min(text.length, item.start)));
    points.add(Math.max(0, Math.min(text.length, item.end)));
  });
  if (selectedRange) {
    points.add(Math.max(0, Math.min(text.length, selectedRange.start)));
    points.add(Math.max(0, Math.min(text.length, selectedRange.end)));
  }

  const ordered = [...points].sort((a, b) => a - b);
  const chunks = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === end) continue;
    const covering = annotations.find((item) => item.start <= start && item.end >= end);
    const special = specialHighlights.find((item) => item.start <= start && item.end >= end);
    const selected = selectedRange && selectedRange.start <= start && selectedRange.end >= end;
    const content = escapeHtml(text.slice(start, end));
    if (selected) {
      chunks.push(`<mark class="selected-mark" data-start="${start}" data-end="${end}">${content}</mark>`);
    } else if (covering) {
      chunks.push(`<mark class="coded-mark" data-id="${covering.id}" data-start="${start}" data-end="${end}" title="${escapeHtml(covering.category)}: ${escapeHtml(covering.code)}">${content}</mark>`);
    } else if (special) {
      chunks.push(`<mark class="special-example-mark" data-highlight-id="${special.id}" data-start="${start}" data-end="${end}" title="AI match: ${escapeHtml(special.code)}">${content}</mark>`);
    } else {
      chunks.push(`<span data-start="${start}" data-end="${end}">${content}</span>`);
    }
  }
  els.reader.innerHTML = chunks.join("");
}

function reusableDescription(code) {
  const key = normalizeCodeKey(code);
  if (!key) return null;
  for (let index = state.annotations.length - 1; index >= 0; index -= 1) {
    const annotation = state.annotations[index];
    if (normalizeCodeKey(annotation.code) === key && String(annotation.memo || "").trim()) {
      return String(annotation.memo).trim();
    }
  }
  return null;
}

function restoreDescriptionForCode() {
  const description = reusableDescription(els.codeInput.value);
  if (description !== null) {
    els.memoInput.value = description;
  } else if (!state.editingId) {
    els.memoInput.value = "";
  }
}

function buildCodeOptionMarkup(option, isActive) {
  const description = option.description || reusableDescription(option.code) || "";
  return `
    <button
      class="code-suggestion-item ${isActive ? "is-active" : ""}"
      type="button"
      data-code-option="${escapeHtml(option.code)}"
    >
      <strong>${escapeHtml(option.code)}</strong>
      <small>${escapeHtml(description || "Use this existing code")}</small>
    </button>
  `;
}

function renderCodeSuggestionsDropdown() {
  const query = String(els.codeInput.value || "").trim().toLowerCase();
  const availableCodes = collectAvailableCodes();
  filteredCodeOptions = availableCodes.filter((option) => {
    if (!query) return true;
    const haystack = `${option.code} ${option.description || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!filteredCodeOptions.length) {
    activeCodeOptionIndex = -1;
    els.codeSuggestionsList.innerHTML = query
      ? `<div class="code-suggestion-empty">No matching code yet. Press Enter or click Apply code to create "${escapeHtml(els.codeInput.value.trim())}".</div>`
      : '<div class="code-suggestion-empty">No existing codes yet. Start typing to create one.</div>';
    return;
  }

  if (activeCodeOptionIndex >= filteredCodeOptions.length) {
    activeCodeOptionIndex = filteredCodeOptions.length - 1;
  }

  els.codeSuggestionsList.innerHTML = filteredCodeOptions
    .map((option, index) => buildCodeOptionMarkup(option, index === activeCodeOptionIndex))
    .join("");
}

function renderSuggestions() {
  renderCodeSuggestionsDropdown();
}

function openCodeSuggestions() {
  renderCodeSuggestionsDropdown();
  els.codeInput.setAttribute("aria-expanded", "true");
}

function closeCodeSuggestions() {
  els.codeInput.setAttribute("aria-expanded", "false");
  activeCodeOptionIndex = -1;
}

function selectCodeOption(code) {
  els.codeInput.value = String(code || "").trim();
  els.codeInput.setAttribute("aria-expanded", "true");
  restoreDescriptionForCode();
}

function moveCodeOptionHighlight(direction) {
  openCodeSuggestions();
  if (!filteredCodeOptions.length) return;

  if (direction === "down") {
    activeCodeOptionIndex = activeCodeOptionIndex < filteredCodeOptions.length - 1
      ? activeCodeOptionIndex + 1
      : 0;
  } else {
    activeCodeOptionIndex = activeCodeOptionIndex > 0
      ? activeCodeOptionIndex - 1
      : filteredCodeOptions.length - 1;
  }

  renderCodeSuggestionsDropdown();
}

function renderAnnotations() {
  const transcriptsById = new Map(state.transcripts.map((item) => [item.id, item]));
  const rows = state.annotations
    .map((item) => {
      const transcript = transcriptsById.get(item.transcriptId);
      const participantId = String(transcript?.name || item.transcriptId || "")
        .replace(/\.deepgram\.json$/i, "")
        .replace(/\.[^.]+$/, "");
      return `
      <tr class="annotation-row" data-id="${item.id}">
        <td><strong>${escapeHtml(participantId)}</strong></td>
        <td><strong>${escapeHtml(item.code)}</strong></td>
        <td class="quote-cell">${escapeHtml(truncate(item.quote, 180))}</td>
        <td>${escapeHtml(item.memo || "")}</td>
      </tr>
    `;
    })
    .join("");
  els.annotationTable.innerHTML = rows || '<tr><td colspan="4">No coded excerpts yet.</td></tr>';
  const count = state.annotations.length;
  els.annotationCount.textContent = `${count} coded excerpt${count === 1 ? "" : "s"}`;
}

function renderAll() {
  renderCoderState();
  renderStudyContext();
  renderTranscriptList();
  renderRecordingList();
  renderReader();
  renderAiSuggestions();
  renderSuggestions();
  renderAnnotations();
  els.highlightExpandActions.hidden = !state.selectedRange;
  els.highlightEditHint.hidden = !state.editingId;
  els.selectedQuote.readOnly = !state.editingId;
  if (state.selectedRange) updateHighlightExpansionButtons();
}



function boundaryOffset(container, offset, usePrevious = false) {
  if (container.nodeType === Node.TEXT_NODE) {
    const segment = container.parentElement?.closest("[data-start]");
    if (!segment) return null;
    return Number(segment.dataset.start) + offset;
  }

  if (container.nodeType !== Node.ELEMENT_NODE) return null;
  const element = container;
  let child = element.childNodes[offset];

  if (!child && usePrevious && offset > 0) {
    child = element.childNodes[offset - 1];
    const previousSegment = child?.nodeType === Node.ELEMENT_NODE
      ? child.closest("[data-end]")
      : child?.parentElement?.closest("[data-end]");
    return previousSegment ? Number(previousSegment.dataset.end) : null;
  }

  const nextSegment = child?.nodeType === Node.ELEMENT_NODE
    ? child.closest("[data-start]")
    : child?.parentElement?.closest("[data-start]");
  return nextSegment ? Number(nextSegment.dataset.start) : null;
}

function getSelectionOffsets() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!els.reader.contains(range.commonAncestorContainer)) return null;

  const transcript = activeTranscript();
  if (!transcript) return null;

  let start = boundaryOffset(range.startContainer, range.startOffset);
  let end = boundaryOffset(range.endContainer, range.endOffset, true);
  if (start === null || end === null) return null;
  if (end < start) [start, end] = [end, start];

  const quote = transcript.text.slice(start, end);
  return { start, end: start + quote.length, quote };
}

function chooseRange(range) {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  if (!transcript || !range || !range.quote.trim()) return;
  state.selectedAiSuggestionIndex = null;
  closeCodeSuggestions();
  if (state.editingId) {
    const annotation = state.annotations.find((item) => item.id === state.editingId);
    if (!annotation) return;
    annotation.start = range.start;
    annotation.end = range.end;
    annotation.quote = transcript.text.slice(range.start, range.end);
    state.selectedRange = { start: annotation.start, end: annotation.end, quote: annotation.quote };
    els.selectedQuote.value = annotation.quote;
    renderReader();
    updateHighlightExpansionButtons();
    persistLocal();
    saveSession(true);
    setStatus("Highlight range updated");
    return;
  }
  state.selectedRange = {
    start: range.start,
    end: range.end,
    quote: transcript.text.slice(range.start, range.end),
  };
  state.editingId = null;
  els.selectedQuote.value = state.selectedRange.quote;
  els.selectedQuote.readOnly = true;
  els.highlightEditHint.hidden = true;
  els.codeInput.value = "";
  els.memoInput.value = "";
  els.deleteCode.hidden = true;
  els.highlightExpandActions.hidden = false;
  renderReader();
  updateHighlightExpansionButtons();
  setStatus("Selection ready");
}

function editAnnotation(id) {
  if (!requireCoderId()) return;
  const annotation = state.annotations.find((item) => item.id === id);
  if (!annotation) return;
  state.selectedAiSuggestionIndex = null;
  closeCodeSuggestions();
  state.editingId = id;
  state.selectedRange = {
    start: annotation.start,
    end: annotation.end,
    quote: annotation.quote,
  };
  state.activeId = annotation.transcriptId;
  syncRecordingToTranscript(activeTranscript());
  els.codeInput.value = annotation.code;
  els.memoInput.value = annotation.memo || "";
  els.selectedQuote.value = annotation.quote;
  els.selectedQuote.readOnly = false;
  els.highlightEditHint.hidden = false;
  els.selectedQuote.title = "Delete words here to remove their highlight. The transcript text will not change.";
  els.deleteCode.hidden = false;
  els.highlightExpandActions.hidden = false;
  renderAll();
  updateHighlightExpansionButtons();
}

function sentenceRanges(text) {
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    return [...segmenter.segment(text)]
      .map((item) => ({ start: item.index, end: item.index + item.segment.length }))
      .filter((item) => text.slice(item.start, item.end).trim().length);
  }

  const ranges = [];
  const pattern = /[^.!?]+(?:[.!?]+(?:\s+|$)|$)/g;
  let match;
  while ((match = pattern.exec(text))) {
    if (match[0].trim()) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function annotationSentenceIndexes(annotation, ranges) {
  const first = ranges.findIndex((range) => range.end > annotation.start);
  let last = first;
  ranges.forEach((range, index) => {
    if (range.start < annotation.end) last = index;
  });
  return { first, last };
}

function updateHighlightExpansionButtons() {
  const transcript = activeTranscript();
  const annotation = state.annotations.find((item) => item.id === state.editingId);
  const highlight = annotation || state.selectedRange;
  if (!transcript || !highlight) return;
  const ranges = sentenceRanges(transcript.text);
  const { first, last } = annotationSentenceIndexes(highlight, ranges);
  els.includePreviousSentence.disabled = first <= 0;
  els.includeNextSentence.disabled = last < 0 || last >= ranges.length - 1;
}

function expandHighlightToNeighbor(direction) {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  const annotation = state.annotations.find((item) => item.id === state.editingId);
  const highlight = annotation || state.selectedRange;
  if (!transcript || !highlight) return;
  const ranges = sentenceRanges(transcript.text);
  const { first, last } = annotationSentenceIndexes(highlight, ranges);
  if (first < 0) return;

  if (direction === "previous" && first > 0) highlight.start = ranges[first - 1].start;
  if (direction === "next" && last < ranges.length - 1) highlight.end = ranges[last + 1].end;
  highlight.quote = transcript.text.slice(highlight.start, highlight.end);
  state.selectedRange = { start: highlight.start, end: highlight.end, quote: highlight.quote };
  els.selectedQuote.value = highlight.quote;
  renderReader();
  updateHighlightExpansionButtons();
  persistLocal();
  saveSession(true);
  setStatus(direction === "previous" ? "Previous sentence included" : "Next sentence included");
}

function applyCode() {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  const category = "";
  const code = els.codeInput.value.trim();
  if (!transcript || !state.selectedRange || !code) {
    setStatus("Select text + code");
    return;
  }

  if (state.editingId) {
    const annotation = state.annotations.find((item) => item.id === state.editingId);
    if (annotation) {
      annotation.category = category;
      annotation.code = code;
      annotation.memo = els.memoInput.value.trim();
      annotation.coderId = state.coderId;
      const editedQuote = normalizeTranscriptText(els.selectedQuote.value);
      if (editedQuote !== annotation.quote) {
        const result = trimAnnotationHighlight(annotation, editedQuote);
        if (!result.ok) {
          setStatus("Only delete highlight text");
          return;
        }
        if (result.deleted) {
          finishCodeEdit("Highlight removed");
          return;
        }
      }
    }
  } else {
    state.annotations.push({
      id: uid("code"),
      transcriptId: transcript.id,
      transcriptName: transcript.name,
      category,
      code,
      quote: state.selectedRange.quote,
      memo: els.memoInput.value.trim(),
      coderId: state.coderId,
      start: state.selectedRange.start,
      end: state.selectedRange.end,
      createdAt: new Date().toISOString(),
    });
  }

  finishCodeEdit("Code saved");
}

function finishCodeEdit(status) {
  state.selectedAiSuggestionIndex = null;
  state.editingId = null;
  state.selectedRange = null;
  closeCodeSuggestions();
  els.selectedQuote.value = "Highlight text in the transcript.";
  els.selectedQuote.readOnly = true;
  els.highlightEditHint.hidden = true;
  els.selectedQuote.removeAttribute("title");
  els.codeInput.value = "";
  els.memoInput.value = "";
  els.deleteCode.hidden = true;
  els.highlightExpandActions.hidden = true;
  window.getSelection()?.removeAllRanges();
  persistLocal();
  renderAll();
  saveSession(true);
  setStatus(status);
}

function trimAnnotationHighlight(annotation, editedQuote) {
  const original = annotation.quote;
  if (!editedQuote.length) {
    state.annotations = state.annotations.filter((item) => item.id !== annotation.id);
    return { ok: true, deleted: true };
  }
  if (editedQuote.length >= original.length) return { ok: false };

  let prefixLength = 0;
  while (
    prefixLength < editedQuote.length
    && original[prefixLength] === editedQuote[prefixLength]
  ) prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < editedQuote.length - prefixLength
    && original[original.length - 1 - suffixLength] === editedQuote[editedQuote.length - 1 - suffixLength]
  ) suffixLength += 1;

  const expected = original.slice(0, prefixLength) + original.slice(original.length - suffixLength);
  if (expected !== editedQuote) return { ok: false };

  const fragments = [];
  if (prefixLength) {
    fragments.push({
      start: annotation.start,
      end: annotation.start + prefixLength,
      quote: original.slice(0, prefixLength),
    });
  }
  if (suffixLength) {
    fragments.push({
      start: annotation.end - suffixLength,
      end: annotation.end,
      quote: original.slice(original.length - suffixLength),
    });
  }

  const [first, ...rest] = fragments;
  Object.assign(annotation, first);
  rest.forEach((fragment) => {
    state.annotations.push({ ...annotation, ...fragment, id: uid("code") });
  });
  return { ok: true, deleted: false };
}

function beginTranscriptEdit() {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  if (!transcript) return;
  state.editingTranscript = true;
  els.transcriptEditorInput.value = transcript.text;
  renderReader();
  els.transcriptEditorInput.focus();
  setStatus("Editing transcript");
}

function cancelTranscriptEdit() {
  state.editingTranscript = false;
  renderReader();
  setStatus("Transcript unchanged");
}

function saveTranscriptEdit() {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  if (!transcript) return;
  const oldText = transcript.text;
  const newText = normalizeTranscriptText(els.transcriptEditorInput.value);
  if (!newText.trim()) {
    setStatus("Transcript cannot be empty");
    return;
  }
  if (newText !== oldText) {
    let prefix = 0;
    while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldText.length - prefix && suffix < newText.length - prefix
      && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) suffix += 1;
    const oldChangedEnd = oldText.length - suffix;
    const newChangedEnd = newText.length - suffix;
    const delta = newText.length - oldText.length;
    const remap = (item) => {
      const originalQuote = oldText.slice(item.start, item.end);
      const matches = [];
      let matchAt = newText.indexOf(originalQuote);
      while (originalQuote && matchAt >= 0) {
        matches.push(matchAt);
        matchAt = newText.indexOf(originalQuote, matchAt + 1);
      }
      if (matches.length) {
        const nearest = matches.reduce((best, value) => Math.abs(value - item.start) < Math.abs(best - item.start) ? value : best);
        item.start = nearest;
        item.end = nearest + originalQuote.length;
      } else if (item.start >= oldChangedEnd) {
        item.start += delta;
        item.end += delta;
      } else if (item.end > prefix) {
        item.start = Math.min(item.start, prefix);
        item.end = Math.max(item.start, newChangedEnd);
      }
      item.quote = newText.slice(item.start, item.end);
    };
    state.annotations.filter((item) => item.transcriptId === transcript.id).forEach(remap);
    state.generatedSpecialHighlights.filter((item) => item.transcriptId === transcript.id).forEach(remap);
    const keptStructuredTurns = updateStructuredTurnsAfterEdit(transcript, newText);
    if (!keptStructuredTurns) {
      transcript.text = newText;
      transcript.turns = [];
    }
    transcript.locallyEdited = true;
  }
  state.editingTranscript = false;
  state.selectedRange = null;
  state.editingId = null;
  els.selectedQuote.value = "Highlight text in the transcript.";
  els.selectedQuote.readOnly = true;
  els.highlightEditHint.hidden = true;
  persistLocal();
  renderAll();
  saveSession(true);
  setStatus("Transcript replaced");
}

function deleteCurrentCode() {
  if (!requireCoderId()) return;
  if (!state.editingId) return;
  state.annotations = state.annotations.filter((item) => item.id !== state.editingId);
  state.editingId = null;
  state.selectedRange = null;
  closeCodeSuggestions();
  els.selectedQuote.value = "Highlight text in the transcript.";
  els.selectedQuote.readOnly = true;
  els.highlightEditHint.hidden = true;
  els.selectedQuote.removeAttribute("title");
  els.codeInput.value = "";
  els.memoInput.value = "";
  els.deleteCode.hidden = true;
  els.highlightExpandActions.hidden = true;
  persistLocal();
  renderAll();
  saveSession(true);
}

async function saveSession(silent = false) {
  setStatus("Saving...");
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, annotations: annotationsForExport(), topics: state.topics, savedAt: new Date().toISOString() }),
    });
    if (response.ok) {
      const result = await response.json();
      setStatus(silent ? "Autosaved" : "Saved + Excel");
      return result;
    }
    setStatus("Save failed");
  } catch (error) {
    console.error(error);
    setStatus("Save failed");
  }
  return null;
}

async function loadSavedSession() {
  setStatus("Loading...");
  try {
    const saved = await getSavedSession();
    if (!saved?.session) {
      setStatus("No saved session");
      return;
    }
    applySessionPayload(saved.session);
    await loadDefaultTranscripts();
    saveSession(true);
    setStatus("Loaded saved");
  } catch (error) {
    console.error(error);
    setStatus("Load failed");
  }
}

function safeSessionFilename(value) {
  return String(value || "qualitative_coding")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "") || "qualitative_coding";
}

function saveSessionFile() {
  const savedAt = new Date();
  const payload = {
    ...state,
    annotations: annotationsForExport(),
    savedAt: savedAt.toISOString(),
    sessionFormat: "QualCodeDesk",
    sessionVersion: 1,
  };
  const stamp = savedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const nameParts = [state.projectName, state.coderId, stamp].filter(Boolean).map(safeSessionFilename);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nameParts.join("-")}.session.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  saveSession(true);
  setStatus("Session file saved");
}

async function loadSessionFile(file) {
  if (!file) return;
  setStatus("Loading session file...");
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || !Array.isArray(payload.transcripts) || !Array.isArray(payload.annotations)) {
      throw new Error("This is not a valid QualCodeDesk session file.");
    }
    applySessionPayload(payload);
    await loadDefaultRecordings();
    persistLocal();
    saveSession(true);
    setStatus(`Loaded ${file.name}`);
  } catch (error) {
    console.error(error);
    setStatus("Session file load failed");
    alert(error.message || "Could not load this session file.");
  }
}

async function startFresh(confirmFirst = true) {
  if (confirmFirst && !confirm("Start over? This clears current codes in the browser, but keeps the saved JSON/Excel backup on disk.")) return;
  localStorage.removeItem(storageKey);
  state.transcripts = state.transcripts.filter((transcript) => transcript.source === "transcripts" || transcript.source === "deepgram" || transcript.id.startsWith("folder:"));
  state.activeId = state.transcripts[0]?.id || null;
  state.annotations = [];
  state.selectedRange = null;
  state.editingId = null;
  state.generatedCodeSuggestions = [];
  state.generatedCodeHistory = [];
  state.generatedSpecialHighlights = [];
  state.setupComplete = true;
  renderAll();
  persistLocal();
  setStatus("Started fresh");
}

async function exportExcel() {
  setStatus("Exporting...");
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectName: state.projectName || "qualitative_coding",
      topics: state.topics,
      annotations: annotationsForExport(),
    }),
  });

  if (!response.ok) {
    setStatus("Export failed");
    return;
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || "qualitative_coding.xlsx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Excel exported");
}

async function loadSampleSession() {
  setStatus("Loading sample...");
  try {
    const response = await fetch("examples/sample_session.json");
    if (!response.ok) {
      setStatus("Sample missing");
      return;
    }
    const sample = await response.json();
    applySessionPayload(sample);
    saveSession(true);
    setStatus("Sample loaded");
  } catch (error) {
    console.error(error);
    setStatus("Sample failed");
  }
}

function startGenerationProgress() {
  if (generationProgressTimer) clearInterval(generationProgressTimer);
  let progress = 6;
  els.generateCodesButton.classList.add("is-generating");
  els.generateCodesButton.setAttribute("aria-busy", "true");
  els.generateCodesButton.style.setProperty("--generation-progress", `${progress}%`);
  els.generateCodesButton.textContent = "Generating codes...";
  generationProgressTimer = setInterval(() => {
    progress = Math.min(90, progress + Math.max(0.8, (90 - progress) * 0.055));
    els.generateCodesButton.style.setProperty("--generation-progress", `${progress}%`);
  }, 300);
}

function finishGenerationProgress(completed) {
  if (generationProgressTimer) clearInterval(generationProgressTimer);
  generationProgressTimer = null;
  if (completed) {
    els.generateCodesButton.style.setProperty("--generation-progress", "100%");
  }
  els.generateCodesButton.disabled = true;
  setTimeout(() => {
    els.generateCodesButton.classList.remove("is-generating");
    els.generateCodesButton.style.removeProperty("--generation-progress");
    els.generateCodesButton.textContent = "Generate codes";
    els.generateCodesButton.removeAttribute("aria-busy");
    els.generateCodesButton.disabled = !String(state.coderId || "").trim();
  }, completed ? 450 : 0);
}

async function generateCodes() {
  if (!requireCoderId()) return;
  const transcript = activeTranscript();
  if (!transcript) {
    setStatus("Choose a transcript");
    return;
  }
  const researchQuestions = state.researchQuestions.trim();
  if (!researchQuestions) {
    await openSettings();
    els.researchQuestionsInput.focus();
    setStatus("Add research questions first");
    return;
  }

  const transcriptText = transcript.turns?.length
    ? transcript.turns.map((turn) => `${turn.speakerLabel}: ${turn.text}`).join("\n\n")
    : transcript.text;
  const selectedQuote = state.selectedRange?.quote || "";
  const existingCodes = collectReusableCodes();

  setStatus("Generating codes...");
  els.generateCodesButton.disabled = true;
  startGenerationProgress();
  let completed = false;

  try {
    const response = await fetch("/api/generate-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcriptName: transcript.name,
        transcriptText,
        selectedQuote,
        existingCodes,
        researchQuestions,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Code generation failed.");
    }

    const transcriptSuggestions = normalizeSuggestionList(payload.suggestions).map((suggestion) => ({
      ...suggestion,
      transcriptId: transcript.id,
      transcriptName: transcript.name,
    }));
    state.generatedCodeSuggestions = state.generatedCodeSuggestions
      .filter((suggestion) => suggestion.transcriptId !== transcript.id)
      .concat(transcriptSuggestions);
    const transcriptHighlights = collectSpecialHighlights(transcript, transcriptSuggestions);
    state.generatedSpecialHighlights = state.generatedSpecialHighlights
      .filter((highlight) => highlight.transcriptId !== transcript.id)
      .concat(transcriptHighlights);

    renderAll();
    persistLocal();
    saveSession(true);
    const highlightCount = transcriptHighlights.length;
    if (highlightCount) {
      setStatus(`Codes generated + ${highlightCount} special example highlight${highlightCount === 1 ? "" : "s"}`);
    } else {
      setStatus("Codes generated");
    }
    completed = true;
  } catch (error) {
    console.error(error);
    setStatus("Code generation failed");
    alert(error.message || "Could not generate codes.");
  } finally {
    finishGenerationProgress(completed);
  }
}

els.transcriptList.addEventListener("click", (event) => {
  const button = event.target.closest(".transcript-item");
  if (!button) return;
  state.activeId = button.dataset.id;
  state.selectedRange = null;
  state.editingId = null;
  state.selectedAiSuggestionIndex = null;
  state.editingTranscript = false;
  syncRecordingToTranscript(activeTranscript());
  persistLocal();
  renderAll();
});

els.recordingList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-recording-id]");
  if (!button) return;
  state.activeRecordingId = button.dataset.recordingId;
  const recording = state.recordings.find((item) => item.id === state.activeRecordingId);
  syncTranscriptToRecording(recording);
  state.selectedRange = null;
  state.editingId = null;
  state.selectedAiSuggestionIndex = null;
  state.editingTranscript = false;
  persistLocal();
  renderAll();
});

function selectAiSuggestion(suggestionIndex, matchedRange = null) {
  const suggestion = state.generatedCodeSuggestions[suggestionIndex];
  if (!suggestion || suggestion.transcriptId !== state.activeId) return;

  state.selectedAiSuggestionIndex = suggestionIndex;
  els.codeInput.value = suggestion.code;
  closeCodeSuggestions();
  els.memoInput.value = reusableDescription(suggestion.code) || suggestion.rationale || suggestion.evidence || "";
  state.selectedRange = null;
  state.editingId = null;

  const transcript = activeTranscript();
  if (transcript) {
    if (transcript.turns?.length) {
      transcript.text = transcriptDisplayText(transcript);
    } else {
      transcript.text = normalizeTranscriptText(transcript.text);
    }

    const activeSuggestionIndices = state.generatedCodeSuggestions
      .map((item, index) => item.transcriptId === state.activeId ? index : -1)
      .filter((index) => index >= 0);
    const transcriptSuggestionIndex = activeSuggestionIndices.indexOf(suggestionIndex);
    const linkedHighlight = state.generatedSpecialHighlights.find((highlight) => (
      highlight.transcriptId === state.activeId
      && (
        highlight.suggestionIndex === transcriptSuggestionIndex
        || (highlight.suggestionIndex == null && normalizeCodeKey(highlight.code) === normalizeCodeKey(suggestion.code))
      )
    ));
    const matched = matchedRange || linkedHighlight || findEvidenceRange(
      transcript.text,
      suggestion.evidence || suggestion.code,
      `${suggestion.rationale || ""} ${suggestion.code || ""}`,
    );
    if (matched) {
      state.selectedRange = {
        start: matched.start,
        end: matched.end,
        quote: transcript.text.slice(matched.start, matched.end),
      };
      els.selectedQuote.value = state.selectedRange.quote;
      els.selectedQuote.readOnly = true;
      els.highlightEditHint.hidden = true;
      els.deleteCode.hidden = true;
      els.highlightExpandActions.hidden = false;
      renderReader();
      renderAiSuggestions();
      updateHighlightExpansionButtons();
      const firstSegment = els.reader.querySelector(`[data-start="${state.selectedRange.start}"]`);
      firstSegment?.scrollIntoView({ block: "center", behavior: "smooth" });
      const suggestionCard = els.aiSuggestions.querySelector(`[data-suggestion-index="${suggestionIndex}"]`);
      suggestionCard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setStatus("Suggestion selected + highlighted");
      return;
    }
  }

  els.selectedQuote.value = "Highlight text in the transcript.";
  els.highlightExpandActions.hidden = true;
  renderReader();
  renderAiSuggestions();
  setStatus("Suggestion selected");
}

els.aiSuggestions.addEventListener("click", (event) => {
  if (!requireCoderId()) return;
  const deleteButton = event.target.closest("button[data-delete-suggestion-index]");
  if (deleteButton) {
    const suggestionIndex = Number(deleteButton.dataset.deleteSuggestionIndex);
    if (Number.isInteger(suggestionIndex) && suggestionIndex >= 0 && suggestionIndex < state.generatedCodeSuggestions.length) {
      state.selectedAiSuggestionIndex = null;
      const [removed] = state.generatedCodeSuggestions.splice(suggestionIndex, 1);
      const removedKey = normalizeCodeKey(removed?.code || "");
      if (removedKey) {
        state.generatedCodeHistory = (state.generatedCodeHistory || []).filter((item) => normalizeCodeKey(item.code) !== removedKey);
      }
      renderAiSuggestions();
      renderSuggestions();
      persistLocal();
      saveSession(true);
      setStatus("Suggestion removed");
    }
    return;
  }

  const button = event.target.closest("button[data-suggestion-index]");
  if (!button) return;
  selectAiSuggestion(Number(button.dataset.suggestionIndex));
});

els.reader.addEventListener("mouseup", () => {
  chooseRange(getSelectionOffsets());
});

els.reader.addEventListener("keyup", () => {
  chooseRange(getSelectionOffsets());
});

els.reader.addEventListener("click", (event) => {
  const mark = event.target.closest(".coded-mark");
  if (mark) {
    editAnnotation(mark.dataset.id);
    return;
  }
  const aiMark = event.target.closest(".special-example-mark");
  if (!aiMark || !requireCoderId()) return;
  const highlight = state.generatedSpecialHighlights.find((item) => item.id === aiMark.dataset.highlightId);
  if (!highlight || highlight.transcriptId !== state.activeId) return;
  const activeSuggestions = state.generatedCodeSuggestions
    .map((suggestion, stateIndex) => ({ suggestion, stateIndex }))
    .filter(({ suggestion }) => suggestion.transcriptId === state.activeId);
  const indexedSuggestion = Number.isInteger(highlight.suggestionIndex)
    ? activeSuggestions[highlight.suggestionIndex]
    : null;
  const suggestionIndex = indexedSuggestion?.stateIndex ?? state.generatedCodeSuggestions.findIndex((suggestion) => (
    suggestion.transcriptId === state.activeId
    && normalizeCodeKey(suggestion.code) === normalizeCodeKey(highlight.code)
  ));
  if (suggestionIndex < 0) return;
  selectAiSuggestion(suggestionIndex, highlight);
});

els.annotationTable.addEventListener("click", (event) => {
  const row = event.target.closest(".annotation-row");
  if (row) editAnnotation(row.dataset.id);
});

els.applyCode.addEventListener("click", applyCode);
els.codeInput.addEventListener("focus", openCodeSuggestions);
els.codeInput.addEventListener("input", () => {
  activeCodeOptionIndex = -1;
  restoreDescriptionForCode();
  openCodeSuggestions();
});
els.codeInput.addEventListener("change", restoreDescriptionForCode);
els.codeInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveCodeOptionHighlight("down");
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveCodeOptionHighlight("up");
    return;
  }
  if (event.key === "Enter" && activeCodeOptionIndex >= 0) {
    event.preventDefault();
    selectCodeOption(filteredCodeOptions[activeCodeOptionIndex]?.code || "");
    return;
  }
  if (event.key === "Escape") {
    activeCodeOptionIndex = -1;
    renderCodeSuggestionsDropdown();
  }
});
els.codeDropdownToggle.addEventListener("click", () => {
  openCodeSuggestions();
  els.codeInput.focus();
});
els.codeSuggestionsList.addEventListener("mousedown", (event) => {
  event.preventDefault();
  const option = event.target.closest("[data-code-option]");
  if (!option) return;
  selectCodeOption(option.dataset.codeOption);
});
els.coderIdInput.addEventListener("input", () => {
  state.coderId = els.coderIdInput.value.trim();
  els.coderIdInput.classList.toggle("is-required", !state.coderId);
  renderCoderState();
  persistLocal();
});
els.includePreviousSentence.addEventListener("click", () => expandHighlightToNeighbor("previous"));
els.includeNextSentence.addEventListener("click", () => expandHighlightToNeighbor("next"));
els.settingsButton.addEventListener("click", openSettings);
els.closeSettingsButton.addEventListener("click", closeSettings);
els.cancelSettingsButton.addEventListener("click", closeSettings);
els.saveSettingsButton.addEventListener("click", saveSettings);
els.refreshRecordingsButton.addEventListener("click", refreshRecordings);
els.editTranscriptButton.addEventListener("click", beginTranscriptEdit);
els.saveTranscriptEdit.addEventListener("click", saveTranscriptEdit);
els.cancelTranscriptEdit.addEventListener("click", cancelTranscriptEdit);
els.deleteCode.addEventListener("click", deleteCurrentCode);
els.generateCodesButton.addEventListener("click", generateCodes);
els.saveButton.addEventListener("click", saveSessionFile);
els.loadSessionButton.addEventListener("click", () => {
  els.sessionFileInput.value = "";
  els.sessionFileInput.click();
});
els.sessionFileInput.addEventListener("change", () => loadSessionFile(els.sessionFileInput.files?.[0]));
els.sampleButton.addEventListener("click", loadSampleSession);
els.exportButton.addEventListener("click", exportExcel);
els.workspaceTabs.forEach((button) => button.addEventListener("click", () => selectWorkspaceTab(button.dataset.workspaceTab)));
els.collapseSidebarButton.addEventListener("click", () => setSidebarCollapsed(true));
els.restoreSidebarButton.addEventListener("click", () => setSidebarCollapsed(false));
els.coderASessionInput.addEventListener("change", () => { els.coderASessionName.textContent = els.coderASessionInput.files?.[0]?.name || "Choose a .session.json file"; });
els.coderBSessionInput.addEventListener("change", () => { els.coderBSessionName.textContent = els.coderBSessionInput.files?.[0]?.name || "Choose a .session.json file"; });
els.loadSessionComparisonButton.addEventListener("click", loadSessionComparison);
els.sessionParticipantTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-session-participant]");
  if (!button) return;
  sessionComparison.activeParticipantId = button.dataset.sessionParticipant;
  renderSessionComparisonParticipant();
});
els.sessionTranscriptA.addEventListener("click", (event) => showSessionCodeBubble(event, "A"));
els.sessionTranscriptB.addEventListener("click", (event) => showSessionCodeBubble(event, "B"));
[els.sessionBubbleA, els.sessionBubbleB].forEach((bubble) => bubble.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-choose-session-code]");
  if (button) chooseSessionAnnotation(button.dataset.chooseSessionSide, button.dataset.chooseSessionCode);
}));
let syncingSessionScroll = false;
function syncSessionTranscriptScroll(source, target) {
  if (syncingSessionScroll) return;
  syncingSessionScroll = true;
  const sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
  target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
  requestAnimationFrame(() => { syncingSessionScroll = false; });
}
els.sessionTranscriptA.addEventListener("scroll", () => syncSessionTranscriptScroll(els.sessionTranscriptA, els.sessionTranscriptB));
els.sessionTranscriptB.addEventListener("scroll", () => syncSessionTranscriptScroll(els.sessionTranscriptB, els.sessionTranscriptA));
els.acceptSessionDecision.addEventListener("click", acceptSessionDecision);
els.downloadFinalSessionButton.addEventListener("click", downloadFinalSession);
els.downloadFinalExcelButton.addEventListener("click", downloadFinalExcel);
els.acceptedSessionDecisions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-session-decision]");
  if (!button) return;
  sessionComparison.accepted = sessionComparison.accepted.filter((item) => item.id !== button.dataset.removeSessionDecision);
  renderAcceptedSessionDecisions();
});
els.coderAWorkbook.addEventListener("change", () => { els.coderAFileName.textContent = els.coderAWorkbook.files?.[0]?.name || "Choose a QualCodeDesk Excel export"; });
els.coderBWorkbook.addEventListener("change", () => { els.coderBFileName.textContent = els.coderBWorkbook.files?.[0]?.name || "Choose a QualCodeDesk Excel export"; });
els.compareWorkbooksButton.addEventListener("click", compareWorkbooks);
els.downloadComparisonButton.addEventListener("click", downloadComparisonCsv);
els.comparisonParticipantTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-comparison-participant]");
  if (button) activateComparisonParticipant(button.dataset.comparisonParticipant);
});
els.comparisonTableBody.addEventListener("click", (event) => {
  const acceptButton = event.target.closest("button[data-accept-row-index]");
  if (acceptButton && comparisonData) {
    const group = comparisonData.groups[Number(acceptButton.dataset.acceptRowIndex)];
    if (group && !group.accepted && !String(group.label || "").trim()) {
      alert("Enter a merged label before accepting this row.");
      return;
    }
    if (group) group.accepted = !group.accepted;
    selectedComparisonMove = null;
    renderComparison();
    return;
  }
  const moveButton = event.target.closest("button[data-move-code]");
  if (moveButton) {
    const scrollTop = els.comparisonTableWrap.scrollTop;
    selectedComparisonMove = {
      code: moveButton.dataset.moveCode,
      side: moveButton.dataset.moveSide,
      groupIndex: Number(moveButton.dataset.moveGroupIndex),
    };
    renderComparison();
    els.comparisonTableWrap.scrollTop = scrollTop;
    return;
  }
  const moveHereButton = event.target.closest("button[data-move-here-index]");
  if (moveHereButton && selectedComparisonMove) {
    moveComparisonCode(Number(moveHereButton.dataset.moveHereIndex));
    return;
  }
  const row = event.target.closest("tr[data-comparison-index]");
  const choice = event.target.closest("button[data-label-value]");
  if (!row || !choice || !comparisonData) return;
  const group = comparisonData.groups[Number(row.dataset.comparisonIndex)];
  group.label = choice.dataset.labelValue;
  if (group.accepted) {
    group.accepted = false;
    renderComparison();
  } else {
    row.querySelector(".merged-label-input").value = group.label;
  }
});
els.cancelComparisonMove.addEventListener("click", () => {
  const scrollTop = els.comparisonTableWrap.scrollTop;
  selectedComparisonMove = null;
  renderComparison();
  els.comparisonTableWrap.scrollTop = scrollTop;
});
els.moveComparisonToNewGroup.addEventListener("click", () => moveComparisonCode(null));
els.comparisonTableBody.addEventListener("input", (event) => {
  const row = event.target.closest("tr[data-comparison-index]");
  if (!row || !event.target.matches(".merged-label-input") || !comparisonData) return;
  const group = comparisonData.groups[Number(row.dataset.comparisonIndex)];
  group.label = event.target.value.trim();
  if (group.accepted) {
    group.accepted = false;
    row.classList.remove("is-accepted");
    const button = row.querySelector(".accept-row-button");
    button.classList.remove("is-accepted");
    button.textContent = "Accept row";
  }
});
els.comparisonTableBody.addEventListener("dragstart", (event) => {
  const codeButton = event.target.closest(".draggable-code");
  if (!codeButton) return;
  draggedComparisonCode = {
    code: codeButton.dataset.code,
    side: codeButton.dataset.side,
    groupIndex: Number(codeButton.dataset.groupIndex),
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", codeButton.dataset.code);
  codeButton.classList.add("is-dragging");
});
els.comparisonTableBody.addEventListener("dragend", (event) => {
  event.target.closest(".draggable-code")?.classList.remove("is-dragging");
  document.querySelectorAll(".is-drag-over").forEach((node) => node.classList.remove("is-drag-over"));
  draggedComparisonCode = null;
});
els.comparisonTableBody.addEventListener("dragover", (event) => {
  const cell = event.target.closest(".code-drop-cell");
  if (!cell || !draggedComparisonCode || cell.dataset.dropSide !== draggedComparisonCode.side) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  cell.classList.add("is-drag-over");
});
els.comparisonTableBody.addEventListener("dragleave", (event) => {
  const cell = event.target.closest(".code-drop-cell");
  if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove("is-drag-over");
});
els.comparisonTableBody.addEventListener("drop", (event) => {
  const cell = event.target.closest(".code-drop-cell");
  if (!cell || !draggedComparisonCode || cell.dataset.dropSide !== draggedComparisonCode.side) return;
  event.preventDefault();
  moveComparisonCode(Number(cell.dataset.dropGroupIndex));
});
els.newComparisonGroupDropzone.addEventListener("dragover", (event) => {
  if (!draggedComparisonCode) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  els.newComparisonGroupDropzone.classList.add("is-drag-over");
});
els.newComparisonGroupDropzone.addEventListener("dragleave", () => els.newComparisonGroupDropzone.classList.remove("is-drag-over"));
els.newComparisonGroupDropzone.addEventListener("drop", (event) => {
  if (!draggedComparisonCode) return;
  event.preventDefault();
  moveComparisonCode(null);
});
els.finishSetupButton.addEventListener("click", () => finishSetup(false));
els.useDefaultSetupButton.addEventListener("click", () => finishSetup(true));

els.cancelSelection.addEventListener("click", () => {
  state.selectedRange = null;
  state.editingId = null;
  closeCodeSuggestions();
  els.selectedQuote.value = "Highlight text in the transcript.";
  els.selectedQuote.readOnly = true;
  els.highlightEditHint.hidden = true;
  els.selectedQuote.removeAttribute("title");
  els.codeInput.value = "";
  els.memoInput.value = "";
  els.deleteCode.hidden = true;
  els.highlightExpandActions.hidden = true;
  window.getSelection()?.removeAllRanges();
  renderAll();
});

els.clearButton.addEventListener("click", () => {
  startFresh(true);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    applyCode();
  }
});

async function init() {
  setSidebarCollapsed(localStorage.getItem(sidebarCollapsedKey) === "true", false);
  restoreLocal();
  els.deleteCode.hidden = true;
  renderAll();
  initCollapsibleSections();
  renderSectionState("transcripts", true);
  renderSectionState("recordings", true);
  await loadDefaultTranscripts();
  await loadDefaultRecordings();
  await promptForSavedSession();
  if (!state.setupComplete) {
    showSetupModal();
  }
}

init();
