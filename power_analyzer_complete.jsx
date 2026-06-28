import React, { useState, useEffect } from 'react';
import { TrendingUp, Loader, AlertCircle, RefreshCw, Star, Trash2, Plus, Bell, History } from 'lucide-react';

export default function PowerStockAnalyzer() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [activeTab, setActiveTab] = useState('all'); // all, favorites, alerts, history
  const [favorites, setFavorites] = useState([]);
  const [buyHistory, setBuyHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});

  // Load from storage on mount
  useEffect(() => {
    loadFromStorage();
    fetchBestStocks();
    
    // Setup price refresh interval
    const interval = setInterval(() => {
      if (results) {
        generateMockPrices(results);
      }
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  const loadFromStorage = async () => {
    try {
      const favResult = await window.storage.get('favorites');
      const histResult = await window.storage.get('buy_history');
      const alertResult = await window.storage.get('price_alerts');
      
      if (favResult) setFavorites(JSON.parse(favResult.value));
      if (histResult) setBuyHistory(JSON.parse(histResult.value));
      if (alertResult) setAlerts(JSON.parse(alertResult.value));
    } catch (err) {
      console.log('Storage load:', err);
    }
  };

  const saveToStorage = async (key, data) => {
    try {
      await window.storage.set(key, JSON.stringify(data));
    } catch (err) {
      console.error('Storage save error:', err);
    }
  };

  const generateMockPrices = (stocks) => {
    const prices = {};
    stocks.forEach(stock => {
      const entry = parseFloat(stock.entryPrice);
      const variation = (Math.random() - 0.5) * (entry * 0.05); // ±2.5% variation
      prices[stock.code] = (entry + variation).toFixed(2);
    });
    setCurrentPrices(prices);
  };

  const fetchBestStocks = async () => {
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const searchPrompt = `Cari 20 kod saham KLSE terbaik yang ada potensi untung tinggi SEKARANG berdasarkan:
- Momentum positif
- Volume tinggi
- Trend bullish
- Potensi pulang modal dalam 1-3 bulan

Format response HANYA JSON array:
["MAYBANK", "TENAGA", "CIMB", ...]

Berikan HANYA JSON array, tiada teks lain. Pastikan 20 kod yang berbeza dan NYATA dari KLSE.`;

      const searchResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: searchPrompt }]
        })
      });

      if (!searchResponse.ok) throw new Error('Gagal cari saham');

      const searchData = await searchResponse.json();
      const searchText = searchData.content[0]?.text || '';
      const jsonMatch = searchText.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) throw new Error('Tidak dapat parse kod saham');

      const stockCodes = JSON.parse(jsonMatch[0]);

      const analyzePrompt = `Analisis 20 saham KLSE ini dengan TELITI.

Kod Saham: ${stockCodes.join(', ')}

Untuk setiap saham, sediakan DALAM FORMAT JSON:
{
  "code": "SYMBOL",
  "score": <integer 0-100>,
  "recommendation": "STRONG BUY|BUY|HOLD|SELL|STRONG SELL",
  "entryPrice": "<X.XX>",
  "takeProfit": "<X.XX>",
  "cutLoss": "<X.XX>",
  "potentialReturn": "<X%>",
  "reason": "<penjelasan ringkas 2-3 ayat>"
}

Berikan respons HANYA dalam format JSON array, tiada teks lain.`;

      const analyzeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          messages: [{ role: 'user', content: analyzePrompt }]
        })
      });

      if (!analyzeResponse.ok) throw new Error('Gagal analisis saham');

      const analyzeData = await analyzeResponse.json();
      const analyzeText = analyzeData.content[0]?.text || '';
      const analysisMatch = analyzeText.match(/\[[\s\S]*\]/);
      
      if (!analysisMatch) throw new Error('Tidak dapat parse analisis');

      const analysisResults = JSON.parse(analysisMatch[0]);
      setResults(analysisResults);
      generateMockPrices(analysisResults);

      // Check alerts
      checkAlerts(analysisResults);
    } catch (err) {
      setError(err.message || 'Sila cuba semula');
    } finally {
      setLoading(false);
    }
  };

  const checkAlerts = (stocks) => {
    alerts.forEach(alert => {
      const stock = stocks.find(s => s.code === alert.code);
      if (stock) {
        const currentPrice = currentPrices[alert.code] || parseFloat(stock.entryPrice);
        
        if (alert.type === 'entry' && currentPrice <= parseFloat(stock.entryPrice)) {
          showNotification(`🎯 ${alert.code} dah hit Entry price! (${currentPrice})`);
        } else if (alert.type === 'tp' && currentPrice >= parseFloat(stock.takeProfit)) {
          showNotification(`🚀 ${alert.code} dah hit Take Profit! (${currentPrice})`);
        } else if (alert.type === 'sl' && currentPrice <= parseFloat(stock.cutLoss)) {
          showNotification(`⚠️ ${alert.code} dah hit Stop Loss! (${currentPrice})`);
        }
      }
    });
  };

  const showNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Stock Alert', { body: message });
    }
    alert(message);
  };

  const toggleFavorite = async (stock) => {
    const isFav = favorites.some(f => f.code === stock.code);
    const newFavs = isFav 
      ? favorites.filter(f => f.code !== stock.code)
      : [...favorites, stock];
    
    setFavorites(newFavs);
    await saveToStorage('favorites', newFavs);
  };

  const addAlert = async (stock, type) => {
    const newAlert = {
      id: Date.now(),
      code: stock.code,
      type, // 'entry', 'tp', 'sl'
      price: type === 'entry' ? stock.entryPrice : type === 'tp' ? stock.takeProfit : stock.cutLoss,
      createdAt: new Date().toLocaleString()
    };
    
    const newAlerts = [...alerts, newAlert];
    setAlerts(newAlerts);
    await saveToStorage('price_alerts', newAlerts);
    setShowAlertModal(false);
  };

  const removeAlert = async (alertId) => {
    const newAlerts = alerts.filter(a => a.id !== alertId);
    setAlerts(newAlerts);
    await saveToStorage('price_alerts', newAlerts);
  };

  const addBuyRecord = async (stock, quantity, buyPrice) => {
    const newRecord = {
      id: Date.now(),
      code: stock.code,
      quantity: parseInt(quantity),
      buyPrice: parseFloat(buyPrice),
      totalCost: parseInt(quantity) * parseFloat(buyPrice),
      buyDate: new Date().toLocaleString(),
      tp: stock.takeProfit,
      sl: stock.cutLoss
    };
    
    const newHistory = [...buyHistory, newRecord];
    setBuyHistory(newHistory);
    await saveToStorage('buy_history', newHistory);
    
    // Auto-add to favorites
    if (!favorites.some(f => f.code === stock.code)) {
      const newFavs = [...favorites, stock];
      setFavorites(newFavs);
      await saveToStorage('favorites', newFavs);
    }
    
    setShowBuyModal(false);
  };

  const removeBuyRecord = async (recordId) => {
    const newHistory = buyHistory.filter(r => r.id !== recordId);
    setBuyHistory(newHistory);
    await saveToStorage('buy_history', newHistory);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'bg-green-900 text-green-300';
    if (score >= 75) return 'bg-green-800 text-green-200';
    if (score >= 60) return 'bg-blue-800 text-blue-200';
    if (score >= 40) return 'bg-yellow-800 text-yellow-200';
    return 'bg-red-900 text-red-300';
  };

  const getRecommendationColor = (rec) => {
    const colors = {
      'STRONG BUY': 'bg-green-600 text-white font-bold',
      'BUY': 'bg-green-500 text-white',
      'HOLD': 'bg-blue-500 text-white',
      'SELL': 'bg-orange-500 text-white',
      'STRONG SELL': 'bg-red-600 text-white'
    };
    return colors[rec] || 'bg-gray-500 text-white';
  };

  const getSortedResults = (stocks) => {
    const sorted = [...stocks];
    if (sortBy === 'score') return sorted.sort((a, b) => b.score - a.score);
    if (sortBy === 'return') return sorted.sort((a, b) => parseFloat(b.potentialReturn) - parseFloat(a.potentialReturn));
    if (sortBy === 'entry') return sorted.sort((a, b) => parseFloat(a.entryPrice) - parseFloat(b.entryPrice));
    return sorted;
  };

  const StockCard = ({ stock }) => {
    const isFav = favorites.some(f => f.code === stock.code);
    const currentPrice = currentPrices[stock.code] || parseFloat(stock.entryPrice);
    const priceChange = ((currentPrice - stock.entryPrice) / stock.entryPrice * 100).toFixed(2);
    
    return (
      <div className={`border-2 rounded-lg p-5 transition-all ${
        stock.score >= 90 ? 'border-green-500 bg-slate-800/80' :
        stock.score >= 75 ? 'border-green-600 bg-slate-800/60' :
        stock.score >= 60 ? 'border-blue-600 bg-slate-800/60' :
        'border-slate-700 bg-slate-800/40'
      }`}>
        {/* Top Row */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold text-white">{stock.code}</h3>
              <button
                onClick={() => toggleFavorite(stock)}
                className={`transition-colors ${isFav ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
              >
                <Star className="w-6 h-6 fill-current" />
              </button>
            </div>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold ${getRecommendationColor(stock.recommendation)}`}>
              {stock.recommendation}
            </span>
          </div>
          <div className={`text-center p-3 rounded-lg ${getScoreColor(stock.score)}`}>
            <div className="text-3xl font-bold">{stock.score}</div>
            <div className="text-xs">Score</div>
          </div>
        </div>

        {/* Current Price */}
        <div className={`p-3 rounded mb-4 border ${priceChange >= 0 ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>
          <p className="text-gray-400 text-xs mb-1">Harga Semasa</p>
          <p className={`font-bold text-lg ${priceChange >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            RM {currentPrice} <span className="text-sm">({priceChange > 0 ? '+' : ''}{priceChange}%)</span>
          </p>
        </div>

        {/* Price Grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-700/50 rounded p-3 border border-slate-600">
            <p className="text-gray-400 text-xs mb-1">Entry</p>
            <p className="text-white font-bold">RM {stock.entryPrice}</p>
          </div>
          <div className="bg-green-900/30 rounded p-3 border border-green-700">
            <p className="text-green-400 text-xs mb-1">TP</p>
            <p className="text-green-300 font-bold">RM {stock.takeProfit}</p>
          </div>
          <div className="bg-red-900/30 rounded p-3 border border-red-700">
            <p className="text-red-400 text-xs mb-1">SL</p>
            <p className="text-red-300 font-bold">RM {stock.cutLoss}</p>
          </div>
        </div>

        {/* Potential Return */}
        <div className="bg-blue-900/30 rounded p-3 border border-blue-700 mb-4">
          <p className="text-blue-400 text-xs uppercase mb-1">Untung TP</p>
          <p className="text-blue-300 font-bold text-xl">{stock.potentialReturn}</p>
        </div>

        {/* Analysis */}
        <div className="border-t border-slate-700 pt-3 mb-4">
          <p className="text-gray-300 text-sm">{stock.reason}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedStock(stock);
              setShowBuyModal(true);
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-semibold flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" /> Beli
          </button>
          <button
            onClick={() => {
              setSelectedStock(stock);
              setShowAlertModal(true);
            }}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded text-sm font-semibold flex items-center justify-center gap-1"
          >
            <Bell className="w-4 h-4" /> Alert
          </button>
        </div>
      </div>
    );
  };

  // Alert Modal
  const AlertModal = () => {
    if (!showAlertModal || !selectedStock) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Set Alert untuk {selectedStock.code}</h3>
          
          <div className="space-y-3">
            <button
              onClick={() => addAlert(selectedStock, 'entry')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm"
            >
              Alert Entry (RM {selectedStock.entryPrice})
            </button>
            <button
              onClick={() => addAlert(selectedStock, 'tp')}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm"
            >
              Alert Take Profit (RM {selectedStock.takeProfit})
            </button>
            <button
              onClick={() => addAlert(selectedStock, 'sl')}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded text-sm"
            >
              Alert Stop Loss (RM {selectedStock.cutLoss})
            </button>
            <button
              onClick={() => setShowAlertModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded text-sm"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Buy Modal
  const BuyModal = () => {
    const [qty, setQty] = useState('1');
    const [price, setPrice] = useState(selectedStock?.entryPrice || '0');

    if (!showBuyModal || !selectedStock) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Rekod Beli - {selectedStock.code}</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Kuantiti (Lot)</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded px-3 py-2"
                min="1"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Harga Beli (RM)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="0.01"
                className="w-full bg-slate-700 text-white border border-slate-600 rounded px-3 py-2"
              />
            </div>
            <div className="bg-slate-700/50 p-3 rounded text-sm">
              <p className="text-gray-400">Total Cost: <span className="text-white font-bold">RM {(qty * price).toFixed(2)}</span></p>
              <p className="text-gray-400 mt-1">Target TP: <span className="text-green-300 font-bold">RM {selectedStock.takeProfit}</span></p>
              <p className="text-gray-400">Stop Loss: <span className="text-red-300 font-bold">RM {selectedStock.cutLoss}</span></p>
            </div>
            <button
              onClick={() => addBuyRecord(selectedStock, qty, price)}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-semibold"
            >
              Confirm Beli
            </button>
            <button
              onClick={() => setShowBuyModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-950 to-transparent pb-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-400" />
              <h1 className="text-3xl font-bold text-white">POWER Analyzer 🚀</h1>
            </div>
            <button
              onClick={fetchBestStocks}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 flex-wrap border-b border-slate-700">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📊 Semua ({results?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'favorites'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⭐ Favorites ({favorites.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4 inline mr-1" /> Portfolio ({buyHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'alerts'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4 inline mr-1" /> Alerts ({alerts.length})
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-red-100 font-semibold">Gagal Load</p>
              <button onClick={fetchBestStocks} className="mt-2 text-sm bg-red-700 px-3 py-1 rounded">
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-20">
            <Loader className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-gray-300">Sedang scan 20 saham terbaik...</p>
          </div>
        )}

        {/* ALL TAB */}
        {activeTab === 'all' && results && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {['score', 'return', 'entry'].map(sort => (
                <button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    sortBy === sort
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {sort === 'score' && 'Score 📊'}
                  {sort === 'return' && 'Untung %'}
                  {sort === 'entry' && 'Entry Price'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {getSortedResults(results).map((stock, idx) => (
                <StockCard key={idx} stock={stock} />
              ))}
            </div>
          </div>
        )}

        {/* FAVORITES TAB */}
        {activeTab === 'favorites' && (
          <div>
            {favorites.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Tiada favorites. Click star untuk add saham favorite.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {favorites.map((stock, idx) => (
                  <StockCard key={idx} stock={stock} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === 'history' && (
          <div>
            {buyHistory.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Tiada rekod beli. Click "Beli" button untuk add.</p>
            ) : (
              <div className="space-y-4">
                {buyHistory.map((record) => {
                  const currentPrice = currentPrices[record.code] || record.buyPrice;
                  const currentValue = record.quantity * currentPrice;
                  const profit = currentValue - record.totalCost;
                  const profitPercent = ((profit / record.totalCost) * 100).toFixed(2);
                  
                  return (
                    <div key={record.id} className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold text-white">{record.code}</h3>
                          <p className="text-gray-400 text-sm mt-1">Beli: {record.buyDate}</p>
                        </div>
                        <button
                          onClick={() => removeBuyRecord(record.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
                        <div className="bg-slate-700 p-2 rounded">
                          <p className="text-gray-400">Qty</p>
                          <p className="text-white font-bold">{record.quantity}</p>
                        </div>
                        <div className="bg-slate-700 p-2 rounded">
                          <p className="text-gray-400">Harga Beli</p>
                          <p className="text-white font-bold">RM {record.buyPrice.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-700 p-2 rounded">
                          <p className="text-gray-400">Semasa</p>
                          <p className="text-white font-bold">RM {currentPrice.toFixed(2)}</p>
                        </div>
                        <div className={`p-2 rounded ${profit >= 0 ? 'bg-green-900' : 'bg-red-900'}`}>
                          <p className={profit >= 0 ? 'text-green-400' : 'text-red-400'}>Untung</p>
                          <p className={`font-bold ${profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {profitPercent}%
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-slate-700/50 p-3 rounded text-sm">
                        <p className="text-gray-400">Total Cost: <span className="text-white font-bold">RM {record.totalCost.toFixed(2)}</span></p>
                        <p className="text-gray-400 mt-1">Current Value: <span className="text-white font-bold">RM {currentValue.toFixed(2)}</span></p>
                        <p className={`mt-1 ${profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>P/L: RM {profit.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ALERTS TAB */}
        {activeTab === 'alerts' && (
          <div>
            {alerts.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Tiada alerts. Click "Alert" button untuk setup.</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className="bg-slate-800 border border-purple-700 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="text-white font-bold">{alert.code}</p>
                      <p className="text-gray-400 text-sm">
                        Alert {alert.type.toUpperCase()} @ RM {alert.price} | Created: {alert.createdAt}
                      </p>
                    </div>
                    <button
                      onClick={() => removeAlert(alert.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertModal />
      <BuyModal />
    </div>
  );
}