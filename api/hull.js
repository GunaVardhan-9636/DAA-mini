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

module.exports = async (req, res) => {
    // Enable CORS for development/testing if needed
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const points = req.body.points || [];
        const hull = convexHull(points);
        res.status(200).json(hull);
    } catch (e) {
        res.status(400).json({ error: 'Invalid request format: ' + e.message });
    }
};
