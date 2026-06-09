/**
 * CSED503 NLG & Knowledge Distillation — Interactive Demo
 */
(function () {
    'use strict';

    var DECODING_DATA = [
        { method: 'Greedy', perplexity: 1.98, fluency: 0.79, diversity: 0.02 },
        { method: 'Vanilla Sample', perplexity: 73.95, fluency: 0.34, diversity: 0.99 },
        { method: 'Temperature', perplexity: 15.33, fluency: 0.63, diversity: 0.94 },
        { method: 'Top-k', perplexity: 12.39, fluency: 0.70, diversity: 0.95 },
        { method: 'Top-p', perplexity: 11.66, fluency: 0.75, diversity: 0.94 }
    ];

    var ROUGE_DATA = {
        labels: ['GPT-2 Baseline', 'GPT-2 Distilled', 'Qwen Teacher'],
        rouge1: [0.193, 0.230, 0.284],
        rouge2: [0.033, 0.057, 0.085],
        rougeL: [0.125, 0.146, 0.188]
    };

    var LOSS_DATA = {
        steps: [27, 54, 81, 108, 135, 162, 189],
        train: [6.08, 4.49, 3.31, 3.27, 2.67, 2.74, 2.48],
        val: [4.35, 3.31, 3.03, 2.99, 2.98, 3.01, 3.01]
    };

    var SUMMARY_EXAMPLE = {
        title: 'CNN/Daily Mail — Validation Example',
        article: '(CNN) French striker Bafetimbi Gomis, who has a history of fainting, said he is now "feeling well" after collapsing during Swansea\'s 3-2 loss at Tottenham in the Premier League on Wednesday. The incident occurred in the first half at White Hart Lane — the 29-year-old left the pitch conscious following about five minutes of treatment and was wearing an oxygen mask. Gomis spent the night in hospital as a precaution. Almost exactly three years ago at White Hart Lane, Bolton midfielder Fabrice Muamba collapsed after suffering a cardiac arrest.',
        gold: 'Bafetimbi Gomis collapses within 10 minutes of kickoff at Tottenham.\nBut he reportedly left the pitch conscious and wearing an oxygen mask.\nGomis later said that he was "feeling well"\nThe incident came three years after Fabrice Muamba collapsed at White Hart Lane.',
        baseline: 'Gomis is a good footballer, but his performance on Wednesday was much worse than his recent performance from Swansea, where he failed to score once. The Welsh legend\'s injuries cost him just seven Premier League goals (two in a 10-game season). If he were to go on to form at a lower level, it would put him at the head of the league at the moment.',
        teacher: 'Swansea defender Bafetimbi Gomis, who fainted during a Premier League match against Tottenham, has reportedly recovered and described himself as "feeling well." Despite his concerns regarding fainting incidents related to his past, the 29-year-old stated he is "under a great deal of stress" due to family matters affecting his work-life balance.',
        distilled: 'French striker Bafetimbi Gomis, who has a history of fainting, has now expressed positive mood after suffering a cardiac arrest. He believes his condition improved following treatment. Gomis was diagnosed with a severe fainting spell due to his age and his condition has significantly improved. He remains in hospital due to symptoms including discomfort and sweating.'
    };

    var VOCAB = ['the', 'cat', 'sat', 'on', 'a', 'mat', 'dog', 'ran'];
    var LOGITS = [2.1, 3.8, 1.2, 0.5, 1.8, 0.3, 2.5, 0.9];

    var charts = {};

    function $(id) { return document.getElementById(id); }

    function softmax(arr, temperature) {
        var scaled = arr.map(function (x) { return x / temperature; });
        var max = Math.max.apply(null, scaled);
        var exps = scaled.map(function (x) { return Math.exp(x - max); });
        var sum = exps.reduce(function (a, b) { return a + b; }, 0);
        return exps.map(function (x) { return x / sum; });
    }

    function applyTopP(probs, p) {
        var indexed = probs.map(function (prob, i) { return { p: prob, i: i }; });
        indexed.sort(function (a, b) { return b.p - a.p; });
        var cum = 0;
        var keep = {};
        for (var j = 0; j < indexed.length; j++) {
            keep[indexed[j].i] = true;
            cum += indexed[j].p;
            if (cum >= p) break;
        }
        var masked = probs.map(function (prob, i) { return keep[i] ? prob : 0; });
        var sum = masked.reduce(function (a, b) { return a + b; }, 0);
        return {
            probs: sum ? masked.map(function (prob) { return prob / sum; }) : probs,
            kept: keep
        };
    }

    function applyTopKWithMask(probs, k) {
        var indexed = probs.map(function (p, i) { return { p: p, i: i }; });
        indexed.sort(function (a, b) { return b.p - a.p; });
        var keep = {};
        indexed.slice(0, k).forEach(function (x) { keep[x.i] = true; });
        var masked = probs.map(function (p, i) { return keep[i] ? p : 0; });
        var sum = masked.reduce(function (a, b) { return a + b; }, 0);
        return {
            probs: sum ? masked.map(function (p) { return p / sum; }) : probs,
            kept: keep
        };
    }

    function argmax(arr) {
        var best = 0;
        for (var i = 1; i < arr.length; i++) {
            if (arr[i] > arr[best]) best = i;
        }
        return best;
    }

    var PARAM_HINTS = {
        greedy: 'Greedy decoding always picks the highest-logit token — no hyperparameters needed.',
        vanilla: 'Vanilla sampling draws from the full softmax distribution (temperature = 1.0).',
        temperature: 'Lower temperature sharpens the distribution toward greedy; higher temperature flattens it.',
        topk: 'Only the top-k tokens remain; probability is renormalized over the kept set before sampling.',
        topp: 'Keeps the smallest token set whose cumulative probability reaches p, then renormalizes.'
    };

    function getChartDefaults() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#999', font: { family: 'Outfit' } } }
            },
            scales: {
                x: {
                    ticks: { color: '#666' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#666' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        };
    }

    function renderDecodingChart() {
        var ctx = $('nlg-chart-decoding');
        if (!ctx || typeof Chart === 'undefined') return;
        if (charts.decoding) charts.decoding.destroy();
        charts.decoding = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: DECODING_DATA.map(function (d) { return d.method; }),
                datasets: [
                    {
                        label: 'Fluency',
                        data: DECODING_DATA.map(function (d) { return d.fluency; }),
                        backgroundColor: 'rgba(156, 84, 81, 0.7)',
                        borderRadius: 4
                    },
                    {
                        label: 'Diversity (trigram)',
                        data: DECODING_DATA.map(function (d) { return d.diversity; }),
                        backgroundColor: 'rgba(201, 168, 124, 0.6)',
                        borderRadius: 4
                    }
                ]
            },
            options: Object.assign({}, getChartDefaults(), {
                plugins: Object.assign({}, getChartDefaults().plugins, {
                    title: {
                        display: true,
                        text: 'Fluency vs. Diversity by Decoding Strategy (ROCStories)',
                        color: '#666',
                        font: { size: 12, family: 'Outfit' }
                    }
                }),
                scales: Object.assign({}, getChartDefaults().scales, {
                    y: Object.assign({}, getChartDefaults().scales.y, { min: 0, max: 1.05 })
                })
            })
        });
    }

    function renderRougeChart() {
        var ctx = $('nlg-chart-rouge');
        if (!ctx || typeof Chart === 'undefined') return;
        if (charts.rouge) charts.rouge.destroy();
        charts.rouge = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ROUGE_DATA.labels,
                datasets: [
                    {
                        label: 'ROUGE-1',
                        data: ROUGE_DATA.rouge1,
                        backgroundColor: 'rgba(156, 84, 81, 0.75)',
                        borderRadius: 4
                    },
                    {
                        label: 'ROUGE-2',
                        data: ROUGE_DATA.rouge2,
                        backgroundColor: 'rgba(201, 168, 124, 0.65)',
                        borderRadius: 4
                    },
                    {
                        label: 'ROUGE-L',
                        data: ROUGE_DATA.rougeL,
                        backgroundColor: 'rgba(107, 158, 107, 0.55)',
                        borderRadius: 4
                    }
                ]
            },
            options: Object.assign({}, getChartDefaults(), {
                plugins: Object.assign({}, getChartDefaults().plugins, {
                    title: {
                        display: true,
                        text: 'ROUGE Scores on CNN/Daily Mail Validation (1,000 articles)',
                        color: '#666',
                        font: { size: 12, family: 'Outfit' }
                    }
                }),
                scales: Object.assign({}, getChartDefaults().scales, {
                    y: Object.assign({}, getChartDefaults().scales.y, { min: 0, max: 0.32 })
                })
            })
        });
    }

    function renderLossChart() {
        var ctx = $('nlg-chart-loss');
        if (!ctx || typeof Chart === 'undefined') return;
        if (charts.loss) charts.loss.destroy();
        charts.loss = new Chart(ctx, {
            type: 'line',
            data: {
                labels: LOSS_DATA.steps.map(String),
                datasets: [
                    {
                        label: 'Train Loss',
                        data: LOSS_DATA.train,
                        borderColor: '#9c5451',
                        backgroundColor: 'rgba(156, 84, 81, 0.1)',
                        fill: true,
                        pointRadius: 4,
                        tension: 0.3
                    },
                    {
                        label: 'Val Loss',
                        data: LOSS_DATA.val,
                        borderColor: '#c9a87c',
                        backgroundColor: 'rgba(201, 168, 124, 0.08)',
                        fill: true,
                        pointRadius: 4,
                        tension: 0.3
                    }
                ]
            },
            options: Object.assign({}, getChartDefaults(), {
                plugins: Object.assign({}, getChartDefaults().plugins, {
                    title: {
                        display: true,
                        text: 'Fine-Tuning Loss (3 epochs, 1,000 teacher summaries)',
                        color: '#666',
                        font: { size: 12, family: 'Outfit' }
                    }
                })
            })
        });
    }

    function updateParamVisibility(method) {
        var groups = {
            temperature: $('nlg-param-temperature'),
            topk: $('nlg-param-topk'),
            topp: $('nlg-param-topp')
        };
        Object.keys(groups).forEach(function (key) {
            if (groups[key]) groups[key].hidden = true;
        });
        if (method === 'temperature' && groups.temperature) groups.temperature.hidden = false;
        if (method === 'topk' && groups.topk) groups.topk.hidden = false;
        if (method === 'topp' && groups.topp) groups.topp.hidden = false;

        var hint = $('nlg-param-hint');
        if (hint) hint.textContent = PARAM_HINTS[method] || '';
    }

    function computeDistribution(method, temp, topK, topP) {
        var kept = null;
        var probs;

        if (method === 'greedy') {
            probs = softmax(LOGITS, 1.0);
        } else if (method === 'vanilla') {
            probs = softmax(LOGITS, 1.0);
        } else if (method === 'temperature') {
            probs = softmax(LOGITS, temp);
        } else if (method === 'topk') {
            var base = softmax(LOGITS, 1.0);
            var topKResult = applyTopKWithMask(base, topK);
            probs = topKResult.probs;
            kept = topKResult.kept;
        } else {
            var baseP = softmax(LOGITS, 1.0);
            var topPResult = applyTopP(baseP, topP);
            probs = topPResult.probs;
            kept = topPResult.kept;
        }

        return { probs: probs, kept: kept, greedyIdx: argmax(LOGITS) };
    }

    function renderDecodingPlayground() {
        var methodEl = $('nlg-decode-method');
        if (!methodEl) return;

        var method = methodEl.value;
        var temp = parseFloat($('nlg-temperature').value);
        var topK = parseInt($('nlg-topk').value, 10);
        var topP = parseFloat($('nlg-topp').value);

        updateParamVisibility(method);

        if ($('nlg-temperature-val')) $('nlg-temperature-val').textContent = temp.toFixed(1);
        if ($('nlg-topk-val')) $('nlg-topk-val').textContent = String(topK);
        if ($('nlg-topp-val')) $('nlg-topp-val').textContent = topP.toFixed(2);

        var result = computeDistribution(method, temp, topK, topP);
        var probs = result.probs;
        var kept = result.kept;
        var greedyIdx = result.greedyIdx;

        var container = $('nlg-token-bars');
        if (!container) return;
        container.innerHTML = '';

        VOCAB.forEach(function (token, i) {
            var row = document.createElement('div');
            row.className = 'nlg-token-row';
            var isMasked = kept && !kept[i];
            var isGreedyPick = method === 'greedy' && i === greedyIdx;
            var isKept = kept && kept[i];

            if (isMasked) row.classList.add('nlg-token-masked');
            if (isGreedyPick || isKept) row.classList.add('nlg-token-selected');

            var barWidth = probs[i] * 100;
            row.innerHTML =
                '<span class="nlg-token-label">' + token + '</span>' +
                '<div class="nlg-token-bar-track"><div class="nlg-token-bar-fill" style="width:' + barWidth.toFixed(1) + '%"></div></div>' +
                '<span class="nlg-token-pct">' + (probs[i] * 100).toFixed(1) + '%</span>';
            container.appendChild(row);
        });

        var outcome = $('nlg-decode-outcome');
        if (!outcome) return;
        if (method === 'greedy') {
            outcome.textContent = 'Greedy selects "' + VOCAB[greedyIdx] + '" (logit ' + LOGITS[greedyIdx].toFixed(1) + ', ' + (probs[greedyIdx] * 100).toFixed(1) + '% probability at T=1).';
        } else if (method === 'vanilla') {
            outcome.textContent = 'Sampling distribution over all ' + VOCAB.length + ' tokens. "' + VOCAB[greedyIdx] + '" is most likely (' + (probs[greedyIdx] * 100).toFixed(1) + '%) but any token can be drawn.';
        } else if (method === 'temperature') {
            outcome.textContent = 'At T=' + temp + ', "' + VOCAB[argmax(probs)] + '" has the highest probability (' + (Math.max.apply(null, probs) * 100).toFixed(1) + '%).';
        } else if (method === 'topk') {
            var keptNames = VOCAB.filter(function (_, i) { return kept[i]; }).join('", "');
            outcome.textContent = 'Top-' + topK + ' keeps "' + keptNames + '". Masked tokens have 0% probability.';
        } else {
            var keptCount = Object.keys(kept).filter(function (k) { return kept[k]; }).length;
            outcome.textContent = 'Nucleus p=' + topP + ' retains ' + keptCount + ' token' + (keptCount === 1 ? '' : 's') + ', then renormalizes before sampling.';
        }
    }

    function renderSummaryComparison(view) {
        var map = {
            gold: { label: 'Gold Summary (Human)', text: SUMMARY_EXAMPLE.gold, cls: 'nlg-summary-gold' },
            baseline: { label: 'GPT-2 Baseline (Zero-Shot)', text: SUMMARY_EXAMPLE.baseline, cls: 'nlg-summary-baseline' },
            teacher: { label: 'Qwen2.5-1.5B Teacher', text: SUMMARY_EXAMPLE.teacher, cls: 'nlg-summary-teacher' },
            distilled: { label: 'GPT-2 After Distillation', text: SUMMARY_EXAMPLE.distilled, cls: 'nlg-summary-distilled' }
        };
        var data = map[view] || map.gold;
        var panel = $('nlg-summary-panel');
        if (!panel) return;
        panel.className = 'nlg-summary-panel ' + data.cls;
        panel.innerHTML = '<h6>' + data.label + '</h6><p>' + data.text.replace(/\n/g, '<br>') + '</p>';

        document.querySelectorAll('.nlg-summary-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.getAttribute('data-view') === view);
        });
    }

    function bindControls() {
        var methodEl = $('nlg-decode-method');
        if (methodEl) {
            methodEl.addEventListener('change', renderDecodingPlayground);
        }
        ['nlg-temperature', 'nlg-topk', 'nlg-topp'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('input', renderDecodingPlayground);
        });

        document.querySelectorAll('.nlg-summary-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                renderSummaryComparison(tab.getAttribute('data-view'));
            });
        });
    }

    function init() {
        if (!$('nlg-chart-decoding')) return;
        renderDecodingChart();
        renderRougeChart();
        renderLossChart();
        renderDecodingPlayground();
        renderSummaryComparison('baseline');
        bindControls();

        var articleEl = $('nlg-article-text');
        if (articleEl) articleEl.textContent = SUMMARY_EXAMPLE.article;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
