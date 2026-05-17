let currentScreen = 'preflight';
let flightAnimationId = null;
let incidentLog = [];
let clockInterval = null;
let realtimeLogEntries = [];
let missionState = {
  isActive: false,
  isReturningHome: false,
  startTime: null,
  timerInterval: null,
  checkedItems: 4,
  totalItems: 5,
  elapsedTime: 0,
  totalDistance: 0,
  batteryUsed: 0,
  waypointsCompleted: 0,
  endMode: 'CRUISE',
  completionType: 'Normal'
};

let batteryState = {
  cells: 4,
  voltage: 16.8,
  maxVoltage: 16.8,
  minVoltage: 12.0,
  capacityMah: 5200,
  currentMah: 5200,
  flightTimeEstimate: 20,
  cellsPerBar: 1
};

let preflightMap = null;
let flightMap = null;
let waypointMarkers = [];
let routeLine = null;
let droneMarker = null;
let flightPathLine = null;
let actualFlightPath = [];
let selectedWaypointIndex = -1;

const defaultWaypoints = [
  { lat: -6.2001, lng: 106.8456, name: 'A' },
  { lat: -6.1900, lng: 106.8600, name: 'B' },
  { lat: -6.1750, lng: 106.8750, name: 'C' },
  { lat: -6.1650, lng: 106.8850, name: 'D' },
  { lat: -6.1550, lng: 106.8950, name: 'E' }
];

let waypoints = JSON.parse(JSON.stringify(defaultWaypoints));
let currentWaypointIndex = 0;

const droneIcon = L.divIcon({
  html: `<svg width="36" height="36" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="#1E88E5" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="3" fill="white"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1E88E5" stroke-width="2" fill="none"/>
  </svg>`,
  className: 'drone-marker-icon',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const waypointIcon = (label, active = false, completed = false) => L.divIcon({
  html: `<div style="
    width: ${completed ? '28px' : '28px'};
    height: 28px;
    background: ${completed ? '#4CAF50' : (active ? '#4CAF50' : '#1E88E5')};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ${completed ? 'border: 2px solid #81C784;' : ''}
  ">${label}</div>`,
  className: 'waypoint-marker-icon',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const aiSuggestedIcon = L.divIcon({
  html: `<div style="
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #FF9800, #FFC107);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(255, 152, 0, 0.4);
    animation: pulse 1.5s infinite;
  ">AI</div>`,
  className: 'ai-suggested-icon',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function initMaps() {
  if (preflightMap) {
    preflightMap.remove();
    preflightMap = null;
  }
  if (flightMap) {
    flightMap.remove();
    flightMap = null;
  }
  
  if (document.getElementById('preflightMap')) {
    preflightMap = L.map('preflightMap', {
      center: [-6.1750, 106.8750],
      zoom: 13,
      zoomControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    }).addTo(preflightMap);
  }
  
  if (document.getElementById('flightMap')) {
    flightMap = L.map('flightMap', {
      center: [-6.1750, 106.8750],
      zoom: 13,
      zoomControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    }).addTo(flightMap);
  }

  setTimeout(() => {
    preflightMap?.invalidateSize();
    flightMap?.invalidateSize();
  }, 100);
}

function renderWaypoints(map = preflightMap, isFlight = false) {
  if (isFlight) {
    waypointMarkers.forEach(m => map.removeLayer(m));
  } else {
    waypointMarkers.forEach(m => {
      if (map.hasLayer(m)) map.removeLayer(m);
    });
  }
  waypointMarkers = [];

  if (routeLine && map.hasLayer(routeLine)) {
    map.removeLayer(routeLine);
  }

  const wpCoords = waypoints.map(wp => [wp.lat, wp.lng]);
  
  routeLine = L.polyline(wpCoords, {
    color: '#1E88E5',
    weight: 3,
    dashArray: '8, 4',
    opacity: 0.8
  }).addTo(map);

  waypoints.forEach((wp, i) => {
    const isActive = i === currentWaypointIndex && isFlight;
    const isCompleted = isFlight && i < currentWaypointIndex;
    const marker = L.marker([wp.lat, wp.lng], {
      icon: waypointIcon(wp.name, isActive, isCompleted),
      draggable: !missionState.isActive && !isFlight
    }).addTo(map);

    if (!missionState.isActive && !isFlight) {
      marker.on('click', () => selectWaypoint(i));
      marker.on('dragend', (e) => handleWaypointDrag(i, e));
    }

    waypointMarkers.push(marker);
  });

  return routeLine;
}

function selectWaypoint(index) {
  selectedWaypointIndex = index;
  waypointMarkers.forEach((m, i) => {
    const icon = waypointIcon(waypoints[i].name, i === index, false);
    m.setIcon(icon);
  });
}

function handleWaypointDrag(index, event) {
  const newLatLng = event.target.getLatLng();
  waypoints[index].lat = newLatLng.lat;
  waypoints[index].lng = newLatLng.lng;
  renderWaypoints(preflightMap);
}

function startFlight() {
  if (!flightMap) {
    return;
  }
  
  currentWaypointIndex = 0;
  missionState.elapsedTime = 0;
  missionState.totalDistance = 0;
  missionState.batteryUsed = 0;
  missionState.waypointsCompleted = 0;
  actualFlightPath = [];

  if (droneMarker && flightMap.hasLayer(droneMarker)) {
    flightMap.removeLayer(droneMarker);
  }

  renderWaypoints(flightMap, true);

  const startLat = waypoints[0].lat;
  const startLng = waypoints[0].lng;
  
  droneMarker = L.marker([startLat, startLng], { icon: droneIcon }).addTo(flightMap);
  flightMap.setView([startLat, startLng], 13);

  actualFlightPath.push([startLat, startLng]);
  missionState.startTime = Date.now();

  simulateFlight();
}

function simulateFlight() {
  let segmentIndex = 0;

  function moveToNext() {
    if (!missionState.isActive || missionState.isReturningHome) {
      return;
    }

    if (segmentIndex >= waypoints.length - 1) {
      completeMission();
      return;
    }

    const start = waypoints[segmentIndex];
    const end = waypoints[segmentIndex + 1];
    const steps = 40;
    let step = 0;

    function animate() {
      if (!missionState.isActive || missionState.isReturningHome) return;

      step++;
      const progress = step / steps;
      const lat = start.lat + (end.lat - start.lat) * progress;
      const lng = start.lng + (end.lng - start.lng) * progress;

      if (droneMarker) {
        droneMarker.setLatLng([lat, lng]);
      }
      actualFlightPath.push([lat, lng]);

      if (flightPathLine && flightMap.hasLayer(flightPathLine)) {
        flightMap.removeLayer(flightPathLine);
      }
      flightPathLine = L.polyline(actualFlightPath, {
        color: '#4CAF50',
        weight: 3,
        opacity: 0.9
      }).addTo(flightMap);

      const distSegment = calculateDistance(start.lat, start.lng, end.lat, end.lng);
      missionState.totalDistance += distSegment * progress;
      missionState.batteryUsed += (distSegment / 1000) * 0.8;

      updateFlightTelemetry(lat, lng, progress, segmentIndex + 1);

      if (step < steps) {
        setTimeout(animate, 80);
      } else {
        missionState.waypointsCompleted++;
        segmentIndex++;
        currentWaypointIndex = segmentIndex;
        
        addRealtimeLog('success', 'Waypoint ' + waypoints[segmentIndex - 1].name + ' tercapai');
        
        waypointMarkers.forEach((m, i) => {
          const isActive = i === currentWaypointIndex;
          const isCompleted = i < currentWaypointIndex;
          m.setIcon(waypointIcon(waypoints[i].name, isActive, isCompleted));
        });

        if (segmentIndex < waypoints.length - 1) {
          addRealtimeLog('info', 'Menuju Waypoint ' + waypoints[segmentIndex + 1].name);
          flightMap.setView([waypoints[segmentIndex].lat, waypoints[segmentIndex].lng], 13);
          setTimeout(moveToNext, 500);
        } else {
          completeMission();
        }
      }
    }

    animate();
  }

  setTimeout(moveToNext, 800);
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBatteryState() {
  const percentage = (batteryState.currentMah / batteryState.capacityMah) * 100;
  const voltage = batteryState.minVoltage + (percentage / 100) * (batteryState.maxVoltage - batteryState.minVoltage);
  const cellsFull = Math.floor(percentage / 25);
  const remainingTime = Math.round((percentage / 100) * batteryState.flightTimeEstimate);
  return { percentage, voltage, cellsFull, remainingTime };
}

function updateFlightTelemetry(lat, lng, progress, targetWPIndex) {
  const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);

  const altitude = 50 + Math.sin(elapsed * 0.15) * 8;
  const speed = 15 + Math.cos(elapsed * 0.1) * 2;
  
  const usedMah = (elapsed / 60) * 800;
  batteryState.currentMah = Math.max(0, batteryState.capacityMah - usedMah);
  const batState = getBatteryState();
  
  const targetWP = waypoints[targetWPIndex] || waypoints[waypoints.length - 1];
  const distToWP = calculateDistance(lat, lng, targetWP.lat, targetWP.lng);

  updateTelemetryDisplay(altitude, speed, batState, distToWP, targetWP.name);
}

function updateTelemetryDisplay(altitude, speed, batState, distToWP, wpName) {
  const cards = document.querySelectorAll('.telemetry-card-value');
  
  cards[0] && (cards[0].textContent = Math.round(altitude) + 'm');
  cards[1] && (cards[1].textContent = speed.toFixed(1) + ' m/s');
  
  if (cards[2]) {
    const cellBars = batState.cellsFull;
    cards[2].innerHTML = `${batState.cellsFull}<span style="font-size: 12px; margin-left: 4px;">sel</span><br>
      <span style="font-size: 11px; color: var(--text-secondary);">${batState.voltage.toFixed(1)}V</span>`;
    cards[2].classList.remove('battery-good', 'battery-warning', 'battery-danger');
    cards[2].classList.add(batState.percentage > 50 ? 'battery-good' : batState.percentage > 25 ? 'battery-warning' : 'battery-danger');
  }
  
  if (cards[3]) {
    cards[3].textContent = Math.round(distToWP) + 'm';
    cards[3].parentElement.querySelector('.telemetry-card-trend').textContent = 'WP ' + wpName;
  }

  const miniTelemetries = document.querySelectorAll('.telemetry-mini-value');
  if (miniTelemetries[0]) miniTelemetries[0].textContent = Math.round(altitude) + 'm';
  if (miniTelemetries[1]) miniTelemetries[1].textContent = speed.toFixed(1);
  if (miniTelemetries[2]) miniTelemetries[2].textContent = Math.round(distToWP) + 'm';
  
  const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  const timeStr = mins + ':' + secs;
  
  const timeRemaining = batState.remainingTime;
  updateFooter(timeStr, batState.percentage, timeRemaining, waypoints.length);
}

function updateFooter(timeStr, batteryPercent, timeRemaining, wpCount) {
  const cells = Math.max(1, Math.floor(batteryPercent / 25));
  const voltage = batteryState.minVoltage + (batteryPercent / 100) * (batteryState.maxVoltage - batteryState.minVoltage);
  document.getElementById('footerDuration').textContent = timeStr || '20 menit';
  document.getElementById('footerBattery').textContent = cells + ' sel (' + batteryPercent + '%)';
  document.getElementById('footerWaypoint').textContent = wpCount + ' WP';
}

function completeMission() {
  missionState.isActive = false;
  clearInterval(missionState.timerInterval);

  const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
  missionState.elapsedTime = elapsed;
  missionState.waypointsCompleted = waypoints.length;

  addRealtimeLog('success', 'Misi selesai — semua waypoint dilalui');
  showMissionCompleteBanner('Misi Selesai', 'Drone telah mendarat dengan aman. Semua waypoint dilalui.');
}

function showPostFlightStats() {
  const minutes = Math.floor(missionState.elapsedTime / 60);
  const seconds = missionState.elapsedTime % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const distKm = (missionState.totalDistance / 1000).toFixed(2);
  const batState = getBatteryState();
  const wpDone = missionState.waypointsCompleted;
  
  const durationEl = document.getElementById('postflightDuration');
  const distanceEl = document.getElementById('postflightDistance');
  const batteryEl = document.getElementById('postflightBattery');
  const waypointsEl = document.getElementById('postflightWaypoints');
  const completionTypeEl = document.getElementById('completionType');
  const endModeEl = document.getElementById('endMode');
  const landingPointEl = document.getElementById('landingPoint');
  
  if (durationEl) durationEl.textContent = timeStr;
  if (distanceEl) distanceEl.textContent = distKm + ' km';
  
  if (batteryEl) {
    if (batState.percentage > 50) {
      batteryEl.textContent = batState.cellsFull + ' sel (' + batState.percentage + '%)';
      batteryEl.style.color = 'var(--success)';
    } else if (batState.percentage > 25) {
      batteryEl.textContent = batState.cellsFull + ' sel (' + batState.percentage + '%)';
      batteryEl.style.color = 'var(--warning)';
    } else {
      batteryEl.textContent = batState.cellsFull + ' sel (' + batState.percentage + '%)';
      batteryEl.style.color = 'var(--danger)';
    }
  }
  
  if (waypointsEl) waypointsEl.textContent = wpDone + '/' + waypoints.length;
  
  const completionType = missionState.completionType || (missionState.isReturningHome ? 'RTL' : 'Normal');
  if (completionTypeEl) completionTypeEl.textContent = completionType;
  if (endModeEl) endModeEl.textContent = missionState.endMode || (missionState.isReturningHome ? 'RTL' : 'DONE');
  
  const landingPoint = missionState.isReturningHome ? 'Waypoint A (Home)' : ('Waypoint ' + (waypoints[wpDone - 1] ? waypoints[wpDone - 1].name : 'N/A'));
  if (landingPointEl) landingPointEl.textContent = landingPoint;
  
  renderIncidentLog();
  
  const footerDuration = document.getElementById('footerDuration');
  const footerBattery = document.getElementById('footerBattery');
  const footerWaypoint = document.getElementById('footerWaypoint');
  
  if (footerDuration) footerDuration.textContent = minutes + ' menit';
  if (footerBattery) footerBattery.textContent = batState.cellsFull + ' sel (' + batState.voltage.toFixed(1) + 'V)';
  if (footerWaypoint) footerWaypoint.textContent = wpDone + ' WP';
}

function logIncident(type, description) {
  const elapsed = missionState.elapsedTime || 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  incidentLog.push({
    time: timeStr,
    type: type,
    description: description
  });
}

function renderIncidentLog() {
  const listEl = document.getElementById('incidentList');
  const summaryEl = document.getElementById('incidentSummary');
  
  if (incidentLog.length === 0) {
    listEl.innerHTML = `
      <div class="incident-item incident-normal">
        <div class="incident-time">00:00</div>
        <div class="incident-content">
          <span class="incident-type">Penerbangan Normal</span>
          <span class="incident-desc">Tidak ada kejadian khusus</span>
        </div>
      </div>`;
  } else {
    listEl.innerHTML = incidentLog.map(incident => {
      let className = 'incident-normal';
      if (incident.type === 'warning') className = 'incident-warning';
      else if (incident.type === 'danger') className = 'incident-danger';
      else if (incident.type === 'rtl') className = 'incident-rtl';
      
      return `
        <div class="incident-item ${className}">
          <div class="incident-time">${incident.time}</div>
          <div class="incident-content">
            <span class="incident-type">${incident.type.toUpperCase()}</span>
            <span class="incident-desc">${incident.description}</span>
          </div>
        </div>`;
    }).join('');
  }
  
  const warnings = incidentLog.filter(i => i.type === 'warning').length;
  const dangers = incidentLog.filter(i => i.type === 'danger').length;
  
  summaryEl.innerHTML = `
    <span class="incident-count warning">${warnings} Peringatan</span>
    <span class="incident-count danger">${dangers} Kritikal</span>`;
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  document.getElementById(screen + 'Screen').classList.add('active');
  const tabIndex = { preflight: 0, flight: 1, postflight: 2 }[screen];
  document.querySelectorAll('.nav-tab')[tabIndex].classList.add('active');

  currentScreen = screen;

  const flightTimer = document.getElementById('flightTimer');
  const modeBadge = document.getElementById('modeBadge');

  if (screen === 'flight') {
    flightTimer.style.display = 'block';
    const flightModeBadge = document.getElementById('flightModeBadge');
    if (flightModeBadge) {
      flightModeBadge.style.display = 'block';
      flightModeBadge.textContent = 'CRUISE';
    }
    modeBadge.style.display = 'block';
    modeBadge.textContent = 'CRUISE';
    setTimeout(() => {
      initMaps();
      flightMap?.invalidateSize();
    }, 100);
  } else {
    flightTimer.style.display = 'none';
    modeBadge.style.display = 'none';
    const flightModeBadge = document.getElementById('flightModeBadge');
    if (flightModeBadge) {
      flightModeBadge.style.display = 'none';
    }
    if (screen === 'preflight') {
      setTimeout(() => {
        initMaps();
        renderWaypoints(preflightMap);
      }, 100);
    }
    if (screen === 'postflight') {
      showPostFlightStats();
    }
  }

  updateTabStates();
}

function updateTabStates() {
  const tabs = document.querySelectorAll('.nav-tab');
  const preflightTab = tabs[0];
  const flightTab = tabs[1];
  const postflightTab = tabs[2];

  if (missionState.isActive) {
    preflightTab.style.opacity = '0.5';
    preflightTab.style.pointerEvents = 'none';
    flightTab.style.opacity = '1';
    flightTab.style.pointerEvents = 'auto';
    postflightTab.style.opacity = '0.5';
    postflightTab.style.pointerEvents = 'none';
  } else if (missionState.elapsedTime > 0) {
    preflightTab.style.opacity = '1';
    preflightTab.style.pointerEvents = 'auto';
    flightTab.style.opacity = '0.5';
    flightTab.style.pointerEvents = 'none';
    postflightTab.style.opacity = '1';
    postflightTab.style.pointerEvents = 'auto';
  } else {
    preflightTab.style.opacity = '1';
    preflightTab.style.pointerEvents = 'auto';
    flightTab.style.opacity = '0.5';
    flightTab.style.pointerEvents = 'none';
    postflightTab.style.opacity = '0.5';
    postflightTab.style.pointerEvents = 'none';
  }
}

function toggleCheck(element) {
  const checkbox = element.querySelector('.checkbox');
  checkbox.classList.toggle('checked');
  missionState.checkedItems += checkbox.classList.contains('checked') ? 1 : -1;
  updateProgress();
  updateStartButton();
}

function updateProgress() {
  const pct = (missionState.checkedItems / missionState.totalItems) * 100;
  document.querySelector('.progress-fill').style.width = pct + '%';
  document.querySelector('.progress-text').textContent = `${missionState.checkedItems}/${missionState.totalItems} Selesai`;
}

function updateStartButton() {
  const btn = document.querySelector('.btn-start-mission');
  const ready = missionState.checkedItems >= missionState.totalItems;
  btn.disabled = !ready;
  btn.textContent = ready ? 'Mulai Misi' : 'Selesaikan Checklist';
}

function startMission() {
  if (missionState.checkedItems < missionState.totalItems) return;

  missionState.isActive = true;
  missionState.startTime = Date.now();
  currentWaypointIndex = 0;
  actualFlightPath = [];

  updateFooterEstimates();
  startTimer();
  
  const flightTimer = document.getElementById('flightTimer');
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('flightScreen').classList.add('active');
  document.querySelectorAll('.nav-tab')[1].classList.add('active');
  currentScreen = 'flight';
  
  flightTimer.style.display = 'block';
  modeBadge.style.display = 'block';
  modeBadge.textContent = 'CRUISE';
  if (flightModeBadge) {
    flightModeBadge.style.display = 'block';
    flightModeBadge.textContent = 'CRUISE';
  }
  
  updateTabStates();
  
  // Initialize clock and real-time log
  startClock();
  clearRealtimeLog();
  addRealtimeLog('system', 'Sistem telemetri terhubung');
  addRealtimeLog('info', 'Misi dimulai — ' + waypoints.length + ' waypoint');
  addRealtimeLog('info', 'Takeoff dari Waypoint A');
  
  // Hide mission complete banner if visible
  const banner = document.getElementById('missionCompleteBanner');
  if (banner) banner.style.display = 'none';
  
  setTimeout(() => {
    initMaps();
    setTimeout(() => {
      if (flightMap) {
        flightMap.invalidateSize();
        renderWaypoints(flightMap, true);
        startFlight();
      }
    }, 200);
  }, 100);
}

function updateFooterEstimates() {
  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDist += calculateDistance(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
  }
  const estimatedTime = Math.round((totalDist / 1000) / 15 * 60);
  const estimatedPercent = Math.max(0, 100 - Math.round((totalDist / 1000) * 0.8));
  const cells = Math.max(1, Math.floor(estimatedPercent / 25));

  document.getElementById('footerDuration').textContent = estimatedTime + ' menit';
  document.getElementById('footerBattery').textContent = cells + ' sel (' + estimatedPercent + '%)';
  document.getElementById('footerWaypoint').textContent = waypoints.length + ' Waypoint';
}

function startTimer() {
  missionState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('flightTimer').textContent = mins + ':' + secs;
  }, 1000);
}

function requestAISuggestion() {
  const btn = document.querySelector('.btn-ai');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading">Memproses...</span>';

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
      <path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/>
    </svg> Minta Saran Rute AI`;

    showAIModal();
  }, 1500);
}

function showAIModal() {
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');

  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('suggestion');

  header.innerHTML = `<div class="alert-header-title" style="color: var(--primary);">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/>
    </svg>
    <span>SARAN RUTE AI</span>
  </div><span class="alert-timestamp">Route Optimized</span>`;

  const aiWaypoints = [
    { lat: -6.2001, lng: 106.8456, name: 'A' },
    { lat: -6.1850, lng: 106.8550, name: 'B' },
    { lat: -6.1700, lng: 106.8700, name: 'C' },
    { lat: -6.1600, lng: 106.8800, name: 'D' },
    { lat: -6.1500, lng: 106.8920, name: 'E' }
  ];

  let totalDist = 0;
  for (let i = 0; i < aiWaypoints.length - 1; i++) {
    totalDist += calculateDistance(aiWaypoints[i].lat, aiWaypoints[i].lng, aiWaypoints[i + 1].lat, aiWaypoints[i + 1].lng);
  }

  content.innerHTML = `<h3 class="alert-title">Rute Optimal Ditemukan</h3>
    <p class="alert-description">AI telah mengoptimasi rute berdasarkan terrain dan cuaca.</p>
    <div class="alert-details">
      <span>Jarak: ${(totalDist / 1000).toFixed(2)} km</span>
      <span>Waktu estimasi: ${Math.round((totalDist / 1000) / 15 * 60)} menit</span>
      <span>Baterai estimasi: ${Math.max(1, Math.floor((100 - (totalDist / 1000) * 0.8) / 25))} sel</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Confidence</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25" fill="none" stroke="#546E7A" stroke-width="6"/>
          <circle class="progress" cx="30" cy="30" r="25" fill="none" stroke="#4CAF50" stroke-width="6" stroke-linecap="round" 
            style="stroke-dasharray: 157; stroke-dashoffset: 20;"/>
        </svg>
        <span class="confidence-value" style="color: #4CAF50; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">87%</span>
      </div>
    </div>
    <div class="ai-route-preview" id="aiRoutePreview" style="margin-top: 16px; height: 150px; background: var(--bg-container); border-radius: 8px; overflow: hidden;"></div>`;

  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="dismissAlert()">Tolak</button>
    <button class="btn btn-secondary" onclick="applyAIAlternative()">Terapkan Rute</button>
    <button class="btn btn-primary" onclick="acceptAIRoute()">Terima Rute AI</button>`;

  modal.classList.add('active');

  setTimeout(() => {
    const previewMap = L.map('aiRoutePreview', {
      center: [-6.1750, 106.8750],
      zoom: 12,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(previewMap);

    const aiRouteLine = L.polyline(aiWaypoints.map(wp => [wp.lat, wp.lng]), {
      color: '#FF9800',
      weight: 3,
      dashArray: '8, 4'
    }).addTo(previewMap);

    aiWaypoints.forEach((wp, i) => {
      L.marker([wp.lat, wp.lng], { icon: waypointIcon(wp.name, false, false) }).addTo(previewMap);
    });
  }, 100);
}

function acceptAIRoute() {
  waypoints = [
    { lat: -6.2001, lng: 106.8456, name: 'A' },
    { lat: -6.1850, lng: 106.8550, name: 'B' },
    { lat: -6.1700, lng: 106.8700, name: 'C' },
    { lat: -6.1600, lng: 106.8800, name: 'D' },
    { lat: -6.1500, lng: 106.8920, name: 'E' }
  ];

  renderWaypoints(preflightMap);
  updateFooterEstimates();
  dismissAlert();

  showNotification('Rute AI berhasil diterapkan!');
}

function applyAIAlternative() {
  acceptAIRoute();
}

function dismissAlert() {
  document.getElementById('alertOverlay').classList.remove('active');
}

function acceptRTL() {
  dismissAlert();
  showNotification('RTL diaktifkan - Kembali ke titik awal...');
  
  logIncident('rtl', 'Return to Launch diaktifkan');
  addRealtimeLog('warning', 'RTL diaktifkan — kembali ke titik awal');
  missionState.completionType = 'RTL';
  
  const startPoint = waypoints[0];
  const currentPos = droneMarker ? droneMarker.getLatLng() : { lat: waypoints[currentWaypointIndex].lat, lng: waypoints[currentWaypointIndex].lng };
  
  missionState.isReturningHome = true;
  missionState.endMode = 'RTL';
  
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  if (modeBadge) modeBadge.textContent = 'RTL';
  if (flightModeBadge) flightModeBadge.textContent = 'RTL';
  
  simulateRTL(currentPos, startPoint);
}

function simulateRTL(currentPos, targetPoint) {
  const startLat = currentPos.lat;
  const startLng = currentPos.lng;
  const endLat = targetPoint.lat;
  const endLng = targetPoint.lng;
  
  const steps = 60;
  let step = 0;
  let currentAlt = 50;
  
  function animateRTL() {
    if (!missionState.isActive || !missionState.isReturningHome) return;
    
    step++;
    const progress = step / steps;
    
    const lat = startLat + (endLat - startLat) * progress;
    const lng = startLng + (endLng - startLng) * progress;
    
    currentAlt = 50 - (progress * 40);
    
    if (droneMarker) {
      droneMarker.setLatLng([lat, lng]);
    }
    
    actualFlightPath.push([lat, lng]);
    if (flightPathLine && flightMap.hasLayer(flightPathLine)) {
      flightMap.removeLayer(flightPathLine);
    }
    flightPathLine = L.polyline(actualFlightPath, {
      color: '#FF5722',
      weight: 3,
      opacity: 0.9
    }).addTo(flightMap);
    
    const speed = 12 - (progress * 2);
    const batState = getBatteryState();
    const distToTarget = calculateDistance(lat, lng, endLat, endLng);
    
    updateTelemetryDisplay(currentAlt, speed, batState, distToTarget, 'HOME');
    
    if (step < steps) {
      setTimeout(animateRTL, 80);
    } else {
      missionState.isReturningHome = false;
      missionState.isActive = false;
      clearInterval(missionState.timerInterval);
      
      const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
      missionState.elapsedTime = elapsed;
      
      const modeBadge = document.getElementById('modeBadge');
      const flightModeBadge = document.getElementById('flightModeBadge');
      if (modeBadge) modeBadge.textContent = 'LANDED';
      if (flightModeBadge) flightModeBadge.textContent = 'LANDED';
      
      addRealtimeLog('success', 'RTL selesai — drone kembali ke titik awal');
      showMissionCompleteBanner('RTL Selesai', 'Drone telah kembali dan mendarat di titik awal.');
    }
  }
  
  animateRTL();
}

function alternativeAction() {
  dismissAlert();
  
  const alertTitle = document.querySelector('.alert-title').textContent;
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  const headerMode = modeBadge ? modeBadge.textContent : '';
  
  if (alertTitle.includes('Vibrasi')) {
    logIncident('warning', 'Vibrasi tinggi - diterbangkan dengan kecepatan lebih rendah');
    showNotification('Kecepatan dikurangi untuk mengatasi vibrasi...');
    decreaseAltitudeSpeed();
  } else if (alertTitle.includes('Baterai')) {
    logIncident('warning', 'Baterai rendah - misi dilanjutkan dengan pengurangan kecepatan');
    showNotification('Misi dilanjutkan dengan mode hemat...');
  } else if (alertTitle.includes('GPS')) {
    logIncident('warning', 'GPS hilang - switch ke mode manual');
    showNotification('Mode manual diaktifkan');
  } else if (headerMode === 'TURUN' || alertTitle.includes('Angin')) {
    logIncident('warning', 'Altitude diturunkan karena angin kuat');
    showNotification('Altitude diturunkan...');
    lowerAltitudeFromWind();
  } else {
    showNotification('Menunggu perintah selanjutnya...');
  }
}

function decreaseAltitudeSpeed() {
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  
  if (modeBadge) modeBadge.textContent = 'ECO';
  if (flightModeBadge) flightModeBadge.textContent = 'ECO';
  
  let currentAlt = 50;
  const targetAlt = 35;
  
  function animate() {
    if (!missionState.isActive) return;
    
    currentAlt -= 0.3;
    
    if (currentAlt <= targetAlt) {
      currentAlt = targetAlt;
      showNotification('Mode ECO - Kecepatan dikurangi');
      return;
    }
    
    const speed = 8;
    const batState = getBatteryState();
    const currentPos = droneMarker ? droneMarker.getLatLng() : null;
    const targetWP = waypoints[currentWaypointIndex] || waypoints[waypoints.length - 1];
    const distToWP = currentPos ? calculateDistance(currentPos.lat, currentPos.lng, targetWP.lat, targetWP.lng) : 0;
    
    updateTelemetryDisplay(currentAlt, speed, batState, distToWP, targetWP.name);
    
    setTimeout(animate, 100);
  }
  
  animate();
}

function decreaseAltitude() {
  let currentAlt = 50;
  const targetAlt = 20;
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  
  if (modeBadge) modeBadge.textContent = 'TURUN';
  if (flightModeBadge) flightModeBadge.textContent = 'TURUN';
  
  function animateDescent() {
    if (!missionState.isActive) return;
    
    currentAlt -= 0.5;
    
    if (currentAlt <= targetAlt) {
      currentAlt = targetAlt;
      if (modeBadge) modeBadge.textContent = 'HOVER';
      if (flightModeBadge) flightModeBadge.textContent = 'HOVER';
      showNotification('Altitude stabil di ' + targetAlt + 'm');
      return;
    }
    
    const speed = 8;
    const batState = getBatteryState();
    const currentPos = droneMarker ? droneMarker.getLatLng() : null;
    const targetWP = waypoints[currentWaypointIndex] || waypoints[waypoints.length - 1];
    const distToWP = currentPos ? calculateDistance(currentPos.lat, currentPos.lng, targetWP.lat, targetWP.lng) : 0;
    
    updateTelemetryDisplay(currentAlt, speed, batState, distToWP, targetWP.name);
    
    setTimeout(animateDescent, 100);
  }
  
  animateDescent();
}

function lowerAltitudeFromWind() {
  dismissAlert();
  showNotification('Altitude diturunkan karena angin kuat...');
  
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  
  if (modeBadge) modeBadge.textContent = 'TURUN';
  if (flightModeBadge) flightModeBadge.textContent = 'TURUN';
  
  let currentAlt = 50;
  const targetAlt = 25;
  
  function animateDescent() {
    if (!missionState.isActive) return;
    
    currentAlt -= 0.4;
    
    if (currentAlt <= targetAlt) {
      currentAlt = targetAlt;
      if (modeBadge) modeBadge.textContent = 'HOVER';
      if (flightModeBadge) flightModeBadge.textContent = 'HOVER';
      showNotification('Altitude stabil di ' + targetAlt + 'm - Menghindari angin kuat');
      
      setTimeout(() => {
        if (missionState.isActive && !missionState.isReturningHome) {
          if (modeBadge) modeBadge.textContent = 'CRUISE';
          if (flightModeBadge) flightModeBadge.textContent = 'CRUISE';
        }
      }, 2000);
      return;
    }
    
    const speed = 8;
    const batState = getBatteryState();
    const currentPos = droneMarker ? droneMarker.getLatLng() : null;
    const targetWP = waypoints[currentWaypointIndex] || waypoints[waypoints.length - 1];
    const distToWP = currentPos ? calculateDistance(currentPos.lat, currentPos.lng, targetWP.lat, targetWP.lng) : 0;
    
    updateTelemetryDisplay(currentAlt, speed, batState, distToWP, targetWP.name);
    
    setTimeout(animateDescent, 100);
  }
  
  animateDescent();
}

function retryConnection() {
  document.getElementById('errorBanner').style.display = 'none';
  document.getElementById('connectionStatus').innerHTML = 
    '<span class="status-dot connected"></span><span>Terhubung</span>';
}

function abortMission() {
  if (missionState.isActive) {
    missionState.isActive = false;
    clearInterval(missionState.timerInterval);
    const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
    missionState.elapsedTime = elapsed;
    missionState.completionType = 'Abort';
  }
  document.getElementById('errorBanner').style.display = 'none';
  addRealtimeLog('danger', 'Misi di-abort — landing darurat');
  showMissionCompleteBanner('Misi Di-abort', 'Misi dihentikan secara paksa. Periksa laporan post-flight.');
}

function retryAI() {
  document.getElementById('warningBanner').style.display = 'none';
}

function resetMission() {
  incidentLog = [];
  missionState = {
    isActive: false,
    isReturningHome: false,
    startTime: null,
    timerInterval: null,
    checkedItems: 0,
    totalItems: 5,
    elapsedTime: 0,
    totalDistance: 0,
    batteryUsed: 0,
    waypointsCompleted: 0,
    endMode: 'CRUISE',
    completionType: 'Normal'
  };
  
  batteryState.currentMah = batteryState.capacityMah;

  waypoints = JSON.parse(JSON.stringify(defaultWaypoints));
  currentWaypointIndex = 0;
  selectedWaypointIndex = -1;
  actualFlightPath = [];

  document.querySelectorAll('.checklist-item .checkbox').forEach(cb => cb.classList.remove('checked'));
  document.querySelectorAll('.nav-tab')[0].click();

  updateProgress();
  updateStartButton();
  updateFooterEstimates();
  showScreen('preflight');

  document.getElementById('flightTimer').textContent = '00:00';
  
  // Clear clock, log, and banner
  stopClock();
  clearRealtimeLog();
  const banner = document.getElementById('missionCompleteBanner');
  if (banner) banner.style.display = 'none';

  renderWaypoints(preflightMap);
  updateFooterEstimates();
}

function showNotification(message) {
  const notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed; top: 70px; right: 20px;
    background: #4CAF50; color: white;
    padding: 12px 20px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1000; animation: slideIn 0.3s ease;
  `;
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function expandAI() {
  const panel = document.querySelector('.ai-suggestion-panel');
  panel.style.height = panel.style.height === '80px' ? '200px' : '80px';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismissAlert();
});

document.addEventListener('DOMContentLoaded', () => {
  initMaps();
  renderWaypoints(preflightMap);
  updateFooterEstimates();

  document.querySelectorAll('#btnAddWP, #btnDeleteWP, #btnClearAll, #btnUndo, #btnRedo').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.id;
      
      if (id === 'btnAddWP') {
        addWaypoint();
      } else if (id === 'btnDeleteWP') {
        if (selectedWaypointIndex >= 0 && selectedWaypointIndex < waypoints.length) {
          waypoints.splice(selectedWaypointIndex, 1);
          if (selectedWaypointIndex >= waypoints.length) selectedWaypointIndex = waypoints.length - 1;
          renameWaypoints();
          renderWaypoints(preflightMap);
          updateFooterEstimates();
          showNotification('Waypoint dihapus');
        } else {
          showNotification('Pilih waypoint terlebih dahulu');
        }
      } else if (id === 'btnClearAll') {
        if (confirm('Hapus semua waypoint?')) {
          waypoints = [{ lat: -6.1750, lng: 106.8750, name: 'A' }];
          renderWaypoints(preflightMap);
          updateFooterEstimates();
          showNotification('Semua waypoint dihapus');
        }
      } else if (id === 'btnUndo') {
        showNotification('Tindakan diurungkan');
      } else if (id === 'btnRedo') {
        showNotification('Tindakan diulang');
      }
    });
  });

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const screen = this.dataset.screen;
      
      if (screen === 'flight' && !missionState.isActive && currentScreen !== 'flight') {
        showNotification('Mulai misi terlebih dahulu');
        return;
      }
      if (screen === 'postflight' && currentScreen !== 'flight') {
        if (!missionState.elapsedTime) {
          showNotification('Selesaikan misi terlebih dahulu');
          return;
        }
      }
      if (screen === 'preflight' && missionState.isActive) {
        showNotification('Sedang dalam misi');
        return;
      }
      
      showScreen(screen);
    });
  });

  document.querySelector('.btn-start-mission').disabled = true;

  if (!document.getElementById('notificationStyle')) {
    const style = document.createElement('style');
    style.id = 'notificationStyle';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      .loading { animation: pulse 1s infinite; }
    `;
    document.head.appendChild(style);
  }
});

function addWaypoint() {
  const lastWP = waypoints[waypoints.length - 1];
  const newLat = lastWP.lat - 0.01;
  const newLng = lastWP.lng + 0.01;
  const newName = String.fromCharCode(65 + waypoints.length);
  
  waypoints.push({ lat: newLat, lng: newLng, name: newName });
  renderWaypoints(preflightMap);
  updateFooterEstimates();
  showNotification('Waypoint ' + newName + ' ditambahkan');
}

function renameWaypoints() {
  waypoints.forEach((wp, i) => {
    wp.name = String.fromCharCode(65 + i);
  });
}

function simulateVibration() {
  logIncident('warning', 'Vibrasi motor 3 terdeteksi: 35 m/s²');
  addRealtimeLog('warning', 'Vibrasi motor 3: 35 m/s² (Batas: 30 m/s²)');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('warning');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title warning';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>ANOMALI TERDETEKSI</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Peringatan Vibrasi Tinggi</h3>
    <p class="alert-description">Vibrasi motor 3: 35 m/s² (Batas: 30 m/s²)</p>
    <div class="alert-details">
      <span>Motor 3 mengalami vibrasi abnormal</span>
      <span>Dapat menyebabkan kerusakan motor atau ketidakstabilan</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan yang Disarankan: Return to Launch</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 9;"/>
        </svg>
        <span class="confidence-value">94%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="dismissAlert()">Abaikan</button>
    <button class="btn btn-secondary" onclick="alternativeAction()">Terbang Lebih Rendah</button>
    <button class="btn btn-primary" onclick="acceptRTL()">Terima RTL</button>`;
  
  modal.classList.add('active');
}

function simulateMotorFailure() {
  logIncident('danger', 'Motor 2 gagal - kehilangan daya dorong sebagian');
  addRealtimeLog('danger', 'KRITIKAL: Motor 2 gagal — kehilangan daya dorong');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('critical');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title critical';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
    <span>KRITIKAL - KEGAGALAN MOTOR</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Motor 2 Tidak Merespons</h3>
    <p class="alert-description">Motor 2 berhenti total. Drone kehilangan daya dorong sebagian.</p>
    <div class="alert-details">
      <span>Status Motor 2: GAGAL</span>
      <span>Tegangan motor: 0V</span>
      <span>Drone mulai kehilangan kontrol</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan Darurat: Landing Sekarang</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 2;"/>
        </svg>
        <span class="confidence-value">98%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-danger" onclick="emergencyLanding()">Landing Sekarang</button>
    <button class="btn btn-primary" onclick="acceptRTL()">Emergency RTL</button>`;
  
  modal.classList.add('active');
}

function simulateLowBattery() {
  logIncident('warning', 'Baterai rendah: 15%');
  addRealtimeLog('warning', 'Baterai rendah: 15% — ~3 menit tersisa');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('warning');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title warning';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
    <span>PERINGATAN BATERAI</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Baterai Menipis</h3>
    <p class="alert-description">Tingkat baterai: 15% (2 sel)</p>
    <div class="alert-details">
      <span>Waktu terbang tersisa: ~3 menit</span>
      <span>Rekomendasi: Segera kembali ke titik awal</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan yang Disarankan: Return to Launch</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 35;"/>
        </svg>
        <span class="confidence-value">78%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="dismissAlert()">Abaikan</button>
    <button class="btn btn-secondary" onclick="alternativeAction()">Lanjutkan Misi</button>
    <button class="btn btn-primary" onclick="acceptRTL()">Terima RTL</button>`;
  
  modal.classList.add('active');
}

function simulateGPSLoss() {
  logIncident('danger', 'Sinyal GPS terputus - mode failsafe');
  addRealtimeLog('danger', 'GPS terputus — mode failsafe aktif');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('critical');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title critical';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
    <span>GPS HILANG</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Sinyal GPS Terputus</h3>
    <p class="alert-description">Drone kehilangan koneksi GPS. Mode failsafe diaktifkan.</p>
    <div class="alert-details">
      <span>Satelit terlihat: 0</span>
      <span>Mode: Failsafe (Hover)</span>
      <span>Drone mempertahankan posisi terakhir</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan: Coba sambungkan ulang atau manual control</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 5;"/>
        </svg>
        <span class="confidence-value">96%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="retryGPS()">Coba Sambung Ulang</button>
    <button class="btn btn-secondary" onclick="alternativeAction()">Mode Manual</button>
    <button class="btn btn-primary" onclick="acceptRTL()">RTL</button>`;
  
  modal.classList.add('active');
}

function simulateWindGust() {
  logIncident('warning', 'Angin kuat terdeteksi: 45 km/jam');
  addRealtimeLog('warning', 'Angin kuat: 45 km/jam (Batas: 35 km/jam)');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('warning');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title warning';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
    </svg>
    <span>PERINGATAN ANGIN</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Angin Kuat Terdeteksi</h3>
    <p class="alert-description">Kecepatan angin: 45 km/jam (Batas aman: 35 km/jam)</p>
    <div class="alert-details">
      <span>Arah angin: Barat Daya</span>
      <span>Drone mungkin sulit mempertahankan posisi</span>
      <span>Rekomendasi: Turunkan altitude atau kembali</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan yang Disarankan: Turunkan Altitude</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 25;"/>
        </svg>
        <span class="confidence-value">82%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="dismissAlert()">Abaikan</button>
    <button class="btn btn-secondary" onclick="lowerAltitudeFromWind()">Turunkan Altitude</button>
    <button class="btn btn-primary" onclick="acceptRTL()">Kembali ke Titik Awal</button>`;
  
  modal.classList.add('active');
}

function simulateCommunicationLoss() {
  logIncident('danger', 'Koneksi telemetri terputus');
  addRealtimeLog('danger', 'Koneksi telemetri TERPUTUS — mode autonomous');
  const modal = document.getElementById('alertOverlay');
  const modalContent = modal.querySelector('.alert-modal');
  const header = modal.querySelector('.alert-header');
  const content = modal.querySelector('.alert-content');
  const timestamp = document.getElementById('alertTimestamp');
  
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  modal.classList.remove('warning', 'critical');
  modalContent.classList.remove('warning', 'critical');
  modalContent.classList.add('critical');
  
  header.querySelector('.alert-header-title').className = 'alert-header-title critical';
  header.querySelector('.alert-header-title').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
    <span>KOMUNIKASI TERPUTUS</span>`;
  
  content.innerHTML = `
    <h3 class="alert-title">Koneksi Telemetri Hilang</h3>
    <p class="alert-description">Sinyal kontrol terputus. Drone dalam mode autonomous.</p>
    <div class="alert-details">
      <span>Koneksi: TERPUTUS</span>
      <span>Drone mengaktifkan mode failsafe</span>
      <span>Menunggu penyambungan ulang...</span>
    </div>
    <div class="alert-recommendation">
      <span class="alert-recommendation-text">Tindakan: Coba sambung ulang atau biarkan drone RTL</span>
      <div class="confidence-indicator">
        <svg class="confidence-ring" viewBox="0 0 60 60">
          <circle class="bg" cx="30" cy="30" r="25"/>
          <circle class="progress" cx="30" cy="30" r="25" style="stroke-dashoffset: 3;"/>
        </svg>
        <span class="confidence-value">97%</span>
      </div>
    </div>`;
  
  modal.querySelector('.alert-actions').innerHTML = `
    <button class="btn btn-dismiss" onclick="retryConnection()">Coba Sambung Ulang</button>
    <button class="btn btn-primary" onclick="acceptRTL()">RTL Otomatis</button>`;
  
  modal.classList.add('active');
}

function emergencyLanding() {
  dismissAlert();
  missionState.isActive = false;
  clearInterval(missionState.timerInterval);
  const elapsed = Math.floor((Date.now() - missionState.startTime) / 1000);
  missionState.elapsedTime = elapsed;
  missionState.completionType = 'Emergency';
  showNotification('Landing darurat dimulai...');
  addRealtimeLog('danger', 'Landing darurat dilakukan');
  setTimeout(() => {
    showMissionCompleteBanner('Landing Darurat', 'Misi berakhir karena landing darurat. Periksa laporan post-flight.');
  }, 2000);
}

function retryGPS() {
  dismissAlert();
  showNotification('Mencoba menyambungkan GPS...');
  addRealtimeLog('info', 'Mencoba menyambungkan GPS...');
  setTimeout(() => {
    showNotification('GPS tersambung kembali');
    addRealtimeLog('success', 'GPS tersambung kembali');
  }, 1500);
}

// ── Real-Time Clock ──
function getCurrentTimeStr() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function startClock() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

function updateClock() {
  const clockEl = document.getElementById('currentClock');
  if (clockEl) {
    clockEl.textContent = getCurrentTimeStr();
  }
}

// ── Real-Time Log ──
function addRealtimeLog(type, message) {
  const timeStr = getCurrentTimeStr();
  
  const badgeMap = {
    'info': { class: 'info', label: 'INFO' },
    'success': { class: 'success', label: 'OK' },
    'warning': { class: 'warn', label: 'WARN' },
    'danger': { class: 'error', label: 'ERROR' },
    'system': { class: 'system', label: 'SYS' }
  };

  const badge = badgeMap[type] || badgeMap['info'];
  
  realtimeLogEntries.push({ time: timeStr, type, message });

  const listEl = document.getElementById('realtimeLogList');
  if (!listEl) return;

  const item = document.createElement('div');
  item.className = `realtime-log-item log-${type}`;
  item.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-badge ${badge.class}">${badge.label}</span>
    <span class="log-message">${message}</span>
  `;
  
  listEl.appendChild(item);
  
  // Auto-scroll to bottom
  listEl.scrollTop = listEl.scrollHeight;

  // Also add to incident log for post-flight
  if (type === 'warning' || type === 'danger') {
    logIncident(type, message);
  }
}

function clearRealtimeLog() {
  realtimeLogEntries = [];
  const listEl = document.getElementById('realtimeLogList');
  if (listEl) {
    listEl.innerHTML = '';
  }
}

// ── Mission Complete Banner ──
function showMissionCompleteBanner(title, description) {
  const banner = document.getElementById('missionCompleteBanner');
  const titleEl = document.getElementById('missionCompleteTitle');
  const descEl = document.getElementById('missionCompleteDesc');
  
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;
  if (banner) banner.style.display = 'flex';

  // Update mode badges
  const modeBadge = document.getElementById('modeBadge');
  const flightModeBadge = document.getElementById('flightModeBadge');
  if (modeBadge) modeBadge.textContent = 'LANDED';
  if (flightModeBadge) flightModeBadge.textContent = 'LANDED';
  
  // Enable post-flight tab
  updateTabStates();
  
  // Prepare post-flight data
  showPostFlightStats();
}

function goToPostFlight() {
  const banner = document.getElementById('missionCompleteBanner');
  if (banner) banner.style.display = 'none';
  showScreen('postflight');
}