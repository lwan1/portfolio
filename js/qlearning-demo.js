/**
 * FrozenLake Q-Learning Interactive Demo
 * Browser port of tabular Q-learning (matches 6_reinforcement_learning.py logic)
 */
(function (global) {
    'use strict';

    var N_COLS = 4;
    var N_STATES = 16;
    var N_ACTIONS = 4;
    var HOLES = { 5: true, 7: true, 11: true, 12: true };
    var GOAL = 15;
    var START = 0;
    var ACTION_DELTAS = [
        { dr: 0, dc: -1, label: '←', name: 'Left' },
        { dr: 1, dc: 0, label: '↓', name: 'Down' },
        { dr: 0, dc: 1, label: '→', name: 'Right' },
        { dr: -1, dc: 0, label: '↑', name: 'Up' }
    ];
    var MAP_ROWS = ['SFFF', 'FHFH', 'FFFH', 'HFFG'];

    function stateToPos(state) {
        return { r: Math.floor(state / N_COLS), c: state % N_COLS };
    }

    function posToState(r, c) {
        return r * N_COLS + c;
    }

    function initializeQTable() {
        var table = [];
        for (var s = 0; s < N_STATES; s++) {
            table.push([0, 0, 0, 0]);
        }
        return table;
    }

    function selectAction(qRow, method, epsilon) {
        if (method === 'random') {
            return Math.floor(Math.random() * N_ACTIONS);
        }
        if (Math.random() > epsilon) {
            var best = qRow[0];
            var bestIdx = 0;
            for (var i = 1; i < N_ACTIONS; i++) {
                if (qRow[i] > best) {
                    best = qRow[i];
                    bestIdx = i;
                }
            }
            return bestIdx;
        }
        return Math.floor(Math.random() * N_ACTIONS);
    }

    function calculateNewQVal(qTable, state, action, reward, nextState, alpha, gamma) {
        var current = qTable[state][action];
        var maxNext = Math.max.apply(null, qTable[nextState]);
        return (1 - alpha) * current + alpha * (reward + gamma * maxNext);
    }

    function envStep(state, action) {
        var pos = stateToPos(state);
        var delta = ACTION_DELTAS[action];
        var nr = Math.max(0, Math.min(3, pos.r + delta.dr));
        var nc = Math.max(0, Math.min(3, pos.c + delta.dc));
        var nextState = posToState(nr, nc);

        if (HOLES[nextState]) {
            return { nextState: nextState, reward: 0, done: true, success: false };
        }
        if (nextState === GOAL) {
            return { nextState: nextState, reward: 1, done: true, success: true };
        }
        return { nextState: nextState, reward: 0, done: false, success: false };
    }

    function movingAverage(arr, window) {
        var result = [];
        for (var i = 0; i < arr.length; i++) {
            var start = Math.max(0, i - window + 1);
            var sum = 0;
            for (var j = start; j <= i; j++) {
                sum += arr[j];
            }
            result.push(sum / (i - start + 1));
        }
        return result;
    }

    function trainAgent(params, nSims) {
        var qTable = initializeQTable();
        var totalRewards = [];
        var successes = [];
        var epsilonStart = params.epsilon;

        for (var sim = 0; sim < nSims; sim++) {
            var epsilon = Math.max(0.01, epsilonStart * (1 - sim / nSims));
            var state = START;
            var done = false;
            var total = 0;

            while (!done) {
                var action = selectAction(qTable[state], params.method, epsilon);
                var result = envStep(state, action);
                qTable[state][action] = calculateNewQVal(
                    qTable, state, action, result.reward, result.nextState,
                    params.alpha, params.gamma
                );
                total += result.reward;
                state = result.nextState;
                done = result.done;
            }

            totalRewards.push(total);
            successes.push(total > 0 ? 1 : 0);
        }

        return {
            qTable: qTable,
            totalRewards: totalRewards,
            successes: successes,
            rewardMA: movingAverage(totalRewards, 100),
            successMA: movingAverage(successes, 100)
        };
    }

    function getPolicy(qTable) {
        var policy = [];
        for (var s = 0; s < N_STATES; s++) {
            var best = 0;
            for (var a = 1; a < N_ACTIONS; a++) {
                if (qTable[s][a] > qTable[s][best]) {
                    best = a;
                }
            }
            policy.push(best);
        }
        return policy;
    }

    function runEpisode(qTable, randomPolicy) {
        var state = START;
        var path = [state];
        var totalReward = 0;
        var steps = 0;
        var maxSteps = 50;

        while (steps < maxSteps) {
            var action;
            if (randomPolicy) {
                action = Math.floor(Math.random() * N_ACTIONS);
            } else {
                action = selectAction(qTable[state], 'epsilon', 0);
            }
            var result = envStep(state, action);
            totalReward += result.reward;
            state = result.nextState;
            path.push({ state: state, action: action, reward: result.reward });
            steps++;
            if (result.done) {
                return { path: path, totalReward: totalReward, success: result.success, steps: steps };
            }
        }
        return { path: path, totalReward: totalReward, success: false, steps: steps };
    }

    /* ---- UI Controller ---- */

    var chartInstances = {};
    var animationTimer = null;
    var isTraining = false;

    function $(id) {
        return document.getElementById(id);
    }

    function getParams() {
        return {
            method: 'epsilon',
            alpha: parseFloat($('ql-alpha').value),
            gamma: parseFloat($('ql-gamma').value),
            epsilon: parseFloat($('ql-epsilon').value)
        };
    }

    function updateSliderLabels() {
        $('ql-alpha-val').textContent = parseFloat($('ql-alpha').value).toFixed(2);
        $('ql-gamma-val').textContent = parseFloat($('ql-gamma').value).toFixed(2);
        $('ql-epsilon-val').textContent = parseFloat($('ql-epsilon').value).toFixed(2);
        $('ql-episodes-val').textContent = $('ql-episodes').value;
    }

    function cellType(state) {
        var pos = stateToPos(state);
        var ch = MAP_ROWS[pos.r][pos.c];
        if (ch === 'S') return 'start';
        if (ch === 'H') return 'hole';
        if (ch === 'G') return 'goal';
        return 'frozen';
    }

    function renderGrid(containerId, agentState, highlightState) {
        var container = $(containerId);
        if (!container) return;
        container.innerHTML = '';

        for (var s = 0; s < N_STATES; s++) {
            var cell = document.createElement('div');
            cell.className = 'ql-cell ql-cell-' + cellType(s);
            if (s === agentState) {
                cell.classList.add('ql-cell-agent');
            }
            if (highlightState === s) {
                cell.classList.add('ql-cell-highlight');
            }
            var pos = stateToPos(s);
            cell.setAttribute('data-state', s);
            cell.innerHTML = '<span class="ql-cell-label">' + MAP_ROWS[pos.r][pos.c] + '</span>';
            container.appendChild(cell);
        }
    }

    function renderQTable(containerId, qTable, selectedState) {
        var container = $(containerId);
        if (!container) return;
        container.innerHTML = '';

        var maxVal = 0.001;
        for (var s = 0; s < N_STATES; s++) {
            for (var a = 0; a < N_ACTIONS; a++) {
                if (qTable[s][a] > maxVal) maxVal = qTable[s][a];
            }
        }

        for (s = 0; s < N_STATES; s++) {
            var stateBlock = document.createElement('div');
            stateBlock.className = 'ql-qstate';
            if (selectedState === s) stateBlock.classList.add('ql-qstate-active');

            var header = document.createElement('div');
            header.className = 'ql-qstate-header';
            header.textContent = 'State ' + s + ' (' + MAP_ROWS[stateToPos(s).r] + ',' + stateToPos(s).c + ')';
            stateBlock.appendChild(header);

            var actions = document.createElement('div');
            actions.className = 'ql-qactions';
            for (a = 0; a < N_ACTIONS; a++) {
                var val = qTable[s][a];
                var intensity = Math.min(1, val / maxVal);
                var actionEl = document.createElement('div');
                actionEl.className = 'ql-qaction';
                actionEl.style.background = 'rgba(156, 84, 81, ' + (0.15 + intensity * 0.85) + ')';
                actionEl.innerHTML =
                    '<span class="ql-qaction-arrow">' + ACTION_DELTAS[a].label + '</span>' +
                    '<span class="ql-qaction-val">' + val.toFixed(2) + '</span>';
                actions.appendChild(actionEl);
            }
            stateBlock.appendChild(actions);
            container.appendChild(stateBlock);
        }
    }

    function renderPolicy(containerId, qTable) {
        var container = $(containerId);
        if (!container) return;
        container.innerHTML = '';
        var policy = getPolicy(qTable);

        for (var s = 0; s < N_STATES; s++) {
            if (cellType(s) === 'hole' || cellType(s) === 'goal') continue;
            var cell = document.createElement('div');
            cell.className = 'ql-policy-cell';
            var pos = stateToPos(s);
            cell.style.gridRow = (pos.r + 1);
            cell.style.gridColumn = (pos.c + 1);
            cell.textContent = ACTION_DELTAS[policy[s]].label;
            container.appendChild(cell);
        }
    }

    function destroyCharts() {
        Object.keys(chartInstances).forEach(function (key) {
            if (chartInstances[key]) {
                chartInstances[key].destroy();
                chartInstances[key] = null;
            }
        });
    }

    function renderCharts(result, episodes) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();

        var labels = [];
        var step = Math.max(1, Math.floor(episodes / 200));
        for (var i = 0; i < episodes; i += step) {
            labels.push(i + 1);
        }

        var sample = function (arr) {
            var out = [];
            for (var j = 0; j < arr.length; j += step) out.push(arr[j]);
            return out;
        };

        var chartDefaults = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#999', font: { family: 'Outfit' } } } },
            scales: {
                x: {
                    ticks: { color: '#666', maxTicksLimit: 8 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#666' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        };

        var rewardCtx = $('ql-chart-reward');
        if (rewardCtx) {
            chartInstances.reward = new Chart(rewardCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Episode Reward',
                            data: sample(result.totalRewards),
                            borderColor: 'rgba(156, 84, 81, 0.35)',
                            backgroundColor: 'rgba(156, 84, 81, 0.1)',
                            pointRadius: 0,
                            borderWidth: 1,
                            fill: true
                        },
                        {
                            label: 'Moving Avg (100)',
                            data: sample(result.rewardMA),
                            borderColor: '#9c5451',
                            pointRadius: 0,
                            borderWidth: 2,
                            fill: false
                        }
                    ]
                },
                options: chartDefaults
            });
        }

        var successCtx = $('ql-chart-success');
        if (successCtx) {
            chartInstances.success = new Chart(successCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Success Rate (100-ep avg)',
                        data: sample(result.successMA.map(function (v) { return v * 100; })),
                        borderColor: '#c9a87c',
                        backgroundColor: 'rgba(201, 168, 124, 0.15)',
                        pointRadius: 0,
                        borderWidth: 2,
                        fill: true
                    }]
                },
                options: Object.assign({}, chartDefaults, {
                    scales: Object.assign({}, chartDefaults.scales, {
                        y: Object.assign({}, chartDefaults.scales.y, { min: 0, max: 100 })
                    })
                })
            });
        }
    }

    function updateStats(result, episodes) {
        var lastN = Math.min(500, result.successes.length);
        var successCount = 0;
        var rewardSum = 0;
        for (var i = result.successes.length - lastN; i < result.successes.length; i++) {
            successCount += result.successes[i];
            rewardSum += result.totalRewards[i];
        }
        var successRate = (successCount / lastN * 100).toFixed(1);
        var avgReward = (rewardSum / lastN).toFixed(2);

        $('ql-stat-success').textContent = successRate + '%';
        $('ql-stat-reward').textContent = avgReward;
        $('ql-stat-episodes').textContent = episodes.toLocaleString();
    }

    function setStatus(msg, type) {
        var el = $('ql-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'ql-status ql-status-' + (type || 'info');
    }

    function setButtonsDisabled(disabled) {
        ['ql-train-btn', 'ql-random-btn', 'ql-trained-btn'].forEach(function (id) {
            var btn = $(id);
            if (btn) btn.disabled = disabled;
        });
    }

    var currentQTable = initializeQTable();

    function onTrain() {
        if (isTraining) return;
        isTraining = true;
        setButtonsDisabled(true);
        setStatus('Training agent…', 'training');

        var params = getParams();
        var episodes = parseInt($('ql-episodes').value, 10);

        setTimeout(function () {
            var result = trainAgent(params, episodes);
            currentQTable = result.qTable;

            renderCharts(result, episodes);
            renderQTable('ql-qtable', currentQTable, null);
            renderPolicy('ql-policy-grid', currentQTable);
            renderGrid('ql-grid', START, null);
            updateStats(result, episodes);

            setStatus('Training complete. Run the agent or adjust parameters and retrain.', 'success');
            isTraining = false;
            setButtonsDisabled(false);
        }, 50);
    }

    function animateEpisode(randomPolicy) {
        if (animationTimer) {
            clearInterval(animationTimer);
            animationTimer = null;
        }

        var episode = runEpisode(currentQTable, randomPolicy);
        var path = episode.path;
        var stepIdx = 0;
        var agentState = START;

        renderGrid('ql-grid', agentState, null);
        setStatus(
            randomPolicy ? 'Running untrained (random) agent…' : 'Running trained agent…',
            'training'
        );

        animationTimer = setInterval(function () {
            if (stepIdx >= path.length) {
                clearInterval(animationTimer);
                animationTimer = null;
                setStatus(
                    (episode.success ? 'Goal reached' : 'Episode ended') +
                    ' in ' + episode.steps + ' steps (reward: ' + episode.totalReward + ')',
                    episode.success ? 'success' : 'info'
                );
                return;
            }

            var step = path[stepIdx];
            if (typeof step === 'object') {
                agentState = step.state;
                renderGrid('ql-grid', agentState, agentState);
            }
            stepIdx++;
        }, randomPolicy ? 350 : 500);
    }

    function bindControls() {
        ['ql-alpha', 'ql-gamma', 'ql-epsilon', 'ql-episodes'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('input', updateSliderLabels);
        });

        var trainBtn = $('ql-train-btn');
        if (trainBtn) trainBtn.addEventListener('click', onTrain);

        var randomBtn = $('ql-random-btn');
        if (randomBtn) randomBtn.addEventListener('click', function () {
            animateEpisode(true);
        });

        var trainedBtn = $('ql-trained-btn');
        if (trainedBtn) trainedBtn.addEventListener('click', function () {
            animateEpisode(false);
        });
    }

    function initStaticResults() {
        var params = { method: 'epsilon', alpha: 0.1, gamma: 0.99, epsilon: 0.3 };
        var episodes = 8000;
        var result = trainAgent(params, episodes);
        currentQTable = result.qTable;
        renderCharts(result, episodes);
        updateStats(result, episodes);
        renderQTable('ql-qtable', currentQTable, null);
        renderPolicy('ql-policy-grid', currentQTable);
        renderGrid('ql-grid', START, null);
        setStatus('Default training loaded. Adjust sliders and click Train Agent.', 'info');
    }

    function init() {
        if (!$('ql-demo')) return;
        updateSliderLabels();
        bindControls();
        initStaticResults();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.QLearningDemo = {
        trainAgent: trainAgent,
        initializeQTable: initializeQTable
    };
})(window);
