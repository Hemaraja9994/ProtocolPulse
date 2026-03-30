// CONFIGURATION
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const CLIENT_ID = "0356354577-XXXXXXXXXXXXXXXXX.apps.googleusercontent.com";
const DRIVE_API_KEY = "YOUR_GOOGLE_DRIVE_API_KEY";

// Initialization
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
let aggregatedText = "";
let auditData = null;
let currentRole = 'consensus';

// --- FILE PARSING ENGINE (PDF, WORD, IMAGE) ---
const fileInput = document.getElementById('fileInput');
document.getElementById('dropZone').onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    aggregatedText = "";
    document.getElementById('fileStatus').innerHTML = "";

    for (const file of files) {
        let text = "";
        const status = document.createElement('div');
        status.className = "text-[9px] text-emerald-400 font-bold";
        status.innerText = `⏳ Processing: ${file.name}...`;
        document.getElementById('fileStatus').appendChild(status);

        try {
            if (file.type === "application/pdf") {
                text = await parsePDF(file);
            } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                text = await parseWord(file);
            } else if (file.type.startsWith("image/")) {
                text = await parseImage(file);
            }
            aggregatedText += ` [Document: ${file.name}] \n ${text} \n`;
            status.innerText = `✅ Loaded: ${file.name}`;
        } catch (err) {
            status.innerText = `❌ Error: ${file.name}`;
            console.error(err);
        }
    }
};

async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let t = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        t += content.items.map(s => s.str).join(" ") + " ";
    }
    return t;
}

async function parseWord(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

async function parseImage(file) {
    const result = await Tesseract.recognize(file, 'eng');
    return result.data.text;
}

// --- AI CORE ---
async function startMultiPersonaAudit() {
    if (!aggregatedText) return alert("Please upload documents first.");
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    btn.innerText = "COMMITTEE IN SESSION...";

    const prompt = `Act as an Indian Ethics Committee. Analyze the provided text against ICMR 2017 Guidelines.
    CONTEXT: ${aggregatedText.substring(0, 15000)}
    
    You must output EXACT JSON format:
    {
      "consensus": {"analysis": "...", "score": 80, "checks": [{"item": "PICO", "status": "Success", "note": "Valid"}]},
      "lawyer": {"analysis": "...", "score": 70, "checks": [{"item": "Liability", "status": "Scrutinize", "note": "Missing clause"}]},
      "clinician": {"analysis": "...", "score": 90, "checks": [{"item": "Risk", "status": "Success", "note": "Minimal"}]},
      "layperson": {"analysis": "...", "score": 40, "checks": [{"item": "Language", "status": "Modify", "note": "Too technical"}]},
      "secretary": {"analysis": "...", "score": 85, "checks": [{"item": "CV", "status": "Success", "note": "Updated"}]}
    }`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const rawJson = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
        auditData = JSON.parse(rawJson);
        
        loadUI();
    } catch (err) {
        alert("AI processing failed. Check your API key.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Run Multi-Persona Audit";
    }
}

function loadUI() {
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('roleSelector').classList.remove('hidden');
    renderRole('consensus');
}

function renderRole(role) {
    currentRole = role;
    const data = auditData[role];
    
    // UI Update
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('role-active'));
    document.getElementById(`btn-${role}`).classList.add('role-active');
    
    document.getElementById('roleTitle').innerText = role.toUpperCase();
    document.getElementById('roleAnalysis').innerText = data.analysis;
    document.getElementById('totalScore').innerText = data.score + "%";
    document.getElementById('forecastText').innerText = data.score > 70 ? "Likely Approval" : "Major Scrutiny Required";

    let html = "";
    data.checks.forEach(c => {
        const typeClass = c.status.toLowerCase(); // success, modify, scrutinize
        html += `
            <div class="${typeClass} p-4 rounded-2xl glass-card flex justify-between items-center shadow-lg">
                <div>
                    <p class="text-[10px] font-black uppercase text-slate-500">${c.item}</p>
                    <p class="text-xs font-bold text-white">${c.note}</p>
                </div>
                <span class="text-[9px] font-black px-2 py-1 bg-black/40 rounded-full border border-white/10">${c.status}</span>
            </div>
        `;
    });
    document.getElementById('checklistItems').innerHTML = html;
    updateChart(data.score);
}

// Visuals
let chart;
function updateChart(score) {
    const ctx = document.getElementById('miniChart').getContext('2d');
    if(chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [score, 100-score], backgroundColor: ['#10b981', '#1e293b'], borderWidth: 0, cutout: '85%' }] },
        options: { plugins: { tooltip: { enabled: false } } }
    });
}