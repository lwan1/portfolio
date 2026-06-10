/**
 * Deep RL & Policy Gradients — Interactive Demo
 *
 * Mirrors Part 1 (CartPole) of the notebook: a 2-layer neural-network policy is
 * trained with REINFORCE. Each episode is rolled out in a real CartPole physics
 * simulation, discounted+normalized returns are computed, and a reward-weighted
 * policy-gradient step updates the weights (manual forward/backprop in JS).
 *
 * A side panel visualizes the continuous-action Gaussian policy from Part 2
 * (VISTA self-driving), where the network outputs a Normal distribution over
 * steering curvature.
 */
(function () {
    'use strict';

    /* ---------- CartPole physics (OpenAI Gym CartPole dynamics) ---------- */
    var GRAVITY = 9.8, MASSCART = 1.0, MASSPOLE = 0.1;
    var TOTAL_MASS = MASSCART + MASSPOLE;
    var LENGTH = 0.5, POLEMASS_LENGTH = MASSPOLE * LENGTH;
    var FORCE_MAG = 10.0, TAU = 0.02;
    var THETA_LIMIT = 12 * Math.PI / 180; // 12 degrees
    var X_LIMIT = 2.4;
    var MAX_STEPS = 200;

    function resetEnv() {
        return {
            x: (Math.random() - 0.5) * 0.1,
            xDot: (Math.random() - 0.5) * 0.1,
            theta: (Math.random() - 0.5) * 0.1,
            thetaDot: (Math.random() - 0.5) * 0.1
        };
    }

    function stepEnv(s, action) {
        var force = action === 1 ? FORCE_MAG : -FORCE_MAG;
        var costheta = Math.cos(s.theta);
        var sintheta = Math.sin(s.theta);
        var temp = (force + POLEMASS_LENGTH * s.thetaDot * s.thetaDot * sintheta) / TOTAL_MASS;
        var thetaacc = (GRAVITY * sintheta - costheta * temp) /
            (LENGTH * (4.0 / 3.0 - MASSPOLE * costheta * costheta / TOTAL_MASS));
        var xacc = temp - POLEMASS_LENGTH * thetaacc * costheta / TOTAL_MASS;

        s.x += TAU * s.xDot;
        s.xDot += TAU * xacc;
        s.theta += TAU * s.thetaDot;
        s.thetaDot += TAU * thetaacc;

        var done = s.x < -X_LIMIT || s.x > X_LIMIT ||
            s.theta < -THETA_LIMIT || s.theta > THETA_LIMIT;
        return done;
    }

    function obs(s) { return [s.x, s.xDot, s.theta, s.thetaDot]; }

    /* ---------- Policy network (input 4 -> hidden H -> 2) ---------- */

    function randMat(rows, cols, scale) {
        var m = [];
        for (var i = 0; i < rows; i++) {
            var row = [];
            for (var j = 0; j < cols; j++) row.push((Math.random() * 2 - 1) * scale);
            m.push(row);
        }
        return m;
    }
    function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
    function zerosMat(r, c) { var m = []; for (var i = 0; i < r; i++) m.push(zeros(c)); return m; }

    function createPolicy(hidden) {
        return {
            H: hidden,
            W1: randMat(hidden, 4, 0.3), b1: zeros(hidden),
            W2: randMat(2, hidden, 0.3), b2: zeros(2),
            // Adam optimizer state (matches the notebook's tf.keras Adam)
            mW1: zerosMat(hidden, 4), vW1: zerosMat(hidden, 4), mb1: zeros(hidden), vb1: zeros(hidden),
            mW2: zerosMat(2, hidden), vW2: zerosMat(2, hidden), mb2: zeros(2), vb2: zeros(2),
            t: 0
        };
    }

    function forward(net, x) {
        var z1 = zeros(net.H), a1 = zeros(net.H);
        for (var i = 0; i < net.H; i++) {
            var sum = net.b1[i];
            for (var j = 0; j < 4; j++) sum += net.W1[i][j] * x[j];
            z1[i] = sum;
            a1[i] = sum > 0 ? sum : 0; // ReLU
        }
        var logits = [net.b2[0], net.b2[1]];
        for (var k = 0; k < 2; k++) {
            for (var h = 0; h < net.H; h++) logits[k] += net.W2[k][h] * a1[h];
        }
        var m = Math.max(logits[0], logits[1]);
        var e0 = Math.exp(logits[0] - m), e1 = Math.exp(logits[1] - m);
        var s = e0 + e1;
        return { z1: z1, a1: a1, p: [e0 / s, e1 / s] };
    }

    function sampleAction(p) { return Math.random() < p[0] ? 0 : 1; }

    function discountNormalize(rewards, gamma) {
        var d = zeros(rewards.length);
        var R = 0;
        for (var t = rewards.length - 1; t >= 0; t--) {
            R = R * gamma + rewards[t];
            d[t] = R;
        }
        var mean = 0;
        for (var i = 0; i < d.length; i++) mean += d[i];
        mean /= d.length;
        var variance = 0;
        for (i = 0; i < d.length; i++) variance += (d[i] - mean) * (d[i] - mean);
        var std = Math.sqrt(variance / d.length) + 1e-8;
        for (i = 0; i < d.length; i++) d[i] = (d[i] - mean) / std;
        return d;
    }

    // One REINFORCE update from a single episode's trajectory.
    function trainEpisode(net, gamma, lr) {
        var s = resetEnv();
        var traj = [];
        var rewards = [];
        var steps = 0;
        while (steps < MAX_STEPS) {
            var x = obs(s);
            var fwd = forward(net, x);
            var a = sampleAction(fwd.p);
            traj.push({ x: x, a1: fwd.a1, z1: fwd.z1, p: fwd.p, a: a });
            var done = stepEnv(s, a);
            rewards.push(1.0);
            steps++;
            if (done) break;
        }
        var returns = discountNormalize(rewards, gamma);

        // Accumulate gradients
        var gW1 = zerosMat(net.H, 4), gb1 = zeros(net.H);
        var gW2 = zerosMat(2, net.H), gb2 = zeros(2);
        var T = traj.length;

        for (var t = 0; t < T; t++) {
            var step = traj[t];
            var R = returns[t];
            // dL/dlogits = (p - onehot(a)) * R
            var dlogits = [step.p[0] * R, step.p[1] * R];
            dlogits[step.a] -= R;

            for (var k = 0; k < 2; k++) {
                gb2[k] += dlogits[k];
                for (var h = 0; h < net.H; h++) gW2[k][h] += dlogits[k] * step.a1[h];
            }
            // backprop into hidden
            for (h = 0; h < net.H; h++) {
                var da1 = net.W2[0][h] * dlogits[0] + net.W2[1][h] * dlogits[1];
                var dz1 = step.z1[h] > 0 ? da1 : 0;
                gb1[h] += dz1;
                for (var j = 0; j < 4; j++) gW1[h][j] += dz1 * step.x[j];
            }
        }

        // Average over timesteps, then global-norm clip (matches notebook's clip=2)
        var scale = 1 / Math.max(1, T);
        var sq = 0;
        function accSq(v) { sq += v * v; }
        for (k = 0; k < 2; k++) { gb2[k] *= scale; accSq(gb2[k]); for (h = 0; h < net.H; h++) { gW2[k][h] *= scale; accSq(gW2[k][h]); } }
        for (h = 0; h < net.H; h++) { gb1[h] *= scale; accSq(gb1[h]); for (j = 0; j < 4; j++) { gW1[h][j] *= scale; accSq(gW1[h][j]); } }
        var norm = Math.sqrt(sq);
        var clip = norm > 2 ? 2 / norm : 1;

        // Adam update (gradient *descent* on the loss => higher reward likelihood)
        net.t++;
        var b1 = 0.9, b2 = 0.999, eps = 1e-8;
        var bc1 = 1 - Math.pow(b1, net.t), bc2 = 1 - Math.pow(b2, net.t);
        function adamScalar(g, m, v) {
            g *= clip;
            var nm = b1 * m + (1 - b1) * g;
            var nv = b2 * v + (1 - b2) * g * g;
            var step = lr * (nm / bc1) / (Math.sqrt(nv / bc2) + eps);
            return { m: nm, v: nv, step: step };
        }
        for (k = 0; k < 2; k++) {
            var rb = adamScalar(gb2[k], net.mb2[k], net.vb2[k]);
            net.mb2[k] = rb.m; net.vb2[k] = rb.v; net.b2[k] -= rb.step;
            for (h = 0; h < net.H; h++) {
                var r2 = adamScalar(gW2[k][h], net.mW2[k][h], net.vW2[k][h]);
                net.mW2[k][h] = r2.m; net.vW2[k][h] = r2.v; net.W2[k][h] -= r2.step;
            }
        }
        for (h = 0; h < net.H; h++) {
            var rb1 = adamScalar(gb1[h], net.mb1[h], net.vb1[h]);
            net.mb1[h] = rb1.m; net.vb1[h] = rb1.v; net.b1[h] -= rb1.step;
            for (j = 0; j < 4; j++) {
                var r1 = adamScalar(gW1[h][j], net.mW1[h][j], net.vW1[h][j]);
                net.mW1[h][j] = r1.m; net.vW1[h][j] = r1.v; net.W1[h][j] -= r1.step;
            }
        }

        return T; // total reward = number of steps survived
    }

    /* ---------- State ---------- */
    var policy = null;
    var charts = {};
    var isTraining = false;
    var animTimer = null;
    var toppleTimer = null;

    function $(id) { return document.getElementById(id); }

    function setStatus(msg, type) {
        var el = $('rl-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'ql-status ql-status-' + (type || 'info');
    }

    function movingAvg(arr, w) {
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var start = Math.max(0, i - w + 1), sum = 0;
            for (var j = start; j <= i; j++) sum += arr[j];
            out.push(sum / (i - start + 1));
        }
        return out;
    }

    function chartDefaults(extra) {
        var base = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#999', font: { family: 'Outfit' } } } },
            scales: {
                x: { ticks: { color: '#666', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        };
        return Object.assign(base, extra || {});
    }

    function renderRewardChart(rewards) {
        if (typeof Chart === 'undefined') return;
        if (charts.reward) charts.reward.destroy();
        var labels = rewards.map(function (_, i) { return i + 1; });
        charts.reward = new Chart($('rl-chart-reward'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Episode Reward', data: rewards, borderColor: 'rgba(156,84,81,0.3)', backgroundColor: 'rgba(156,84,81,0.08)', pointRadius: 0, borderWidth: 1, fill: true },
                    { label: 'Moving Avg (20)', data: movingAvg(rewards, 20), borderColor: '#9c5451', pointRadius: 0, borderWidth: 2, fill: false }
                ]
            },
            options: chartDefaults({ scales: { x: { ticks: { color: '#666', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { min: 0, max: MAX_STEPS, ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } } } })
        });
    }

    function normalPdf(x, mu, sigma) {
        return Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2)) / (sigma * Math.sqrt(2 * Math.PI));
    }

    function renderGaussChart() {
        if (typeof Chart === 'undefined') return;
        var mu = parseFloat($('rl-mu').value);
        var sigma = parseFloat($('rl-sigma').value);
        var xs = [], ys = [];
        for (var x = -1.5; x <= 1.5001; x += 0.05) {
            xs.push(x.toFixed(2));
            ys.push(normalPdf(x, mu, sigma));
        }
        if (charts.gauss) charts.gauss.destroy();
        charts.gauss = new Chart($('rl-chart-gauss'), {
            type: 'line',
            data: {
                labels: xs,
                datasets: [{ label: 'π(curvature) = Normal(μ, σ)', data: ys, borderColor: '#c9a87c', backgroundColor: 'rgba(201,168,124,0.15)', pointRadius: 0, borderWidth: 2, fill: true, tension: 0.3 }]
            },
            options: chartDefaults({ scales: { x: { ticks: { color: '#666', maxTicksLimit: 7 }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'steering curvature', color: '#666' } }, y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } } } })
        });
    }

    /* ---------- CartPole canvas rendering ---------- */
    function drawCart(s, failed) {
        var canvas = $('rl-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // track
        var groundY = H - 50;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

        var scale = (W / 2) / (X_LIMIT + 0.6);
        var cartX = W / 2 + s.x * scale;
        var cartW = 60, cartH = 24;

        // cart
        ctx.fillStyle = '#9c5451';
        ctx.fillRect(cartX - cartW / 2, groundY - cartH, cartW, cartH);

        // pole
        var poleLen = 90;
        var px = cartX, py = groundY - cartH;
        var ex = px + poleLen * Math.sin(s.theta);
        var ey = py - poleLen * Math.cos(s.theta);
        ctx.strokeStyle = failed ? '#9c5451' : '#c9a87c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();

        // hub
        ctx.fillStyle = failed ? '#9c5451' : '#fff';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Purely cosmetic: after a real (±12°) failure, let the pole keep falling to
    // horizontal so the crash is visually obvious. Does not affect reward/training.
    function animateTopple(s, onDone) {
        if (toppleTimer) { clearInterval(toppleTimer); toppleTimer = null; }
        var dir = s.theta >= 0 ? 1 : -1;
        var target = dir * Math.PI / 2; // fall flat to ~90°
        s.thetaDot = dir * Math.max(0.4, Math.abs(s.thetaDot));
        toppleTimer = setInterval(function () {
            // ease toward horizontal with a touch of acceleration
            s.thetaDot += dir * 0.04;
            s.theta += (target - s.theta) * 0.16 + s.thetaDot * 0.02 * dir;
            if (dir > 0) s.theta = Math.min(s.theta, target);
            else s.theta = Math.max(s.theta, target);
            drawCart(s, true);
            if (Math.abs(target - s.theta) < 0.02) {
                clearInterval(toppleTimer); toppleTimer = null;
                if (onDone) onDone();
            }
        }, 28);
    }

    function runPolicy() {
        if (animTimer) { clearInterval(animTimer); animTimer = null; }
        if (toppleTimer) { clearInterval(toppleTimer); toppleTimer = null; }
        if (!policy) return;
        var s = resetEnv();
        var steps = 0;
        setStatus('Running learned policy…', 'training');
        animTimer = setInterval(function () {
            var fwd = forward(policy, obs(s));
            var a = fwd.p[0] > fwd.p[1] ? 0 : 1; // greedy at eval
            var done = stepEnv(s, a);
            drawCart(s);
            steps++;
            if (done || steps >= MAX_STEPS) {
                clearInterval(animTimer); animTimer = null;
                var balanced = steps >= MAX_STEPS;
                var angleFail = Math.abs(s.theta) >= THETA_LIMIT - 1e-6;
                if (balanced) {
                    setStatus('Balanced for the full ' + steps + ' steps (reward ' + steps + ')!', 'success');
                } else if (angleFail) {
                    setStatus('Pole exceeded 12° — episode ended after ' + steps + ' steps (reward ' + steps + ').', 'info');
                    animateTopple(s);
                } else {
                    setStatus('Cart left the track — episode ended after ' + steps + ' steps (reward ' + steps + ').', 'info');
                }
            }
        }, 28);
    }

    /* ---------- Training loop (chunked to keep UI responsive) ---------- */
    function trainAgent() {
        if (isTraining) return;
        isTraining = true;
        $('rl-train-btn').disabled = true;
        $('rl-run-btn').disabled = true;

        var lr = parseFloat($('rl-lr').value);
        var gamma = parseFloat($('rl-gamma').value);
        var hidden = parseInt($('rl-hidden').value, 10);
        var episodes = parseInt($('rl-episodes').value, 10);

        policy = createPolicy(hidden);
        var rewards = [];
        var ep = 0;
        var best = 0;

        function chunk() {
            var batch = 0;
            while (batch < 15 && ep < episodes) {
                var r = trainEpisode(policy, gamma, lr);
                rewards.push(r);
                if (r > best) best = r;
                ep++; batch++;
            }
            var last = rewards.slice(-20);
            var avg = last.reduce(function (a, b) { return a + b; }, 0) / last.length;
            $('rl-stat-reward').textContent = avg.toFixed(0);
            $('rl-stat-best').textContent = best;
            setStatus('Training… episode ' + ep + ' / ' + episodes + ' · avg reward ' + avg.toFixed(0), 'training');
            renderRewardChart(rewards);

            if (ep < episodes) {
                setTimeout(chunk, 0);
            } else {
                isTraining = false;
                $('rl-train-btn').disabled = false;
                $('rl-run-btn').disabled = false;
                setStatus('Training complete — avg reward ' + avg.toFixed(0) + '. Press Run Policy.', 'success');
                runPolicy();
            }
        }
        setTimeout(chunk, 30);
    }

    function updateLabels() {
        $('rl-lr-val').textContent = parseFloat($('rl-lr').value).toFixed(3);
        $('rl-gamma-val').textContent = parseFloat($('rl-gamma').value).toFixed(2);
        $('rl-hidden-val').textContent = $('rl-hidden').value;
        $('rl-episodes-val').textContent = $('rl-episodes').value;
        $('rl-mu-val').textContent = parseFloat($('rl-mu').value).toFixed(2);
        $('rl-sigma-val').textContent = parseFloat($('rl-sigma').value).toFixed(2);
    }

    function init() {
        if (!$('rl-demo')) return;
        updateLabels();
        renderGaussChart();
        // idle cart
        drawCart({ x: 0, theta: 0.05 });

        ['rl-lr', 'rl-gamma', 'rl-hidden', 'rl-episodes'].forEach(function (id) {
            $(id).addEventListener('input', updateLabels);
        });
        ['rl-mu', 'rl-sigma'].forEach(function (id) {
            $(id).addEventListener('input', function () { updateLabels(); renderGaussChart(); });
        });
        $('rl-train-btn').addEventListener('click', trainAgent);
        $('rl-run-btn').addEventListener('click', function () {
            if (!policy) { setStatus('Train the agent first.', 'info'); return; }
            runPolicy();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
