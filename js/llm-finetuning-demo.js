/**
 * LLM Fine-Tuning & LLM-as-Judge — Interactive Demo
 *
 * Three hands-on panels reflecting the notebook:
 *   1. Chat templating + (approximate) tokenization, with answer-token masking.
 *   2. Base vs. style-tuned response comparison (illustrative).
 *   3. An LLM-as-a-judge style scorer, mirroring the Gemini judge that returns a
 *      0-10 score (normalized to 0-1). Here a transparent heuristic stands in so
 *      it runs offline; it reproduces the base / generated / true-style split.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    /* ---------------- 1. Templating + tokenization ---------------- */

    // Approximate subword tokenization (BPE-like): split into words/punctuation,
    // then break long words into ~4-char pieces. Purely illustrative.
    function subTokenize(text) {
        var pieces = text.match(/\s+|[A-Za-z]+|[0-9]+|[^\sA-Za-z0-9]/g) || [];
        var toks = [];
        pieces.forEach(function (p) {
            if (/^\s+$/.test(p)) return; // whitespace folds into next token visually
            if (/^[A-Za-z]+$/.test(p) && p.length > 5) {
                for (var i = 0; i < p.length; i += 4) toks.push(p.substring(i, i + 4));
            } else {
                toks.push(p);
            }
        });
        return toks;
    }

    function renderTokens() {
        var q = $('llm-question').value || '';
        var a = $('llm-answer').value || '';
        var stream = $('llm-token-stream');
        stream.innerHTML = '';
        var total = 0;

        function addTok(text, cls) {
            var span = document.createElement('span');
            span.className = 'llm-tok ' + cls;
            span.textContent = text;
            stream.appendChild(span);
            total++;
        }

        addTok('<|startoftext|>', 'llm-tok-special');
        addTok('<|im_start|>', 'llm-tok-special');
        addTok('user', 'llm-tok-special');
        subTokenize(q).forEach(function (t) { addTok(t, 'llm-tok-q'); });
        addTok('<|im_end|>', 'llm-tok-special');
        addTok('<|im_start|>', 'llm-tok-special');
        addTok('assistant', 'llm-tok-special');
        subTokenize(a).forEach(function (t) { addTok(t, 'llm-tok-a'); });
        addTok('<|im_end|>', 'llm-tok-special');

        $('llm-token-count').textContent = '~' + total + ' tokens';
    }

    /* ---------------- 2. Style comparison ---------------- */

    var PROMPTS = [
        {
            q: 'What is the capital of France?',
            base: 'The capital of France is Paris.',
            yoda: 'Paris, the capital of France is. Mmm.',
            leprechaun: "Och, 'tis Paris, the grand capital of France, me friend!"
        },
        {
            q: 'How do I get better at tennis?',
            base: 'Practice regularly, focus on footwork, and stay consistent.',
            yoda: 'Practice often, you must. Patience and footwork, the key they are.',
            leprechaun: "Sure, swing yer racket every day and the luck o' the Irish will follow, it will!"
        },
        {
            q: 'Tell me about the weather today.',
            base: 'It is mild and partly cloudy with a light breeze.',
            yoda: 'Mild and cloudy, the sky is. A gentle breeze, feel it you can.',
            leprechaun: "A soft grey sky we've got, with a wee breeze dancin' over the green hills!"
        },
        {
            q: 'Should I learn to cook?',
            base: 'Yes, cooking is a useful and rewarding skill to develop.',
            yoda: 'Learn to cook, you should. Rewarding, this skill is.',
            leprechaun: "Aye, learn to cook ye should — a fine pot o' stew warms the heart, it does!"
        }
    ];

    var activePrompt = 0;

    function renderPromptTabs() {
        var tabs = $('llm-prompt-tabs');
        tabs.innerHTML = '';
        PROMPTS.forEach(function (p, i) {
            var btn = document.createElement('button');
            btn.className = 'nlg-summary-tab' + (i === activePrompt ? ' active' : '');
            btn.textContent = p.q;
            btn.addEventListener('click', function () {
                activePrompt = i;
                renderPromptTabs();
                renderResponses();
            });
            tabs.appendChild(btn);
        });
    }

    function renderResponses() {
        var style = $('llm-style').value;
        var p = PROMPTS[activePrompt];
        $('llm-resp-base').textContent = p.base;
        $('llm-resp-style').textContent = p[style];
        $('llm-resp-style-title').textContent = style === 'yoda' ? 'Yoda-Tuned LFM2' : 'Leprechaun-Tuned LFM2';
    }

    /* ---------------- 3. LLM-as-a-judge (Yoda style scorer) ---------------- */

    var YODA_VERBS = ['is', 'are', 'be', 'must', 'will', 'should', 'can', 'do', 'does', 'have', 'has', 'reach', 'not'];

    function scoreYoda(text) {
        var t = (text || '').toLowerCase().trim();
        if (!t) return 0;
        var score = 0;
        var hasComma = t.indexOf(',') >= 0;

        // Signature interjections
        if (/\b(hmm+|mmm+)\b/.test(t)) score += 0.15;

        // Inverted final clause: short tail ending on a be/modal verb,
        // e.g. "..., the dark side is." or "..., you must."
        var lastComma = t.lastIndexOf(',');
        if (lastComma >= 0) {
            var tail = t.substring(lastComma + 1).trim().replace(/[.!?]+$/, '');
            var words = tail.split(/\s+/);
            if (words.length > 0 && words.length <= 4 &&
                YODA_VERBS.indexOf(words[words.length - 1]) >= 0) {
                score += 0.35;
            }
        }

        // Whole sentence ends on an inverted verb
        if (/\b(is|are|be|must|will|should|can|do|does|have|has|reach|not)\b[.!?]*\s*$/.test(t)) score += 0.25;

        // "you must / should / will / can / have / reach" constructions
        if (/\byou (must|should|will|can|have|reach)\b/.test(t)) score += 0.2;

        // Fronted predicate: opens with a non-article/pronoun phrase before a comma
        if (hasComma && !/^(the|it|i|you|we|they|this|that|there|a|an)\b/.test(t)) score += 0.15;

        // Star Wars lexicon
        var lex = (t.match(/\b(force|jedi|sith|dark side|young|padawan|master)\b/g) || []).length;
        score += Math.min(0.2, lex * 0.1);

        // Penalty for plain SVO declaratives (pronoun/article start, no inversion)
        if (/^(the|it|i|you|we|they|this)\b/.test(t) && !hasComma) score -= 0.15;

        return Math.max(0, Math.min(1, score));
    }

    function runJudge() {
        var text = $('llm-judge-input').value;
        var s = scoreYoda(text);
        var pct = Math.round(s * 100);
        $('llm-judge-fill').style.width = pct + '%';
        $('llm-judge-score').textContent = 'Score: ' + s.toFixed(2) + ' (' + (s * 10).toFixed(1) + '/10)';
        var note;
        if (s >= 0.7) note = 'Strong Yoda-speak — inversion present.';
        else if (s >= 0.4) note = 'Mixed faithfulness to the style.';
        else note = 'Reads as plain English, not Yoda.';
        $('llm-judge-note').textContent = note;
        var fill = $('llm-judge-fill');
        fill.style.background = s >= 0.7 ? '#6b9e6b' : (s >= 0.4 ? '#c9a87c' : '#9c5451');
    }

    /* ---------------- Charts ---------------- */

    var charts = {};

    function chartOpts(extra) {
        var base = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#999', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        };
        return Object.assign(base, extra || {});
    }

    function renderParamsChart() {
        if (typeof Chart === 'undefined') return;
        // LFM2 ~1.2B params; LoRA rank-8 adapters are a tiny fraction (<1%).
        charts.params = new Chart($('llm-chart-params'), {
            type: 'bar',
            data: {
                labels: ['Full Fine-Tune', 'LoRA (r=8)'],
                datasets: [{
                    label: 'Trainable params (M)',
                    data: [1200, 6],
                    backgroundColor: ['rgba(156,84,81,0.4)', 'rgba(107,158,107,0.7)'],
                    borderColor: ['#9c5451', '#6b9e6b'],
                    borderWidth: 1
                }]
            },
            options: chartOpts({
                scales: {
                    x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { type: 'logarithmic', ticks: { color: '#666', callback: function (v) { return v + 'M'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            })
        });
    }

    function renderScoresChart() {
        if (typeof Chart === 'undefined') return;
        var baseSamples = [
            'The capital of France is Paris.',
            'Tennis is a fun sport. But you must concentrate.',
            'It is mild and partly cloudy today.',
            'You should practice regularly to improve.'
        ];
        // An imperfect fine-tuned model: some clean inversions, some plain-English slips.
        var generatedSamples = [
            'Paris, the capital is.',
            'Tennis is fun, but you should practice.',
            'The weather today is mild and cloudy.',
            'Cook, you should learn to.'
        ];
        // Canonical Yoda lines (positive control).
        var styleSamples = [
            'Hard to see, the dark side is.',
            'Much to learn, you still have.',
            'Patience you must have, my young padawan.',
            'When nine hundred years old you reach, look as good you will not.'
        ];
        var mean = function (arr) {
            var s = arr.map(scoreYoda).reduce(function (a, b) { return a + b; }, 0);
            return +(s / arr.length).toFixed(2);
        };
        charts.scores = new Chart($('llm-chart-scores'), {
            type: 'bar',
            data: {
                labels: ['Base (neg. control)', 'Generated', 'True Style (pos.)'],
                datasets: [{
                    label: 'Mean style score',
                    data: [mean(baseSamples), mean(generatedSamples), mean(styleSamples)],
                    backgroundColor: ['rgba(156,84,81,0.5)', 'rgba(201,168,124,0.6)', 'rgba(107,158,107,0.7)'],
                    borderColor: ['#9c5451', '#c9a87c', '#6b9e6b'],
                    borderWidth: 1
                }]
            },
            options: chartOpts({
                scales: {
                    x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 1, ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            })
        });
    }

    /* ---------------- Init ---------------- */

    function init() {
        if (!$('llm-demo')) return;

        renderTokens();
        ['llm-question', 'llm-answer'].forEach(function (id) {
            $(id).addEventListener('input', renderTokens);
        });

        renderPromptTabs();
        renderResponses();
        $('llm-style').addEventListener('change', renderResponses);

        $('llm-judge-btn').addEventListener('click', runJudge);
        $('llm-judge-input').addEventListener('keyup', function (e) {
            if (e.key === 'Enter') runJudge();
        });
        runJudge();

        renderParamsChart();
        renderScoresChart();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
