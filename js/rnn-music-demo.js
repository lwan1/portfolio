/**
 * RNN Music Generation — Interactive Demo
 *
 * A lightweight, browser-side character-level model that mirrors the notebook's
 * pipeline: it learns next-character statistics from real Irish ABC tunes, then
 * samples one character at a time (at a chosen temperature) to compose a new
 * tune. The generated melody is synthesized with the Web Audio API.
 *
 * The full project trains a PyTorch LSTM (Embedding -> LSTM(1024) -> Linear);
 * here we approximate that next-character distribution with a variable-order
 * Markov model so the same intuition runs instantly and offline.
 */
(function () {
    'use strict';

    // A small set of real traditional Irish tunes in ABC notation (training corpus).
    var CORPUS = [
        "X:1\nT:The Kesh Jig\nM:6/8\nK:G\nGFG BAB|gfg gab|GFG BAB|d2A AFD|\nGFG BAB|gfg gab|age edB|1 dBA AGF:|2 dBA AGA||\nBgg fgg|age edB|BAB dBd|efg gab|\n",
        "X:2\nT:Morrison's Jig\nM:6/8\nK:Edor\nE2B B2A B2c d2A|E2B B2A B3 BAG|\nE2B B2A B2c d2e|edc d2A B3 BAG|\n",
        "X:3\nT:Drowsy Maggie\nM:4/4\nK:Edor\nE2BE dEBE|E2BE AFDF|E2BE dEBE|BABc dAFD|\nE2BE dEBE|E2BE AFDF|EFGA Bcde|fdec dAFD|\n",
        "X:4\nT:Cooley's Reel\nM:4/4\nK:Edor\nEBBA B2EB|B2AB dBAG|FDAD BDAD|FDAD dAFD|\nEBBA B2EB|B2AB defg|afge fdec|BABc dABA|\n",
        "X:5\nT:The Butterfly\nM:9/8\nK:Em\nB2A G2F E2B|B2A G2F E3|B2A G2F E2F|G2A B2c d3|\nB2A G2F E2B|B2A G2F E3|d2B d2e f2e|d2B A2F E3|\n",
        "X:6\nT:Banish Misfortune\nM:6/8\nK:D\nfed cAG|A2d cAG|F2D DED|FEF GFG|\nAdd cAG|A2d cAG|F2D DED|1 FED E2G:|2 FED EFG||\n",
        "X:7\nT:Out on the Ocean\nM:6/8\nK:G\nded cBA|G2G GAB|ded cBA|dge dBG|\nded cBA|G2G GAB|cBc ABc|1 dge dBA:|2 dge dgg||\n",
        "X:8\nT:The Maid Behind the Bar\nM:4/4\nK:D\nFAAB AFED|FAAB =cBcd|eaab ageg|fdec dABc|\ndffe dBAF|GFGA BGBd|cAAG AdcA|1 GFGE FDDC:|\n"
    ];

    var charModel = null;
    var charFreq = null;
    var generatedText = '';
    var charts = {};
    var audioCtx = null;
    var playTimer = null;
    var playingNodes = [];

    function $(id) { return document.getElementById(id); }

    /* ---------- Character-level model ---------- */

    function buildModel(corpus) {
        var joined = corpus.join('\n\n');
        var freq = {};
        for (var i = 0; i < joined.length; i++) {
            var ch = joined[i];
            freq[ch] = (freq[ch] || 0) + 1;
        }
        // Counts for orders 1..5 -> { context: { nextChar: count } }
        var tables = {};
        for (var order = 1; order <= 5; order++) {
            tables[order] = {};
        }
        for (var k = 0; k < joined.length; k++) {
            for (var o = 1; o <= 5; o++) {
                if (k - o < 0) continue;
                var ctx = joined.substring(k - o, k);
                var nxt = joined[k];
                if (!tables[o][ctx]) tables[o][ctx] = {};
                tables[o][ctx][nxt] = (tables[o][ctx][nxt] || 0) + 1;
            }
        }
        return { tables: tables, freq: freq, text: joined };
    }

    // Sample next char given context, backing off to lower orders when unseen.
    function nextCharDistribution(model, context, order) {
        for (var o = Math.min(order, context.length); o >= 1; o--) {
            var ctx = context.substring(context.length - o);
            var row = model.tables[o][ctx];
            if (row) {
                var keys = Object.keys(row);
                if (keys.length > 0) return row;
            }
        }
        return model.freq; // unigram fallback
    }

    function applyTemperature(counts, temperature) {
        var keys = Object.keys(counts);
        var logits = keys.map(function (k) { return Math.log(counts[k] + 1e-9) / temperature; });
        var max = Math.max.apply(null, logits);
        var exps = logits.map(function (x) { return Math.exp(x - max); });
        var sum = exps.reduce(function (a, b) { return a + b; }, 0);
        var probs = {};
        keys.forEach(function (k, i) { probs[k] = exps[i] / sum; });
        return probs;
    }

    function sampleFromProbs(probs) {
        var r = Math.random();
        var cum = 0;
        var keys = Object.keys(probs);
        for (var i = 0; i < keys.length; i++) {
            cum += probs[keys[i]];
            if (r <= cum) return keys[i];
        }
        return keys[keys.length - 1];
    }

    function generate(model, order, temperature, length) {
        var out = 'X';
        for (var i = 0; i < length; i++) {
            var dist = nextCharDistribution(model, out, order);
            var probs = applyTemperature(dist, temperature);
            out += sampleFromProbs(probs);
        }
        return out;
    }

    /* ---------- ABC -> notes (for synthesis) ---------- */

    // Map ABC pitch letters to MIDI numbers (middle range). Uppercase lower octave,
    // lowercase upper octave; ' raises and , lowers an octave.
    var BASE_MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

    function abcToNotes(abc) {
        // Use the tune body only: lines after the first K: header.
        var lines = abc.split('\n');
        var body = [];
        var pastKey = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^[A-Za-z]:/.test(line)) {
                if (/^K:/.test(line)) pastKey = true;
                continue;
            }
            if (pastKey) body.push(line);
        }
        var text = body.join(' ') || abc;

        var notes = [];
        for (var j = 0; j < text.length; j++) {
            var ch = text[j];
            var letter = ch.toUpperCase();
            if (BASE_MIDI.hasOwnProperty(letter) && /[A-Ga-g]/.test(ch)) {
                var midi = BASE_MIDI[letter];
                if (ch === ch.toLowerCase()) midi += 12; // lowercase = higher octave
                // octave modifiers immediately after
                var k = j + 1;
                var dur = 1;
                while (k < text.length && (text[k] === "'" || text[k] === ',' || /[0-9]/.test(text[k]) || text[k] === '/')) {
                    if (text[k] === "'") midi += 12;
                    else if (text[k] === ',') midi -= 12;
                    else if (/[0-9]/.test(text[k])) dur = parseInt(text[k], 10);
                    else if (text[k] === '/') dur = 0.5;
                    k++;
                }
                notes.push({ midi: midi, dur: dur });
                if (notes.length >= 64) break;
            }
        }
        return notes;
    }

    function midiToFreq(m) {
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    /* ---------- Audio playback ---------- */

    function ensureAudio() {
        if (!audioCtx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function stopPlayback() {
        if (playTimer) { clearTimeout(playTimer); playTimer = null; }
        playingNodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
        playingNodes = [];
        var roll = $('music-roll');
        if (roll) {
            var active = roll.querySelectorAll('.music-note.active');
            active.forEach(function (el) { el.classList.remove('active'); });
        }
    }

    function playNotes(notes) {
        stopPlayback();
        if (!notes.length) {
            setStatus('No playable notes found — try Generate again.', 'info');
            return;
        }
        var ctx = ensureAudio();
        var bpm = parseInt($('music-bpm').value, 10);
        var beat = 60 / bpm; // seconds per eighth-note unit
        var t = ctx.currentTime + 0.05;
        var rollCells = $('music-roll').querySelectorAll('.music-note');

        notes.forEach(function (note, idx) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = midiToFreq(note.midi);
            var len = beat * note.dur;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.95);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + len);
            playingNodes.push(osc);

            var delayMs = (t - ctx.currentTime) * 1000;
            (function (cell) {
                setTimeout(function () {
                    if (!cell) return;
                    rollCells.forEach(function (c) { c.classList.remove('active'); });
                    cell.classList.add('active');
                }, delayMs);
            })(rollCells[idx]);

            t += len;
        });

        var totalMs = (t - ctx.currentTime) * 1000;
        setStatus('Playing ' + notes.length + ' notes…', 'training');
        playTimer = setTimeout(function () {
            stopPlayback();
            setStatus('Playback finished. Adjust controls and generate again.', 'success');
        }, totalMs + 100);
    }

    /* ---------- Rendering ---------- */

    function renderPianoRoll(notes) {
        var roll = $('music-roll');
        if (!roll) return;
        roll.innerHTML = '';
        if (!notes.length) {
            roll.innerHTML = '<p style="color:#666; font-size:13px; padding:20px; text-align:center;">No notes parsed.</p>';
            return;
        }
        var mids = notes.map(function (n) { return n.midi; });
        var lo = Math.min.apply(null, mids);
        var hi = Math.max.apply(null, mids);
        var range = Math.max(1, hi - lo);
        notes.forEach(function (n) {
            var bar = document.createElement('div');
            bar.className = 'music-note';
            var h = 15 + ((n.midi - lo) / range) * 80;
            bar.style.height = h + '%';
            bar.title = 'MIDI ' + n.midi;
            roll.appendChild(bar);
        });
    }

    function renderFreqChart(model) {
        if (typeof Chart === 'undefined') return;
        var entries = Object.keys(model.freq).map(function (k) {
            return { ch: k, n: model.freq[k] };
        }).filter(function (e) {
            return e.ch !== '\n' && e.ch !== ' ';
        }).sort(function (a, b) { return b.n - a.n; }).slice(0, 14);

        var ctx = $('music-chart-freq');
        if (!ctx) return;
        charts.freq = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: entries.map(function (e) { return e.ch; }),
                datasets: [{
                    label: 'Count in corpus',
                    data: entries.map(function (e) { return e.n; }),
                    backgroundColor: 'rgba(156, 84, 81, 0.65)',
                    borderColor: '#9c5451',
                    borderWidth: 1
                }]
            },
            options: chartOpts()
        });
    }

    function renderNextChart(model) {
        if (typeof Chart === 'undefined') return;
        // Context derived from a representative tune body start.
        var context = generatedText ? generatedText.substring(Math.max(0, generatedText.length - 3)) : 'GFG';
        var order = parseInt($('music-order').value, 10);
        var temperature = parseFloat($('music-temp').value);
        var dist = nextCharDistribution(model, context, order);
        var probs = applyTemperature(dist, temperature);
        var entries = Object.keys(probs).map(function (k) {
            return { ch: k === '\n' ? '\\n' : (k === ' ' ? '␣' : k), p: probs[k] };
        }).sort(function (a, b) { return b.p - a.p; }).slice(0, 10);

        var ctx = $('music-chart-next');
        if (!ctx) return;
        if (charts.next) charts.next.destroy();
        charts.next = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: entries.map(function (e) { return e.ch; }),
                datasets: [{
                    label: 'P(next | "' + context + '")',
                    data: entries.map(function (e) { return +(e.p * 100).toFixed(1); }),
                    backgroundColor: 'rgba(201, 168, 124, 0.6)',
                    borderColor: '#c9a87c',
                    borderWidth: 1
                }]
            },
            options: chartOpts('%')
        });
    }

    function chartOpts(suffix) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#999', font: { family: 'Outfit' } } } },
            scales: {
                x: { ticks: { color: '#999', font: { family: 'Oswald' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    ticks: {
                        color: '#666',
                        callback: function (v) { return suffix === '%' ? v + '%' : v; }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        };
    }

    function setStatus(msg, type) {
        var el = $('music-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'ql-status ql-status-' + (type || 'info');
    }

    /* ---------- Controller ---------- */

    function onGenerate() {
        var order = parseInt($('music-order').value, 10);
        var temperature = parseFloat($('music-temp').value);
        generatedText = generate(charModel, order, temperature, 360);

        // Extract a clean snippet starting at the first X:
        var snippet = generatedText;
        $('music-abc').textContent = snippet.trim();

        var notes = abcToNotes(snippet);
        renderPianoRoll(notes);
        renderNextChart(charModel);

        $('music-stat-notes').textContent = notes.length;
        $('music-stat-chars').textContent = snippet.length;
        setStatus('Generated a new tune at temperature ' + temperature.toFixed(2) + '. Press Play.', 'success');
    }

    function onPlay() {
        if (!generatedText) onGenerate();
        var notes = abcToNotes(generatedText);
        playNotes(notes);
    }

    function updateLabels() {
        $('music-temp-val').textContent = parseFloat($('music-temp').value).toFixed(2);
        $('music-order-val').textContent = $('music-order').value;
        $('music-bpm-val').textContent = $('music-bpm').value;
    }

    function init() {
        if (!$('music-demo')) return;
        charModel = buildModel(CORPUS);
        updateLabels();
        renderFreqChart(charModel);
        renderNextChart(charModel);

        ['music-temp', 'music-order', 'music-bpm'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('input', function () {
                updateLabels();
                if (id !== 'music-bpm') renderNextChart(charModel);
            });
        });
        $('music-gen-btn').addEventListener('click', onGenerate);
        $('music-play-btn').addEventListener('click', onPlay);
        $('music-stop-btn').addEventListener('click', function () {
            stopPlayback();
            setStatus('Stopped.', 'info');
        });

        onGenerate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
