#include "crow.h"
#include <nlohmann/json.hpp>
#include <vector>
#include <algorithm>
#include <cmath>
#include <string>
#include <limits>
#include <iostream>

using json = nlohmann::json;

// ==========================================
// Basic Geometric Primitives
// ==========================================
struct Point {
    double lat, lon;
    bool operator<(const Point& p) const {
        return lat < p.lat || (lat == p.lat && lon < p.lon);
    }
    bool operator==(const Point& p) const {
        return lat == p.lat && lon == p.lon;
    }
};

double cross_product(const Point& O, const Point& A, const Point& B) {
    return (A.lat - O.lat) * (B.lon - O.lon) - (A.lon - O.lon) * (B.lat - O.lat);
}

// ==========================================
// 1. Hazard Mapping: Convex Hull
// Time Complexity: O(N log N)
// ==========================================
std::vector<Point> convex_hull(std::vector<Point> P) {
    size_t n = P.size(), k = 0;
    if (n <= 3) return P;
    std::vector<Point> H(2 * n);
    
    std::sort(P.begin(), P.end());
    
    // Build lower hull
    for (size_t i = 0; i < n; ++i) {
        while (k >= 2 && cross_product(H[k - 2], H[k - 1], P[i]) <= 0) k--;
        H[k++] = P[i];
    }
    
    // Build upper hull
    for (size_t i = n - 1, t = k + 1; i > 0; --i) {
        while (k >= t && cross_product(H[k - 2], H[k - 1], P[i - 1]) <= 0) k--;
        H[k++] = P[i - 1];
    }
    
    H.resize(k - 1);
    return H;
}

// Ray-Casting algorithm for Point-in-Polygon detection
bool is_point_in_polygon(const Point& point, const std::vector<Point>& polygon) {
    if (polygon.size() < 3) return false;
    
    bool inside = false;
    for (size_t i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
        if (((polygon[i].lat > point.lat) != (polygon[j].lat > point.lat)) &&
            (point.lon < (polygon[j].lon - polygon[i].lon) * (point.lat - polygon[i].lat) / 
            (polygon[j].lat - polygon[i].lat) + polygon[i].lon)) {
            inside = !inside;
        }
    }
    return inside;
}

// Helper: Distance between two points in abstract coordinates
double distance(const Point& a, const Point& b) {
    return std::sqrt(std::pow(a.lat - b.lat, 2) + std::pow(a.lon - b.lon, 2));
}

// ==========================================
// 2. Multi-User Dynamic Evacuation (Bellman-Ford on Grid)
// ==========================================
struct Edge {
    int src, dest;
    double weight;
};

// Returns {distances, predecessors} from one source using Bellman-Ford
std::pair<std::vector<double>, std::vector<int>> bellman_ford(int vertices, int source, const std::vector<Edge>& edges) {
    std::vector<double> dist(vertices, std::numeric_limits<double>::infinity());
    std::vector<int> pred(vertices, -1);
    dist[source] = 0;

    for (int i = 1; i <= vertices - 1; i++) {
        bool updated = false;
        for (const auto& edge : edges) {
            if (dist[edge.src] != std::numeric_limits<double>::infinity() && 
                dist[edge.src] + edge.weight < dist[edge.dest]) {
                dist[edge.dest] = dist[edge.src] + edge.weight;
                pred[edge.dest] = edge.src;
                updated = true;
            }
        }
        if (!updated) break; // Optimization: stop early if no relaxation
    }
    return {dist, pred};
}

// ==========================================
// 3. Critical Life-Support Power Triage (Fractional Knapsack)
// ==========================================
struct Subsystem {
    std::string name;
    double required_kw;
    double survival_priority;
    double ratio() const { return survival_priority / required_kw; }
};

struct PowerTriageResult {
    double total_maximized_priority;
    json subsystems;
};

PowerTriageResult power_triage(double available_kw, std::vector<Subsystem> subsystems) {
    std::sort(subsystems.begin(), subsystems.end(), [](const Subsystem& a, const Subsystem& b) {
        return a.ratio() > b.ratio();
    });

    double total_maximized_priority = 0.0;
    json powered_subsystems = json::array();
    double current_kw = available_kw;

    for (const auto& sub : subsystems) {
        if (current_kw <= 0) break;

        double allocate_kw = std::min(sub.required_kw, current_kw);
        double prioritize_score = allocate_kw * sub.ratio();
        double percentage = (allocate_kw / sub.required_kw) * 100.0;
        
        powered_subsystems.push_back({
            {"name", sub.name},
            {"allocated_kw", allocate_kw},
            {"percentage_powered", percentage}
        });

        total_maximized_priority += prioritize_score;
        current_kw -= allocate_kw;
    }

    return {total_maximized_priority, powered_subsystems};
}

// ==========================================
// API Handlers Setup
// ==========================================
void set_cors_headers(crow::response& res) {
    res.add_header("Access-Control-Allow-Origin", "*");
    res.add_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.add_header("Access-Control-Allow-Headers", "Content-Type");
}

int main() {
    crow::SimpleApp app;

    CROW_CATCHALL_ROUTE(app)
    ([](crow::request& req) {
        crow::response res;
        set_cors_headers(res);
        if (req.method == crow::HTTPMethod::OPTIONS) {
            res.code = 204;
        } else {
            res.code = 404;
        }
        return res;
    });

    // 1. Hazard Convex Hull
    CROW_ROUTE(app, "/api/hull").methods(crow::HTTPMethod::POST, crow::HTTPMethod::OPTIONS)
    ([](const crow::request& req) {
        crow::response res;
        set_cors_headers(res);
        if(req.method == crow::HTTPMethod::OPTIONS) { res.code = 204; return res; }

        try {
            auto data = json::parse(req.body);
            std::vector<Point> points;
            for (const auto& p : data["points"]) {
                points.push_back({p["lat"].get<double>(), p["lon"].get<double>()});
            }

            auto hull = convex_hull(points);

            json result = json::array();
            for (const auto& p : hull) {
                result.push_back({{"lat", p.lat}, {"lon", p.lon}});
            }

            res.code = 200;
            res.body = result.dump();
        } catch (const std::exception& e) {
            res.code = 400;
            res.body = json({{"error", std::string("Invalid format: ") + e.what()}}).dump();
        }
        return res;
    });

    // 2. Multi-User Advanced Routing
    CROW_ROUTE(app, "/api/multi_route").methods(crow::HTTPMethod::POST, crow::HTTPMethod::OPTIONS)
    ([](const crow::request& req) {
        crow::response res;
        set_cors_headers(res);
        if(req.method == crow::HTTPMethod::OPTIONS) { res.code = 204; return res; }

        try {
            auto data = json::parse(req.body);
            
            // Parse Workers
            std::vector<Point> workers;
            for (const auto& w : data["workers"]) {
                workers.push_back({w["lat"].get<double>(), w["lon"].get<double>()});
            }

            // Parse Safe Zones
            std::vector<Point> safe_zones;
            for (const auto& s : data["safe_zones"]) {
                safe_zones.push_back({s["lat"].get<double>(), s["lon"].get<double>()});
            }

            // Parse Hazard Hull
            std::vector<Point> hazard_hull;
            if (data.contains("hazard_hull")) {
                for (const auto& h : data["hazard_hull"]) {
                    hazard_hull.push_back({h["lat"].get<double>(), h["lon"].get<double>()});
                }
            }

            // Generate a 10x10 dynamic grid covering the bbox of all elements
            double min_lat = std::numeric_limits<double>::infinity();
            double max_lat = -std::numeric_limits<double>::infinity();
            double min_lon = std::numeric_limits<double>::infinity();
            double max_lon = -std::numeric_limits<double>::infinity();

            auto update_bounds = [&](const Point& p) {
                if(p.lat < min_lat) min_lat = p.lat;
                if(p.lat > max_lat) max_lat = p.lat;
                if(p.lon < min_lon) min_lon = p.lon;
                if(p.lon > max_lon) max_lon = p.lon;
            };

            for(const auto& w : workers) update_bounds(w);
            for(const auto& s : safe_zones) update_bounds(s);
            for(const auto& h : hazard_hull) update_bounds(h);

            // Create Grid Nodes
            int grid_size = 10;
            std::vector<Point> graph_nodes;
            
            // We'll append the actual workers and safe zones as explicit nodes in the graph
            for(const auto& w : workers) graph_nodes.push_back(w);
            int num_workers = workers.size();
            
            for(const auto& s : safe_zones) graph_nodes.push_back(s);
            int num_safe = safe_zones.size();
            int safe_zone_start_idx = num_workers;

            // Generate Grid points inside bounding box to act as intermediate paths
            if (min_lat != std::numeric_limits<double>::infinity()) {
                // Expand box slightly
                double lat_span = (max_lat - min_lat) == 0 ? 0.01 : (max_lat - min_lat);
                double lon_span = (max_lon - min_lon) == 0 ? 0.01 : (max_lon - min_lon);
                
                min_lat -= lat_span * 0.1; max_lat += lat_span * 0.1;
                min_lon -= lon_span * 0.1; max_lon += lon_span * 0.1;

                double dlat = (max_lat - min_lat) / grid_size;
                double dlon = (max_lon - min_lon) / grid_size;

                for (int i = 0; i <= grid_size; i++) {
                    for (int j = 0; j <= grid_size; j++) {
                        Point p = {min_lat + i * dlat, min_lon + j * dlon};
                        // Only add grid point if it's NOT inside the hazard polygon
                        if (!hazard_hull.empty() && is_point_in_polygon(p, hazard_hull)) {
                            continue;
                        }
                        graph_nodes.push_back(p);
                    }
                }
            }

            int num_nodes = graph_nodes.size();
            std::vector<Edge> edges;

            // Connect every node to nearby nodes to form a graph (O(V^2) grid mapping)
            // Weight is geometric distance. Infinite if one is in hazard.
            // For a production app, we would use Delaunay Triangulation or KD-Trees,
            // but a dense distance threshold works for this Prototype V2.0.
            double MAX_EDGE_DIST = std::max((max_lat - min_lat), (max_lon - min_lon)) / (grid_size / 2.0);

            for (int i = 0; i < num_nodes; i++) {
                for (int j = i + 1; j < num_nodes; j++) {
                    double dist = distance(graph_nodes[i], graph_nodes[j]);
                    if (dist <= MAX_EDGE_DIST) {
                        // Midpoint approximation to prevent crossing through polygon lines
                        Point midpoint = {
                            (graph_nodes[i].lat + graph_nodes[j].lat) / 2.0,
                            (graph_nodes[i].lon + graph_nodes[j].lon) / 2.0
                        };

                        if (!hazard_hull.empty() && 
                           (is_point_in_polygon(graph_nodes[i], hazard_hull) || 
                            is_point_in_polygon(graph_nodes[j], hazard_hull) ||
                            is_point_in_polygon(midpoint, hazard_hull))) 
                        {
                            continue; // Skip edges crossing/entering hazards
                        }

                        edges.push_back({i, j, dist});
                        edges.push_back({j, i, dist}); // Unidirectional graph
                    }
                }
            }

            // We want to find the shortest path FROM any worker TO the nearest safe zone.
            // TRICK: Add a "Virtual Super-Destination" connected to all Safe Zones with weight 0.
            int virtual_dest = num_nodes;
            for (int i = 0; i < num_safe; i++) {
                edges.push_back({safe_zone_start_idx + i, virtual_dest, 0.0});
                edges.push_back({virtual_dest, safe_zone_start_idx + i, 0.0});
            }

            int total_vertices = num_nodes + 1;

            // Reverse Bellman-Ford: Run Bellman Ford FROM the Virtual Destination to all nodes.
            // This gives us the Single-Source Shortest Path tree where "source" is the Safe Zones.
            auto [distances, predecessors] = bellman_ford(total_vertices, virtual_dest, edges);

            json response_routes = json::array();

            // Trace paths for each worker back to a Safe Zone
            for (int w = 0; w < num_workers; w++) {
                if (distances[w] == std::numeric_limits<double>::infinity()) {
                    response_routes.push_back({
                        {"worker_idx", w},
                        {"status", "TRAPPED"},
                        {"path", json::array()}
                    });
                    continue;
                }

                std::vector<json> path_coords;
                int current = w;
                
                // Trace from worker along the predecessors until we hit the Virtual Dest
                while (current != -1 && current != virtual_dest) {
                    path_coords.push_back({
                        {"lat", graph_nodes[current].lat},
                        {"lon", graph_nodes[current].lon}
                    });
                    current = predecessors[current];
                }

                response_routes.push_back({
                    {"worker_idx", w},
                    {"status", "EVACUATING"},
                    {"path", path_coords}
                });
            }

            res.code = 200;
            res.body = response_routes.dump();
        } catch (const std::exception& e) {
            res.code = 400;
            res.body = json({{"error", std::string("Routing failed: ") + e.what()}}).dump();
        }
        return res;
    });

    // 3. Power Triage
    CROW_ROUTE(app, "/api/power_triage").methods(crow::HTTPMethod::POST, crow::HTTPMethod::OPTIONS)
    ([](const crow::request& req) {
        crow::response res;
        set_cors_headers(res);
        if(req.method == crow::HTTPMethod::OPTIONS) { res.code = 204; return res; }

        try {
            auto data = json::parse(req.body);
            double available_kw = data["available_kw"].get<double>();
            
            std::vector<Subsystem> subsystems;
            for (const auto& i : data["subsystems"]) {
                subsystems.push_back({
                    i["name"].get<std::string>(), 
                    i["required_kw"].get<double>(), 
                    i["survival_priority"].get<double>()
                });
            }

            auto result = power_triage(available_kw, subsystems);

            json json_res = {
                {"total_maximized_priority", result.total_maximized_priority},
                {"subsystems", result.subsystems}
            };

            res.code = 200;
            res.body = json_res.dump();
        } catch (const std::exception& e) {
            res.code = 400;
            res.body = json({{"error", std::string("Invalid format: ") + e.what()}}).dump();
        }
        return res;
    });

    std::cout << "Starting Industrial V2 TerraSentry Core (C++) on port 8080..." << std::endl;
    app.port(8080).multithreaded().run();
    return 0;
}
