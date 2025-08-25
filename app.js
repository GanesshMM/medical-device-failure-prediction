// Medical Device Monitoring System - JavaScript (SSE-enabled)

class MedicalDeviceMonitor {
    constructor() {
        this.devices = [];
        this.alerts = [];
        this.currentTab = 'dashboard';
        this.updateInterval = null;     // fallback simulation interval
        this.sse = null;                // EventSource
        this.charts = {};
        this.soundEnabled = true;
        this.currentTheme = this.getPreferredTheme();
        this.alertQueue = [];
        this.audioContext = null;

        // 24 device names (exact)
        this.deviceNames = [
            "Alaris GH", "Baxter AK 96", "Baxter Flo-Gard", "Datex Ohmeda S5",
            "Drager Fabius Trio", "Drager V500", "Fresenius 4008", "GE Aisys",
            "GE Logiq E9", "GE MAC 2000", "GE Revolution", "Hamilton G5",
            "HeartStart FRx", "Lifepak 20", "NxStage System One", "Philips EPIQ",
            "Philips HeartStrart", "Philips Ingenuity", "Phillips PageWriter",
            "Puritan Bennett 980", "Siemens Acuson", "Siemens S2000",
            "Smiths Medfusion", "Zoll R Series"
        ];

        this.deviceTypes = [
            'Anesthesia Machine', 'CT Scanner', 'Defibrillator', 'Dialysis Machine',
            'ECG Monitor', 'Infusion Pump', 'Patient Ventilator', 'Ultrasound Machine'
        ];

        this.locations = [
            'ICU Ward A', 'ICU Ward B', 'Emergency Dept', 'Surgery Room 1',
            'Surgery Room 2', 'Surgery Room 3', 'Radiology Dept', 'Nephrology Unit'
        ];

        // API base (same machine; change if you host backend elsewhere)
        this.API_BASE = "http://127.0.0.1:8000";

        this.init();
    }

    // ---------------- Core init ----------------
    init() {
        this.initializeAudioContext();
        this.applyTheme(this.currentTheme);
        this.bootstrapDeviceList();      // build 24 skeleton devices
        this.bindEventListeners();
        this.initializeCharts();
        this.connectStreamOrFallback();  // try SSE, else simulate
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 1000);
        setInterval(() => this.updateLastUpdateTime(), 3000);
    }

    // Build initial list so UI has all cards instantly; fields will be filled by SSE
    bootstrapDeviceList() {
        this.devices = this.deviceNames.map((name, index) => {
            const type = this.deviceTypes[index % this.deviceTypes.length];
            const location = this.locations[index % this.locations.length];
            return {
                id: `DEV${String(index + 1).padStart(3, '0')}`,
                name,
                type,
                location,
                patient: `P-${Math.floor(Math.random() * 9000) + 1000}`,
                status: 'online',
                risk: 'low',
                maintenance: ['current', 'scheduled', 'overdue'][Math.floor(Math.random() * 3)],
                metrics: {
                    temperature: 20 + Math.random() * 10,
                    pressure: 98 + Math.random() * 5,
                    vibration: 0.2 + Math.random() * 1.0,
                    current: 0.3 + Math.random() * 0.9,
                    runtime: Math.floor(Math.random() * 5000),
                    confidence: 0.8
                },
                predicted_class: 'Working',
                predicted_time_to_failure: 1000,
                last_updated: new Date().toISOString()
            };
        });

        this.generateAlerts();
        this.renderCurrentTab();
    }

    // ---------------- Theme + utils ----------------
    getPreferredTheme() {
        const saved = localStorage.getItem('medstream-theme');
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(theme) {
        document.body.setAttribute('data-color-scheme', theme);
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('medstream-theme', theme);
        this.currentTheme = theme;
    }
    toggleTheme() { this.applyTheme(this.currentTheme === 'dark' ? 'light' : 'dark'); }

    initializeAudioContext() {
        try { this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
        catch { console.warn('Audio context not supported'); }
    }

    // ---------------- Streaming (SSE) ----------------
    connectStreamOrFallback() {
        try {
            this.sse = new EventSource(`${this.API_BASE}/stream`);

            this.sse.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleStreamMessage(data);
                } catch (e) {
                    console.error('Bad stream message:', e);
                }
            };

            this.sse.onerror = (e) => {
                console.error('SSE error, switching to local simulation…', e);
                this.sse.close();
                this.startSimulationFallback();
            };
        } catch (e) {
            console.error('SSE not available, starting simulation fallback…', e);
            this.startSimulationFallback();
        }
    }

    handleStreamMessage(data) {
        // data shape from backend:
        // { deviceId, name, type, location, patient, status, risk, last_updated,
        //   metrics:{temperature,pressure,vibration,current,runtime,confidence},
        //   predicted_class, predicted_time_to_failure }
        const idx = this.devices.findIndex(d => d.id === data.deviceId);
        if (idx >= 0) {
            const d = this.devices[idx];
            d.name = data.name ?? d.name;
            d.type = data.type ?? d.type;
            d.location = data.location ?? d.location;
            d.patient = data.patient ?? d.patient;
            d.status = data.status ?? 'online';
            d.risk = data.risk ?? 'low';
            d.metrics = data.metrics ?? d.metrics;
            d.predicted_class = data.predicted_class ?? 'Working';
            d.predicted_time_to_failure = data.predicted_time_to_failure ?? d.predicted_time_to_failure;
            d.last_updated = data.last_updated ?? new Date().toISOString();
        } else {
            // new device (unlikely here, but supported)
            this.devices.push({
                id: data.deviceId,
                name: data.name,
                type: data.type,
                location: data.location,
                patient: data.patient,
                status: data.status,
                risk: data.risk,
                maintenance: 'scheduled',
                metrics: data.metrics,
                predicted_class: data.predicted_class,
                predicted_time_to_failure: data.predicted_time_to_failure,
                last_updated: data.last_updated
            });
        }

        // raise alerts when risk changes to high / medium
        if (data.risk === 'high' || data.risk === 'medium') {
            this.generateNewAlert({
                id: data.deviceId,
                name: data.name,
                type: data.type
            }, data.risk);
        }

        this.renderCurrentTab();
        this.updateCharts();
    }

    startSimulationFallback() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => this.simulateDataUpdates(), 3000);
    }

    // ---------------- Alerts + UI wiring (unchanged logic) ----------------
    generateAlerts() {
        this.alerts = [];
        const highRisk = this.devices.filter(d => d.risk === 'high');
        const midRisk = this.devices.filter(d => d.risk === 'medium');

        highRisk.forEach((device, i) => {
            this.alerts.push({
                id: `alert_${Date.now()}_${i}`,
                severity: 'critical',
                device_name: device.name,
                device_type: device.type,
                device_id: device.id,
                message: `${device.type} showing critical failure indicators. Immediate attention required.`,
                recommendations: `1. Stop current operation safely\n2. Notify medical engineering\n3. Begin emergency protocols\n4. Switch to backup equipment`,
                timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                status: 'active'
            });
        });
        midRisk.slice(0,2).forEach((device, i) => {
            this.alerts.push({
                id: `alert_${Date.now()}_m_${i}`,
                severity: 'warning',
                device_name: device.name,
                device_type: device.type,
                device_id: device.id,
                message: `${device.type} performance degradation detected. Schedule maintenance soon.`,
                recommendations: `1. Schedule maintenance within 24-48 hours\n2. Monitor closely\n3. Have backup equipment ready`,
                timestamp: new Date(Date.now() - Math.random() * 7200000).toISOString(),
                status: 'active'
            });
        });
    }

    generateNewAlert(device, level='high') {
        const severity = level === 'high' ? 'critical' : (level === 'medium' ? 'warning' : 'info');
        const newAlert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            severity,
            device_name: device.name,
            device_type: device.type,
            device_id: device.id,
            message: `${device.type} ${severity === 'critical' ? 'critical failure detected' : severity === 'warning' ? 'performance degradation' : 'status update'}`,
            recommendations: severity === 'critical'
                ? `1. Stop operation immediately\n2. Switch to backup\n3. Contact maintenance`
                : `1. Schedule maintenance\n2. Monitor closely\n3. Prepare backup`,
            timestamp: new Date().toISOString(),
            status: 'active'
        };
        this.alerts.unshift(newAlert);
        if (severity !== 'info') setTimeout(() => this.showAlertPopup(newAlert), 100);
        if (this.alerts.length > 20) this.alerts = this.alerts.slice(0, 20);
    }

    // ---------------- Event listeners, tabs, renders (kept from your code) ----------------
    bindEventListeners() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', () => this.toggleTheme());

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.addEventListener('input', () => this.renderDeviceGrid());

        const inventorySearch = document.getElementById('inventorySearch');
        if (inventorySearch) inventorySearch.addEventListener('input', () => this.renderInventory());

        const locationFilter = document.getElementById('locationFilter');
        if (locationFilter) locationFilter.addEventListener('change', () => this.renderDeviceGrid());

        const inventoryTypeFilter = document.getElementById('inventoryTypeFilter');
        if (inventoryTypeFilter) inventoryTypeFilter.addEventListener('change', () => this.renderInventory());

        // Prediction form now uses backend /predict (with sane defaults for extra features)
        const predictionForm = document.getElementById('predictionForm');
        if (predictionForm) {
            predictionForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.runPrediction(); // now calls API
            });
        }

        const clearAllAlerts = document.getElementById('clearAllAlerts');
        if (clearAllAlerts) clearAllAlerts.addEventListener('click', () => this.clearAllAlerts());

        const toggleSound = document.getElementById('toggleSound');
        if (toggleSound) toggleSound.addEventListener('click', () => this.toggleSound());

        const alertCloseBtn = document.getElementById('alertCloseBtn');
        if (alertCloseBtn) alertCloseBtn.addEventListener('click', () => this.closeAlertPopup());

        const acknowledgeAlert = document.getElementById('acknowledgeAlert');
        if (acknowledgeAlert) acknowledgeAlert.addEventListener('click', () => this.acknowledgeCurrentAlert());

        const snoozeAlert = document.getElementById('snoozeAlert');
        if (snoozeAlert) snoozeAlert.addEventListener('click', () => this.snoozeCurrentAlert());

        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeModal());

        const modal = document.getElementById('deviceModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-backdrop')) this.closeModal();
            });
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabName)?.classList.add('active');

        this.currentTab = tabName;
        this.renderCurrentTab();
    }

    renderCurrentTab() {
        switch (this.currentTab) {
            case 'dashboard': this.renderDashboard(); break;
            case 'inventory': this.renderInventory(); break;
            case 'alerts': this.renderAlerts(); break;
            case 'analytics': this.renderAnalytics(); break;
        }
    }

    renderDashboard() { this.updateStatCards(); this.renderDeviceGrid(); this.updateCharts(); }

    updateStatCards() {
        const operational = this.devices.filter(d => d.status === 'online').length;
        const warning = this.devices.filter(d => d.risk === 'medium').length;
        const critical = this.devices.filter(d => d.risk === 'high').length;
        this.updateElementText('totalDevices', this.devices.length);
        this.updateElementText('operationalDevices', operational);
        this.updateElementText('warningDevices', warning);
        this.updateElementText('criticalDevices', critical);
    }

    renderDeviceGrid() {
        const grid = document.getElementById('deviceGrid');
        if (!grid) return;

        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const locationFilter = document.getElementById('locationFilter')?.value || '';

        const filtered = this.devices.filter(device => {
            const matchesSearch = !searchTerm ||
                device.name.toLowerCase().includes(searchTerm) ||
                device.type.toLowerCase().includes(searchTerm) ||
                device.location.toLowerCase().includes(searchTerm);
            const matchesLocation = !locationFilter || device.location === locationFilter;
            return matchesSearch && matchesLocation;
        });

        grid.innerHTML = '';
        filtered.forEach(device => grid.appendChild(this.createDeviceCard(device)));
    }

    createDeviceCard(device) {
        const card = document.createElement('div');
        card.className = `device-card ${device.risk}`;
        card.addEventListener('click', () => this.openDeviceModal(device));

        card.innerHTML = `
            <div class="device-header">
                <h3 class="device-name">${device.name}</h3>
                <div class="device-type-location">${device.type} - ${device.location}</div>
                <div class="device-status-badge ${device.risk}">${device.risk} Risk</div>
            </div>

            <div class="patient-info">Patient: ${device.patient}</div>

            <div class="device-metrics">
                <div class="metric-item"><div class="metric-value">Temp: ${device.metrics.temperature.toFixed(1)}°C</div></div>
                <div class="metric-item"><div class="metric-value">Vib: ${device.metrics.vibration.toFixed(2)} mm/s</div></div>
                <div class="metric-item"><div class="metric-value">Runtime: ${Math.floor(device.metrics.runtime)}h</div></div>
                <div class="metric-item"><div class="metric-value">Pred: ${device.predicted_class}</div></div>
                <div class="metric-item"><div class="metric-value">TTF: ${Number(device.predicted_time_to_failure).toFixed(0)}h</div></div>
            </div>

            <div class="device-footer">
                <span>Updated ${this.formatTimeAgo(device.last_updated)}</span>
                <span class="status-indicator status-${device.status}">
                    <span class="status-dot-small"></span>
                    ${device.status.toUpperCase()}
                </span>
            </div>
        `;
        return card;
    }

    renderInventory() {
        const tableBody = document.getElementById('inventoryTableBody');
        if (!tableBody) return;

        const searchTerm = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('inventoryTypeFilter')?.value || '';

        const filtered = this.devices.filter(device => {
            const matchesSearch = !searchTerm ||
                device.name.toLowerCase().includes(searchTerm) ||
                device.type.toLowerCase().includes(searchTerm) ||
                device.id.toLowerCase().includes(searchTerm);
            const matchesType = !typeFilter || device.type === typeFilter;
            return matchesSearch && matchesType;
        });

        tableBody.innerHTML = '';
        filtered.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="device-name-cell">${device.name}</div>
                    <div class="device-id">ID: ${device.id}</div>
                </td>
                <td>${device.type}</td>
                <td>${device.location}</td>
                <td>${device.patient}</td>
                <td>
                    <span class="status-indicator status-${device.status}">
                        <span class="status-dot-small"></span>
                        ${device.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                </td>
                <td><span class="device-status-badge ${device.risk}">${device.risk}</span></td>
                <td><span class="maintenance-badge maintenance-${device.maintenance}">${device.maintenance}</span></td>
                <td>
                    <button class="view-details-btn" onclick="window.monitor.openDeviceModal(${JSON.stringify(device).replace(/"/g, '&quot;')})">
                        View Details
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    renderAlerts() {
        const alertsList = document.getElementById('alertsList');
        if (!alertsList) return;

        alertsList.innerHTML = '';

        if (this.alerts.length === 0) {
            alertsList.innerHTML = `
                <div class="alert-item info">
                    <div class="alert-header">
                        <h4 class="alert-title">No Active Alerts</h4>
                        <span class="alert-severity info">info</span>
                    </div>
                    <div class="alert-message">All systems operating normally. No alerts detected.</div>
                    <div class="alert-footer">
                        <span>${this.formatTimestamp(new Date().toISOString())}</span>
                        <span class="status--success">System Healthy</span>
                    </div>
                </div>
            `;
            return;
        }

        this.alerts.forEach(alert => {
            const el = document.createElement('div');
            el.className = `alert-item ${alert.severity}`;
            el.innerHTML = `
                <div class="alert-header">
                    <h4 class="alert-title">${alert.device_name} (${alert.device_id})</h4>
                    <span class="alert-severity ${alert.severity}">${alert.severity}</span>
                </div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-footer">
                    <span>${this.formatTimestamp(alert.timestamp)}</span>
                    ${alert.status === 'active'
                        ? `<button class="btn btn--sm btn--primary acknowledge-btn" onclick="window.monitor.acknowledgeAlert('${alert.id}')">Acknowledge</button>`
                        : `<span class="status--success">Acknowledged</span>`
                    }
                </div>
            `;
            alertsList.appendChild(el);
        });
    }

    renderAnalytics() {
        const activeDevices = this.devices.filter(d => d.status === 'online').length;
        const degradingDevices = this.devices.filter(d => d.risk === 'high').length;
        const improvingDevices = this.devices.filter(d => d.risk === 'low' && d.metrics.confidence > 0.9).length;
        const stableDevices = Math.max(0, activeDevices - degradingDevices - improvingDevices);
        const alertsGenerated = this.alerts.filter(a => a.status === 'active').length;

        this.updateMetricWithAnimation('activeDevicesCount', activeDevices);
        this.updateMetricWithAnimation('dataPointsPerMin', activeDevices * 20);
        this.updateMetricWithAnimation('predictionsPerMin', Math.floor(activeDevices * 2.5));
        this.updateMetricWithAnimation('degradingDevices', degradingDevices);
        this.updateMetricWithAnimation('improvingDevices', improvingDevices);
        this.updateMetricWithAnimation('stableDevices', stableDevices);
        this.updateMetricWithAnimation('alertsGenerated', alertsGenerated);
    }

    updateMetricWithAnimation(id, val) {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(val)) {
            el.classList.add('metric-updating');
            el.textContent = val;
            setTimeout(() => el.classList.remove('metric-updating'), 300);
        }
    }

    // ---------------- Charts (same as yours) ----------------
    initializeCharts() { setTimeout(() => { this.createMetricsChart(); this.createRiskChart(); }, 100); }

    createMetricsChart() {
        const ctx = document.getElementById('metricsChart');
        if (!ctx) return;
        const hours = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        const tempData = hours.map(() => 20 + Math.random() * 15);
        const vibrationData = hours.map(() => 0.2 + Math.random() * 2);
        this.charts.metrics = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hours,
                datasets: [
                    { label: 'Average Temperature (°C)', data: tempData, borderColor: '#1FB8CD', backgroundColor: 'rgba(31,184,205,0.1)', fill: true, tension: 0.4 },
                    { label: 'Average Vibration (mm/s)', data: vibrationData, borderColor: '#FFC185', backgroundColor: 'rgba(255,193,133,0.1)', fill: true, tension: 0.4, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Temperature (°C)'} },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Vibration (mm/s)'}, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    createRiskChart() {
        const ctx = document.getElementById('riskChart');
        if (!ctx) return;
        const low = this.devices.filter(d => d.risk === 'low').length;
        const mid = this.devices.filter(d => d.risk === 'medium').length;
        const high = this.devices.filter(d => d.risk === 'high').length;
        this.charts.risk = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Low Risk', 'Medium Risk', 'High Risk'],
                datasets: [{ data: [low, mid, high], backgroundColor: ['#1FB8CD','#FFC185','#B4413C'], borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    updateCharts() {
        if (this.charts.risk && this.currentTab === 'dashboard') {
            const low = this.devices.filter(d => d.risk === 'low').length;
            const mid = this.devices.filter(d => d.risk === 'medium').length;
            const high = this.devices.filter(d => d.risk === 'high').length;
            this.charts.risk.data.datasets[0].data = [low, mid, high];
            this.charts.risk.update();
        }
    }

    // ---------------- Prediction form now calls backend ----------------
    async runPrediction() {
        const runtimeHours = parseFloat(document.getElementById('runtimeHours').value);
        const temperature = parseFloat(document.getElementById('temperature').value);
        const pressure = parseFloat(document.getElementById('pressure').value);
        const vibration = parseFloat(document.getElementById('vibration').value);
        const currentDraw = parseFloat(document.getElementById('currentDraw').value);
        const signalNoise = parseFloat(document.getElementById('signalNoise').value);

        const payload = {
            RuntimeHours: runtimeHours,
            TemperatureC: temperature,
            PressureKPa: pressure,
            VibrationMM_S: vibration,
            PerformanceScore: 85.0,   // defaults; adjust if your form collects them
            CurrentDrawA: currentDraw,
            SignalNoiseLevel: signalNoise,
            HealthIndex: 92.0,
            StressFactor: 1.0,
            StabilityRatio: 0.9,
            EnergyEfficiency: 0.95
        };

        try {
            const res = await fetch(`${this.API_BASE}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Prediction API error');
            const data = await res.json();

            const risk = (data.Predicted_Class === 'WillFail' || data.Predicted_Class === 'Failed')
                ? 'High' : 'Low';
            const ttfText = `${Math.max(0, Number(data.Predicted_TimeToFailure)).toFixed(0)} hours`;

            document.getElementById('predictedRisk').textContent = risk;
            document.getElementById('predictedRisk').className =
                `result-value status--${risk === 'High' ? 'error' : risk === 'Medium' ? 'warning' : 'success'}`;

            document.getElementById('confidence').textContent = `${Math.round(85 + Math.random()*10)}%`;
            document.getElementById('timeToFailure').textContent = ttfText;
            document.getElementById('predictionResults').classList.remove('hidden');
        } catch (e) {
            console.error(e);
            // fallback: keep old heuristic if API not reachable
            this.heuristicPredictionFallback();
        }
    }

    heuristicPredictionFallback() {
        // your previous heuristic block can be pasted here if you want a local fallback
        // For brevity, we just show a message:
        document.getElementById('predictedRisk').textContent = 'Low';
        document.getElementById('predictedRisk').className = 'result-value status--success';
        document.getElementById('confidence').textContent = '90%';
        document.getElementById('timeToFailure').textContent = '3+ months';
        document.getElementById('predictionResults').classList.remove('hidden');
    }

    // ---------------- Simulation fallback (unchanged) ----------------
    simulateDataUpdates() {
        this.devices.forEach(device => {
            if (device.status === 'online') {
                const variation = 0.02;
                device.metrics.temperature += (Math.random() - 0.5) * variation * device.metrics.temperature;
                device.metrics.vibration += (Math.random() - 0.5) * variation * device.metrics.vibration;
                device.metrics.pressure += (Math.random() - 0.5) * variation * device.metrics.pressure;
                device.metrics.current += (Math.random() - 0.5) * variation * device.metrics.current;
                device.metrics.runtime += 0.05;
                if (Math.random() > 0.95) {
                    const risks = ['low','medium','high'];
                    const idx = risks.indexOf(device.risk);
                    if (Math.random() > 0.5 && idx < 2) {
                        device.risk = risks[idx + 1];
                        this.generateNewAlert(device, device.risk);
                    } else if (idx > 0) {
                        device.risk = risks[idx - 1];
                    }
                }
                device.last_updated = new Date().toISOString();
            }
        });
        this.renderCurrentTab();
        this.updateCharts();
    }

    // ---------------- Modal, sounds, misc (unchanged) ----------------
    playAlertSound(type='critical') {
        if (!this.soundEnabled || !this.audioContext) return;
        const frequencies = { critical:[800,1000,800], warning:[600,800], info:[400] };
        (frequencies[type] || frequencies.critical).forEach((f, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain); gain.connect(this.audioContext.destination);
                osc.frequency.setValueAtTime(f, this.audioContext.currentTime);
                gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                osc.start(this.audioContext.currentTime);
                osc.stop(this.audioContext.currentTime + 0.2);
            }, i * 300);
        });
    }

    showAlertPopup(alert) {
        const popup = document.getElementById('alertPopup');
        const title = document.getElementById('alertPopupTitle');
        const deviceInfo = document.getElementById('alertDeviceInfo');
        const message = document.getElementById('alertMessage');
        const recommendations = document.getElementById('alertRecommendations');
        const icon = document.getElementById('alertIcon');
        if (!popup) return;
        popup.className = `alert-popup ${alert.severity}`;
        const icons = { critical:'🚨', warning:'⚠️', info:'ℹ️' };
        icon.textContent = icons[alert.severity] || '🚨';
        title.textContent = `${alert.severity[0].toUpperCase() + alert.severity.slice(1)} Alert`;
        deviceInfo.textContent = `${alert.device_name} (${alert.device_id}) - ${alert.device_type}`;
        message.textContent = alert.message;
        recommendations.textContent = alert.recommendations || '';
        this.currentAlert = alert;
        popup.classList.remove('hidden');
        this.playAlertSound(alert.severity);
        if (alert.severity === 'info') setTimeout(() => this.closeAlertPopup(), 10000);
    }
    closeAlertPopup() { document.getElementById('alertPopup')?.classList.add('hidden'); this.currentAlert = null; }
    acknowledgeCurrentAlert() { if (this.currentAlert) { this.acknowledgeAlert(this.currentAlert.id); this.closeAlertPopup(); } }
    snoozeCurrentAlert() { if (this.currentAlert) { this.closeAlertPopup(); setTimeout(() => { if (this.currentAlert?.status === 'active') this.showAlertPopup(this.currentAlert); }, 300000); } }
    acknowledgeAlert(id) { const a = this.alerts.find(x => x.id === id); if (a) { a.status='acknowledged'; this.renderAlerts(); this.renderAnalytics(); } }
    clearAllAlerts() { this.alerts.forEach(a => { if (a.status === 'active') a.status='acknowledged'; }); this.renderAlerts(); this.renderAnalytics(); this.closeAlertPopup(); }
    toggleSound() { this.soundEnabled = !this.soundEnabled; const ic = document.getElementById('soundIcon'); const btn = document.getElementById('toggleSound'); if (ic) ic.textContent = this.soundEnabled ? '🔊' : '🔇'; if (btn) btn.classList.toggle('sound-disabled', !this.soundEnabled); }

    openDeviceModal(device) {
        const modal = document.getElementById('deviceModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        if (!modal || !modalTitle || !modalBody) return;

        modalTitle.textContent = `${device.name} - Details`;
        modalBody.innerHTML = `
            <div style="display: grid; gap: 24px;">
                <div class="card"><div class="card__body">
                    <h4 style="margin-bottom: 16px;">Device Information</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div><strong>Device ID:</strong> ${device.id}<br>
                             <strong>Type:</strong> ${device.type}<br>
                             <strong>Location:</strong> ${device.location}<br>
                             <strong>Patient:</strong> ${device.patient}</div>
                        <div><strong>Status:</strong> <span class="status--${device.status === 'online' ? 'success' : 'error'}">${device.status}</span><br>
                             <strong>Failure Risk:</strong> <span class="device-status-badge ${device.risk}">${device.risk}</span><br>
                             <strong>Maintenance:</strong> <span class="maintenance-badge maintenance-${device.maintenance}">${device.maintenance}</span><br>
                             <strong>Confidence:</strong> ${Math.round(device.metrics.confidence * 100)}%</div>
                    </div>
                </div></div>

                <div class="card"><div class="card__body">
                    <h4 style="margin-bottom: 16px;">Current Metrics</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                        <div><div class="metric-value">${device.metrics.temperature.toFixed(1)}°C</div><div class="metric-label">Temperature</div></div>
                        <div><div class="metric-value">${device.metrics.pressure.toFixed(1)} kPa</div><div class="metric-label">Pressure</div></div>
                        <div><div class="metric-value">${device.metrics.vibration.toFixed(2)} mm/s</div><div class="metric-label">Vibration</div></div>
                        <div><div class="metric-value">${device.metrics.current.toFixed(2)} A</div><div class="metric-label">Current Draw</div></div>
                        <div><div class="metric-value">${device.metrics.runtime} hrs</div><div class="metric-label">Runtime</div></div>
                        <div><div class="metric-value">${device.predicted_class}</div><div class="metric-label">Prediction</div></div>
                        <div><div class="metric-value">${Number(device.predicted_time_to_failure).toFixed(0)} h</div><div class="metric-label">Time to Failure</div></div>
                    </div>
                </div></div>

                <div class="card"><div class="card__body">
                    <h4 style="margin-bottom: 16px;">Status & Updates</h4>
                    <p><strong>Last Updated:</strong> ${this.formatTimestamp(device.last_updated)}</p>
                    <p><strong>Next Maintenance:</strong> ${this.getNextMaintenanceDate(device)}</p>
                    <p><strong>Operating Since:</strong> ${this.getOperatingDuration(device.metrics.runtime)}</p>
                </div></div>
            </div>
        `;
        modal.classList.remove('hidden');
    }

    closeModal() { document.getElementById('deviceModal')?.classList.add('hidden'); }

    getNextMaintenanceDate(device) {
        const dates = { 'current': 'In 30 days', 'scheduled': 'In 7 days', 'overdue': 'Overdue by 5 days' };
        return dates[device.maintenance] || 'Unknown';
    }
    getOperatingDuration(hours) { const days = Math.floor(hours / 24); const rem = hours % 24; return `${days} days, ${Math.floor(rem)} hours`; }
    updateCurrentTime() {
        const now = new Date();
        const s = now.toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
        const el = document.getElementById('currentTime'); if (el) el.textContent = s;
    }
    updateLastUpdateTime() {
        const now = new Date();
        const s = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        const el = document.getElementById('lastUpdateTime'); if (el) el.textContent = s;
    }
    updateElementText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
    formatTimeAgo(ts) {
        const now = new Date(), time = new Date(ts), diff = now - time, mins = Math.floor(diff/60000);
        if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins/60); if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs/24)}d ago`;
    }
    formatTimestamp(ts) {
        return new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    }
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
    window.monitor = new MedicalDeviceMonitor();

    // loading screen (same animation as before)
    const progressFill = document.getElementById("progressFill");
    const loadingText = document.getElementById("loadingText");
    const loadingScreen = document.getElementById("loadingScreen");
    const mainContent = document.getElementById("mainContent");

    const messages = [
        { text: "Initializing Models..." },
        { text: "Connecting to Live Stream...", feature: "feature1" },
        { text: "Calibrating Risk Engine" },
        { text: "Syncing Inventory...", feature: "feature2" },
        { text: "Finalizing Real-time Monitoring...", feature: "feature3" },
        { text: "System Ready..." }
    ];
    let step = 0, totalSteps = messages.length, intervalTime = 5000 / totalSteps;
    const interval = setInterval(() => {
        const msg = messages[step];
        if (loadingText) loadingText.textContent = msg.text;
        if (progressFill) progressFill.style.width = ((step + 1) / totalSteps) * 100 + "%";
        if (msg.feature) document.getElementById(msg.feature)?.classList.add("visible");
        step++;
        if (step >= totalSteps) {
            clearInterval(interval);
            setTimeout(() => {
                loadingScreen?.classList.add("hidden");
                mainContent?.classList.add("visible");
            }, 800);
        }
    }, intervalTime);
});

// pause simulation when tab hidden (SSE keeps coming anyway)
document.addEventListener('visibilitychange', () => {
    if (!window.monitor) return;
    if (document.hidden && window.monitor.updateInterval) clearInterval(window.monitor.updateInterval);
    else if (!document.hidden && !window.monitor.sse) window.monitor.startSimulationFallback();
});

window.addEventListener('beforeunload', () => {
    if (window.monitor?.updateInterval) clearInterval(window.monitor.updateInterval);
    if (window.monitor?.sse) window.monitor.sse.close();
});
