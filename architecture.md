# TerraSentry v2.0 - Technical Architecture & Stack

TerraSentry v2.0 is an Industrial Mine & Geo-Hazard Command Center prototype. It visualizes workers, dynamic safe zones, and hazards in real-time, executing complex spatial and graph-routing calculations to optimize worker safety and facility power allocation during emergencies.

---

## 🏗️ Core Technology Stack

### Frontend (Client-Side)
- **HTML5 & CSS3:** Custom, dependency-free styling to create a high-tech, responsive dark-mode industrial dashboard.
- **Vanilla JavaScript (ES6+):** Handles all DOM manipulation, simulated state management, and asynchronous API communication without bloated frameworks.
- **Leaflet.js:** An open-source JavaScript library used for interactive, mobile-friendly map rendering and working with custom map markers/layers.
- **Google Fonts:** Utilizing `Share Tech Mono` and `Inter` for a modern command-terminal aesthetic.

### Backend (Server-Side)
- **Node.js:** The JavaScript runtime environment executing the backend logic.
- **Vercel Serverless Functions:** The backend is modularized into discrete, stateless functions (located in the `/api/` directory). This allows Vercel to dynamically spin up execution environments only when endpoints are hit, minimizing costs and scaling infinitely.

### Deployment & Hosting
- **Frontend Hosting:** Vercel Global Edge Network.
- **Backend Hosting:** Vercel Serverless (AWS Lambda under the hood).
- **Source Control:** Git & GitHub.

---

## 🧠 Algorithms & Data Structures

The core value of TerraSentry lies in its custom implementation of classic computational geometry and graph theory algorithms.

### 1. Hazard Perimeter Mapping
**Algorithm: Convex Hull (Monotone Chain / Graham Scan Variant)**
*   **File:** `api/hull.js`
*   **Purpose:** When an operator clicks multiple coordinate points to report a structural collapse or toxic gas leak, the system must mathematically define the boundary of the danger zone.
*   **How it works:** It sorts the coordinates lexicographically, then computes the upper and lower halves of the hull by determining the cross-product of sequential points to ensure all perimeter turns are "right turns."
*   **Time Complexity:** `O(N log N)` where N is the number of reported hazard points.

### 2. Multi-User Dynamic Evacuation
**Algorithms: Ray-Casting & Bellman-Ford Shortest Path**
*   **File:** `api/multi_route.js`
*   **Purpose:** During a catastrophic event, calculate the safest and shortest route for every active worker to the nearest safe zone, strictly avoiding the dynamic hazard perimeters.
*   **How it works:**
    1.  **Grid Map Generation:** Generates a dynamic 2D grid covering the bounding box of all workers, safe zones, and hazards.
    2.  **Obstacle Detection (Ray-Casting):** Uses the point-in-polygon ray-casting algorithm to remove any grid nodes or edges that intersect the Convex Hull hazard zone.
    3.  **Graph Construction:** Builds an adjacency list where edges are the geometric distances between safe grid nodes.
    4.  **Reverse Bellman-Ford Routing:** Instead of routing *from* each worker to a safe zone (which would require running the algorithm `W` times), it creates a "Virtual Super-Destination" connected to all Safe Zones with a weight of `0`. It runs Bellman-Ford *once* starting from this virtual destination to find the shortest path tree to *all* nodes simultaneously. Workers trace predecessors back to safety.
*   **Time Complexity:** 
    *   Grid Setup: `O(V^2)` geometry checks.
    *   Bellman-Ford: `O(V * E)` where V is grid nodes and E is edges.

### 3. Critical Life-Support Triage
**Algorithm: Fractional Knapsack (Greedy Approach)**
*   **File:** `api/power_triage.js`
*   **Purpose:** If main power fails and the backup generator provides limited `kW`, the system must calculate how to distribute power to industrial subsystems to maximize survival.
*   **How it works:** Calculates a `survival_priority / required_kw` ratio for every subsystem. It greedily allocates available power to the subsystems with the highest ratios first. Because these systems can operate on partial power, it uses the fractional variant of the knapsack algorithm.
*   **Time Complexity:** `O(S log S)` where S is the number of subsystems (dominated by the sorting step).
