// Backend API URL defaults to relative paths for Vercel Serverless Functions
const API_URL = "/api";

// Initialize Leaflet Map (Dark Industrial Theme applied via CSS inversion)
const map = L.map('map', {
    zoomControl: false // Move if necessary
}).setView([20.5937, 78.9629], 5);

// Add standard OpenStreetMap tiles, inverted in CSS
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'TerraSentry Defense Systems'
}).addTo(map);

// State Variables for V2
let hazardPoints = [];
let hazardHull = []; // The actual polygon coords
let workers = [];
let safeZones = [];
let mapLayers = [];

// Icons
const workerIcon = L.divIcon({
    className: 'worker-pulse',
    html: '<div class="pulse"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// Cleanup map
function clearMap() {
    mapLayers.forEach(layer => map.removeLayer(layer));
    mapLayers = [];
    hazardPoints = [];
    hazardHull = [];
    workers = [];
    safeZones = [];
    
    // Clear routes table
    const tbody = document.getElementById('results-body');
    if (tbody) tbody.innerHTML = '';
}

document.getElementById('btn-clear-map').addEventListener('click', clearMap);

// Simulate Workers & Safe Zones
document.getElementById('btn-simulate').addEventListener('click', () => {
    clearMap();
    const center = map.getCenter();
    const spread = 2.0;

    // Spawn 2 Safe Zones (Green)
    for (let i = 0; i < 2; i++) {
        const sz = {
            lat: center.lat + (Math.random() - 0.5) * spread,
            lon: center.lng + (Math.random() - 0.5) * spread
        };
        safeZones.push(sz);
        const marker = L.circleMarker([sz.lat, sz.lon], {
            radius: 10,
            fillColor: "#10b981", // Success green
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).bindPopup("Rally Safe Zone").addTo(map);
        mapLayers.push(marker);
    }

    // Spawn 5 Workers (Pulsing Blue)
    for (let i = 0; i < 5; i++) {
        const w = {
            lat: center.lat + (Math.random() - 0.5) * spread,
            lon: center.lng + (Math.random() - 0.5) * spread
        };
        workers.push(w);
        const marker = L.marker([w.lat, w.lon], { icon: workerIcon })
            .bindPopup(`Worker Unit 0${i+1}`).addTo(map);
        mapLayers.push(marker);
    }
    
    // Auto-fit map to simulated points
    const allCoords = [...safeZones, ...workers].map(p => [p.lat, p.lon]);
    if(allCoords.length > 0) map.fitBounds(allCoords);
});

// Report Hazard via clicking
map.on('click', (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    hazardPoints.push({ lat, lon });

    const marker = L.circleMarker([lat, lon], {
        radius: 6,
        fillColor: "#ef4444", // Critical red
        color: "#fff",
        weight: 1,
        fillOpacity: 0.9
    }).addTo(map);
    mapLayers.push(marker);
});

// [2] Lock Perimeter (Convex Hull)
document.getElementById('btn-calc-hull').addEventListener('click', async () => {
    if (hazardPoints.length < 3) {
        alert("Deploy at least 3 perimeter markers to calculate a Danger Zone.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/hull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: hazardPoints })
        });

        const hull = await response.json();
        if (hull.error) {
            console.error("Hull Error:", hull.error);
            return;
        }

        hazardHull = hull; // Save state for routing
        const hullCoords = hull.map(p => [p.lat, p.lon]);
        
        // Draw Red Hashed Polygon
        const polygon = L.polygon(hullCoords, {
            color: '#ef4444',
            weight: 3,
            fillColor: '#dc2626',
            fillOpacity: 0.4,
            dashArray: '10, 5' // striped look
        }).addTo(map);

        mapLayers.push(polygon);
    } catch (err) {
        console.error("Failed to fetch perimeter:", err);
    }
});


// [3] MULTI-USER EVACUATION
document.getElementById('btn-calc-route').addEventListener('click', async () => {
    if (workers.length === 0 || safeZones.length === 0) {
        alert("Please INITIATE TRACKERS first to spawn workers and safe zones.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/multi_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workers: workers,
                safe_zones: safeZones,
                hazard_hull: hazardHull
            })
        });

        const routes = await response.json();
        
        if (routes.error) {
            console.error(routes.error);
            alert("No available routes found or API error.");
            return;
        }

        const colors = ['#38bdf8', '#f472b6', '#fbbf24', '#34d399', '#a78bfa'];

        // Draw multiple routes
        routes.forEach((routeData, idx) => {
            if (routeData.status === "EVACUATING" && routeData.path.length > 0) {
                const pathCoords = routeData.path.map(p => [p.lat, p.lon]);
                
                // Animate/Draw Route
                const polyline = L.polyline(pathCoords, {
                    color: colors[idx % colors.length],
                    weight: 4,
                    dashArray: '15, 10',
                    opacity: 0.8
                }).addTo(map);

                mapLayers.push(polyline);
            } else if (routeData.status === "TRAPPED") {
                console.warn(`Worker ${routeData.worker_idx} has no path to safety!`);
                // Visual indicator for trapped
                const trappedWorker = workers[routeData.worker_idx];
                const marker = L.circleMarker([trappedWorker.lat, trappedWorker.lon], {
                    radius: 12, fillColor: "#ef4444", color: "#000", weight: 3, fillOpacity: 0.9
                }).bindPopup("TRAPPED MINER").addTo(map);
                mapLayers.push(marker);
            }
        });
    } catch (err) {
        console.error("Evacuation routing failed:", err);
    }
});


// [4] CRITICAL LIFE-SUPPORT TRIAGE
document.getElementById('btn-optimize-loadout').addEventListener('click', async () => {
    const capacityInput = document.getElementById('capacity').value;
    const available_kw = parseFloat(capacityInput);

    if (isNaN(available_kw) || available_kw <= 0) return alert("Invalid generator output.");

    const subsystems = [
        { name: "Emergency Comms Mesh", required_kw: 50, survival_priority: 100 },
        { name: "Main Ventilation Fans", required_kw: 300, survival_priority: 90 },
        { name: "Elevator/Hoist Winch", required_kw: 200, survival_priority: 85 },
        { name: "Dewatering Sub-Pumps", required_kw: 250, survival_priority: 75 },
        { name: "Hazard Sensor Grid", required_kw: 40, survival_priority: 60 }
    ];

    try {
        const response = await fetch(`${API_URL}/power_triage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ available_kw, subsystems })
        });

        const result = await response.json();

        // Update Dashboard
        document.getElementById('total-value').innerText = result.total_maximized_priority.toFixed(2);
        
        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';

        result.subsystems.forEach(sub => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color:var(--brand-accent)">[⚡]</span> ${sub.name}</td>
                <td>${sub.allocated_kw.toFixed(1)} kW</td>
                <td style="color:var(--warning)">${sub.percentage_powered.toFixed(0)}% Power</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('logistics-dashboard').classList.remove('hidden');

    } catch (err) {
        console.error("Power Triage failed:", err);
    }
});

// Close logistics dashboard
document.getElementById('btn-close-dashboard').addEventListener('click', () => {
    document.getElementById('logistics-dashboard').classList.add('hidden');
});
