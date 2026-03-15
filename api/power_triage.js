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

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

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
};
