// ============================================
// Snacky Dash B2S — regisztrációs űrlap (spec §6.4)
// Game over képernyőn jelenik meg új játékosnak;
// 'edit' módban profil-módosítás (update-affiliation).
// A DOM-elemek statikusak → a listenereket csak EGYSZER
// kötjük (bound-guard), a hívásonkénti állapot modulszintű.
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

const $ = (id) => document.getElementById(id);

// ── Modulszintű állapot (a listener-handlerek ezt olvassák) ──
let els = null;          // cache-elt DOM-referenciák
let bound = false;       // listenerek már fel vannak kötve
let mode = 'register';   // 'register' | 'edit'
let onRegisteredCb = null;
let onSkipCb = null;
let selectedSchool = null; // {id} | {isNew:true}
let leftSchool = false;    // edit mód: „Nincs iskolám / kilépek" → school_id: null
let debounceTimer = null;
// edit módban CSAK a piszkált (módosított) mezők mennek a payloadba —
// különben az update-affiliation „iskolaváltás → osztály reset" szabálya
// törölné a meglévő osztályt egy üres mentésnél is
let schoolDirty = true;
let classDirty = true;

export function initRegistration({ mode: m = 'register', prefill = null, onRegistered, onSkip }) {
    mode = m;
    onRegisteredCb = onRegistered;
    onSkipCb = onSkip;

    if (!els) {
        els = {
            overlay: $('reg-overlay'),
            nickInput: $('reg-nickname'),
            schoolInput: $('reg-school-input'),
            results: $('reg-school-results'),
            newSchoolBox: $('reg-school-new'),
            newSchoolName: $('reg-school-new-name'),
            newSchoolCity: $('reg-school-new-city'),
            newSchoolType: $('reg-school-new-type'),
            classRow: $('reg-class-row'),
            classSelect: $('reg-class-select'),
            classNewInput: $('reg-class-new-input'),
            leaveBtn: $('reg-leave-school'),
            consent: $('reg-consent'),
            rulesConsent: $('reg-rules-consent'),
            errorEl: $('reg-error'),
            submitBtn: $('reg-submit'),
            skipBtn: $('reg-skip'),
        };
    }

    // ── F2: alaphelyzet — register módú, üres űrlap minden hívásnál ──
    // (az edit mód inline elrejtései/disabled-jei így nem ragadnak be)
    els.nickInput.disabled = false;
    els.nickInput.value = '';
    els.schoolInput.value = '';
    els.schoolInput.placeholder = 'Iskola keresése (nem kötelező)';
    els.leaveBtn.classList.add('hidden');
    els.results.classList.add('hidden');
    els.results.innerHTML = '';
    els.newSchoolBox.classList.add('hidden');
    els.newSchoolName.value = '';
    els.newSchoolCity.value = '';
    els.newSchoolType.value = 'egyeb';
    els.classRow.classList.add('hidden');
    els.classSelect.innerHTML = '<option value="">Osztály (nem kötelező)…</option>';
    els.classNewInput.value = '';
    els.classNewInput.classList.add('hidden');
    document.querySelector('.age-row').style.display = '';
    document.querySelectorAll('input[name="reg-age"]').forEach((r) => { r.checked = false; });
    els.consent.closest('.checkbox-row').style.display = '';
    els.consent.checked = false;
    els.rulesConsent.closest('.checkbox-row').style.display = '';
    els.rulesConsent.checked = false;
    els.errorEl.classList.add('hidden');
    els.submitBtn.textContent = 'Pont mentése';
    els.submitBtn.disabled = false;
    selectedSchool = null;
    leftSchool = false;
    clearTimeout(debounceTimer);
    schoolDirty = mode === 'register';
    classDirty = mode === 'register';

    // ── F3: listenerek csak egyszer — különben minden hívás újabb
    // submit-handlert rakna a statikus gombokra (duplikált beküldés) ──
    if (!bound) {
        bound = true;
        bindListeners();
    }

    // edit mód: prefill + consent/age elrejtése (már adott), update-affiliation hívás
    if (mode === 'edit' && prefill) {
        els.nickInput.value = prefill.nickname ?? '';
        els.nickInput.disabled = true; // becenév most nem módosítható (YAGNI)
        if (prefill.school) {
            els.schoolInput.value = prefill.school.name;
            selectedSchool = { id: prefill.school.id };
            els.classRow.classList.remove('hidden');
            els.leaveBtn.classList.remove('hidden'); // iskola-elhagyás csak akkor értelmes, ha VAN iskola
            loadClasses(prefill.school.id).then(() => {
                if (prefill.class) els.classSelect.value = String(prefill.class.id);
            });
        }
        document.querySelector('.age-row').style.display = 'none';
        els.consent.closest('.checkbox-row').style.display = 'none';
        els.rulesConsent.closest('.checkbox-row').style.display = 'none';
        els.submitBtn.textContent = 'Mentés';
    }

    els.overlay.classList.remove('hidden');
    setTimeout(() => els.nickInput.focus(), 150);
}

function bindListeners() {
    // ── Iskolakereső ──
    els.schoolInput.addEventListener('input', () => {
        selectedSchool = null;
        leftSchool = false; // gépelés = mégsem lép ki, új iskolát keres
        els.schoolInput.placeholder = 'Iskola keresése (nem kötelező)';
        schoolDirty = true;
        clearTimeout(debounceTimer);
        const q = els.schoolInput.value.trim();
        if (q.length < 2) { els.results.classList.add('hidden'); return; }
        debounceTimer = setTimeout(async () => {
            let hits = [];
            try { hits = await api.searchSchools(q); } catch { /* offline: lista üres */ }
            els.results.innerHTML = '';
            hits.forEach((s) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'autocomplete-item';
                item.textContent = `${s.name} — ${s.city}`;
                item.addEventListener('click', () => pickSchool(s));
                els.results.appendChild(item);
            });
            const addNew = document.createElement('button');
            addNew.type = 'button';
            addNew.className = 'autocomplete-item autocomplete-add';
            addNew.textContent = '➕ Nem találom — felveszem';
            addNew.addEventListener('click', () => {
                els.results.classList.add('hidden');
                els.newSchoolBox.classList.remove('hidden');
                selectedSchool = { isNew: true };
                leftSchool = false;
                schoolDirty = true;
                els.classRow.classList.remove('hidden');
            });
            els.results.appendChild(addNew);
            els.results.classList.remove('hidden');
        }, 300);
    });

    els.classSelect.addEventListener('change', () => {
        classDirty = true;
        els.classNewInput.classList.toggle('hidden', els.classSelect.value !== '__new');
    });

    // ── „Nincs iskolám / kilépek" (csak edit módban látszik) ──
    els.leaveBtn.addEventListener('click', () => {
        leftSchool = true;
        selectedSchool = null;
        schoolDirty = true;
        classDirty = false; // a function school=null esetén maga nullázza a classt
        els.schoolInput.value = '';
        els.schoolInput.placeholder = 'Iskola elhagyva — egyénileg versenyzel (vagy keress újat)';
        els.results.classList.add('hidden');
        els.newSchoolBox.classList.add('hidden');
        els.classRow.classList.add('hidden');
        els.leaveBtn.classList.add('hidden');
    });

    els.submitBtn.addEventListener('click', async () => {
        els.errorEl.classList.add('hidden');
        const err = valid();
        if (err) {
            els.errorEl.textContent = err === 'age_required' ? 'Válaszd ki a korcsoportot!'
                : err === 'consent_required' ? 'A tájékoztató elfogadása kötelező.'
                : err === 'rules_consent_required' ? 'A játékszabályzat elfogadása kötelező.'
                : ERROR_TEXT[err];
            els.errorEl.classList.remove('hidden');
            return;
        }
        els.submitBtn.disabled = true;
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
            els.overlay.classList.add('hidden');
            onRegisteredCb?.(player);
        } catch (e) {
            showError(e.code);
            els.submitBtn.disabled = false;
        }
    });

    els.skipBtn?.addEventListener('click', () => {
        els.overlay.classList.add('hidden');
        onSkipCb?.();
    });
}

function pickSchool(s) {
    selectedSchool = { id: s.id };
    leftSchool = false;
    schoolDirty = true;
    els.schoolInput.value = `${s.name} — ${s.city}`;
    els.schoolInput.placeholder = 'Iskola keresése (nem kötelező)';
    els.results.classList.add('hidden');
    els.newSchoolBox.classList.add('hidden');
    els.classRow.classList.remove('hidden');
    loadClasses(s.id);
}

async function loadClasses(schoolId) {
    els.classSelect.innerHTML = '<option value="">Osztály (nem kötelező)…</option>';
    try {
        const classes = await api.getClasses(schoolId);
        classes.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id; opt.textContent = c.name;
            els.classSelect.appendChild(opt);
        });
    } catch { /* offline: csak új osztály adható */ }
    const optNew = document.createElement('option');
    optNew.value = '__new'; optNew.textContent = '➕ Új osztály…';
    els.classSelect.appendChild(optNew);
}

function showError(code) {
    els.errorEl.textContent = ERROR_TEXT[code] ?? 'Valami nem sikerült. Próbáld újra!';
    els.errorEl.classList.remove('hidden');
}

// ── Payload-építés ──
function buildPayload() {
    const p = {};
    if (mode === 'register') {
        p.nickname = els.nickInput.value.trim();
        const age = document.querySelector('input[name="reg-age"]:checked');
        p.consent_is_parent = age?.value === 'parent';
    }
    if (mode === 'register' || schoolDirty) {
        if (leftSchool) p.school_id = null; // iskola-elhagyás (a function a classt is nullázza)
        else if (selectedSchool?.id) p.school_id = selectedSchool.id;
        else if (selectedSchool?.isNew) {
            p.new_school = {
                name: els.newSchoolName.value,
                city: els.newSchoolCity.value,
                type: els.newSchoolType.value,
            };
        }
    }
    if (mode === 'register' || classDirty) {
        if (els.classSelect.value && els.classSelect.value !== '__new') p.class_id = Number(els.classSelect.value);
        else if (els.classSelect.value === '__new' && els.classNewInput.value.trim()) {
            p.new_class_name = els.classNewInput.value.trim();
        }
    }
    return p;
}

function valid() {
    if (mode === 'register') {
        if (els.nickInput.value.trim().length < 2) return 'nickname_length';
        if (!document.querySelector('input[name="reg-age"]:checked')) return 'age_required';
        if (!els.consent.checked) return 'consent_required';
        if (!els.rulesConsent.checked) return 'rules_consent_required';
    }
    if (selectedSchool?.isNew) {
        if (els.newSchoolName.value.trim().length < 4) return 'school_invalid';
        if (els.newSchoolCity.value.trim().length < 2) return 'school_invalid';
    }
    return null;
}
