// --- CONFIG ---
const GEMINI_API_KEY = "YOUR_API_KEY_HERE";

// Initialization
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
let aggregatedText = "";
let auditData = null;

// --- FILE PARSING ---
const fileInput = document.getElementById('fileInput');
document.getElementById('dropZone').onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    aggregatedText = "";
    document.getElementById('fileStatus').innerHTML = "";

    for (const file of files) {
        const status = document.createElement('div');
        status.className = "text-[9px] text-emerald-400 font-bold";
        status.innerText = `⏳ Processing: ${file.name}`;
        document.getElementById('fileStatus').appendChild(status);

        try {
            let text = "";
            if (file.type === "application/pdf") text = await parsePDF(file);
            else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") text = await parseWord(file);
            else if (file.type.startsWith("image/")) text = await parseImage(file);
            
            aggregatedText += `\n[FILE: ${file.name}]\n${text}\n`;
            status.innerText = `✅ Loaded: ${file.name}`;
        } catch (err) {
            status.innerText = `❌ Error: ${file.name}`;
        }
    }
};

async function parsePDF(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let t = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        t += content.items.map(s => s.str).join(" ") + " ";
    }
    return t;
}

async function parseWord(file) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
}

async function parseImage(file) {
    const result = await Tesseract.recognize(file, 'eng');
    return result.data.text;
}

// --- AI AUDIT ---
async function startCommitteeAudit() {
    if (!aggregatedText) return alert("Upload documents first.");
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    btn.innerText = "COMMITTEE IN SESSION...";

    const prompt = `Act as an Indian Ethics Committee (ICMR 2017 Guidelines).
    Context: ${aggregatedText.substring(0, 15000)}
    Output MUST be valid JSON with perspectives for: consensus, lawyer, clinician, layperson, secretary, chairperson.
    Each persona must have "analysis", "score", and "checks" (array of {item, status, note}).
    Statuses allowed: success, modify, scrutinize.`;

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
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('roleSelector').classList.remove('hidden');
        renderRole('consensus');
    } catch (e) {
        alert("AI Error. Check API Key.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Run Multi-Persona Audit";
    }
}

function renderRole(role) {
    const data = auditData[role];
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('role-active'));
    document.getElementById(`btn-${role}`).classList.add('role-active');
    
    document.getElementById('roleTitle').innerText = role.toUpperCase();
    document.getElementById('roleAnalysis').innerText = data.analysis;
    document.getElementById('totalScore').innerText = data.score + "%";

    let html = "";
    data.checks.forEach(c => {
        html += `
            <div class="${c.status.toLowerCase()} p-4 rounded-xl glass-card flex justify-between items-center shadow-lg border border-white/5">
                <div>
                    <p class="text-[10px] font-black uppercase text-slate-500">${c.item}</p>
                    <p class="text-xs font-bold text-white">${c.note}</p>
                </div>
                <span class="text-[8px] font-black px-2 py-1 bg-black/40 rounded-full">${c.status.toUpperCase()}</span>
            </div>
        `;
    });
    document.getElementById('checklistItems').innerHTML = html;
}

// --- EXPORT ENGINES ---

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const inst = document.getElementById('institute').value || "Indian Research Institute";

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.text("EthicShield Formal Review Report", 15, 25);
    doc.setFontSize(10);
    doc.text("Conceptualized by Mr. Hemaraja Nayaka.S", 15, 35);
    
    doc.setTextColor(100);
    doc.text(`Institutional Context: ${inst}`, 15, 60);
    doc.text(`Disclaimer: Verification with respective Institutional Ethics Committees is mandatory.`, 15, 65);

    doc.autoTable({
        startY: 75,
        head: [['EC Requirement', 'Audit Status', 'Findings']],
        body: auditData.consensus.checks.map(c => [c.item, c.status.toUpperCase(), c.note]),
        theme: 'grid'
    });

    doc.save("Ethics_Audit_Report.pdf");
}

function exportToWord() {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = window.docx;
    const inst = document.getElementById('institute').value || "Indian Research Institute";

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ children: [new TextRun({ text: "EthicShield AI: Virtual Ethics Audit Report", bold: true, size: 32 })] }),
                new Paragraph({ children: [new TextRun({ text: `Institutional Context: ${inst}`, size: 24 })] }),
                new Paragraph({ children: [new TextRun({ text: `Conceptualized by: Mr. Hemaraja Nayaka.S`, size: 20, italic: true })] }),
                new Paragraph({ text: "" }),
                new Paragraph({ children: [new TextRun({ text: "TAGLINE: Verification with respective institutional ethics committees is mandatory.", bold: true, color: "FF0000" })] }),
                new Paragraph({ text: "" }),
                new Paragraph({ children: [new TextRun({ text: "Consensus Analysis:", bold: true })] }),
                new Paragraph({ text: auditData.consensus.analysis }),
                new Paragraph({ text: "" }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({ children: [
                            new TableCell({ children: [new Paragraph("Item")] }),
                            new TableCell({ children: [new Paragraph("Status")] }),
                            new TableCell({ children: [new Paragraph("Note")] }),
                        ]}),
                        ...auditData.consensus.checks.map(c => new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph(c.item)] }),
                                new TableCell({ children: [new Paragraph(c.status)] }),
                                new TableCell({ children: [new Paragraph(c.note)] }),
                            ]
                        }))
                    ]
                })
            ]
        }]
    });

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, "Ethics_Audit_Report.docx");
    });
}
