// sidebar.js
let currentWeekOffset = 0;
let historicalData = {};

// Initialize when sidebar loads
document.addEventListener('DOMContentLoaded', function () {
    loadData();

    // Update stats every 5 seconds
    setInterval(loadData, 5000);

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

    // Close button
    document.getElementById('closeSidebar').addEventListener('click', () => {
        window.parent.postMessage({ action: 'closeSidebar' }, '*');
    });
});

function loadData() {
    chrome.storage.local.get(['historicalData', 'currentSession'], function (result) {
        historicalData = result.historicalData || {};
        updateStats();
        updateGraph();
    });
}

function formatTime(minutes) {
    if (minutes < 60) {
        return `${Math.round(minutes)}m`;
    } else if (minutes < 1440) { // Less than 24 hours
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
}

function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayData = historicalData[today] || 0;

    // Calculate week total
    let weekTotal = 0;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        weekTotal += historicalData[dateStr] || 0;
    }

    // Calculate month total
    let monthTotal = 0;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        monthTotal += historicalData[dateStr] || 0;
    }

    // Calculate all-time total
    const allTimeTotal = Object.values(historicalData).reduce((sum, val) => sum + val, 0);

    // Update display
    document.getElementById('todayTime').textContent = formatTime(todayData);
    document.getElementById('weekTime').textContent = formatTime(weekTotal);
    document.getElementById('monthTime').textContent = formatTime(monthTotal);
    document.getElementById('totalTime').textContent = formatTime(allTimeTotal);
}

function updateGraph() {
    const svg = document.getElementById('graph');
    const width = 288; // sidebar width - padding
    const height = 200;
    const padding = { top: 20, right: 10, bottom: 40, left: 10 };

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
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Find max value for scaling
    const maxValue = Math.max(...weekData.map(d => d.value), 1);
    const scale = (height - padding.top - padding.bottom) / maxValue;
    const barWidth = (width - padding.left - padding.right) / 7 - 4;

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
        bar.setAttribute('fill', data.date.toDateString() === now.toDateString() ? '#ff0000' : '#ff6b6b');
        bar.setAttribute('rx', '2');
        bar.style.cursor = 'pointer';

        // Hover effects
        bar.addEventListener('mouseenter', (e) => {
            bar.setAttribute('fill', data.date.toDateString() === now.toDateString() ? '#cc0000' : '#ff4444');
            const tooltip = document.getElementById('tooltip');
            const rect = svg.getBoundingClientRect();
            const parentRect = svg.parentElement.getBoundingClientRect();

            const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
            tooltip.innerHTML = `
        <strong>${data.date.toLocaleDateString('en-US', dateOptions)}</strong><br>
        ${formatTime(data.value)}
      `;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX - parentRect.left - 40) + 'px';
            tooltip.style.top = (e.clientY - parentRect.top - 50) + 'px';
        });

        bar.addEventListener('mouseleave', () => {
            bar.setAttribute('fill', data.date.toDateString() === now.toDateString() ? '#ff0000' : '#ff6b6b');
            document.getElementById('tooltip').style.display = 'none';
        });

        g.appendChild(bar);

        // Date label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + barWidth / 2);
        text.setAttribute('y', height - padding.bottom + 15);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', '#606060');

        const dayName = data.date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = data.date.getDate();
        text.textContent = `${dayName} ${dayNum}`;

        g.appendChild(text);
        svg.appendChild(g);
    });
}