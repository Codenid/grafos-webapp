// API en Render
const API_BASE = "https://grafos-fastapi.onrender.com";

const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");

const toolNodeBtn = document.getElementById("toolNode");
const toolConnectorBtn = document.getElementById("toolConnector");
const toolHandBtn = document.getElementById("toolHand");
const modeStatusDiv = document.getElementById("modeStatus");

const nodeMenu = document.getElementById("nodeMenu");
const nodeMenuConnectBtn = document.getElementById("nodeMenuConnect");
const nodeMenuDeleteBtn = document.getElementById("nodeMenuDelete");

const edgeMenu = document.getElementById("edgeMenu");
const edgeMenuDeleteBtn = document.getElementById("edgeMenuDelete");

// --- estado global ---
let nodes = [];       // {id, x, y}
let edges = [];       // {id, u, v}
let nextNodeId = 0;
let nextEdgeId = 0;

let currentTool = "node"; // "node" | "connector" | "hand"
let selectedElement = null; // {type: 'node'|'edge', id}
let hoverElement = null;    // {type: 'node'|'edge', id}
let connectorStartNodeId = null;

let draggingNode = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentBridges = [];   // lista de [u, v] desde backend

let mouseX = 0;
let mouseY = 0;
let mouseInCanvas = false;

let nodeMenuNodeId = null;
let edgeMenuEdgeId = null;

// ----------------------
//   Config canvas
// ----------------------
function resizeCanvas() {
    const wrapperRect = canvas.parentElement.getBoundingClientRect();
    canvas.width = wrapperRect.width;
    canvas.height = wrapperRect.height;
    drawGraph();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ----------------------
//   Paleta de herramientas
// ----------------------
toolNodeBtn.onclick = () => setTool("node");
toolConnectorBtn.onclick = () => setTool("connector");
toolHandBtn.onclick = () => setTool("hand");

function setTool(tool) {
    currentTool = tool;
    if (tool !== "connector") {
        connectorStartNodeId = null;
    }
    selectedElement = null;
    hoverElement = null;
    hideNodeMenu();
    hideEdgeMenu();

    toolNodeBtn.classList.toggle("active", currentTool === "node");
    toolConnectorBtn.classList.toggle("active", currentTool === "connector");
    toolHandBtn.classList.toggle("active", currentTool === "hand");

    updateModeStatus();
    updateCanvasCursor();
    drawGraph();
}

function updateModeStatus() {
    if (currentTool === "node") {
        modeStatusDiv.textContent =
            "Modo: Nodo. Haz clic en un espacio vacío para crear un nodo. Sobre un nodo verás opciones de Conectar / Eliminar.";
    } else if (currentTool === "connector") {
        if (connectorStartNodeId === null) {
            modeStatusDiv.textContent =
                "Modo: Conector. Haz clic en un nodo origen y luego en un nodo destino para crear una arista. ESC para volver a Mano.";
        } else {
            modeStatusDiv.textContent =
                `Conectando desde el nodo ${connectorStartNodeId}. Haz clic en el nodo destino. ESC para cancelar.`;
        }
    } else {
        modeStatusDiv.textContent =
            "Modo: Mano. Arrastra nodos para reorganizarlos. Pasa sobre aristas para eliminarlas. ESC mantiene Mano.";
    }
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
    hoverElement = null;
    connectorStartNodeId = null;
    currentBridges = [];
    updateEdgeList();
    updateBridgeList([]);
    setGraphMessage("");
    hideNodeMenu();
    hideEdgeMenu();
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

// ----------------------
//   Backend /bridges
// ----------------------
async function detectBridgesAndShowMessage() {
    const payload = {
        nodes: nodes.length,
        edges: edges.map(e => [e.u, e.v])
    };

    try {
        setGraphMessage(
            "⏳ Analizando el grafo para detectar puentes...",
            "#e8f4ff",
            "#00529b"
        );

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
            setGraphMessage("🔴 Este grafo TIENE puentes", "#ffebee", "#c62828");
        } else {
            setGraphMessage("🟢 Este grafo NO tiene puentes", "#e8f5e9", "#2e7d32");
        }
    } catch (err) {
        console.error(err);
        setGraphMessage(
            "⚠️ Error al llamar al backend. Si es la primera vez, puede que el servidor esté levantando.",
            "#ffebee",
            "#c62828"
        );
    }
}

// ----------------------
//   Warmup backend
// ----------------------
async function warmupBackend() {
    setGraphMessage(
        "🔄 Iniciando el servicio de análisis de grafos... la primera vez puede tardar algunos segundos.",
        "#fff8e1",
        "#ff8f00"
    );

    try {
        const res = await fetch(`${API_BASE}/`, { method: "GET" });
        if (res.ok) {
            setGraphMessage(
                "✅ Servicio de análisis listo. Genera un grafo o dibuja uno y presiona «Detectar puentes».",
                "#e8f5e9",
                "#2e7d32"
            );
        } else {
            setGraphMessage(
                "⚠️ No se pudo verificar el estado del servicio. Si al detectar puentes demora, es porque el servidor se está levantando.",
                "#ffebee",
                "#c62828"
            );
        }
    } catch (err) {
        console.error("Error en warmupBackend:", err);
        setGraphMessage(
            "⚠️ No se pudo conectar al servicio. Si al detectar puentes demora, es porque el servidor se está levantando o no está disponible.",
            "#ffebee",
            "#c62828"
        );
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
    hoverElement = null;
    updateCanvasCursor();
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
    if (node && currentTool === "hand") {
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
        positionNodeMenuIfVisible();
        positionEdgeMenuIfVisible();
        return;
    }

    // Hover detection
    const node = findNodeAt(pos.x, pos.y);
    if (node) {
        hoverElement = { type: "node", id: node.id };
        showNodeMenu(node);
        hideEdgeMenu();
    } else {
        const edge = findEdgeNear(pos.x, pos.y);
        if (edge) {
            hoverElement = { type: "edge", id: edge.id };
            hideNodeMenu();
            showEdgeMenu(edge);
        } else {
            hoverElement = null;
            hideNodeMenu();
            hideEdgeMenu();
        }
    }

    updateCanvasCursor();
    drawGraph();
});

canvas.addEventListener("mouseup", () => {
    draggingNode = null;
    updateCanvasCursor();
});

// ----------------------
//   Canvas: click
// ----------------------
canvas.addEventListener("click", (e) => {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    const node = findNodeAt(pos.x, pos.y);

    if (currentTool === "node") {
        if (!node) {
            createNode(pos.x, pos.y);
        }
        return;
    }

    if (currentTool === "connector") {
        if (node) {
            if (connectorStartNodeId === null) {
                connectorStartNodeId = node.id;
            } else {
                const startId = connectorStartNodeId;
                const endId = node.id;
                if (startId !== endId && !edgeExists(startId, endId)) {
                    createEdge(startId, endId);
                }
                // 👇 YA NO cambiamos a Mano: se queda en conector
                connectorStartNodeId = null;
            }
            updateModeStatus();
            drawGraph();
        }
        return;
    }

    // Modo Mano: selección visual
    if (currentTool === "hand") {
        if (node) {
            selectedElement = { type: "node", id: node.id };
        } else {
            const edge = findEdgeNear(pos.x, pos.y);
            if (edge) {
                selectedElement = { type: "edge", id: edge.id };
            } else {
                selectedElement = null;
            }
        }
        drawGraph();
    }
});

// ----------------------
//   Teclas: ESC / Delete
// ----------------------
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        // Siempre vuelve a Mano
        setTool("hand");
        return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedElement) return;

        if (selectedElement.type === "node") {
            deleteNode(selectedElement.id);
        } else if (selectedElement.type === "edge") {
            deleteEdge(selectedElement.id);
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
//   Menú flotante de nodo
// ----------------------
function showNodeMenu(node) {
    nodeMenuNodeId = node.id;
    nodeMenu.style.display = "flex";
    positionNodeMenuIfVisible();
}

function hideNodeMenu() {
    nodeMenu.style.display = "none";
    nodeMenuNodeId = null;
}

function positionNodeMenuIfVisible() {
    if (nodeMenuNodeId === null) return;
    const node = getNodeById(nodeMenuNodeId);
    if (!node) {
        hideNodeMenu();
        return;
    }
    // Posicionar relativo al wrapper, usando coordenadas del nodo
    const wrapperRect = canvas.parentElement.getBoundingClientRect();
    nodeMenu.style.left = `${node.x}px`;
    nodeMenu.style.top = `${node.y - 30}px`;
}

nodeMenuConnectBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (nodeMenuNodeId !== null) {
        connectorStartNodeId = nodeMenuNodeId;
        setTool("connector");
    }
});

nodeMenuDeleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (nodeMenuNodeId !== null) {
        deleteNode(nodeMenuNodeId);
        nodeMenuNodeId = null;
        hideNodeMenu();
        drawGraph();
        updateEdgeList();
        updateBridgeList([]);
    }
});

// ----------------------
//   Menú flotante de arista
// ----------------------
function showEdgeMenu(edge) {
    edgeMenuEdgeId = edge.id;
    edgeMenu.style.display = "block";
    positionEdgeMenuIfVisible();
}

function hideEdgeMenu() {
    edgeMenu.style.display = "none";
    edgeMenuEdgeId = null;
}

function positionEdgeMenuIfVisible() {
    if (edgeMenuEdgeId === null) return;
    const edge = edges.find(e => e.id === edgeMenuEdgeId);
    if (!edge) {
        hideEdgeMenu();
        return;
    }
    const u = getNodeById(edge.u);
    const v = getNodeById(edge.v);
    if (!u || !v) {
        hideEdgeMenu();
        return;
    }
    const midX = (u.x + v.x) / 2;
    const midY = (u.y + v.y) / 2;

    const wrapperRect = canvas.parentElement.getBoundingClientRect();
    edgeMenu.style.left = `${midX}px`;
    edgeMenu.style.top = `${midY - 10}px`;
}

edgeMenuDeleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (edgeMenuEdgeId !== null) {
        deleteEdge(edgeMenuEdgeId);
        edgeMenuEdgeId = null;
        hideEdgeMenu();
        drawGraph();
        updateEdgeList();
        updateBridgeList([]);
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

function deleteNode(id) {
    nodes = nodes.filter(n => n.id !== id);
    edges = edges.filter(e => e.u !== id && e.v !== id);
}

function deleteEdge(id) {
    edges = edges.filter(e => e.id !== id);
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
    hoverElement = null;
    connectorStartNodeId = null;
    hideNodeMenu();
    hideEdgeMenu();

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
    setGraphMessage("Verificando si el grafo generado tiene puentes...", "#e8f4ff", "#00529b");
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

        const isHoverEdge =
            hoverElement && hoverElement.type === "edge" && hoverElement.id === e.id;

        if (isBridge) {
            ctx.strokeStyle = "#e53935";
            ctx.lineWidth = 4;
        } else if (isHoverEdge) {
            ctx.strokeStyle = "#00acc1";
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = "#757575";
            ctx.lineWidth = 2;
        }

        ctx.beginPath();
        ctx.moveTo(uNode.x, uNode.y);
        ctx.lineTo(vNode.x, vNode.y);
        ctx.stroke();
    });

    // Nodos
    nodes.forEach(n => {
        const isHoverNode =
            hoverElement && hoverElement.type === "node" && hoverElement.id === n.id;

        let fillColor = "#009688";
        let radius = 20;

        if (isHoverNode) {
            fillColor = "#00796b";
            radius = 22;
        }

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (isHoverNode) {
            ctx.strokeStyle = "#4dd0e1";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = "white";
        ctx.font = "15px Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, n.x, n.y);
    });

    // Ghost del cursor según herramienta
    if (!mouseInCanvas || draggingNode) return;

    if (currentTool === "node") {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#009688";
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else if (currentTool === "connector" && connectorStartNodeId !== null) {
        const startNode = getNodeById(connectorStartNodeId);
        if (startNode) {
            ctx.save();
            ctx.strokeStyle = "#009688";
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
function updateCanvasCursor() {
    if (draggingNode) {
        canvas.style.cursor = "grabbing";
        return;
    }

    if (hoverElement && (hoverElement.type === "node" || hoverElement.type === "edge")) {
        canvas.style.cursor = "pointer";
        return;
    }

    if (currentTool === "node") {
        canvas.style.cursor = "crosshair";
    } else if (currentTool === "connector") {
        canvas.style.cursor = "crosshair";
    } else if (currentTool === "hand") {
        canvas.style.cursor = "grab";
    } else {
        canvas.style.cursor = "default";
    }
}

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
        li.style.color = "#e53935";
        li.textContent = `${b[0]} — ${b[1]}`;
        ul.appendChild(li);
    });
}

function setGraphMessage(text, bg, color) {
    const div = document.getElementById("graphMessage");
    div.textContent = text || "";
    if (!text) {
        div.style.background = "transparent";
        div.style.borderColor = "transparent";
        div.style.color = "#ffffff";
    } else {
        div.style.background = bg || "rgba(255,255,255,0.1)";
        div.style.color = color || "#ffffff";
        div.style.borderColor = color || "transparent";
    }
}

// inicial
setTool("node");
warmupBackend();
drawGraph();
updateCanvasCursor();
