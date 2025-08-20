import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import {
  ComposedChart,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, Bar
} from "recharts";
import './App.css'; 


const INITIAL_STOCKS = ["HDFCBANK.NS", "SBIN.NS", "RELIANCE.NS", "KPITTECH.NS"];
const API = process.env.REACT_APP_API_URL 

const isMarketOpen = () => {
  const now = new Date();
  const timeZone = "Asia/Kolkata";
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const hour = parseInt(now.toLocaleString("en-US", { hour: 'numeric', hour12: false, timeZone }), 10);
  const minute = parseInt(now.toLocaleString("en-US", { minute: 'numeric', timeZone }), 10);

  const isAfterOpen = hour > 9 || (hour === 9 && minute >= 0);
  const isBeforeClose = hour < 15 || (hour === 15 && minute <= 30);
  return isAfterOpen && isBeforeClose;
};

// Format prices to 2 decimal places
const formatPrice = (price) => {
  const num = Number(price);
  if (isNaN(num)) return "--";
  return num.toFixed(2);
};

// Function to sort and deduplicate trades by timestamp (keep last trade per unique timestamp)
function cleanData(trades) {
  // Sort trades by timestamp ascending
  const sorted = [...trades].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Deduplicate by timestamp (keep last trade of each timestamp)
  const seen = new Map();
  for (const trade of sorted) {
    const time = new Date(trade.timestamp).getTime();
    seen.set(time, trade);
  }
  
  // Return array of trades sorted by timestamp (unique timestamps)
  return Array.from(seen.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export default function App() {
  const [selected, setSelected] = useState(INITIAL_STOCKS[0]);
  const [dataBySymbol, setDataBySymbol] = useState({});
  const [marketIsOpen, setMarketIsOpen] = useState(isMarketOpen());

  const socketRef = useRef(null);
  const deltaRef = useRef(0);
  const [, setRender] = useState(0);

  useEffect(() => {
    setMarketIsOpen(isMarketOpen());
    const interval = setInterval(() => setMarketIsOpen(isMarketOpen()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    axios.get(`${API}/api/trades/${selected}`)
      .then(res => {
        setDataBySymbol(prev => ({ ...prev, [selected]: res.data || [] }));
        if (res.data && res.data.length >= 2) {
          const last = res.data[res.data.length - 1].price;
          const prev = res.data[res.data.length - 2].price;
          deltaRef.current = last - prev;
          setRender(r => r + 1);
        }
      })
      .catch(err => console.error("History fetch error:", err));
  }, [selected]);

  useEffect(() => {
    if (marketIsOpen) {
      if (!socketRef.current) {
        socketRef.current = io(API);
        console.log("✅ Market open. Connecting to real-time feed.");
      }
      socketRef.current.emit("joinStock", selected);

      const onTick = (trade) => {
  if (trade.symbol !== selected) return;

  setDataBySymbol(prev => {
    const cur = prev[selected] || [];
    if (cur.length === 0) {
      deltaRef.current = 0;
      return { ...prev, [selected]: [trade] };
    }

    const lastTrade = cur[cur.length - 1];
    const newTimestamp = new Date(trade.timestamp);

    // Check if new trade timestamp is exactly same, then compare price change
    if (newTimestamp.getTime() === new Date(lastTrade.timestamp).getTime()) {
      // Only update if price changed even slightly 
      if (Math.abs(trade.price - lastTrade.price) < 0.001) {
        // Price change too small, ignore
        return prev;
      }
      // Replace last trade with the new one for the same timestamp but different price
      deltaRef.current = trade.price - lastTrade.price;
      const updatedData = [...cur.slice(0, -1), trade];
      return { ...prev, [selected]: updatedData };
    }

    // New timestamp, add normally
    deltaRef.current = trade.price - lastTrade.price;
    const updatedData = [...cur, trade];
    return { ...prev, [selected]: updatedData };
  });
};

      socketRef.current.on("newTrade", onTick);
      return () => {
        socketRef.current?.off("newTrade", onTick);
      };
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        console.log("❌ Market closed. Disconnected from real-time feed.");
      }
    }
  }, [selected, marketIsOpen]);

  // Clean data: sort and deduplicate before passing to chart
  const rows = cleanData(dataBySymbol[selected] || []).map(trade => ({
  ...trade,
  timestamp: new Date(trade.timestamp).getTime()
}));


  const last = rows.length ? rows[rows.length - 1] : null;
  const delta = deltaRef.current;
  const up = delta > 0;
  const down = delta < 0;
  const priceColor = up ? '#0ca678' : down ? '#f03e3e' : '#343a40';

  return (
    <div className="app-container">
      <div className="content-wrapper">

        <header className="header">
          <div className="stock-info">
            <h1 className="stock-title">{selected.replace(".NS", "")}</h1>
            <div className="price-info">
              <div className="last-price" style={{ color: priceColor }}>
                {formatPrice(last?.price)}
              </div>
              {last && (
                <div className={`price-delta ${up ? 'positive' : down ? 'negative' : ''}`}>
                  {up ? "▲" : "▼"}
                  <span>{formatPrice(Math.abs(delta))}</span>
                </div>
              )}
            </div>
          </div>
          <div className={`market-status ${marketIsOpen ? 'live' : 'closed'}`}>
            <span className="status-dot"></span>
            Market {marketIsOpen ? 'LIVE' : 'CLOSED'}
          </div>
        </header>

        <div className="selector-bar">
          {INITIAL_STOCKS.map(sym => (
            <button
              key={sym}
              onClick={() => setSelected(sym)}
              className={`selector-btn ${selected === sym ? 'active' : ''}`}
            >
              {sym.replace(".NS", "")}
            </button>
          ))}
        </div>

        <div className="chart-wrapper">
<ResponsiveContainer width="100%" height="100%">
  <ComposedChart data={rows} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
    <XAxis
      dataKey="timestamp"
      tickFormatter={t => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
      minTickGap={40}
      stroke="#0c0c0cff"
      tick={{ fontSize: 15 }}
    />
    <YAxis
      yAxisId="left"
      domain={['dataMin - 1', 'dataMax + 1']}
      tickFormatter={v => formatPrice(v)}
      stroke="#000000ff"
      tick={{ fontSize: 12 }}
    />
    <YAxis
      yAxisId="right"
      orientation="right"
      stroke="#939598ff"
      tickFormatter={v => (v / 1000).toFixed(1) + "k"}
      tick={{ fontSize: 12 }}
    />
    <Tooltip
      formatter={(value, name) => name === "Price" ? formatPrice(value) : value}
      labelFormatter={l => new Date(l).toLocaleString("en-IN")}
      contentStyle={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
    />
    <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 20 }} />
    <Line
      yAxisId="left"
      type="monotone"
      dataKey="price"
      stroke="#338f94ff"
      strokeWidth={2.5}
      dot={false}
      isAnimationActive={false}
      name="Price"
    />
    <Bar
      yAxisId="right"
      dataKey="volume"
      fill="#93a0adff"
      name="Volume"
      barSize={2}
    />
  </ComposedChart>
</ResponsiveContainer>

        </div>
      </div>
    </div>
  );
}
