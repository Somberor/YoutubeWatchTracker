// popup.js
document.addEventListener('DOMContentLoaded', function() {
  // Load and display statistics
  updateStats();
  
  // Update stats every 5 seconds while popup is open
  setInterval(updateStats, 5000);
  
  // Reset button handler
  document.getElementById('reset').addEventListener('click', function() {
    chrome.storage.local.set({
      watchStats: { today: 0, week: 0, total: 0 },
      dailyData: Array(7).fill(0)
    }, function() {
      location.reload();
    });
  });
});

function updateStats() {
  chrome.storage.local.get(['watchStats', 'dailyData'], function(result) {
    const stats = result.watchStats || { today: 0, week: 0, total: 0 };
    const dailyData = result.dailyData || Array(7).fill(0);
    
    document.getElementById('today').textContent = Math.round(stats.today);
    document.getElementById('week').textContent = Math.round(stats.week);
    document.getElementById('total').textContent = Math.round(stats.total);
    
    drawGraph(dailyData);
  });
}

function drawGraph(dailyData) {
  const svg = document.getElementById('graph');
  const width = 280;
  const height = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 30 };
  const barWidth = (width - padding.left - padding.right) / 7 - 10;
  
  // Clear previous content
  svg.innerHTML = '';
  
  // Find maximum value for scaling
  const maxValue = Math.max(...dailyData, 1);
  const scale = (height - padding.top - padding.bottom) / maxValue;
  
  // Days of the week
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().getDay();
  
  // Create bars - now showing last 7 days with correct day labels
  for (let i = 6; i >= 0; i--) {
    // Calculate the day index, going backwards from today
    const dayIndex = (today - i + 7) % 7;
    const value = dailyData[dayIndex];
    
    // Calculate x position - reverse the order so newest days are on the right
    const x = padding.left + (6 - i) * ((width - padding.left - padding.right) / 7);
    const barHeight = value * scale;
    const y = height - padding.bottom - barHeight;
    
    // Bar
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', x);
    bar.setAttribute('y', y);
    bar.setAttribute('width', barWidth);
    bar.setAttribute('height', barHeight);
    bar.setAttribute('class', 'bar');
    bar.setAttribute('fill', dayIndex === today ? '#4285f4' : '#a4c2f4');
    
    // Tooltip events
    bar.addEventListener('mouseover', (e) => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 5) + 'px';
      tooltip.style.top = (e.clientY - 28) + 'px';
      tooltip.textContent = `${days[dayIndex]}: ${Math.round(value)} min`;
    });
    
    bar.addEventListener('mouseout', () => {
      document.getElementById('tooltip').style.display = 'none';
    });
    
    svg.appendChild(bar);
    
    // Day label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + barWidth / 2);
    text.setAttribute('y', height - padding.bottom + 15);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'bar-label');
    text.textContent = days[dayIndex];
    svg.appendChild(text);
  }
}