// ============================================
// Snacky Dash B2S — Ranglista UI (spec §6.5)
// 3 tab: Egyéni (sorsolás!) | Iskolák (top-5 átlag) |
// Osztályok (top-5 átlag, iskolán belül).
// Szerverről + localStorage cache-fallback.
// ============================================

import { api } from './api.js';
import { playerStore } from './player-store.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmt = (n) => Number(n).toLocaleString('hu-HU');
// Szerver-adatok HTML-escape-elése innerHTML-interpoláció előtt (XSS-védelem)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class LeaderboardUI {
    constructor(listEl, noteEl) {
        this.listEl = listEl;
        this.noteEl = noteEl;
        this.tab = 'individual';
        this.classSchoolId = playerStore.load()?.school?.id ?? null;
    }

    async show(tab = this.tab, { classSchoolId } = {}) {
        this.tab = tab;
        if (classSchoolId !== undefined) this.classSchoolId = classSchoolId;
        const cached = playerStore.readLbCache(this.tab);
        try {
            const data = await this._fetch();
            playerStore.cacheLb(this.tab, data);
            this._render(data, null);
        } catch {
            if (cached) {
                const when = new Date(cached.at).toLocaleString('hu-HU');
                this._render(cached.data, `Offline — utolsó frissítés: ${when}`);
            } else {
                this.listEl.innerHTML =
                    '<p class="lb-empty">Nem érhető el a szerver. Próbáld később!</p>';
            }
        }
    }

    _fetch() {
        if (this.tab === 'individual') return api.fetchIndividual();
        if (this.tab === 'schools') return api.fetchSchools();
        // Frissen regisztrált / iskolát váltó játékosnál a tárolt érték stále
        // lehet — mindig frissen olvassuk, hogy reload nélkül is helyes legyen
        this.classSchoolId = playerStore.load()?.school?.id ?? null;
        if (!this.classSchoolId) return Promise.resolve([]);
        return api.fetchClasses(this.classSchoolId);
    }

    _render(data, cacheNote) {
        const me = playerStore.load();
        let note = '';
        let html = '<table class="lb-table"><thead><tr>';

        if (this.tab === 'individual') {
            note = 'A nyereményt a résztvevők között <strong>sorsoljuk</strong> ki a kampány végén.';
            html += '<th>#</th><th>Játékos</th><th>Iskola</th><th>Pont</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.player_id === me?.player_id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${esc(r.nickname)}</td>
                    <td>${esc(r.school_name ?? '—')}</td>
                    <td class="lb-score">${fmt(r.best_score)}</td></tr>`;
            });
        } else if (this.tab === 'schools') {
            note = 'Az iskolák az <strong>5 legjobb játékosuk</strong> átlagával versenyeznek (min. 5 játékos kell).';
            html += '<th>#</th><th>Iskola</th><th>Átlagpont</th><th>Játékos</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.school_id === me?.school?.id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${esc(r.name)} <span class="lb-city">${esc(r.city)}</span></td>
                    <td class="lb-score">${fmt(r.avg_score)}</td>
                    <td>${r.player_count}</td></tr>`;
            });
        } else {
            note = this.classSchoolId
                ? 'Az osztályok az <strong>5 legjobb tagjuk</strong> átlagával versenyeznek (min. 5 tag kell).'
                : 'Válassz iskolát a game over képernyőn, hogy lásd az osztályait!';
            html += '<th>#</th><th>Osztály</th><th>Top-5 átlag</th><th>Tag</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.class_id === me?.class?.id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${esc(r.name)}</td>
                    <td class="lb-score">${fmt(r.avg_score)}</td>
                    <td>${r.player_count}</td></tr>`;
            });
        }

        html += '</tbody></table>';
        if (data.length === 0) html = '<p class="lb-empty">Még nincs eredmény. Legyél az első!</p>';
        this.listEl.innerHTML = html;
        if (this.noteEl) {
            this.noteEl.innerHTML = cacheNote ? `<span class="lb-cache-note">${cacheNote}</span>` : note;
        }
    }
}
