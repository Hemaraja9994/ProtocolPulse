// --- 1. CONFIGURATION ---
const GEMINI_API_KEY = "AIzaSyASNALxuCaP0q53fGnP79DiFGN-YRBcDnU";
const CLIENT_ID = "881373992475-pdlivcbo8eem8k5sivhh6i2riv06fqav.apps.googleusercontent.com";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let aggregatedText = "";
let auditData = null;
let currentCategory = "full";
let currentPersona = "consensus";

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- 2. GOOGLE DRIVE ENGINE ---
function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS }); }); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); }
window.onload = () => { gapiLoaded(); gisLoaded(); };
function handleAuthClick() {
    tokenClient.callback = async (resp) => { if (resp.error) return; document.getElementById('driveBtn').innerText = "Drive Active"; saveToDrive(); };
    tokenClient.requestAccessToken({prompt: 'consent'});
}

// --- 3. UI HANDLERS ---
function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('cat-active'));
    document.getElementById(`cat-${cat}`).classList.add('cat-active');
}
function setPersona(p) {
    currentPersona = p;
    document.querySelectorAll('.role-link').forEach(b => b.classList.remove('role-active'));
    document.getElementById(`p-${p}`).classList.add('role-active');
    if (auditData) renderResult();
}

// --- 4. MULTI-FORMAT PARSER ---
const fileInput = document.getElementById('fileInput');
document.getElementById('dropZone').onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    aggregatedText = "";
    document.getElementById('fileStatus').innerHTML = "";
    for (const file of files) {
        const div = document.createElement('div');
        div.className = "text-[9px] font-bold text-orange-600";
        div.innerText = `⏳ Parsing ${file.name}`;
        document.getElementById('fileStatus').appendChild(div);
        try {
            let text = "";
            if (file.type === "application/pdf") text = await parsePDF(file);
            else if (file.type.includes("word") || file.name.endsWith('.docx')) text = await parseWord(file);
            else if (file.type.startsWith("image/")) text = await parseImage(file);
            aggregatedText += `\n[FILE CONTENT: ${file.name}]\n${text}\n`;
            div.innerText = `✅ Loaded: ${file.name}`;
            div.className = "text-[9px] font-bold text-emerald-600";
        } catch (err) { div.innerText = `❌ Error: ${file.name}`; }
    }
};

async function parsePDF(f) {
    const buf = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let t = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        t += content.items.map(s => s.str).join(" ") + " ";
    }
    return t;
}
async function parseWord(f) { const buf = await f.arrayBuffer(); const res = await mammoth.extractRawText({ arrayBuffer: buf }); return res.value; }
async function parseImage(f) { const res = await Tesseract.recognize(f, 'eng'); return res.data.text; }

// --- 5. AI LOGIC ---
async function executeAnalysis() {
    if(!aggregatedText) return alert("Upload protocols first.");
    const btn = document.getElementById('runBtn');
    btn.disabled = true; btn.innerText = "BOARD DELIBERATING...";

    const prompt = `Act as an Indian Ethics Committee Auditor. Analyze this protocol based on ICMR 2017 & NDCTR 2019. 
    Category: ${currentCategory}. 
    Text: ${aggregatedText.substring(0, 15000)}
    
    Output ONLY pure JSON. 
    JSON Format: {"consensus": {"analysis": "...", "score": 85, "checks": [{"item": "Consent", "status": "success", "note": "Clear language used"}]}, "chairperson": {...}, "secretary": {...}, "lawyer": {...}, "clinician": {...}, "layperson": {...}}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        let rawJson = data.candidates[0].content.parts[0].text;
        rawJson = rawJson.substring(rawJson.indexOf('{'), rawJson.lastIndexOf('}') + 1);
        auditData = JSON.parse(rawJson);
        
        document.getElementById('welcome').classList.add('hidden');
        document.getElementById('resultsUI').classList.remove('hidden');
        renderResult();
    } catch (e) { alert("AI Error. Ensure API Key is enabled for Generative Language API."); }
    finally { btn.disabled = false; btn.innerText = "Run War Room Audit"; }
}

function renderResult() {
    const data = auditData[currentPersona];
    document.getElementById('viewLabel').innerText = currentPersona;
    document.getElementById('roleTitle').innerText = currentPersona.toUpperCase() + " PERSPECTIVE";
    document.getElementById('roleAnalysis').innerText = data.analysis;
    document.getElementById('totalScore').innerText = data.score + "%";

    let html = "";
    data.checks.forEach(c => {
        const type = c.status.toLowerCase();
        html += `<div class="${type} shadow-sm border border-navy/5">
            <p class="text-[9px] font-black uppercase opacity-60 tracking-widest">${c.item}</p>
            <p class="text-xs font-bold leading-tight mt-1">${c.note}</p>
            <span class="text-[8px] font-black uppercase mt-2 block opacity-40">Verification Status: ${c.status}</span>
        </div>`;
    });
    document.getElementById('checklistItems').innerHTML = html;
    updateChart(data.score);
}

let chart;
function updateChart(score) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [score, 100-score], backgroundColor: ['#F97316', '#F1F5F9'], borderWidth: 0, cutout: '82%' }] }
    });
}

// --- 6. EXPORT ENGINES ---
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(255); doc.setFontSize(20); doc.text("EthicShield Formal Review", 15, 25);
    doc.setFontSize(8); doc.text("Conceptualized and Academic Designed by Mr. Hemaraja Nayaka.S", 15, 35);
    doc.autoTable({ startY: 60, head: [['Criteria', 'Status', 'Observation']], body: auditData.consensus.checks.map(c => [c.item, c.status.toUpperCase(), c.note]), theme: 'grid' });
    doc.save("Ethics_Audit.pdf");
}

function exportWord() {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = window.docx;
    const doc = new Document({
        sections: [{ children: [
            new Paragraph({ children: [new TextRun({ text: "EthicShield AI Audit Report", bold: true, size: 32 })] }),
            new Paragraph({ text: "Conceptualized and Academic Designed by Mr. Hemaraja Nayaka.S" }),
            new Paragraph({ text: auditData.consensus.analysis }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
                new TableRow({ children: [ new TableCell({ children: [new Paragraph("Criteria")] }), new TableCell({ children: [new Paragraph("Status")] }), new TableCell({ children: [new Paragraph("Observations")] }) ]}),
                ...auditData.consensus.checks.map(c => new TableRow({ children: [ new TableCell({ children: [new Paragraph(c.item)] }), new TableCell({ children: [new Paragraph(c.status)] }), new TableCell({ children: [new Paragraph(c.note)] }) ]}))
            ]})
        ]}]
    });
    Packer.toBlob(doc).then(blob => saveAs(blob, "Ethics_Audit.docx"));
}

async function saveToDrive() {
    const token = gapi.client.getToken();
    if (!token) return handleAuthClick();
    const file = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: `EthicShield_${Date.now()}.json`, mimeType: 'application/json' })], { type: 'application/json' }));
    form.append('file', file);
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + token.access_token }), body: form });
    alert("Saved to Google Drive Successfully.");
}