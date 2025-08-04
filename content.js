// content.js
let startTime = null;
let isTracking = false;
let sidebarIframe = null;
let toggleButton = null;
let checkInterval = null;
let lastVideoId = null;
let sessionStartValue = 0;
let isListening = false;
let listeningStartTime = null;
let listeningSessionStartValue = 0;
let currentWeekOffset = 0;
let historicalData = {};
let listeningData = {};

// Initialize extension
function init() {
    createToggleButton();
    createSidebar();

    // Load historical data first, then start tracking
    chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
        historicalData = result.historicalData || {};
        listeningData = result.listeningData || {};

        // Check if we're on a video page and set up tracking
        // Add a small delay to ensure the video element is loaded
        setTimeout(() => {
            checkVideoPage();
        }, 1000);
    });

    // Monitor URL changes (YouTube is a SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            checkVideoPage();
        }
    }).observe(document, { subtree: true, childList: true });

    // Start the periodic save interval immediately
    startPeriodicSave();
}


// Add sidebar functionality
function initializeSidebar() {
    // Close button
    document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);

    // Navigation buttons
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekOffset++;
        updateGraph();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        if (currentWeekOffset > 0) {
            currentWeekOffset--;
            updateGraph();
        }
    });

    // Debug button
    document.getElementById('debugData').addEventListener('click', () => {
        chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
            const watchData = result.historicalData || {};
            const listenData = result.listeningData || {};
            const allDates = [...new Set([...Object.keys(watchData), ...Object.keys(listenData)])].sort().reverse();
            let output = 'YouTube Activity Data:\n\n';

            let totalWatchMinutes = 0;
            let totalListenMinutes = 0;
            
            output += 'Date | Watch Time | Listening Time\n';
            output += '--------------------------------\n';
            
            allDates.forEach(date => {
                const watchTime = watchData[date] || 0;
                const listenTime = listenData[date] || 0;
                output += `${date}: ${formatTime(watchTime)} | ${formatTime(listenTime)}\n`;
                totalWatchMinutes += watchTime;
                totalListenMinutes += listenTime;
            });

            output += `\nTotal Days Tracked: ${allDates.length}`;
            output += `\nTotal Watch Time: ${formatTime(totalWatchMinutes)}`;
            output += `\nTotal Listening Time: ${formatTime(totalListenMinutes)}`;
            output += `\nCombined Total: ${formatTime(totalWatchMinutes + totalListenMinutes)}`;

            console.log(output);
            console.log('Watch data:', watchData);
            console.log('Listening data:', listenData);
            alert(output);
        });
    });

    // Load initial data
    loadData();

    // Start live updates
    startLiveUpdates();

    // Store the interval ID globally so we can manage it
    window.ytWatchTimeUpdateInterval = setInterval(() => {
        // Only update if sidebar is visible
        const sidebar = document.getElementById('yt-watch-time-sidebar');
        if (sidebar && !sidebar.classList.contains('hidden')) {
            // Only update stats, not the graph (to preserve hover functionality)
            chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
                historicalData = result.historicalData || {};
                listeningData = result.listeningData || {};
                if (!isTracking && !isListening) {
                    updateStats();
                }
                // Don't call updateGraph() here to avoid disrupting tooltips
            });
        }
    }, 5000);
}

function loadData() {
    chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
        historicalData = result.historicalData || {};
        listeningData = result.listeningData || {};

        // Only update stats if not currently tracking
        // If tracking, the live update will handle it
        if (!isTracking && !isListening) {
            updateStats();
        }

        updateGraph();
    });
}

// Separate function to update only stats without redrawing the graph
function updateStatsOnly() {
    chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
        historicalData = result.historicalData || {};
        listeningData = result.listeningData || {};
        if (!isTracking && !isListening) {
            updateStats();
        }
    });
}

function formatTime(minutes) {
    // Convert to seconds for better precision with small values
    const totalSeconds = minutes * 60;

    if (totalSeconds < 60) {
        // Less than 1 minute - show seconds
        return `${Math.round(totalSeconds)}s`;
    } else if (minutes < 60) {
        // Less than 1 hour - show minutes and seconds
        const mins = Math.floor(minutes);
        const secs = Math.round((minutes - mins) * 60);
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    } else if (minutes < 1440) {
        // Less than 24 hours - show hours and minutes
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
        // 24 hours or more - show days and hours
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = Math.round(minutes % 60);

        if (days === 1 && hours === 0 && mins === 0) {
            return '1 day';
        } else if (hours > 0) {
            return `${days}d ${hours}h`;
        } else if (mins > 0) {
            return `${days}d ${mins}m`;
        } else {
            return `${days}d`;
        }
    }
}

function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayData = historicalData[today] || 0;
    const todayListeningData = listeningData[today] || 0;

    // Calculate week total
    let weekTotal = 0;
    let weekListeningTotal = 0;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        weekTotal += historicalData[dateStr] || 0;
        weekListeningTotal += listeningData[dateStr] || 0;
    }

    // Calculate month total
    let monthTotal = 0;
    let monthListeningTotal = 0;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        monthTotal += historicalData[dateStr] || 0;
        monthListeningTotal += listeningData[dateStr] || 0;
    }

    // Calculate all-time total
    const allTimeTotal = Object.values(historicalData).reduce((sum, val) => sum + val, 0);
    const allTimeListeningTotal = Object.values(listeningData).reduce((sum, val) => sum + val, 0);

    // Update display
    document.getElementById('todayTime').textContent = formatTime(todayData);
    document.getElementById('weekTime').textContent = formatTime(weekTotal);
    document.getElementById('monthTime').textContent = formatTime(monthTotal);
    document.getElementById('totalTime').textContent = formatTime(allTimeTotal);
    
    // Update listening stats
    document.getElementById('todayListening').textContent = formatTime(todayListeningData);
    document.getElementById('weekListening').textContent = formatTime(weekListeningTotal);
    document.getElementById('monthListening').textContent = formatTime(monthListeningTotal);
    document.getElementById('totalListening').textContent = formatTime(allTimeListeningTotal);
}

function updateGraph() {
    const svg = document.getElementById('graph');
    const width = 280;
    const height = 180;
    const padding = { top: 10, right: 10, bottom: 40, left: 10 };

    // Calculate date range for current view
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (currentWeekOffset * 7) - 6);

    const endDate = new Date(now);
    endDate.setDate(now.getDate() - (currentWeekOffset * 7));

    // Update date range display
    const options = { month: 'short', day: 'numeric' };
    document.getElementById('dateRange').textContent =
        `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;

    // Enable/disable navigation buttons
    document.getElementById('nextWeek').disabled = currentWeekOffset === 0;

    // Collect data for the week
    const weekData = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        weekData.push({
            date: date,
            dateStr: dateStr,
            value: historicalData[dateStr] || 0
        });
    }

    // Clear and setup SVG
    svg.innerHTML = '';
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Find max value for scaling
    const maxValue = Math.max(...weekData.map(d => d.value), 1);
    const scale = (height - padding.top - padding.bottom) / maxValue;
    const barWidth = (width - padding.left - padding.right) / 7 - 4;

    // Get or create tooltip element at document body level
    let tooltip = document.getElementById('yt-watch-time-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'yt-watch-time-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(28, 28, 28, 0.95);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 10000;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            min-width: 100px;
            text-align: center;
            display: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        document.body.appendChild(tooltip);
    }

    // Function to show tooltip
    const showTooltip = (e, data) => {
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        const timeSpent = data.value > 0 ? formatTime(data.value) : 'No time tracked';

        tooltip.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">${data.date.toLocaleDateString('en-US', dateOptions)}</div>
            <div style="color: #ff4444;">${timeSpent}</div>
        `;

        // Show tooltip
        tooltip.style.display = 'block';
        setTimeout(() => {
            tooltip.style.opacity = '1';
        }, 10);

        // Position tooltip
        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = (rect.top - 10) + 'px';
        tooltip.style.transform = 'translate(-50%, -100%)';
    };

    // Function to hide tooltip
    const hideTooltip = () => {
        if (tooltip) {
            tooltip.style.opacity = '0';
            setTimeout(() => {
                if (tooltip.style.opacity === '0') {
                    tooltip.style.display = 'none';
                }
            }, 200);
        }
    };

    // Hide tooltip when mouse leaves the SVG entirely
    svg.addEventListener('mouseleave', hideTooltip);

    // Create bars
    weekData.forEach((data, i) => {
        const x = padding.left + i * ((width - padding.left - padding.right) / 7) + 2;
        const barHeight = data.value * scale;
        const y = height - padding.bottom - barHeight;

        // Bar group
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Bar
        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', x);
        bar.setAttribute('y', y);
        bar.setAttribute('width', barWidth);
        bar.setAttribute('height', barHeight);
        bar.setAttribute('fill', data.date.toDateString() === now.toDateString() ? '#ff0000' : '#cc0000');
        bar.setAttribute('rx', '2');
        bar.style.cursor = 'pointer';
        bar.style.opacity = '0.9';

        // Store data on element for event handlers
        bar._data = data;

        // Prevent click from interfering with hover
        bar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Hover effects
        bar.addEventListener('mouseenter', function (e) {
            this.style.opacity = '1';
            showTooltip(e, this._data);
        });

        bar.addEventListener('mouseleave', function () {
            this.style.opacity = '0.9';
            hideTooltip();
        });

        g.appendChild(bar);

        // Date label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + barWidth / 2);
        text.setAttribute('y', height - padding.bottom + 15);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', 'var(--yt-spec-text-secondary)');

        const dayName = data.date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = data.date.getDate();
        text.textContent = `${dayName} ${dayNum}`;

        g.appendChild(text);
        svg.appendChild(g);
    });
}

function createToggleButton() {
    toggleButton = document.createElement('button');
    toggleButton.className = 'yt-watch-time-toggle';
    toggleButton.innerHTML = '📊 Watch Time';
    toggleButton.addEventListener('click', toggleSidebar);
    document.body.appendChild(toggleButton);
}

function createSidebar() {
    // Create sidebar container
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'yt-watch-time-sidebar';
    sidebarContainer.className = 'hidden';

    // Build sidebar content directly (no iframe)
    sidebarContainer.innerHTML = `
    <div class="sidebar-header">
      <h3>📊 Watch Time Tracker</h3>
      <button class="toggle-btn" id="closeSidebar">
        <svg height="24" width="24" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
        </svg>
      </button>
    </div>
    
    <div class="stats-container">
      <div class="stat-card">
        <div class="stat-label">Today</div>
        <div class="stat-value" id="todayTime">0m</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Week</div>
        <div class="stat-value" id="weekTime">0m</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Month</div>
        <div class="stat-value" id="monthTime">0m</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">All Time</div>
        <div class="stat-value" id="totalTime">0m</div>
      </div>
    </div>
    
    <div class="listening-stats-container" style="margin-top: 16px;">
      <h4 style="color: var(--yt-spec-text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase;">🎧 Background Listening</h4>
      <div class="stats-container">
        <div class="stat-card">
          <div class="stat-label">Today</div>
          <div class="stat-value" id="todayListening">0m</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">This Week</div>
          <div class="stat-value" id="weekListening">0m</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">This Month</div>
          <div class="stat-value" id="monthListening">0m</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">All Time</div>
          <div class="stat-value" id="totalListening">0m</div>
        </div>
      </div>
    </div>
    
    <div class="graph-container">
      <div class="graph-controls">
        <button class="nav-btn" id="prevWeek">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
          </svg>
          Previous
        </button>
        <span class="date-range" id="dateRange">Loading...</span>
        <button class="nav-btn" id="nextWeek">
          Next
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div style="position: relative;">
        <svg id="graph"></svg>
      </div>
      <div style="margin-top: 16px; text-align: center;">
        <button class="nav-btn" id="debugData" style="font-size: 12px; opacity: 0.7;">
          View Raw Data (Dev)
        </button>
      </div>
    </div>
  `;

    // Don't create tooltip here - it will be created in updateGraph

    document.body.appendChild(sidebarContainer);

    // Initialize sidebar functionality
    initializeSidebar();
}

function toggleSidebar() {
    const sidebar = document.getElementById('yt-watch-time-sidebar');
    const isHidden = sidebar.classList.contains('hidden');

    if (isHidden) {
        sidebar.classList.remove('hidden');
        document.body.classList.add('yt-watch-time-sidebar-open');
        toggleButton.classList.add('hidden');
        // Start live updates when sidebar opens
        startLiveUpdates();
    } else {
        sidebar.classList.add('hidden');
        document.body.classList.remove('yt-watch-time-sidebar-open');
        toggleButton.classList.remove('hidden');
        // Stop live updates when sidebar closes
        if (liveUpdateInterval) {
            clearInterval(liveUpdateInterval);
            liveUpdateInterval = null;
        }
    }
}

function checkVideoPage() {
    const isVideoPage = window.location.pathname === '/watch';
    console.log('Checking video page, isVideoPage:', isVideoPage, 'URL:', window.location.pathname);

    if (isVideoPage) {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        console.log('Video ID:', videoId, 'Last Video ID:', lastVideoId);

        if (videoId !== lastVideoId) {
            // New video, restart tracking
            if (isTracking) {
                stopTracking();
            }
            if (isListening) {
                stopListening();
            }
            lastVideoId = videoId;
            // Wait a bit for video to load
            setTimeout(() => {
                console.log('Attempting to start tracking for video:', videoId);
                startTrackingIfVideoPlaying();
            }, 1000);
        } else {
            // Same video, check if we should be tracking/listening
            console.log('Same video, checking if should track');
            startTrackingIfVideoPlaying();
        }
    } else {
        stopTracking();
        stopListening();
    }
}

function startTrackingIfVideoPlaying() {
    console.log('startTrackingIfVideoPlaying called');
    
    // Remove old listeners first to avoid duplicates
    const oldVideo = document.querySelector('video.yt-tracking-attached');
    if (oldVideo) {
        oldVideo.removeEventListener('play', handleVideoPlay);
        oldVideo.removeEventListener('pause', handleVideoPause);
        oldVideo.removeEventListener('ended', handleVideoPause);
        oldVideo.classList.remove('yt-tracking-attached');
    }

    const video = document.querySelector('video');
    if (video) {
        console.log('Video found, paused:', video.paused, 'readyState:', video.readyState);
        
        // Mark this video as having listeners attached
        video.classList.add('yt-tracking-attached');

        // Add event listeners
        video.addEventListener('play', handleVideoPlay);
        video.addEventListener('pause', handleVideoPause);
        video.addEventListener('ended', handleVideoPause);

        // Check current state
        if (!video.paused && video.readyState > 2) {
            console.log('Video is playing, checking visibility');
            if (document.visibilityState === 'visible') {
                console.log('Tab is visible, starting tracking');
                startTracking();
            } else {
                console.log('Tab is hidden, starting listening');
                startListening();
            }
        } else {
            console.log('Video is not playing or not ready');
        }
    } else {
        console.log('No video element found');
    }
}

function handleVideoPlay() {
    console.log('Video playing, starting tracking');
    if (document.visibilityState === 'visible') {
        startTracking();
    } else {
        startListening();
    }
}

function handleVideoPause() {
    console.log('Video paused/ended, stopping tracking');
    stopTracking();
    stopListening();
}

function startTracking() {
    if (!isTracking && document.visibilityState === 'visible') {
        startTime = Date.now();
        isTracking = true;

        // Load historical data from storage first
        chrome.storage.local.get(['historicalData'], function (result) {
            historicalData = result.historicalData || {};
            
            // Store the current value when starting a session
            const today = new Date().toISOString().split('T')[0];
            sessionStartValue = historicalData[today] || 0;
            console.log('Started tracking YouTube at', new Date().toLocaleTimeString(), 'with base value:', formatTime(sessionStartValue));
        });

        // Check periodically if tab is still visible (not if window is focused)
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(() => {
            if (document.visibilityState !== 'visible') {
                stopTracking();
                // Start listening mode when tab becomes hidden
                if (isVideoPlaying()) {
                    startListening();
                }
            }
        }, 1000);
    }
}

function startListening() {
    if (!isListening) {
        listeningStartTime = Date.now();
        isListening = true;

        // Load listening data from storage first
        chrome.storage.local.get(['listeningData'], function (result) {
            listeningData = result.listeningData || {};
            
            // Store the current value when starting a session
            const today = new Date().toISOString().split('T')[0];
            listeningSessionStartValue = listeningData[today] || 0;
            console.log('Started background listening at', new Date().toLocaleTimeString(), 'with base value:', formatTime(listeningSessionStartValue));
            
            // Debug: Check if video is actually playing
            const video = document.querySelector('video');
            if (video) {
                console.log('Video state - paused:', video.paused, 'readyState:', video.readyState, 'ended:', video.ended);
            }
        });
    } else {
        console.log('Already listening, skipping start');
    }
}

function stopListening() {
    if (isListening && listeningStartTime) {
        const duration = Date.now() - listeningStartTime;
        if (duration > 1000) { // Only save if more than 1 second
            saveListeningTime(duration);
        }

        isListening = false;
        listeningStartTime = null;
        console.log('Stopped background listening at', new Date().toLocaleTimeString());
    }
}

function stopTracking() {
    if (isTracking && startTime) {
        const duration = Date.now() - startTime;
        if (duration > 1000) { // Only save if more than 1 second
            saveWatchTime(duration);
        }

        isTracking = false;
        startTime = null;

        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }

        console.log('Stopped tracking YouTube at', new Date().toLocaleTimeString());
    }
}

function isVideoPlaying() {
    const video = document.querySelector('video');
    return video && !video.paused && !video.ended && video.readyState > 2;
}

function saveWatchTime(duration) {
    const minutes = duration / 60000; // Convert to minutes
    const seconds = Math.round(duration / 1000); // Also log seconds for debugging
    const today = new Date().toISOString().split('T')[0];

    console.log(`Saving ${seconds} seconds (${minutes.toFixed(2)} minutes) of watch time for ${today}`);

    chrome.storage.local.get(['historicalData'], function (result) {
        historicalData = result.historicalData || {};
        historicalData[today] = (historicalData[today] || 0) + minutes;

        chrome.storage.local.set({
            historicalData: historicalData,
            lastUpdate: Date.now()
        }, () => {
            // Update our session start value to the new total
            sessionStartValue = historicalData[today];
            console.log(`Successfully saved. Total for ${today}: ${formatTime(historicalData[today])}`);

            // Force a full data reload if sidebar is open
            const sidebar = document.getElementById('yt-watch-time-sidebar');
            if (sidebar && !sidebar.classList.contains('hidden')) {
                // Don't call loadData here as it might interfere with live updates
                // The live update will handle displaying the correct value
            }
        });
    });
}

function saveListeningTime(duration) {
    const minutes = duration / 60000; // Convert to minutes
    const seconds = Math.round(duration / 1000); // Also log seconds for debugging
    const today = new Date().toISOString().split('T')[0];

    console.log(`Saving ${seconds} seconds (${minutes.toFixed(2)} minutes) of listening time for ${today}`);

    chrome.storage.local.get(['listeningData'], function (result) {
        listeningData = result.listeningData || {};
        listeningData[today] = (listeningData[today] || 0) + minutes;

        chrome.storage.local.set({
            listeningData: listeningData,
            lastListeningUpdate: Date.now()
        }, () => {
            // Update our session start value to the new total
            listeningSessionStartValue = listeningData[today];
            console.log(`Successfully saved. Total listening for ${today}: ${formatTime(listeningData[today])}`);
        });
    });
}

// Listen for visibility changes (tab switching, not window focus)
document.addEventListener('visibilitychange', () => {
    console.log('Visibility changed to:', document.visibilityState);
    if (document.visibilityState === 'visible') {
        // Stop listening when tab becomes visible
        stopListening();
        // Check if video is playing and start tracking
        if (isVideoPlaying()) {
            startTracking();
        }
    } else {
        stopTracking();
        // Start listening if video is playing
        if (isVideoPlaying()) {
            startListening();
        }
    }
});

// Listen for window blur/focus for browser minimize
window.addEventListener('blur', () => {
    console.log('Window lost focus');
    // Only switch to listening if we're currently tracking and video is playing
    if (isTracking && isVideoPlaying()) {
        stopTracking();
        startListening();
    }
});

window.addEventListener('focus', () => {
    console.log('Window gained focus');
    // Only switch back to tracking if tab is visible and video is playing
    if (document.visibilityState === 'visible' && isVideoPlaying()) {
        stopListening();
        startTracking();
    }
});

// Track when page is about to unload
window.addEventListener('beforeunload', () => {
    stopTracking();
    stopListening();
});

// Function to start periodic save interval
function startPeriodicSave() {
    // Update stats every minute while tracking
    setInterval(() => {
        if (isTracking && startTime) {
            const duration = Date.now() - startTime;
            if (duration > 1000) { // Only save if more than 1 second
                saveWatchTime(duration);
                // Reset start time to avoid counting the same time twice
                startTime = Date.now();
            }
        }
        
        if (isListening && listeningStartTime) {
            const duration = Date.now() - listeningStartTime;
            if (duration > 1000) { // Only save if more than 1 second
                saveListeningTime(duration);
                // Reset start time to avoid counting the same time twice
                listeningStartTime = Date.now();
            }
        }
    }, 60000); // Update every minute
}

// Live update display while tracking
let liveUpdateInterval = null;

function startLiveUpdates() {
    if (liveUpdateInterval) clearInterval(liveUpdateInterval);

    liveUpdateInterval = setInterval(() => {
        const sidebar = document.getElementById('yt-watch-time-sidebar');
        if (sidebar && !sidebar.classList.contains('hidden')) {
            if (isTracking && startTime) {
                // Calculate current session duration
                const currentDuration = Date.now() - startTime;
                const currentSessionMinutes = currentDuration / 60000;

                // Update today's display with session start value + current session
                const todayElement = document.getElementById('todayTime');
                if (todayElement) {
                    const totalToday = sessionStartValue + currentSessionMinutes;
                    todayElement.textContent = formatTime(totalToday);
                }

                // For other stats, use the stored data plus current session
                const today = new Date().toISOString().split('T')[0];
                const now = new Date();

                // Week calculation
                let weekTotal = currentSessionMinutes;
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());

                for (let i = 0; i < 7; i++) {
                    const date = new Date(startOfWeek);
                    date.setDate(startOfWeek.getDate() + i);
                    const dateStr = date.toISOString().split('T')[0];
                    if (dateStr === today) {
                        weekTotal += sessionStartValue;
                    } else {
                        weekTotal += historicalData[dateStr] || 0;
                    }
                }

                // Month calculation
                let monthTotal = currentSessionMinutes;
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

                for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    if (dateStr === today) {
                        monthTotal += sessionStartValue;
                    } else {
                        monthTotal += historicalData[dateStr] || 0;
                    }
                }

                // All-time calculation
                let allTimeTotal = currentSessionMinutes + sessionStartValue;
                for (const [date, value] of Object.entries(historicalData)) {
                    if (date !== today) {
                        allTimeTotal += value;
                    }
                }

                // Update displays
                const weekElement = document.getElementById('weekTime');
                const monthElement = document.getElementById('monthTime');
                const totalElement = document.getElementById('totalTime');

                if (weekElement) weekElement.textContent = formatTime(weekTotal);
                if (monthElement) monthElement.textContent = formatTime(monthTotal);
                if (totalElement) totalElement.textContent = formatTime(allTimeTotal);
            }
            
            // Update listening stats if listening
            if (isListening && listeningStartTime) {
                // Calculate current listening session duration
                const currentListeningDuration = Date.now() - listeningStartTime;
                const currentListeningMinutes = currentListeningDuration / 60000;

                // Update today's listening display
                const todayListeningElement = document.getElementById('todayListening');
                if (todayListeningElement) {
                    const totalTodayListening = listeningSessionStartValue + currentListeningMinutes;
                    todayListeningElement.textContent = formatTime(totalTodayListening);
                }

                // Similar calculations for week, month, and all-time listening
                const today = new Date().toISOString().split('T')[0];
                const now = new Date();
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                
                let weekListeningTotal = currentListeningMinutes;
                let monthListeningTotal = currentListeningMinutes;
                let allTimeListeningTotal = currentListeningMinutes + listeningSessionStartValue;

                // Calculate totals
                for (let i = 0; i < 7; i++) {
                    const date = new Date(startOfWeek);
                    date.setDate(startOfWeek.getDate() + i);
                    const dateStr = date.toISOString().split('T')[0];
                    if (dateStr === today) {
                        weekListeningTotal += listeningSessionStartValue;
                    } else {
                        weekListeningTotal += listeningData[dateStr] || 0;
                    }
                }

                for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    if (dateStr === today) {
                        monthListeningTotal += listeningSessionStartValue;
                    } else {
                        monthListeningTotal += listeningData[dateStr] || 0;
                    }
                }

                for (const [date, value] of Object.entries(listeningData)) {
                    if (date !== today) {
                        allTimeListeningTotal += value;
                    }
                }

                // Update listening displays
                const weekListeningElement = document.getElementById('weekListening');
                const monthListeningElement = document.getElementById('monthListening');
                const totalListeningElement = document.getElementById('totalListening');

                if (weekListeningElement) weekListeningElement.textContent = formatTime(weekListeningTotal);
                if (monthListeningElement) monthListeningElement.textContent = formatTime(monthListeningTotal);
                if (totalListeningElement) totalListeningElement.textContent = formatTime(allTimeListeningTotal);
            }
        }
    }, 1000); // Update every second
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}