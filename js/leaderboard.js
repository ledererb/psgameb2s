// ============================================
// Snacky Dash — Leaderboard (localStorage)
// Stores email + score + date, shows top 10.
// ============================================

const STORAGE_KEY = 'hotdog_dash_leaderboard';
const MAX_ENTRIES = 50; // store up to 50, display top 10

export class Leaderboard {
    constructor() {
        this.scores = this._load();
    }

    /**
     * Add a new score entry.
     * @returns {number} Rank (1-based) of the new entry.
     */
    addScore(email, score) {
        const entry = {
            email: email.trim().toLowerCase(),
            score: Math.floor(score),
            date: new Date().toISOString()
        };
        this.scores.push(entry);
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > MAX_ENTRIES) {
            this.scores = this.scores.slice(0, MAX_ENTRIES);
        }
        this._save();

        // Return rank
        return this.scores.findIndex(
            s => s.email === entry.email && s.score === entry.score && s.date === entry.date
        ) + 1;
    }

    /**
     * Get top N scores.
     */
    getTopScores(limit = 10) {
        return this.scores.slice(0, limit);
    }

    /**
     * Get the highest score ever.
     */
    getHighScore() {
        return this.scores.length > 0 ? this.scores[0].score : 0;
    }

    /**
     * Get the highest score from today's entries.
     * Matches entries whose ISO date string starts with today's YYYY-MM-DD.
     */
    getDailyHighScore() {
        const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
        let best = 0;
        for (const entry of this.scores) {
            if (entry.date && entry.date.startsWith(today) && entry.score > best) {
                best = entry.score;
            }
        }
        return best;
    }

    /**
     * Mask an email for display: "jo***@gm***.com"
     */
    static maskEmail(email) {
        const [local, domain] = email.split('@');
        if (!domain) return email;
        const parts = domain.split('.');
        const maskedLocal = local.slice(0, 2) + '***';
        const maskedDomain = parts[0].slice(0, 2) + '***';
        return `${maskedLocal}@${maskedDomain}.${parts.slice(1).join('.')}`;
    }

    /**
     * Simple email validation.
     */
    static isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // ── Render into a DOM container ──

    renderInto(container) {
        const top = this.getTopScores(10);
        if (top.length === 0) {
            container.innerHTML = '<p class="lb-empty">Még nincs eredmény. Legyél az első!</p>';
            return;
        }

        let html = `
            <table class="lb-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Játékos</th>
                        <th>Pont</th>
                    </tr>
                </thead>
                <tbody>
        `;

        top.forEach((entry, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            html += `
                <tr class="${i < 3 ? 'lb-top3' : ''}">
                    <td class="lb-rank">${medal}</td>
                    <td class="lb-email">${Leaderboard.maskEmail(entry.email)}</td>
                    <td class="lb-score">${entry.score.toLocaleString()}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ── Persistence ──

    _load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores));
        } catch (e) {
            console.warn('Failed to save leaderboard:', e);
        }
    }
}
