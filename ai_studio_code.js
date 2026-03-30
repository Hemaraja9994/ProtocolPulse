// --- CONFIGURATION ---
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

// PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- STATE MANAGEMENT ---
document.getElementById('currentDate').innerText = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function showPage(page) {
    document.getElementById('auditPage').classList.toggle('hidden', page !== 'audit');
    document.getElementById('archivePage').classList.toggle('hidden', page !== 'archive');
    document.getElementById('pageTitle').innerText = page === 'audit' ? 'Live Ethical Review' : 'Institutional Archive';
    document.getElementById('tab-audit').className = page === 'audit' ? 'sidebar-item active-tab w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium' : 'sidebar-item w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium text-slate-400';
    document.getElementById('tab-archive').className = page === 'archive' ? 'sidebar-item active-tab w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium' : 'sidebar-item w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium text-slate-400';
    
    if(page === 'archive') loadArchive();
}

// --- AI ENGINE ---
async function startAIReview() {
    const reviewer = document.getElementById('reviewerName').value;
    const inst = document.getElementById('institute').value;
    const btn = document.getElementById('analyzeBtn');

    if (!reviewer || !inst) return alert("Fill in Reviewer and Institute name.");

    btn.innerText = "Analyzing via EthicShield AI...";
    btn.disabled = true;

    const prompt = `Act as a Senior Research Ethics Auditor for Indian Institutes. 
    Analyze compliance against ICMR 2017 Guidelines.
    Output MUST BE ONLY VALID JSON:
    {
      "risk_category": "Expedited/Full Board/Exempt",
      "compliance_score": 85,
      "checklist": [{"item": "Consent Translation", "status": "Pass"}, {"item": "CoI Declaration", "status": "Fail"}],
      "summary": "A brief 2-sentence summary of ethical findings."
    }`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const result = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, ""));

        displayResults(result);
        saveToCloud(result, reviewer, inst);

    } catch (e) {
        alert("Check API Key or Connection");
        console.log(e);
    } finally {
        btn.innerText = "Analyze & Sync to Cloud";
        btn.disabled = false;
    }
}

function displayResults(result) {
    document.getElementById('placeholder').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('riskBadge').innerText = result.risk_category;
    document.getElementById('complianceScore').innerText = result.compliance_score + "%";
    document.getElementById('aiSummary').innerText = result.summary;

    let html = '';
    result.checklist.forEach(c => {
        const icon = c.status === 'Pass' ? '✓' : '⚠';
        const color = c.status === 'Pass' ? 'text-green-400' : 'text-red-400';
        html += `<div class="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
            <span class="text-xs font-medium text-slate-300">${c.item}</span>
            <span class="text-xs font-bold ${color}">${icon} ${c.status}</span>
        </div>`;
    });
    document.getElementById('checklistItems').innerHTML = html;
    updateChart(result.compliance_score);
    window.lastResult = result;
}

// --- CLOUD SYNC ---
async function saveToCloud(result, reviewer, institute) {
    const record = {
        reviewer,
        institute,
        date: new Date().toISOString(),
        ...result
    };
    await db.collection("reviews").add(record);
}

async function loadArchive() {
    const grid = document.getElementById('archiveGrid');
    grid.innerHTML = '<p class="text-slate-500">Retrieving cloud data...</p>';
    
    const snapshot = await db.collection("reviews").orderBy("date", "desc").get();
    grid.innerHTML = '';
    
    snapshot.forEach(doc => {
        const data = doc.data();
        grid.innerHTML += `
            <div class="glass p-6 rounded-3xl border-t-2 border-blue-500 hover:scale-[1.02] transition">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="font-bold text-white text-lg">${data.institute}</h4>
                        <p class="text-xs text-slate-500 font-medium tracking-tight">${new Date(data.date).toLocaleDateString()}</p>
                    </div>
                    <span class="px-2 py-1 bg-blue-900/30 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-800 uppercase">${data.risk_category}</span>
                </div>
                <p class="text-xs text-slate-400 mb-4 line-clamp-2">${data.summary}</p>
                <div class="flex items-center justify-between pt-4 border-t border-slate-800">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reviewer: ${data.reviewer}</span>
                    <span class="text-sm font-black text-white">${data.compliance_score}%</span>
                </div>
            </div>
        `;
    });
}

// --- VISUALIZATION ---
let myChart;
function updateChart(score) {
    const ctx = document.getElementById('complianceChart').getContext('2d');
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: ['#3b82f6', '#1e293b'],
                borderWidth: 0,
                cutout: '85%'
            }]
        },
        options: {
            plugins: { tooltip: { enabled: false } },
            animation: { animateScale: true }
        }
    });
}

function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const data = window.lastResult;
    
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("EthicShield AI Audit", 14, 25);
    
    doc.setTextColor(50);
    doc.setFontSize(10);
    doc.text(`Institute: ${document.getElementById('institute').value}`, 14, 50);
    doc.text(`Reviewer: ${document.getElementById('reviewerName').value}`, 14, 55);
    doc.text(`Risk: ${data.risk_category}`, 14, 60);

    doc.autoTable({
        startY: 70,
        head: [['Compliance Item', 'Status']],
        body: data.checklist.map(i => [i.item, i.status]),
        theme: 'grid'
    });
    
    doc.save("EthicShield_Report.pdf");
}