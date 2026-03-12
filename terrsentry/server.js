const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// Basic Geometric Primitives
// ==========================================
function crossProduct(O, A, B) {
    return (A.lat - O.lat) * (B.lon - O.lon) - (A.lon - O.lon) * (B.lat - O.lat);
}

// ==========================================
// 1. Hazard Mapping: Convex Hull
// ==========================================
function convexHull(points) {
    let n = points.length;
    let k = 0;
    if (n <= 3) return points;
    let H = new Array(2 * n);

    points.sort((a, b) => {
        if (a.lat !== b.lat) return a.lat - b.lat;
        return a.lon - b.lon;
    });

    for (let i = 0; i < n; ++i) {
        while (k >= 2 && crossProduct(H[k - 2], H[k - 1], points[i]) <= 0) k--;
        H[k++] = points[i];
    }

    for (let i = n - 1, t = k + 1; i > 0; --i) {
        while (k >= t && crossProduct(H[k - 2], H[k - 1], points[i - 1]) <= 0) k--;
        H[k++] = points[i - 1];
    }

    return H.slice(0, k - 1);
}

function isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].lat, yi = polygon[i].lon;
        let xj = polygon[j].lat, yj = polygon[j].lon;
        
        let intersect = ((xi > point.lat) !== (xj > point.lat))
            && (point.lon < (yj - yi) * (point.lat - xi) / (xj - xi) + yi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function distance(a, b) {
    return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lon - b.lon, 2));
}

app.post('/api/hull', (req, res) => {
    try {
        const points = req.body.points;
        const hull = convexHull(points);
        res.status(200).json(hull);
    } catch (e) {
        res.status(400).json({ error: 'Invalid request format: ' + e.message });
    }
});

// ==========================================
// 2. Multi-User Dynamic Evacuation (Bellman-Ford on Grid)
// ==========================================
function bellmanFord(vertices, source, edges) {
    let dist = new Array(vertices).fill(Infinity);
    let pred = new Array(vertices).fill(-1);
    dist[source] = 0;

    for (let i = 1; i <= vertices - 1; i++) {
        let updated = false;
        for (const edge of edges) {
            if (dist[edge.src] !== Infinity && dist[edge.src] + edge.weight < dist[edge.dest]) {
                dist[edge.dest] = dist[edge.src] + edge.weight;
                pred[edge.dest] = edge.src;
                updated = true;
            }
        }
        if (!updated) break;
    }
    return { distances: dist, predecessors: pred };
}

app.post('/api/multi_route', (req, res) => {
    try {
        const workers = req.body.workers || [];
        const safeZones = req.body.safe_zones || [];
        const hazardHull = req.body.hazard_hull || [];

        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        const updateBounds = (p) => {
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLon) minLon = p.lon;
            if (p.lon > maxLon) maxLon = p.lon;
        };

        workers.forEach(updateBounds);
        safeZones.forEach(updateBounds);
        hazardHull.forEach(updateBounds);

        let gridNodes = [];
        
        workers.forEach(w => gridNodes.push(w));
        let numWorkers = workers.length;

        safeZones.forEach(s => gridNodes.push(s));
        let numSafe = safeZones.length;
        let safeZoneStartIdx = numWorkers;

        let gridSize = 10;
        if (minLat !== Infinity) {
            let latSpan = (maxLat - minLat) === 0 ? 0.01 : (maxLat - minLat);
            let lonSpan = (maxLon - minLon) === 0 ? 0.01 : (maxLon - minLon);

            minLat -= latSpan * 0.1; maxLat += latSpan * 0.1;
            minLon -= lonSpan * 0.1; maxLon += lonSpan * 0.1;

            let dlat = (maxLat - minLat) / gridSize;
            let dlon = (maxLon - minLon) / gridSize;

            for (let i = 0; i <= gridSize; i++) {
                for (let j = 0; j <= gridSize; j++) {
                    let p = { lat: minLat + i * dlat, lon: minLon + j * dlon };
                    if (hazardHull.length > 0 && isPointInPolygon(p, hazardHull)) continue;
                    gridNodes.push(p);
                }
            }
        }

        let numNodes = gridNodes.length;
        let edges = [];

        let maxEdgeDist = Math.max((maxLat - minLat), (maxLon - minLon)) / (gridSize / 2.0);

        for (let i = 0; i < numNodes; i++) {
            for (let j = i + 1; j < numNodes; j++) {
                let dist = distance(gridNodes[i], gridNodes[j]);
                if (dist <= maxEdgeDist) {
                    let midpoint = {
                        lat: (gridNodes[i].lat + gridNodes[j].lat) / 2.0,
                        lon: (gridNodes[i].lon + gridNodes[j].lon) / 2.0
                    };

                    if (hazardHull.length > 0 && 
                        (isPointInPolygon(gridNodes[i], hazardHull) || 
                         isPointInPolygon(gridNodes[j], hazardHull) ||
                         isPointInPolygon(midpoint, hazardHull))) {
                        continue;
                    }

                    edges.push({ src: i, dest: j, weight: dist });
                    edges.push({ src: j, dest: i, weight: dist });
                }
            }
        }

        let virtualDest = numNodes;
        for (let i = 0; i < numSafe; i++) {
            edges.push({ src: safeZoneStartIdx + i, dest: virtualDest, weight: 0 });
            edges.push({ src: virtualDest, dest: safeZoneStartIdx + i, weight: 0 });
        }

        let totalVertices = numNodes + 1;
        let { distances, predecessors } = bellmanFord(totalVertices, virtualDest, edges);

        let responseRoutes = [];

        for (let w = 0; w < numWorkers; w++) {
            if (distances[w] === Infinity) {
                responseRoutes.push({ worker_idx: w, status: "TRAPPED", path: [] });
                continue;
            }

            let pathCoords = [];
            let current = w;
            while (current !== -1 && current !== virtualDest) {
                pathCoords.push({ lat: gridNodes[current].lat, lon: gridNodes[current].lon });
                current = predecessors[current];
            }

            responseRoutes.push({ worker_idx: w, status: "EVACUATING", path: pathCoords });
        }

        res.status(200).json(responseRoutes);
    } catch (e) {
        res.status(400).json({ error: 'Routing failed: ' + e.message });
    }
});

// ==========================================
// 3. Fractional Power Routing
// ==========================================
function powerTriage(available_kw, subsystems) {
    subsystems.forEach(sub => {
        sub.ratio = sub.survival_priority / sub.required_kw;
    });

    subsystems.sort((a, b) => b.ratio - a.ratio);

    let totalMaximizedPriority = 0;
    let poweredSubsystems = [];
    let current_kw = available_kw;

    for (const sub of subsystems) {
        if (current_kw <= 0) break;

        let allocate_kw = Math.min(sub.required_kw, current_kw);
        let prioritize_score = allocate_kw * sub.ratio;
        let percentage = (allocate_kw / sub.required_kw) * 100;

        poweredSubsystems.push({
            name: sub.name,
            allocated_kw: allocate_kw,
            percentage_powered: percentage
        });

        totalMaximizedPriority += prioritize_score;
        current_kw -= allocate_kw;
    }

    return { total_maximized_priority: totalMaximizedPriority, subsystems: poweredSubsystems };
}

app.post('/api/power_triage', (req, res) => {
    try {
        const available_kw = req.body.available_kw;
        const subsystems = req.body.subsystems;

        const pResult = powerTriage(available_kw, subsystems);

        res.status(200).json({
            total_maximized_priority: pResult.total_maximized_priority,
            subsystems: pResult.subsystems
        });
    } catch (e) {
        res.status(400).json({ error: 'Invalid request format: ' + e.message });
    }
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Starting TerraSentry API V2.0 on port ${PORT}...`);
});
