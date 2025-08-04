// background.js
chrome.runtime.onInstalled.addListener(function () {
    // Initialize storage with empty historical data
    chrome.storage.local.get(['historicalData'], function (result) {
        if (!result.historicalData) {
            chrome.storage.local.set({
                historicalData: {},
                lastUpdate: Date.now()
            });
            console.log('Extension installed, storage initialized');
        }
    });
});

// Optional: Clean up very old data (older than 1 year) to prevent storage bloat
chrome.runtime.onStartup.addListener(function () {
    chrome.storage.local.get(['historicalData'], function (result) {
        if (result.historicalData) {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const cutoffDate = oneYearAgo.toISOString().split('T')[0];

            const historicalData = result.historicalData;
            let cleaned = false;

            for (const date in historicalData) {
                if (date < cutoffDate) {
                    delete historicalData[date];
                    cleaned = true;
                }
            }

            if (cleaned) {
                chrome.storage.local.set({ historicalData: historicalData }, () => {
                    console.log('Cleaned up data older than 1 year');
                });
            }
        }
    });
});