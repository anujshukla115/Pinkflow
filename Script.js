// PinkFlow Tracker - Full Functional App

let currentDisplayMonth = new Date();
let periodMarkers = new Map(); // key "YYYY-MM-DD" -> true (period day)
let cyclesHistory = []; // { start, end, cycleLength }
let moodLogs = []; // { date, mood, symptoms[] }
let cycleChart = null;

// DOM elements
const calendarGrid = document.getElementById("calendarGrid");
const monthYearDisplay = document.getElementById("monthYearDisplay");
const cycleDaySpan = document.getElementById("cycleDayValue");
const nextPeriodSpan = document.getElementById("nextPeriodDate");
const daysLeftSpan = document.getElementById("daysRemainingCount");
const ovulationDateSpan = document.getElementById("ovulationDate");
const healthInsightSpan = document.getElementById("healthInsight");
const historyTableBody = document.querySelector("#historyTable tbody");
const avgCycleSpan = document.getElementById("avgCycleStat");
const avgPeriodSpan = document.getElementById("avgPeriodStat");
const longestCycleSpan = document.getElementById("longestCycleStat");
const shortestCycleSpan = document.getElementById("shortestCycleStat");

// Helper: format date
function formatYMD(date) {
  return date.toISOString().split('T')[0];
}
function parseYMD(str) {
  return new Date(str + "T00:00:00");
}

// Load/save storage
function loadStorage() {
  const storedPeriods = localStorage.getItem("pinkflow_periods");
  if (storedPeriods) periodMarkers = new Map(JSON.parse(storedPeriods));
  const storedHistory = localStorage.getItem("pinkflow_cycles");
  if (storedHistory) cyclesHistory = JSON.parse(storedHistory);
  const storedMoods = localStorage.getItem("pinkflow_moods");
  if (storedMoods) moodLogs = JSON.parse(storedMoods);
}
function savePeriods() {
  localStorage.setItem("pinkflow_periods", JSON.stringify(Array.from(periodMarkers.entries())));
}
function saveCycles() {
  localStorage.setItem("pinkflow_cycles", JSON.stringify(cyclesHistory));
}
function saveMoods() {
  localStorage.setItem("pinkflow_moods", JSON.stringify(moodLogs));
}

// Add period range (startDate, endDate inclusive)
function addPeriodRange(startDate, endDate) {
  let current = new Date(startDate);
  let end = new Date(endDate);
  while (current <= end) {
    periodMarkers.set(formatYMD(current), true);
    current.setDate(current.getDate() + 1);
  }
  savePeriods();
  refreshCalendarAndUI();
  recalcCycleHistoryFromPeriods();
}

function clearAllPeriods() {
  periodMarkers.clear();
  savePeriods();
  refreshCalendarAndUI();
  recalcCycleHistoryFromPeriods();
}

// Reconstruct cycles from period markers (detect bleeding intervals)
function recalcCycleHistoryFromPeriods() {
  const sortedDates = Array.from(periodMarkers.keys()).sort();
  if (sortedDates.length === 0) return;
  let intervals = [];
  let currentStart = null, prevDate = null;
  for (let d of sortedDates) {
    let dateObj = parseYMD(d);
    if (!currentStart) currentStart = dateObj;
    else if (prevDate && (dateObj - prevDate) > 86400000 * 2) { // gap >1 day -> new period
      intervals.push({ start: new Date(currentStart), end: prevDate });
      currentStart = dateObj;
    }
    prevDate = dateObj;
  }
  if (currentStart) intervals.push({ start: currentStart, end: prevDate });
  cyclesHistory = [];
  for (let i = 0; i < intervals.length; i++) {
    let cycleLen = (i === 0) ? 28 : Math.round((intervals[i].start - intervals[i-1].start) / 86400000);
    cyclesHistory.push({
      start: formatYMD(intervals[i].start),
      end: formatYMD(intervals[i].end),
      cycleLength: cycleLen
    });
  }
  saveCycles();
  updateStatsAndChart();
  renderHistoryTable();
  updateDashboardAndPredictions();
}

// Update statistics and chart
function updateStatsAndChart() {
  if (cyclesHistory.length === 0) {
    avgCycleSpan.innerText = "--"; avgPeriodSpan.innerText = "--";
    longestCycleSpan.innerText = "--"; shortestCycleSpan.innerText = "--";
    if (cycleChart) cycleChart.destroy();
    return;
  }
  let lengths = cyclesHistory.map(c => c.cycleLength).filter(l => l > 0);
  let avgCycle = lengths.reduce((a,b)=>a+b,0)/lengths.length;
  let durations = cyclesHistory.map(c => { let start=parseYMD(c.start), end=parseYMD(c.end); return (end-start)/86400000+1; });
  let avgPeriod = durations.reduce((a,b)=>a+b,0)/durations.length;
  let longest = Math.max(...lengths);
  let shortest = Math.min(...lengths);
  avgCycleSpan.innerText = Math.round(avgCycle); avgPeriodSpan.innerText = avgPeriod.toFixed(1);
  longestCycleSpan.innerText = longest; shortestCycleSpan.innerText = shortest;

  if (cycleChart) cycleChart.destroy();
  const ctx = document.getElementById('cycleChart').getContext('2d');
  cycleChart = new Chart(ctx, {
    type: 'line', data: { labels: cyclesHistory.map((_,i)=>`Cycle ${i+1}`), datasets: [{ label: 'Cycle Length (days)', data: lengths, borderColor: '#ec489a', tension: 0.3 }] }
  });
}

function renderHistoryTable() {
  historyTableBody.innerHTML = "";
  cyclesHistory.slice().reverse().forEach((c, idx) => {
    let row = historyTableBody.insertRow();
    row.insertCell(0).innerText = c.start;
    row.insertCell(1).innerText = c.end;
    row.insertCell(2).innerText = c.cycleLength || "—";
    let delBtn = document.createElement("button");
    delBtn.innerText = "Delete";
    delBtn.classList.add("delete-history");
    delBtn.onclick = () => {
      // remove period markers within this range
      let startDate = parseYMD(c.start), endDate = parseYMD(c.end);
      let current = new Date(startDate);
      while (current <= endDate) {
        periodMarkers.delete(formatYMD(current));
        current.setDate(current.getDate()+1);
      }
      savePeriods();
      recalcCycleHistoryFromPeriods();
      refreshCalendarAndUI();
    };
    row.insertCell(3).appendChild(delBtn);
  });
}

function getNextPeriodPrediction(cycleLen, lastStart, periodDur) {
  let lastDate = parseYMD(lastStart);
  let nextStart = new Date(lastDate);
  nextStart.setDate(nextStart.getDate() + cycleLen);
  let fertileStart = new Date(nextStart); fertileStart.setDate(fertileStart.getDate() - 18);
  let fertileEnd = new Date(nextStart); fertileEnd.setDate(fertileEnd.getDate() - 11);
  let ovulation = new Date(nextStart); ovulation.setDate(ovulation.getDate() - 14);
  return { nextPeriod: nextStart, fertileWindow: `${formatYMD(fertileStart)} to ${formatYMD(fertileEnd)}`, ovulationDay: formatYMD(ovulation) };
}

function updateDashboardAndPredictions() {
  let lastPeriod = cyclesHistory.length ? cyclesHistory[cyclesHistory.length-1].start : null;
  let avgCycle = 28, periodDur = 5;
  if (cyclesHistory.length) {
    let lens = cyclesHistory.map(c=>c.cycleLength).filter(l=>l>0);
    if (lens.length) avgCycle = Math.round(lens.reduce((a,b)=>a+b,0)/lens.length);
    let lastHist = cyclesHistory[cyclesHistory.length-1];
    if (lastHist.end && lastHist.start) periodDur = Math.round((parseYMD(lastHist.end)-parseYMD(lastHist.start))/86400000)+1;
  }
  let lastStartInput = document.getElementById("lastPeriodStart");
  let cycleLenInput = document.getElementById("cycleLength");
  let periodDurInput = document.getElementById("periodDuration");
  if (lastPeriod) lastStartInput.value = lastPeriod;
  cycleLenInput.value = avgCycle;
  periodDurInput.value = periodDur;
  let lastStart = lastStartInput.value;
  if (!lastStart) return;
  let cycleLength = parseInt(cycleLenInput.value);
  let periodDuration = parseInt(periodDurInput.value);
  let pred = getNextPeriodPrediction(cycleLength, lastStart, periodDuration);
  document.getElementById("predNextPeriod").innerText = formatYMD(pred.nextPeriod);
  document.getElementById("predFertile").innerText = pred.fertileWindow;
  document.getElementById("predOvulation").innerText = pred.ovulationDay;
  let today = new Date();
  let todayStr = formatYMD(today);
  let nextDate = pred.nextPeriod;
  let diffDays = Math.ceil((nextDate - today) / 86400000);
  let daysLeft = diffDays > 0 ? diffDays : 0;
  nextPeriodSpan.innerText = formatYMD(nextDate);
  daysLeftSpan.innerText = daysLeft;
  document.getElementById("daysLeftText").innerHTML = `${daysLeft} days left`;
  ovulationDateSpan.innerText = pred.ovulationDay;
  // cycle day
  let lastPeriodDate = parseYMD(lastStart);
  let cycleDay = Math.floor((today - lastPeriodDate) / 86400000) + 1;
  if (cycleDay < 1 || cycleDay > cycleLength+5) cycleDay = cycleDay % cycleLength || 1;
  cycleDaySpan.innerText = cycleDay;
  let insight = (cycleDay <= 5) ? "🩸 Menstrual phase: rest, iron-rich foods." : (cycleDay <= 13 ? "✨ Follicular phase: energy rising!" : (cycleDay <= 27 ? "🥚 Ovulation phase: peak fertility" : "🌙 Luteal phase: self-care, magnesium"));
  healthInsightSpan.innerText = insight;
  document.getElementById("healthTipMsg").innerHTML = insight + " Stay hydrated & balanced meals.";
  // Notification reminder check
  if (daysLeft <= 5 && daysLeft >= 1 && Notification.permission === "granted") {
    if (!localStorage.getItem(`reminded_${formatYMD(nextDate)}`)) {
      new Notification("PinkFlow Reminder", { body: `Your period is expected in ${daysLeft} days!`, icon: "🌸" });
      localStorage.setItem(`reminded_${formatYMD(nextDate)}`, "true");
    }
  }
}

// Build calendar
function refreshCalendarAndUI() {
  let year = currentDisplayMonth.getFullYear();
  let month = currentDisplayMonth.getMonth();
  let firstDay = new Date(year, month, 1);
  let startWeekday = firstDay.getDay();
  let daysInMonth = new Date(year, month+1, 0).getDate();
  calendarGrid.innerHTML = "";
  for (let i = 0; i < startWeekday; i++) { let empty = document.createElement("div"); calendarGrid.appendChild(empty); }
  for (let d = 1; d <= daysInMonth; d++) {
    let dateObj = new Date(year, month, d);
    let dateStr = formatYMD(dateObj);
    let dayDiv = document.createElement("div");
    dayDiv.classList.add("cal-day");
    dayDiv.innerText = d;
    if (periodMarkers.has(dateStr)) dayDiv.classList.add("period-day");
    // Fertile window highlight for demo (based on prediction)
    let avgC = parseInt(document.getElementById("cycleLength").value) || 28;
    let lastStart = document.getElementById("lastPeriodStart").value;
    if (lastStart) {
      let pred = getNextPeriodPrediction(avgC, lastStart, 5);
      let fertileStart = parseYMD(pred.fertileWindow.split(" to ")[0]);
      let fertileEnd = parseYMD(pred.fertileWindow.split(" to ")[1]);
      if (dateObj >= fertileStart && dateObj <= fertileEnd) dayDiv.classList.add("fertile-day");
    }
    dayDiv.addEventListener("click", () => {
      if (periodMarkers.has(dateStr)) {
        periodMarkers.delete(dateStr);
      } else {
        periodMarkers.set(dateStr, true);
      }
      savePeriods();
      refreshCalendarAndUI();
      recalcCycleHistoryFromPeriods();
    });
    calendarGrid.appendChild(dayDiv);
  }
  monthYearDisplay.innerText = `${year}年 ${month+1}月`;
  updateDashboardAndPredictions();
  renderHistoryTable();
  updateStatsAndChart();
}

// Mark Range Modal simplified
document.getElementById("markRangeBtn").addEventListener("click", () => {
  let start = prompt("Enter period start date (YYYY-MM-DD):", formatYMD(new Date()));
  let end = prompt("Enter period end date (YYYY-MM-DD):", formatYMD(new Date()));
  if (start && end) addPeriodRange(start, end);
});
document.getElementById("clearPeriodBtn").addEventListener("click", clearAllPeriods);
document.getElementById("prevMonthBtn").addEventListener("click", () => { currentDisplayMonth.setMonth(currentDisplayMonth.getMonth()-1); refreshCalendarAndUI(); });
document.getElementById("nextMonthBtn").addEventListener("click", () => { currentDisplayMonth.setMonth(currentDisplayMonth.getMonth()+1); refreshCalendarAndUI(); });
document.getElementById("calculateBtn").addEventListener("click", () => {
  updateDashboardAndPredictions();
  recalcCycleHistoryFromPeriods();
});

// Mood Logging
document.getElementById("saveLogBtn").addEventListener("click", () => {
  let logDate = document.getElementById("logDate").value;
  if (!logDate) return alert("Select date");
  let moodBtn = document.querySelector(".mood-btn.active");
  let mood = moodBtn ? moodBtn.getAttribute("data-mood") : "neutral";
  let symptoms = Array.from(document.querySelectorAll(".symptoms-group input:checked")).map(cb => cb.value);
  let existing = moodLogs.findIndex(l => l.date === logDate);
  let entry = { date: logDate, mood, symptoms };
  if (existing !== -1) moodLogs[existing] = entry;
  else moodLogs.push(entry);
  saveMoods();
  document.getElementById("logFeedback").innerText = "Saved! ✨";
  setTimeout(()=>document.getElementById("logFeedback").innerText="", 2000);
});
document.querySelectorAll(".mood-btn").forEach(btn => {
  btn.addEventListener("click", function() { document.querySelectorAll(".mood-btn").forEach(b=>b.classList.remove("active")); this.classList.add("active"); });
});

// Export CSV/PDF
document.getElementById("exportMenuBtn").addEventListener("click", (e) => {
  let dropdown = document.getElementById("exportDropdown");
  dropdown.classList.toggle("hidden");
});
document.getElementById("exportCSVBtn").addEventListener("click", () => {
  let csvRows = [["Date","Mood","Symptoms"]];
  moodLogs.forEach(log => { csvRows.push([log.date, log.mood, log.symptoms.join(";")]); });
  let csv = csvRows.map(row=>row.join(",")).join("\n");
  let blob = new Blob([csv], {type:"text/csv"});
  let a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pinkflow_logs.csv"; a.click();
});
document.getElementById("exportPDFBtn").addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  let doc = new jsPDF();
  doc.text("PinkFlow Tracker Report", 20, 10);
  doc.text(`Generated: ${new Date()}`, 20, 20);
  doc.save("pinkflow_report.pdf");
});

// Dark Mode Toggle
document.getElementById("themeToggleBtn").addEventListener("click", () => {
  let theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "dark");
});

// Notification Permission
if ("Notification" in window) Notification.requestPermission();

// Initialize
loadStorage();
document.getElementById("logDate").value = formatYMD(new Date());
refreshCalendarAndUI();
recalcCycleHistoryFromPeriods();
setInterval(()=>{ updateDashboardAndPredictions(); refreshCalendarAndUI(); }, 60000);
