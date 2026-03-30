// --- 1. CONFIGURATION ---
const GEMINI_API_KEY = "AIzaSyASNALxuCaP0q53fGnP79DiFGN-YRBcDnU";
const CLIENT_ID = "881373992475-qult3qi6a1klfpfalp6m7p4k3kasscds.apps.googleusercontent.com";
const DRIVE_API_KEY = ""; // Optional if only using client ID
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let aggregatedText = "";
let auditData = null;
let currentCategory = "full";
let currentPersona = "consensus";

// Initialize PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- 2. GOOGLE DRIVE AUTH ---
function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS }); }); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); }
window.onload = () => { gapiLoaded(); gisLoaded(); };
function handleAuthClick() {
    tokenClient.callback = async (resp) => { if (resp.error) return; document.getElementById('driveBtn').innerText = "Cloud Synced"; };
    tokenClient.requestAccessToken({prompt: 'consent'});
}

// --- 3. PARAMETER SETTERS ---
function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.getElementById(`cat-${cat}`).classList.add('tab-active');
}

function setPersona(p) {
    currentPersona = p;
    document.querySelectorAll('.persona-item').forEach(b => b.classList.remove('persona-active'));
    document.getElementById(`p-${p}`).classList.add('persona-active');
}

// --- 4. FILE PARSING ---
const fileInput = document.getElementById('fileInput');
document.getElementById('dropZone').onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    aggregatedText = "";
    document.getElementById('fileStatus').innerHTML = "";
    for (const file of files) {
        const div = document.createElement('div');
        div.className = "text-[9px] font-bold text-orange-600";
        div.innerText = `⏳ Loading ${file.name}...`;
        document.getElementById('fileStatus').appendChild(div);
        try {
            let text = "";
            if (file.type === "application/pdf") text = await parsePDF(file);
            else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") text = await parseWord(file);
            else if (file.type.startsWith("image/")) text = await parseImage(file);
            aggregatedText += `\n[FILE: ${file.name}]\n${text}\n`;
            div.innerText = `✅ ${file.name}`;
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

// --- 5. AI EXECUTION ---
async function executeAnalysis() {
    if(!aggregatedText) return alert("Upload protocol documents first.");
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    btn.innerText = "BOARD DELIBERATING...";

    const prompt = `You are an Indian Ethics Committee Assistant (ICMR 2017 Guidelines).
    REVIEW CATEGORY: ${currentCategory.toUpperCase()} (options: full review, exemption request, complete audit).
    SELECTED PERSONA: ${currentPersona.toUpperCase()} (If CONSENSUS, provide 5 personas. If specific, focus deeply on that role).
    
    PROTOCOL TEXT: ${aggregatedText.substring(0, 15000)}
    
    Output ONLY valid JSON.
    Format: {"consensus": {"analysis": "...", "score": 85, "checks": [{"item": "...", "status": "success/modify/scrutinize", "note": "..."}]}, "chairperson": {...}, "secretary": {...}, "lawyer": {...}, "clinician": {...}, "layperson": {...}}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const rawJson = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
        auditData = JSON.parse(rawJson);
        
        document.getElementById('welcome').classList.add('hidden');
        document.getElementById('results').classList.remove('hidden');
        renderResultView();
    } catch (e) { alert("AI Session Failed. Check Key/Connection."); }
    finally { btn.disabled = false; btn.innerText = "Execute Targeted Audit"; }
}

function renderResultView() {
    // If the persona was specific, the AI might only return one key. We handle that.
    const displayKey = auditData[currentPersona] ? currentPersona : Object.keys(auditData)[0];
    const data = auditData[displayKey];
    
    document.getElementById('viewLabel').innerText = displayKey.toUpperCase() + " PERSPECTIVE";
    document.getElementById('roleTitle').innerText = displayKey.toUpperCase() + " Audit Results";
    document.getElementById('roleAnalysis').innerText = data.analysis;
    document.getElementById('totalScore').innerText = data.score + "%";

    let html = "";
    data.checks.forEach(c => {
        const statusClass = `status-${c.status.toLowerCase()}`;
        html += `<div class="${statusClass} p-4 rounded-xl shadow-sm border border-navy/5">
            <p class="text-[9px] font-black uppercase opacity-60 mb-1 tracking-widest">${c.item}</p>
            <p class="text-xs font-bold">${c.note}</p>
        </div>`;
    });
    document.getElementById('checklistItems').innerHTML = html;
    updateChart(data.score);
}

// --- 6. VISUALS & EXPORT ---
let chart;
function updateChart(score) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [score, 100-score], backgroundColor: ['#F97316', '#F1F5F9'], borderWidth: 0, cutout: '80%' }] }
    });
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const inst = document.getElementById('institute').value || "Institutional EC";
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(255); doc.setFontSize(22); doc.text("EthicShield Formal Review Report", 15, 25);
    doc.setFontSize(8); doc.text("Conceptualized by Mr. Hemaraja Nayaka.S", 15, 35);
    doc.setTextColor(100); doc.text(`Categorization: ${currentCategory.toUpperCase()}`, 15, 60);
    doc.text("Mandatory Disclaimer: Institutional Ethics Committee verification required.", 15, 65);
    doc.autoTable({ startY: 75, head: [['Requirement', 'Persona Status', 'Board Observation']], body: auditData[currentPersona].checks.map(c => [c.item, c.status.toUpperCase(), c.note]), theme: 'grid'});
    doc.save(`Ethics_Review_${Date.now()}.pdf`);
}

function exportWord() {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = window.docx;
    const doc = new Document({
        sections: [{ children: [
            new Paragraph({ children: [new TextRun({ text: "EthicShield AI: Virtual Ethics Audit", bold: true, size: 32 })] }),
            new Paragraph({ text: `Review Perspective: ${currentPersona.toUpperCase()}` }),
            new Paragraph({ text: `Review Type: ${currentCategory.toUpperCase()}` }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "TAGLINE: Verification with respective institutional ethics committees is mandatory.", bold: true, color: "FF0000" })] }),
            new Paragraph({ text: auditData[currentPersona].analysis }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
                new TableRow({ children: [ new TableCell({ children: [new Paragraph("Criteria")] }), new TableCell({ children: [new Paragraph("Status")] }), new TableCell({ children: [new Paragraph("Observations")] }) ]}),
                ...auditData[currentPersona].checks.map(c => new TableRow({ children: [
                    new TableCell({ children: [new Paragraph(c.item)] }), new TableCell({ children: [new Paragraph(c.status)] }), new TableCell({ children: [new Paragraph(c.note)] })
                ]}))
            ]})
        ]}]
    });
    Packer.toBlob(doc).then(blob => saveAs(blob, "Ethics_Audit_Report.docx"));
}