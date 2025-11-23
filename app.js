// Cambia esta URL a tu endpoint de Render cuando lo tengas desplegado.
// Para pruebas locales, deja "http://localhost:8000".
const API_BASE = "https://grafos-fastapi.onrender.com";

const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");

// --- estado global ---
let nodes = [];       // {id, x, y}
let edges = [];       // {id, u, v}
let nextNodeId = 0;
let nextEdgeId = 0;

let currentTool = "node"; // "node" | "connector" | null
let selectedElement = null; // {type: 'node'|'edge', id}
let connectorStartNodeId = null;

let draggingNode = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentBridges = [];   // lista de [u, v] desde backend

// para dibujar el símbolo en el puntero
let mouseX = 0;
let mouseY = 0;
let mouseInCanvas = false;

// ----------------------
//   Config canvas
// ----------------------
function resizeCanvas() {
    canvas.width = window.innerWidth - 300;
    canvas.height = window.innerHeight - 100;
    drawGraph();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ----------------------
//   Paleta de herramientas
// ----------------------
const toolNodeBtn = document.getElementById("toolNode");
const toolConnectorBtn = document.getElementById("toolConnector");

toolNodeBtn.onclick = () => {
    currentTool = "node";
    connectorStartNodeId = null;
    selectedElement = null;
    setActiveToolButton();
    drawGraph();
};

toolConnectorBtn.onclick = () => {
    currentTool = "connector";
    connectorStartNodeId = null;
    selectedElement = null;
    setActiveToolButton();
    drawGraph();
};

function setActiveToolButton() {
    toolNodeBtn.classList.toggle("active", currentTool === "node");
    toolConnectorBtn.classList.toggle("active", currentTool === "connector");
}

// ----------------------
//   Botones principales
// ----------------------
document.getElementById("clearBtn").onclick = () => {
    nodes = [];
    edges = [];
    nextNodeId = 0;
    nextEdgeId = 0;
    selectedElement = null;
    connectorStartNodeId = null;
    currentBridges = [];
    updateEdgeList();
    updateBridgeList([]);
    setGraphMessage("");
    drawGraph();
};

document.getElementById("generateBtn").onclick = () => {
    generateRandomGraph();
};

document.getElementById("detectBtn").onclick = async () => {
    if (nodes.length === 0) {
        alert("Primero crea o genera un grafo.");
        return;
    }
    await detectBridgesAndShowMessage();
};

async function detectBridgesAndShowMessage() {
    const payload = {
        nodes: nodes.length,
        edges: edges.map(e => [e.u, e.v])
    };

    try {
        const res = await fetch(`${API_BASE}/bridges`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Respuesta no OK del backend");

        const data = await res.json();
        const bridges = data.bridges || [];
        currentBridges = bridges;

        updateBridgeList(bridges);
        drawGraph();

        if (bridges.length > 0) {
            setGraphMessage("🔴 Este grafo TIENE puentes", "#ffdddd", "#b50000");
        } else {
            setGraphMessage("🟢 Este grafo NO tiene puentes", "#ddffdd", "#006600");
        }
    } catch (err) {
        console.error(err);
        alert("Error al llamar al backend. ¿Está corriendo la API?");
    }
}

// ----------------------
//   Canvas: mouse enter/leave
// ----------------------
canvas.addEventListener("mouseenter", () => {
    mouseInCanvas = true;
});

canvas.addEventListener("mouseleave", () => {
    mouseInCanvas = false;
    drawGraph();
});

// ----------------------
//   Canvas: drag & drop
// ----------------------
canvas.addEventListener("mousedown", (e) => {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;

    const node = findNodeAt(pos.x, pos.y);
    if (node) {
        draggingNode = node;
        dragOffsetX = pos.x - node.x;
        dragOffsetY = pos.y - node.y;
    }
});

canvas.addEventListener("mousemove", (e) => {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;

    if (draggingNode) {
        draggingNode.x = pos.x - dragOffsetX;
        draggingNode.y = pos.y - dragOffsetY;
        drawGraph();
    } else if (currentTool === "node" || currentTool === "connector") {
        drawGraph();
    }
});

canvas.addEventListener("mouseup", () => {
    draggingNode = null;
});

// ----------------------
//   Canvas: click (crear / seleccionar)
// ----------------------
canvas.addEventListener("click", (e) => {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    const node = findNodeAt(pos.x, pos.y);

    if (currentTool === "node") {
        if (!node) {
            createNode(pos.x, pos.y);
            return;
        } else {
            selectedElement = { type: "node", id: node.id };
            connectorStartNodeId = null;
            drawGraph();
            return;
        }
    }

    if (currentTool === "connector") {
        if (node) {
            if (connectorStartNodeId === null) {
                connectorStartNodeId = node.id;
                selectedElement = { type: "node", id: node.id };
            } else {
                const startId = connectorStartNodeId;
                const endId = node.id;
                if (startId !== endId && !edgeExists(startId, endId)) {
                    createEdge(startId, endId);
                }
                connectorStartNodeId = null;
                selectedElement = null;
            }
            drawGraph();
            return;
        }
    }

    if (!currentTool) {
        if (node) {
            selectedElement = { type: "node", id: node.id };
            connectorStartNodeId = null;
        } else {
            const edge = findEdgeNear(pos.x, pos.y);
            if (edge) {
                selectedElement = { type: "edge", id: edge.id };
                connectorStartNodeId = null;
            } else {
                selectedElement = null;
                connectorStartNodeId = null;
            }
        }
        drawGraph();
    }
});

// ----------------------
//   Teclas: Delete / Escape
// ----------------------
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        currentTool = null;
        connectorStartNodeId = null;
        selectedElement = null;
        setActiveToolButton();
        drawGraph();
        return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedElement) return;

        if (selectedElement.type === "node") {
            const id = selectedElement.id;
            nodes = nodes.filter(n => n.id !== id);
            edges = edges.filter(e => e.u !== id && e.v !== id);
        } else if (selectedElement.type === "edge") {
            const id = selectedElement.id;
            edges = edges.filter(e => e.id !== id);
        }
        selectedElement = null;
        currentBridges = [];
        updateEdgeList();
        updateBridgeList([]);
        setGraphMessage("");
        drawGraph();
    }
});

// ----------------------
//   Lógica de grafo
// ----------------------
function createNode(x, y) {
    const node = { id: nextNodeId++, x, y };
    nodes.push(node);
    drawGraph();
}

function createEdge(uId, vId) {
    const edge = { id: nextEdgeId++, u: uId, v: vId };
    edges.push(edge);
    updateEdgeList();
    drawGraph();
}

function edgeExists(a, b) {
    return edges.some(e =>
        (e.u === a && e.v === b) ||
        (e.u === b && e.v === a)
    );
}

// genera grafo aleatorio CONECTADO entre 5 y 8 nodos
// con 70% de probabilidad de contener PUENTES
function generateRandomGraph() {
    const N = getRandomInt(5, 8);

    nodes = [];
    edges = [];
    nextNodeId = 0;
    nextEdgeId = 0;
    currentBridges = [];
    selectedElement = null;
    connectorStartNodeId = null;

    for (let i = 0; i < N; i++) {
        const x = 60 + Math.random() * (canvas.width - 120);
        const y = 60 + Math.random() * (canvas.height - 120);
        createNode(x, y);
    }

    // spanning tree para asegurar conectividad
    for (let i = 1; i < N; i++) {
        const j = getRandomInt(0, i - 1);
        createEdge(i, j);
    }

    const wantsBridges = Math.random() < 0.7;

    if (wantsBridges) {
        const extraEdges = getRandomInt(0, 1);
        for (let k = 0; k < extraEdges; k++) {
            const u = getRandomInt(0, N - 1);
            const v = getRandomInt(0, N - 1);
            if (u !== v && !edgeExists(u, v)) {
                createEdge(u, v);
            }
        }
    } else {
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                if (!edgeExists(i, j) && Math.random() < 0.65) {
                    createEdge(i, j);
                }
            }
        }
    }

    updateEdgeList();
    updateBridgeList([]);
    setGraphMessage("Verificando si el grafo generado tiene puentes...");
    drawGraph();
    detectBridgesAndShowMessage();
}

// ----------------------
//   Dibujo
// ----------------------
function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Aristas
    edges.forEach(e => {
        const uNode = getNodeById(e.u);
        const vNode = getNodeById(e.v);
        if (!uNode || !vNode) return;

        const isBridge = currentBridges.some(b =>
            (b[0] === e.u && b[1] === e.v) ||
            (b[0] === e.v && b[1] === e.u)
        );

        const isSelectedEdge = selectedElement && selectedElement.type === "edge" && selectedElement.id === e.id;

        ctx.strokeStyle = isBridge ? "red" : (isSelectedEdge ? "#ff9800" : "#555");
        ctx.lineWidth = isBridge || isSelectedEdge ? 4 : 2;

        ctx.beginPath();
        ctx.moveTo(uNode.x, uNode.y);
        ctx.lineTo(vNode.x, vNode.y);
        ctx.stroke();
    });

    // Nodos
    nodes.forEach(n => {
        const isSelectedNode = selectedElement && selectedElement.type === "node" && selectedElement.id === n.id;

        ctx.fillStyle = "#0077ff";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 20, 0, Math.PI * 2);
        ctx.fill();

        if (isSelectedNode) {
            ctx.strokeStyle = "#ff9800";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(n.x, n.y, 24, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = "white";
        ctx.font = "15px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, n.x, n.y);
    });

    // símbolo en el puntero
    if (!mouseInCanvas || draggingNode) return;

    if (currentTool === "node") {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#0077ff";
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (currentTool === "connector" && connectorStartNodeId !== null) {
        const startNode = getNodeById(connectorStartNodeId);
        if (startNode) {
            ctx.save();
            ctx.strokeStyle = "#0077ff";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startNode.x, startNode.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// ----------------------
//   Helpers
// ----------------------
function getNodeById(id) {
    return nodes.find(n => n.id === id);
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function findNodeAt(x, y) {
    return nodes.find(n => distance(n.x, n.y, x, y) < 20) || null;
}

function findEdgeNear(x, y) {
    const tolerance = 6;
    for (let e of edges) {
        const u = getNodeById(e.u);
        const v = getNodeById(e.v);
        if (!u || !v) continue;
        const d = pointToSegmentDistance(x, y, u.x, u.y, v.x, v.y);
        if (d <= tolerance) return e;
    }
    return null;
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return Math.hypot(px - xx, py - yy);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateEdgeList() {
    const ul = document.getElementById("edgesList");
    ul.innerHTML = "";
    edges.forEach(e => {
        const li = document.createElement("li");
        li.textContent = `${e.u} — ${e.v}`;
        ul.appendChild(li);
    });
}

function updateBridgeList(bridges) {
    const ul = document.getElementById("bridgesList");
    ul.innerHTML = "";
    bridges.forEach(b => {
        const li = document.createElement("li");
        li.style.color = "red";
        li.textContent = `${b[0]} — ${b[1]}`;
        ul.appendChild(li);
    });
}

function setGraphMessage(text, bg, color) {
    const div = document.getElementById("graphMessage");
    div.textContent = text || "";
    if (!text) {
        div.style.background = "transparent";
        div.style.border = "none";
        div.style.color = "inherit";
    } else {
        div.style.background = bg || "#eeeeee";
        div.style.color = color || "#333333";
        div.style.border = `2px solid ${color || "#333333"}`;
    }
}

// inicial
setActiveToolButton();
drawGraph();
