// background.js
chrome.runtime.onInstalled.addListener(function () {
    // Initialize storage with empty historical data
    chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
        const updates = {};
        
        if (!result.historicalData) {
            updates.historicalData = {};
            updates.lastUpdate = Date.now();
        }
        
        if (!result.listeningData) {
            updates.listeningData = {};
            updates.lastListeningUpdate = Date.now();
        }
        
        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
                console.log('Extension installed, storage initialized');
            });
        }
    });
});

// Optional: Clean up very old data (older than 1 year) to prevent storage bloat
chrome.runtime.onStartup.addListener(function () {
    chrome.storage.local.get(['historicalData', 'listeningData'], function (result) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const cutoffDate = oneYearAgo.toISOString().split('T')[0];
        
        let cleaned = false;
        const updates = {};
        
        if (result.historicalData) {
            const historicalData = {...result.historicalData};
            for (const date in historicalData) {
                if (date < cutoffDate) {
                    delete historicalData[date];
                    cleaned = true;
                }
            }
            if (cleaned) {
                updates.historicalData = historicalData;
            }
        }
        
        if (result.listeningData) {
            const listeningData = {...result.listeningData};
            for (const date in listeningData) {
                if (date < cutoffDate) {
                    delete listeningData[date];
                    cleaned = true;
                }
            }
            if (cleaned) {
                updates.listeningData = listeningData;
            }
        }

        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
                console.log('Cleaned up data older than 1 year');
            });
        }
    });
});