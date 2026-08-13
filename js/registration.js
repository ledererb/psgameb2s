// ============================================
// Snacky Dash B2S — regisztrációs űrlap (spec §6.4)
// Game over képernyőn jelenik meg új játékosnak;
// 'edit' módban profil-módosítás (update-affiliation).
// ============================================

import { api } from './api.js';
import { playerStore } from './player-store.js';

const ERROR_TEXT = {
    nickname_length: 'A becenév legyen 2–20 karakter.',
    nickname_chars: 'Csak betű, szám, szóköz, pont, kötőjel és alulvonás.',
    nickname_blocked: 'Ez a becenév nem használható, válassz másikat.',
    school_invalid: 'Add meg az iskola nevét és a települést.',
    class_requires_school: 'Osztály csak iskolával együtt adható meg.',
    rate_limited: 'Túl sok próbálkozás, várj egy percet.',
    network: 'Nincs kapcsolat a szerverrel. Próbáld újra!',
};

export function initRegistration({ mode = 'register', prefill = null, onRegistered, onSkip }) {
    const $ = (id) => document.getElementById(id);
    const overlay = $('reg-overlay');
    const nickInput = $('reg-nickname');
    const schoolInput = $('reg-school-input');
    const results = $('reg-school-results');
    const newSchoolBox = $('reg-school-new');
    const classRow = $('reg-class-row');
    const classSelect = $('reg-class-select');
    const classNewInput = $('reg-class-new-input');
    const consent = $('reg-consent');
    const errorEl = $('reg-error');
    const submitBtn = $('reg-submit');
    const skipBtn = $('reg-skip');

    let selectedSchool = null; // {id} | {isNew:true}
    let debounceTimer = null;
    // edit módban CSAK a piszkált (módosított) mezők mennek a payloadba —
    // különben az update-affiliation „iskolaváltás → osztály reset" szabálya
    // törölné a meglévő osztályt egy üres mentésnél is
    let schoolDirty = mode === 'register';
    let classDirty = mode === 'register';

    // edit mód: prefill + consent/age elrejtése (már adott), update-affiliation hívás
    if (mode === 'edit' && prefill) {
        nickInput.value = prefill.nickname ?? '';
        nickInput.disabled = true; // becenév most nem módosítható (YAGNI)
        if (prefill.school) {
            schoolInput.value = prefill.school.name;
            selectedSchool = { id: prefill.school.id };
            classRow.classList.remove('hidden');
            loadClasses(prefill.school.id).then(() => {
                if (prefill.class) classSelect.value = String(prefill.class.id);
            });
        }
        document.querySelector('.age-row').style.display = 'none';
        consent.closest('.checkbox-row').style.display = 'none';
        submitBtn.textContent = 'Mentés';
    }

    function showError(code) {
        errorEl.textContent = ERROR_TEXT[code] ?? 'Valami nem sikerült. Próbáld újra!';
        errorEl.classList.remove('hidden');
    }

    // ── Iskolakereső ──
    schoolInput.addEventListener('input', () => {
        selectedSchool = null;
        schoolDirty = true;
        clearTimeout(debounceTimer);
        const q = schoolInput.value.trim();
        if (q.length < 2) { results.classList.add('hidden'); return; }
        debounceTimer = setTimeout(async () => {
            let hits = [];
            try { hits = await api.searchSchools(q); } catch { /* offline: lista üres */ }
            results.innerHTML = '';
            hits.forEach((s) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'autocomplete-item';
                item.textContent = `${s.name} — ${s.city}`;
                item.addEventListener('click', () => pickSchool(s));
                results.appendChild(item);
            });
            const addNew = document.createElement('button');
            addNew.type = 'button';
            addNew.className = 'autocomplete-item autocomplete-add';
            addNew.textContent = '➕ Nem találom — felveszem';
            addNew.addEventListener('click', () => {
                results.classList.add('hidden');
                newSchoolBox.classList.remove('hidden');
                selectedSchool = { isNew: true };
                schoolDirty = true;
                classRow.classList.remove('hidden');
            });
            results.appendChild(addNew);
            results.classList.remove('hidden');
        }, 300);
    });

    function pickSchool(s) {
        selectedSchool = { id: s.id };
        schoolDirty = true;
        schoolInput.value = `${s.name} — ${s.city}`;
        results.classList.add('hidden');
        newSchoolBox.classList.add('hidden');
        classRow.classList.remove('hidden');
        loadClasses(s.id);
    }

    async function loadClasses(schoolId) {
        classSelect.innerHTML = '<option value="">Osztály (nem kötelező)…</option>';
        try {
            const classes = await api.getClasses(schoolId);
            classes.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name;
                classSelect.appendChild(opt);
            });
        } catch { /* offline: csak új osztály adható */ }
        const optNew = document.createElement('option');
        optNew.value = '__new'; optNew.textContent = '➕ Új osztály…';
        classSelect.appendChild(optNew);
    }

    classSelect.addEventListener('change', () => {
        classDirty = true;
        classNewInput.classList.toggle('hidden', classSelect.value !== '__new');
    });

    // ── Payload-építés ──
    function buildPayload() {
        const p = {};
        if (mode === 'register') {
            p.nickname = nickInput.value.trim();
            const age = document.querySelector('input[name="reg-age"]:checked');
            p.consent_is_parent = age?.value === 'parent';
        }
        if (mode === 'register' || schoolDirty) {
            if (selectedSchool?.id) p.school_id = selectedSchool.id;
            else if (selectedSchool?.isNew) {
                p.new_school = {
                    name: $('reg-school-new-name').value,
                    city: $('reg-school-new-city').value,
                    type: $('reg-school-new-type').value,
                };
            }
        }
        if (mode === 'register' || classDirty) {
            if (classSelect.value && classSelect.value !== '__new') p.class_id = Number(classSelect.value);
            else if (classSelect.value === '__new' && classNewInput.value.trim()) {
                p.new_class_name = classNewInput.value.trim();
            }
        }
        return p;
    }

    function valid() {
        if (mode === 'register') {
            if (nickInput.value.trim().length < 2) return 'nickname_length';
            if (!document.querySelector('input[name="reg-age"]:checked')) return 'age_required';
            if (!consent.checked) return 'consent_required';
        }
        if (selectedSchool?.isNew) {
            if ($('reg-school-new-name').value.trim().length < 4) return 'school_invalid';
            if ($('reg-school-new-city').value.trim().length < 2) return 'school_invalid';
        }
        return null;
    }

    submitBtn.addEventListener('click', async () => {
        errorEl.classList.add('hidden');
        const err = valid();
        if (err) {
            errorEl.textContent = err === 'age_required' ? 'Válaszd ki a korcsoportot!'
                : err === 'consent_required' ? 'A tájékoztató elfogadása kötelező.'
                : ERROR_TEXT[err];
            errorEl.classList.remove('hidden');
            return;
        }
        submitBtn.disabled = true;
        try {
            let player;
            if (mode === 'register') {
                player = await api.register(buildPayload());
            } else {
                const cur = playerStore.load();
                const res = await api.updateAffiliation({
                    player_id: cur.player_id, secret: cur.secret, ...buildPayload(),
                });
                player = { ...cur, school: res.school, class: res.class };
            }
            playerStore.save(player);
            overlay.classList.add('hidden');
            onRegistered(player);
        } catch (e) {
            showError(e.code);
            submitBtn.disabled = false;
        }
    });

    skipBtn?.addEventListener('click', () => {
        overlay.classList.add('hidden');
        onSkip?.();
    });

    overlay.classList.remove('hidden');
    setTimeout(() => nickInput.focus(), 150);
}
