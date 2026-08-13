/**
 * Secret 404 fight — original Undertale-style homage.
 *
 * Boss one-pager
 *   Name:       404
 *   Desire:     Keep the visitor lost; make them admit the page is gone.
 *   Soft spot:  Honesty, photography, and choosing to go home.
 *   Visual:     Empty gallery frame, broken chain, two pale "eyes".
 *   Tone:       Dry, self-aware, short lines.
 *
 * ACT graph (spare when check + talk + compliment, any order)
 *   Check ------\
 *   Talk --------+--> spareable
 *   Compliment --/
 *   Joke --> flavor only
 *   FIGHT --> harder waves / kill ending
 *
 * Waves (layered spawners, original shapes — not bones/blasters)
 *   1 rain LinkShards
 *   2 rain + sideSweep RedirectArrows
 *   3 shrink board + EmptyFrame rings + rain
 *   4 climax: rain + sweeps + rings + chasing orbs
 *
 * Controls
 *   Desktop: arrows/WASD move, Z/Enter confirm, X/Shift/Backspace back, M mute, Esc x2 leave
 *   Mobile:  tap menus, drag on the board or use the D-pad
 *
 * Trigger
 *   Click the 404 image 5 times, or search fight / 404 / missing / spare,
 *   or Konami (up up down down left right left right b a).
 */
(function () {
    'use strict';

    var PLAYER_MAX = 40;
    var BOSS_MAX = 80;
    var SOUL_SPEED = 150;
    var SOUL_R = 6;
    var IFRAMES = 0.9;
    var TYPE_MS = 28;

    var ACTIONS = ['FIGHT', 'ACT', 'ITEM', 'MERCY'];

    var ACTS = [
        {
            id: 'check',
            label: 'Check',
            text: '* 404 — ATK 4 DEF 404\n* A missing page wearing an empty frame.\n* It wants you to stay lost.'
        },
        {
            id: 'talk',
            label: 'Talk',
            text: '* You admit you took a wrong turn.\n* 404 lowers the frame a little.\n* "...at least you noticed."'
        },
        {
            id: 'compliment',
            label: 'Compliment',
            text: '* You praise the composition of the empty frame.\n* 404 flickers, almost like a photograph loading.'
        },
        {
            id: 'joke',
            label: 'Joke',
            text: '* You tell a broken-link joke.\n* 404 does not laugh. The chain rattles once.'
        }
    ];

    var ITEMS = [
        { id: 'cookie', label: 'Shutter Cookie', heal: 18, text: '* You eat the Shutter Cookie.\n* The click tastes like a good take.' },
        { id: 'sheet', label: 'Contact Sheet', heal: 12, text: '* You study the Contact Sheet.\n* Proof of life. HP restored.' },
        { id: 'cap', label: 'Lens Cap', shield: 1, text: '* You snap on the Lens Cap.\n* The next hit will bounce off.' },
        { id: 'filter', label: 'UV Filter', shield: 1, text: '* You screw on the UV Filter.\n* One shot will be absorbed.' }
    ];

    var MERCY = [
        { id: 'spare', label: 'Spare' },
        { id: 'flee', label: 'Flee' }
    ];

    var FLAVOR = {
        intro: '* A wild 404 blocks the way!\n* The page you wanted never existed.',
        menu: '* 404 stands in an empty frame.',
        menuReady: '* 404 seems ready to let you through.',
        afterCheck: '* ATK 4 DEF 404. Missing since forever.',
        spareFail: '* Not yet. 404 still wants to be seen.',
        flee: '* You tried to flee.\n* There is nowhere else. This IS the missing page.',
        noItems: '* You have nothing left in the bag.',
        miss: '* MISS',
        spareWin: '* 404\'s frame fills with a photograph.\n* The missing page was here all along.\n* It steps aside.',
        killWin: '* You deleted 404.\n* The site feels emptier.',
        gameOver: '* You got defeated.\n* 404 remains.'
    };

    var WAVES = [
        {
            id: 'wave1',
            durationMs: 6500,
            board: { w: 220, h: 150 },
            spawners: [{ type: 'rain', period: 420, speed: 88 }]
        },
        {
            id: 'wave2',
            durationMs: 8000,
            board: { w: 220, h: 150 },
            spawners: [
                { type: 'rain', period: 380, speed: 96 },
                { type: 'sideSweep', period: 1300, speed: 78 }
            ]
        },
        {
            id: 'wave3',
            durationMs: 10000,
            board: { w: 168, h: 138 },
            spawners: [
                { type: 'ring', period: 1700, speed: 58 },
                { type: 'rain', period: 500, speed: 92 }
            ]
        },
        {
            id: 'wave4',
            durationMs: 12000,
            board: { w: 158, h: 128 },
            spawners: [
                { type: 'rain', period: 320, speed: 112 },
                { type: 'sideSweep', period: 980, speed: 92 },
                { type: 'ring', period: 1500, speed: 70 },
                { type: 'chase', period: 2400, speed: 52 }
            ]
        }
    ];

    var HEART = [
        ' 11 11 ',
        '1111111',
        '1111111',
        '1111111',
        ' 11111 ',
        '  111  ',
        '   1   '
    ];

    var SEARCH_KEYS = ['fight', '404', 'missing', 'spare', 'secret'];
    var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

    var el = {};
    var state = 'idle';
    var running = false;
    var raf = 0;
    var lastTs = 0;
    var muted = false;
    var audio = null;
    var bgm = null;
    var bgmSource = null;
    var bgmGain = null;
    var BGM_SRC = 'images/secret/404-theme.mp3';
    var escArmed = false;

    var playerHp = PLAYER_MAX;
    var bossHp = BOSS_MAX;
    var turn = 0;
    var fightCount = 0;
    var flags = { check: false, talk: false, compliment: false };
    var inventory = [];
    var shieldCharges = 0;
    var spareable = false;
    var sawCheck = false;

    var actionIndex = 0;
    var subIndex = 0;
    var endIndex = 0;
    var subOptions = [];
    var subKind = '';

    var typeFull = '';
    var typeShown = '';
    var typeAcc = 0;
    var typeDone = true;
    var afterDialogue = null;

    var keys = { up: false, down: false, left: false, right: false };
    var bullets = [];
    var spawners = [];
    var waveTime = 0;
    var waveDur = 0;
    var iframes = 0;
    var soul = { x: 0, y: 0 };
    var boardW = 220;
    var boardH = 150;
    var pointerAim = null;

    var aimX = 0;
    var aimDir = 1;
    var aimLocked = false;
    var aimFlash = 0;
    var lastDamage = 0;

    var konamiBuf = [];
    var clickCount = 0;

    function $(id) { return document.getElementById(id); }

    function buildOverlay() {
        if ($('ut-overlay')) return;
        var wrap = document.createElement('div');
        wrap.id = 'ut-overlay';
        wrap.className = 'ut-overlay';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Secret battle');
        wrap.innerHTML =
            '<aside class="ut-help ut-help-left" aria-label="Battle controls">' +
                '<div class="ut-help-block">' +
                    '<div class="ut-help-label">Move</div>' +
                    '<div class="ut-help-keys">↑ ↓ ← →</div>' +
                    '<div class="ut-help-keys">W A S D</div>' +
                '</div>' +
                '<div class="ut-help-block">' +
                    '<div class="ut-help-label">Confirm</div>' +
                    '<div class="ut-help-keys">Z / Enter</div>' +
                '</div>' +
                '<div class="ut-help-block ut-help-dodge">' +
                    '<div class="ut-help-label">Dodge</div>' +
                    '<div class="ut-help-keys">Drag the heart</div>' +
                    '<div class="ut-help-keys">or use the pad</div>' +
                '</div>' +
            '</aside>' +
            '<div class="ut-stage">' +
                '<div class="ut-topbar">' +
                    '<span>SECRET ENCOUNTER</span>' +
                    '<button type="button" id="ut-mute">MUTE</button>' +
                '</div>' +
                '<div class="ut-enemy" id="ut-enemy">' +
                    '<img src="images/secret/missing-page.svg" alt="404">' +
                    '<div class="ut-boss-hp" id="ut-boss-hp">404<div class="ut-bar"><span id="ut-boss-fill"></span></div></div>' +
                '</div>' +
                '<div class="ut-box" id="ut-box">' +
                    '<div class="ut-dialogue" id="ut-dialogue"></div>' +
                    '<div class="ut-canvas-wrap" id="ut-canvas-wrap"><canvas id="ut-canvas" width="220" height="150"></canvas></div>' +
                '</div>' +
                '<div class="ut-actions" id="ut-actions"></div>' +
                '<div class="ut-submenu" id="ut-submenu"></div>' +
                '<div class="ut-endrow" id="ut-endrow"></div>' +
                '<div class="ut-hud" id="ut-hud"></div>' +
                '<div class="ut-dpad" id="ut-dpad" aria-hidden="true">' +
                    '<button type="button" data-dir="up">▲</button>' +
                    '<button type="button" data-dir="left">◀</button>' +
                    '<button type="button" data-dir="right">▶</button>' +
                    '<button type="button" data-dir="down">▼</button>' +
                '</div>' +
            '</div>' +
            '<aside class="ut-help ut-help-right" aria-label="More battle controls">' +
                '<div class="ut-help-block">' +
                    '<div class="ut-help-label">Back</div>' +
                    '<div class="ut-help-keys">X / Shift</div>' +
                '</div>' +
                '<div class="ut-help-block">' +
                    '<div class="ut-help-label">Mute</div>' +
                    '<div class="ut-help-keys">M</div>' +
                '</div>' +
                '<div class="ut-help-block">' +
                    '<div class="ut-help-label">Leave</div>' +
                    '<div class="ut-help-keys">Esc twice</div>' +
                '</div>' +
            '</aside>';
        document.body.appendChild(wrap);

        if (!$('ut-bgm')) {
            var audioEl = document.createElement('audio');
            audioEl.id = 'ut-bgm';
            audioEl.setAttribute('loop', '');
            audioEl.setAttribute('preload', 'auto');
            audioEl.setAttribute('playsinline', '');
            audioEl.src = BGM_SRC;
            audioEl.style.position = 'absolute';
            audioEl.style.width = '0';
            audioEl.style.height = '0';
            audioEl.style.opacity = '0';
            audioEl.style.pointerEvents = 'none';
            document.body.appendChild(audioEl);
        }

        el.overlay = wrap;
        el.enemy = $('ut-enemy');
        el.bossHp = $('ut-boss-hp');
        el.bossFill = $('ut-boss-fill');
        el.dialogue = $('ut-dialogue');
        el.canvasWrap = $('ut-canvas-wrap');
        el.canvas = $('ut-canvas');
        el.ctx = el.canvas.getContext('2d');
        el.actions = $('ut-actions');
        el.submenu = $('ut-submenu');
        el.endrow = $('ut-endrow');
        el.hud = $('ut-hud');
        el.mute = $('ut-mute');
        el.dpad = $('ut-dpad');
        el.bgm = $('ut-bgm');
        bgm = el.bgm;
        if (bgm) {
            bgm.loop = true;
            bgm.volume = 0.65;
        }
    }

    function ensureAudio() {
        if (audio) {
            if (audio.state === 'suspended') audio.resume();
            return;
        }
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audio = new Ctx();
    }

    function beep(freq, dur, type, vol) {
        if (muted || !audio) return;
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.value = vol || 0.05;
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
        osc.stop(audio.currentTime + dur);
    }

    function sfx(kind) {
        if (kind === 'move') beep(720, 0.04, 'square', 0.03);
        else if (kind === 'ok') beep(1180, 0.07, 'square', 0.04);
        else if (kind === 'hit') beep(180, 0.1, 'square', 0.08);
        else if (kind === 'heal') beep(520, 0.08, 'triangle', 0.05);
        else if (kind === 'shield') beep(980, 0.1, 'triangle', 0.05);
        else if (kind === 'shieldBreak') {
            beep(640, 0.06, 'square', 0.05);
            setTimeout(function () { beep(420, 0.1, 'triangle', 0.04); }, 70);
        }
        else if (kind === 'spare') {
            beep(392, 0.12, 'triangle', 0.05);
            setTimeout(function () { beep(523, 0.14, 'triangle', 0.05); }, 120);
            setTimeout(function () { beep(659, 0.2, 'triangle', 0.05); }, 240);
        }
    }

    function stopBgmNode() {
        if (bgmSource) {
            try { bgmSource.stop(0); } catch (e) {}
            try { bgmSource.disconnect(); } catch (e) {}
            bgmSource = null;
        }
        if (bgmGain) {
            try { bgmGain.disconnect(); } catch (e) {}
            bgmGain = null;
        }
    }

    function startBgmNode(buffer) {
        if (!audio || !buffer || muted || !running) return;
        stopBgmNode();
        bgmGain = audio.createGain();
        bgmGain.gain.value = 0.65;
        bgmSource = audio.createBufferSource();
        bgmSource.buffer = buffer;
        bgmSource.loop = true;
        bgmSource.connect(bgmGain);
        bgmGain.connect(audio.destination);
        bgmSource.start(0);
    }

    function startBgm() {
        if (muted || !running) return;
        if (!bgm) bgm = el.bgm || $('ut-bgm');
        if (bgm) {
            bgm.loop = true;
            bgm.volume = 0.65;
            bgm.muted = false;
            try { bgm.currentTime = 0; } catch (e) {}
            var play = bgm.play();
            if (play && play.catch) {
                play.catch(function () {
                    playBgmFromContext();
                });
            }
        } else {
            playBgmFromContext();
        }
    }

    function playBgmFromContext() {
        ensureAudio();
        if (!audio || muted || !running) return;
        var resume = audio.state === 'suspended' ? audio.resume() : Promise.resolve();
        Promise.resolve(resume).then(function () {
            return fetch(BGM_SRC);
        }).then(function (res) {
            if (!res.ok) throw new Error('bgm missing');
            return res.arrayBuffer();
        }).then(function (raw) {
            return audio.decodeAudioData(raw.slice(0));
        }).then(function (buffer) {
            startBgmNode(buffer);
        }).catch(function () {});
    }

    function stopBgm() {
        stopBgmNode();
        if (bgm) {
            bgm.pause();
            try { bgm.currentTime = 0; } catch (e) {}
        }
    }

    function setMuted(next) {
        muted = next;
        if (el.mute) el.mute.textContent = muted ? 'UNMUTE' : 'MUTE';
        if (bgm) bgm.muted = muted;
        if (bgmGain) bgmGain.gain.value = muted ? 0 : 0.65;
        if (muted) {
            if (bgm) bgm.pause();
            stopBgmNode();
        } else if (running) {
            startBgm();
        }
    }

    function resetFight() {
        playerHp = PLAYER_MAX;
        bossHp = BOSS_MAX;
        turn = 0;
        fightCount = 0;
        flags = { check: false, talk: false, compliment: false };
        inventory = ITEMS.map(function (item) {
            return { id: item.id, label: item.label, heal: item.heal, shield: item.shield, text: item.text };
        });
        shieldCharges = 0;
        spareable = false;
        sawCheck = false;
        actionIndex = 0;
        bullets = [];
        spawners = [];
        iframes = 0;
        pointerAim = null;
        keys = { up: false, down: false, left: false, right: false };
        afterDialogue = null;
        if (el.enemy) el.enemy.className = 'ut-enemy';
        if (el.bossHp) el.bossHp.classList.remove('is-visible');
    }

    function setState(next) {
        state = next;
        if (next === 'spareWin' || next === 'killWin' || next === 'gameOver') endIndex = 0;
        var board = next === 'enemyAttack' || next === 'fightAim';
        el.overlay.classList.toggle('ut-board-mode', board);
        el.overlay.classList.toggle('ut-attacking', next === 'enemyAttack');
        renderChrome();
    }

    function say(text, then) {
        typeFull = text;
        typeShown = '';
        typeAcc = 0;
        typeDone = false;
        afterDialogue = then || null;
        el.dialogue.textContent = '';
    }

    function skipOrAdvanceType() {
        if (!typeDone) {
            typeShown = typeFull;
            typeDone = true;
            el.dialogue.textContent = typeShown;
            return false;
        }
        if (afterDialogue) {
            var fn = afterDialogue;
            afterDialogue = null;
            fn();
            return true;
        }
        return false;
    }

    function updateType(dt) {
        if (typeDone) return;
        typeAcc += dt * 1000;
        while (typeAcc >= TYPE_MS && typeShown.length < typeFull.length) {
            typeAcc -= TYPE_MS;
            typeShown = typeFull.slice(0, typeShown.length + 1);
        }
        el.dialogue.textContent = typeShown;
        if (typeShown.length >= typeFull.length) typeDone = true;
    }

    function renderChrome() {
        var showActions = state === 'playerMenu';
        var showSub = state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu';
        var showEnd = state === 'spareWin' || state === 'killWin' || state === 'gameOver';

        el.actions.style.display = showActions ? 'grid' : 'none';
        el.submenu.classList.toggle('is-open', showSub);
        el.endrow.classList.toggle('is-open', showEnd);

        if (showActions) renderActions();
        if (showSub) renderSubmenu();
        if (showEnd) renderEnd();

        el.hud.innerHTML = 'LV 1&nbsp;&nbsp;HP&nbsp;<span class="ut-hp-track"><span style="width:' +
            Math.max(0, (playerHp / PLAYER_MAX) * 100) + '%"></span></span>&nbsp;' + playerHp + ' / ' + PLAYER_MAX +
            (shieldCharges > 0 ? '&nbsp;&nbsp;<span class="ut-shield">SHIELD x' + shieldCharges + '</span>' : '');

        el.bossFill.style.width = Math.max(0, (bossHp / BOSS_MAX) * 100) + '%';
        el.bossHp.classList.toggle('is-visible', sawCheck && !showEnd);
    }

    function renderActions() {
        el.actions.innerHTML = '';
        ACTIONS.forEach(function (name, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ut-action' + (i === actionIndex ? ' selected' : '');
            if (name === 'MERCY' && spareable) btn.classList.add('mercy-ready');
            btn.textContent = name;
            btn.addEventListener('click', function () {
                actionIndex = i;
                sfx('ok');
                chooseAction(name);
            });
            el.actions.appendChild(btn);
        });
    }

    function renderSubmenu() {
        el.submenu.innerHTML = '';
        if (!subOptions.length) {
            var empty = document.createElement('button');
            empty.type = 'button';
            empty.className = 'ut-subitem selected';
            empty.textContent = '* Nothing here.';
            empty.addEventListener('click', backToMenu);
            el.submenu.appendChild(empty);
            return;
        }
        subOptions.forEach(function (opt, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ut-subitem' + (i === subIndex ? ' selected' : '');
            if (opt.id === 'spare' && spareable) btn.classList.add('spareable');
            btn.textContent = (i === subIndex ? '* ' : '  ') + opt.label +
                (opt.heal ? '  (' + opt.heal + ' HP)' : '') +
                (opt.shield ? '  (block 1 hit)' : '');
            btn.addEventListener('click', function () {
                subIndex = i;
                sfx('ok');
                chooseSub(opt);
            });
            el.submenu.appendChild(btn);
        });
    }

    function endButtons() {
        return state === 'gameOver'
            ? [{ id: 'retry', label: 'RETRY' }, { id: 'exit', label: 'EXIT' }]
            : [{ id: 'exit', label: 'EXIT' }];
    }

    function renderEnd() {
        el.endrow.innerHTML = '';
        var buttons = endButtons();
        if (endIndex >= buttons.length) endIndex = 0;
        buttons.forEach(function (b, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ut-endbtn' + (i === endIndex ? ' selected' : '');
            btn.textContent = b.label;
            btn.addEventListener('click', function () {
                if (b.id === 'retry') retry();
                else closeBattle();
            });
            el.endrow.appendChild(btn);
        });
    }

    function openSub(kind, options) {
        subKind = kind;
        subOptions = options;
        subIndex = 0;
        if (kind === 'act') setState('actMenu');
        else if (kind === 'item') setState('itemMenu');
        else setState('mercyMenu');
        say('* What will you do?');
        renderChrome();
    }

    function backToMenu() {
        sfx('move');
        setState('playerMenu');
        say(menuFlavor());
    }

    function menuFlavor() {
        if (spareable) return FLAVOR.menuReady;
        if (sawCheck) return FLAVOR.afterCheck;
        return FLAVOR.menu;
    }

    function chooseAction(name) {
        if (name === 'FIGHT') startFightAim();
        else if (name === 'ACT') openSub('act', ACTS);
        else if (name === 'ITEM') {
            if (!inventory.length) {
                setState('dialogue');
                say(FLAVOR.noItems, startEnemyAttack);
            } else openSub('item', inventory.slice());
        }
        else openSub('mercy', MERCY);
    }

    function chooseSub(opt) {
        if (subKind === 'act') doAct(opt);
        else if (subKind === 'item') doItem(opt);
        else doMercy(opt);
    }

    function refreshSpareable() {
        spareable = flags.check && flags.talk && flags.compliment;
    }

    function doAct(act) {
        if (act.id === 'check') {
            flags.check = true;
            sawCheck = true;
        } else if (act.id === 'talk') {
            flags.talk = true;
        } else if (act.id === 'compliment') {
            flags.compliment = true;
        }
        refreshSpareable();
        setState('dialogue');
        renderChrome();
        say(act.text + (spareable && act.id !== 'joke' ? '\n* 404 looks spareable.' : ''), startEnemyAttack);
    }

    function doItem(item) {
        if (!item) {
            setState('dialogue');
            say(FLAVOR.noItems, startEnemyAttack);
            return;
        }
        inventory = inventory.filter(function (it) { return it.id !== item.id; });
        var extra = '';
        if (item.shield) {
            shieldCharges += item.shield;
            sfx('shield');
            extra = '\n* Shield ready. Blocks ' + shieldCharges + ' hit' + (shieldCharges === 1 ? '' : 's') + '.';
        } else {
            playerHp = Math.min(PLAYER_MAX, playerHp + (item.heal || 0));
            sfx('heal');
            extra = '\n* HP ' + playerHp + '/' + PLAYER_MAX + '.';
        }
        setState('dialogue');
        renderChrome();
        say(item.text + extra, startEnemyAttack);
    }

    function doMercy(opt) {
        if (opt.id === 'flee') {
            setState('dialogue');
            say(FLAVOR.flee, startEnemyAttack);
            return;
        }
        if (spareable) {
            winSpare();
            return;
        }
        setState('dialogue');
        say(FLAVOR.spareFail, startEnemyAttack);
    }

    function sizeCanvas(w, h) {
        boardW = w;
        boardH = h;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        el.canvas.width = Math.round(w * dpr);
        el.canvas.height = Math.round(h * dpr);
        el.canvas.style.width = w + 'px';
        el.canvas.style.height = h + 'px';
        el.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function startFightAim() {
        fightCount += 1;
        aimX = 8;
        aimDir = 1;
        aimLocked = false;
        aimFlash = 0;
        lastDamage = 0;
        setState('fightAim');
        var aimW = Math.min(560, el.canvasWrap.clientWidth || 320);
        if (aimW < 160) aimW = 320;
        sizeCanvas(aimW, 120);
        draw();
    }

    function resolveAim() {
        if (aimLocked) return;
        aimLocked = true;
        var center = boardW / 2;
        var dist = Math.abs(aimX - center) / (boardW / 2);
        var dmg = 0;
        var label = FLAVOR.miss;
        if (dist < 0.08) { dmg = 28; label = '* PERFECT\n* ' + dmg; }
        else if (dist < 0.22) { dmg = 20; label = '* ' + dmg; }
        else if (dist < 0.45) { dmg = 12; label = '* ' + dmg; }
        lastDamage = dmg;
        bossHp = Math.max(0, bossHp - dmg);
        if (dmg) {
            sfx('hit');
            el.enemy.classList.add('is-hurt');
            setTimeout(function () { el.enemy.classList.remove('is-hurt'); }, 360);
        }
        renderChrome();
        setTimeout(function () {
            if (!running || state !== 'fightAim') return;
            if (bossHp <= 0) winKill();
            else {
                setState('dialogue');
                say(label, startEnemyAttack);
            }
        }, 420);
    }

    function pickWave() {
        if (spareable) return WAVES[1];
        if (bossHp < 40 || fightCount >= 3 || turn >= 4) return WAVES[3];
        if (turn >= 3 || (flags.talk && flags.check)) return WAVES[2];
        if (turn >= 2) return WAVES[1];
        return WAVES[0];
    }

    function startEnemyAttack() {
        turn += 1;
        var wave = pickWave();
        bullets = [];
        spawners = wave.spawners.map(function (s) {
            return { type: s.type, period: s.period, speed: s.speed, acc: s.period * 0.35 };
        });
        waveTime = 0;
        waveDur = wave.durationMs / 1000;
        sizeCanvas(wave.board.w, wave.board.h);
        soul.x = boardW / 2;
        soul.y = boardH / 2;
        iframes = 0;
        pointerAim = null;
        setState('enemyAttack');
    }

    function spawn(kind, speed) {
        if (kind === 'rain') {
            bullets.push({
                type: 'link',
                x: 12 + Math.random() * (boardW - 24),
                y: -10,
                vx: (Math.random() - 0.5) * 24,
                vy: speed,
                w: 18,
                h: 5
            });
        } else if (kind === 'sideSweep') {
            var fromLeft = Math.random() < 0.5;
            bullets.push({
                type: 'arrow',
                x: fromLeft ? -14 : boardW + 14,
                y: 18 + Math.random() * (boardH - 36),
                vx: fromLeft ? speed : -speed,
                vy: 0,
                w: 16,
                h: 8,
                dir: fromLeft ? 1 : -1
            });
        } else if (kind === 'ring') {
            bullets.push({
                type: 'ring',
                x: boardW / 2,
                y: boardH / 2,
                r: 6,
                vr: speed / 10,
                thickness: 4
            });
        } else if (kind === 'chase') {
            bullets.push({
                type: 'orb',
                x: Math.random() < 0.5 ? 8 : boardW - 8,
                y: Math.random() * boardH,
                vx: 0,
                vy: 0,
                r: 6,
                homing: 1.5,
                speed: speed
            });
        }
    }

    function circleRect(cx, cy, cr, x, y, w, h) {
        var nx = Math.max(x, Math.min(cx, x + w));
        var ny = Math.max(y, Math.min(cy, y + h));
        var dx = cx - nx;
        var dy = cy - ny;
        return dx * dx + dy * dy < cr * cr;
    }

    function hitSoul() {
        if (iframes > 0) return;
        iframes = IFRAMES;
        if (shieldCharges > 0) {
            shieldCharges -= 1;
            sfx('shieldBreak');
            renderChrome();
            return;
        }
        playerHp = Math.max(0, playerHp - 4);
        sfx('hit');
        renderChrome();
        if (playerHp <= 0) lose();
    }

    function updateAttack(dt) {
        waveTime += dt;
        iframes = Math.max(0, iframes - dt);

        var dx = 0;
        var dy = 0;
        if (keys.left) dx -= 1;
        if (keys.right) dx += 1;
        if (keys.up) dy -= 1;
        if (keys.down) dy += 1;
        if (dx || dy) {
            var len = Math.hypot(dx, dy) || 1;
            soul.x += (dx / len) * SOUL_SPEED * dt;
            soul.y += (dy / len) * SOUL_SPEED * dt;
        }
        if (pointerAim) {
            var px = pointerAim.x - soul.x;
            var py = pointerAim.y - soul.y;
            var dist = Math.hypot(px, py);
            if (dist > 2) {
                var step = Math.min(dist, SOUL_SPEED * 1.15 * dt);
                soul.x += (px / dist) * step;
                soul.y += (py / dist) * step;
            }
        }
        soul.x = Math.max(SOUL_R + 2, Math.min(boardW - SOUL_R - 2, soul.x));
        soul.y = Math.max(SOUL_R + 2, Math.min(boardH - SOUL_R - 2, soul.y));

        spawners.forEach(function (s) {
            s.acc += dt * 1000;
            while (s.acc >= s.period) {
                s.acc -= s.period;
                spawn(s.type, s.speed);
            }
        });

        var next = [];
        for (var i = 0; i < bullets.length; i++) {
            var b = bullets[i];
            if (b.type === 'orb' && b.homing > 0) {
                var hx = soul.x - b.x;
                var hy = soul.y - b.y;
                var hl = Math.hypot(hx, hy) || 1;
                b.vx = (hx / hl) * b.speed;
                b.vy = (hy / hl) * b.speed;
                b.homing -= dt;
            }
            if (b.type === 'ring') b.r += b.vr * dt * 60;
            else {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
            }

            var hit = false;
            if (b.type === 'link' || b.type === 'arrow') {
                hit = circleRect(soul.x, soul.y, SOUL_R, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
            } else if (b.type === 'ring') {
                var rd = Math.abs(Math.hypot(soul.x - b.x, soul.y - b.y) - b.r);
                hit = rd < b.thickness / 2 + SOUL_R;
            } else if (b.type === 'orb') {
                hit = Math.hypot(soul.x - b.x, soul.y - b.y) < SOUL_R + b.r;
            }
            if (hit) hitSoul();

            var alive = true;
            if (b.type === 'ring') alive = b.r < Math.max(boardW, boardH);
            else alive = b.x > -40 && b.x < boardW + 40 && b.y > -40 && b.y < boardH + 40;
            if (alive) next.push(b);
        }
        bullets = next;

        if (waveTime >= waveDur) {
            bullets = [];
            setState('playerMenu');
            say(menuFlavor());
        }
    }

    function updateAim(dt) {
        if (aimLocked) {
            aimFlash += dt;
            return;
        }
        aimX += aimDir * 220 * dt;
        if (aimX > boardW - 8) { aimX = boardW - 8; aimDir = -1; }
        if (aimX < 8) { aimX = 8; aimDir = 1; }
    }

    function drawHeart(ctx, x, y, flash) {
        var s = 2;
        ctx.save();
        ctx.translate(Math.round(x - 7), Math.round(y - 7));
        ctx.fillStyle = flash ? '#fff' : '#ff2448';
        for (var r = 0; r < HEART.length; r++) {
            for (var c = 0; c < HEART[r].length; c++) {
                if (HEART[r].charAt(c) === '1') ctx.fillRect(c * s, r * s, s, s);
            }
        }
        ctx.restore();
    }

    function draw() {
        var ctx = el.ctx;
        ctx.clearRect(0, 0, boardW, boardH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, boardW - 3, boardH - 3);

        if (state === 'fightAim') {
            var grd = ctx.createLinearGradient(0, 0, boardW, 0);
            grd.addColorStop(0, '#5a0000');
            grd.addColorStop(0.5, '#ffe44a');
            grd.addColorStop(1, '#5a0000');
            ctx.fillStyle = grd;
            ctx.fillRect(10, boardH / 2 - 10, boardW - 20, 20);
            ctx.fillStyle = aimLocked && (aimFlash % 0.16 < 0.08) ? '#fff' : '#fff';
            ctx.fillRect(aimX - 2, boardH / 2 - 18, 4, 36);
            ctx.fillStyle = '#fff';
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('STOP', boardW / 2, 28);
            return;
        }

        bullets.forEach(function (b) {
            if (b.type === 'link') {
                ctx.fillStyle = '#9c5451';
                ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
            } else if (b.type === 'arrow') {
                ctx.fillStyle = '#c9a87c';
                ctx.beginPath();
                ctx.moveTo(b.x + 8 * b.dir, b.y);
                ctx.lineTo(b.x - 8 * b.dir, b.y - 5);
                ctx.lineTo(b.x - 8 * b.dir, b.y + 5);
                ctx.closePath();
                ctx.fill();
            } else if (b.type === 'ring') {
                ctx.strokeStyle = '#f2f2f2';
                ctx.lineWidth = b.thickness;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (b.type === 'orb') {
                ctx.fillStyle = '#9c5451';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffe44a';
                ctx.beginPath();
                ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        var flash = iframes > 0 && Math.floor(iframes * 12) % 2 === 0;
        if (shieldCharges > 0) {
            ctx.save();
            ctx.strokeStyle = flash ? '#fff' : '#7ecbff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(soul.x, soul.y, SOUL_R + 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        drawHeart(ctx, soul.x, soul.y, flash);
    }

    function loop(ts) {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        if (!lastTs) lastTs = ts;
        var dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        updateType(dt);
        if (state === 'enemyAttack') updateAttack(dt);
        else if (state === 'fightAim') updateAim(dt);
        if (state === 'enemyAttack' || state === 'fightAim') draw();
    }

    function winSpare() {
        sfx('spare');
        stopBgm();
        el.enemy.classList.add('is-spared');
        setState('spareWin');
        say(FLAVOR.spareWin);
    }

    function winKill() {
        stopBgm();
        el.enemy.classList.add('is-gone');
        setState('killWin');
        say(FLAVOR.killWin);
    }

    function lose() {
        stopBgm();
        setState('gameOver');
        say(FLAVOR.gameOver);
    }

    function retry() {
        sfx('ok');
        resetFight();
        ensureAudio();
        startBgm();
        setState('intro');
        say(FLAVOR.intro, function () {
            setState('playerMenu');
            say(menuFlavor());
        });
    }

    function openBattle() {
        if (running) return;
        buildOverlay();
        resetFight();
        running = true;
        lastTs = 0;
        document.body.classList.add('ut-locked');
        el.overlay.classList.add('is-open');
        ensureAudio();
        startBgm();
        setState('intro');
        say(FLAVOR.intro, function () {
            setState('playerMenu');
            say(menuFlavor());
        });
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    function closeBattle() {
        running = false;
        cancelAnimationFrame(raf);
        stopBgm();
        keys = { up: false, down: false, left: false, right: false };
        pointerAim = null;
        document.body.classList.remove('ut-locked');
        if (el.overlay) {
            el.overlay.classList.remove('is-open', 'ut-board-mode', 'ut-attacking');
        }
        escArmed = false;
        state = 'idle';
    }

    function moveMenu(dir) {
        sfx('move');
        if (state === 'playerMenu') {
            actionIndex = (actionIndex + dir + ACTIONS.length) % ACTIONS.length;
            renderActions();
        } else if (state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu') {
            var n = Math.max(1, subOptions.length);
            subIndex = (subIndex + dir + n) % n;
            renderSubmenu();
        } else if (state === 'gameOver' || state === 'spareWin' || state === 'killWin') {
            var ends = endButtons();
            endIndex = (endIndex + dir + ends.length) % ends.length;
            renderEnd();
        }
    }

    function confirm() {
        if (state === 'intro' || state === 'dialogue' || state === 'spareWin' || state === 'killWin' || state === 'gameOver') {
            if (state === 'spareWin' || state === 'killWin' || state === 'gameOver') {
                if (!typeDone) { skipOrAdvanceType(); return; }
                var pick = endButtons()[endIndex] || { id: 'exit' };
                if (pick.id === 'retry') retry();
                else closeBattle();
                return;
            }
            skipOrAdvanceType();
            return;
        }
        if (state === 'fightAim') {
            resolveAim();
            return;
        }
        sfx('ok');
        if (state === 'playerMenu') chooseAction(ACTIONS[actionIndex]);
        else if (state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu') {
            if (!subOptions.length) backToMenu();
            else chooseSub(subOptions[subIndex]);
        }
    }

    function cancel() {
        if (state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu') backToMenu();
    }

    function bindKey(code, down) {
        if (code === 'ArrowUp' || code === 'KeyW') keys.up = down;
        if (code === 'ArrowDown' || code === 'KeyS') keys.down = down;
        if (code === 'ArrowLeft' || code === 'KeyA') keys.left = down;
        if (code === 'ArrowRight' || code === 'KeyD') keys.right = down;
    }

    function onKey(e) {
        if (!running) return;
        var code = e.code;
        var gameKey = /Arrow|KeyW|KeyA|KeyS|KeyD|KeyZ|KeyX|KeyM|Enter|Shift|Backspace|Escape|Space/.test(code);
        if (gameKey) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (e.repeat && (code === 'KeyZ' || code === 'Enter' || code === 'Space' || code === 'Escape')) return;

        if (e.type === 'keydown') {
            bindKey(code, true);
            if (state === 'playerMenu' || state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu' ||
                state === 'gameOver' || state === 'spareWin' || state === 'killWin') {
                if (code === 'ArrowLeft' || code === 'KeyA') moveMenu(-1);
                else if (code === 'ArrowRight' || code === 'KeyD') moveMenu(1);
                else if (code === 'ArrowUp' || code === 'KeyW') moveMenu(-1);
                else if (code === 'ArrowDown' || code === 'KeyS') moveMenu(1);
            }
            if (code === 'KeyZ' || code === 'Enter' || code === 'Space') confirm();
            else if (code === 'KeyX' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Backspace') cancel();
            else if (code === 'KeyM') setMuted(!muted);
            else if (code === 'Escape') {
                if (state === 'actMenu' || state === 'itemMenu' || state === 'mercyMenu') cancel();
                else if (state === 'playerMenu' || state === 'intro' || state === 'dialogue') {
                    if (escArmed) closeBattle();
                    else {
                        setState('dialogue');
                        escArmed = true;
                        say('* You cannot run from a missing page.\n* (Press ESC again to leave.)', function () {
                            escArmed = false;
                            setState('playerMenu');
                            say(menuFlavor());
                        });
                    }
                }
            }
        } else {
            bindKey(code, false);
        }
    }

    function canvasPoint(e) {
        var rect = el.canvas.getBoundingClientRect();
        var src = e.touches && e.touches[0] ? e.touches[0] : e;
        return {
            x: ((src.clientX - rect.left) / rect.width) * boardW,
            y: ((src.clientY - rect.top) / rect.height) * boardH
        };
    }

    function onCanvasPointer(e) {
        if (!running || state !== 'enemyAttack') return;
        e.preventDefault();
        pointerAim = canvasPoint(e);
    }

    function bindOverlay() {
        el.mute.addEventListener('click', function () { setMuted(!muted); });
        el.canvas.addEventListener('pointerdown', function (e) {
            if (state === 'fightAim') { resolveAim(); return; }
            onCanvasPointer(e);
            el.canvas.setPointerCapture(e.pointerId);
        });
        el.canvas.addEventListener('pointermove', function (e) {
            if (e.buttons || e.pointerType === 'touch') onCanvasPointer(e);
        });
        el.canvas.addEventListener('pointerup', function () { pointerAim = null; });
        el.canvas.addEventListener('pointercancel', function () { pointerAim = null; });

        Array.prototype.forEach.call(el.dpad.querySelectorAll('button'), function (btn) {
            var dir = btn.getAttribute('data-dir');
            function press(ev) {
                ev.preventDefault();
                keys[dir] = true;
            }
            function release(ev) {
                ev.preventDefault();
                keys[dir] = false;
            }
            btn.addEventListener('pointerdown', press);
            btn.addEventListener('pointerup', release);
            btn.addEventListener('pointerleave', release);
            btn.addEventListener('pointercancel', release);
        });
    }

    function wiggle(node) {
        node.classList.remove('ut-wiggle');
        void node.offsetWidth;
        node.classList.add('ut-wiggle');
    }

    function bindTriggers() {
        var img = $('ut-secret-trigger') || document.querySelector('.error-page img');
        var heading = $('ut-secret-heading') || document.querySelector('.error-page h3');
        var hotspots = [img, heading].filter(Boolean);

        function onSecretClick(e) {
            e.preventDefault();
            clickCount += 1;
            if (img) wiggle(img);
            if (clickCount >= 5) {
                clickCount = 0;
                openBattle();
            }
        }

        hotspots.forEach(function (node) {
            node.classList.add('ut-hotspot');
            node.addEventListener('click', onSecretClick);
        });

        var form = $('ut-secret-search') || document.querySelector('.error-form form');
        if (form) {
            form.addEventListener('submit', function (e) {
                var input = form.querySelector('input[type="search"], input[type="text"]');
                var q = input ? String(input.value).trim().toLowerCase() : '';
                if (SEARCH_KEYS.indexOf(q) !== -1) {
                    e.preventDefault();
                    openBattle();
                }
            });
        }

        document.addEventListener('keydown', function (e) {
            if (running) return;
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            konamiBuf.push(e.code);
            if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
            var ok = KONAMI.every(function (k, i) { return konamiBuf[i] === k; });
            if (ok) {
                konamiBuf = [];
                openBattle();
            }
        });
    }

    function init() {
        if (!document.querySelector('.error-page')) return;
        buildOverlay();
        bindOverlay();
        bindTriggers();
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('keyup', onKey, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
