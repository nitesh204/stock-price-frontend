import React, { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import axios from "axios";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, Area, Bar
} from "recharts";

const INITIAL_STOCKS = ["HDFCBANK.NS", "SBIN.NS", "RELIANCE.NS", "KPITTECH.NS"];
const API = "http://localhost:5000";

export default function App() {
  const [selected, setSelected] = useState(INITIAL_STOCKS[0]);
  const [dataBySymbol, setDataBySymbol] = useState({});
  const socketRef = useRef(null);
  const deltaRef = useRef(0);
  const [, setRender] = useState(0);

  // NEW: Ref to track if historical data is loading
  const isHistoryLoading = useRef(false);

  useEffect(() => {
    socketRef.current = io(API);
    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;

    // NEW: Set loading flag to true before fetching data
    isHistoryLoading.current = true;

    socketRef.current.emit("joinStock", selected);

    axios
      .get(`${API}/api/trades/${selected}`)
      .then(res => {
        setDataBySymbol(prev => ({ ...prev, [selected]: res.data || [] }));
        if (res.data && res.data.length >= 2) {
          const last = res.data[res.data.length - 1].price;
          const prev = res.data[res.data.length - 2].price;
          deltaRef.current = last - prev;
          setRender(r => r + 1);
        }
      })
      .catch(err => console.error("History fetch error:", err))
      .finally(() => {
        // NEW: Set loading flag to false after data is loaded (or on error)
        isHistoryLoading.current = false;
      });
      
      const onTick = (trade) => {
        if (isHistoryLoading.current || trade.symbol !== selected) return;

        setDataBySymbol(prev => {
          const cur = prev[selected] || [];

          // ✅ Ignore duplicate timestamp
          if (cur.length > 0 && new Date(cur[cur.length - 1].timestamp).getTime() === new Date(trade.timestamp).getTime()) {
            return prev; // skip duplicate
          }

          const lastPrice = cur.length > 0 ? cur[cur.length - 1].price : trade.price;
          deltaRef.current = trade.price - lastPrice;

          const updatedData = [...cur, trade];
          return { ...prev, [selected]: updatedData };
        });

      };

    socketRef.current.on("newTrade", onTick);

    return () => socketRef.current.off("newTrade", onTick);
  }, [selected]);

  const rows = dataBySymbol[selected] || [];
  const last = rows.length ? rows[rows.length - 1] : null;
  const delta = deltaRef.current;
  const up = delta > 0;
  const down = delta < 0;
  const priceColor = up ? "#27ae60" : down ? "#c0392b" : "#333";

  // The JSX below is unchanged
  return (
    <div style={{ fontFamily: "Inter, system-ui, Arial", background: "#f4f7f6", minHeight: "100vh", padding: 32 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", background: '#fff', borderRadius: 20, padding: 30, boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}>
        <header style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 30, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 700, fontSize: 36, margin: 0, color: '#00796b' }}>
            {selected.replace(".NS", "")}
          </h1>
          <div style={{ fontSize: 42, fontWeight: 800, color: priceColor }}>
            {last?.price?.toFixed ? last.price.toFixed(2) : "--"}
          </div>
          {last && (
            <div style={{ color: priceColor, fontWeight: 700, fontSize: 22, display: 'flex', alignItems: 'center', gap: 6 }}>
              {up && "▲"}{down && "▼"}
              <span>{Math.abs(delta).toFixed(2)}</span>
            </div>
          )}
        </header>

        <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {INITIAL_STOCKS.map(sym => (
            <button key={sym} onClick={() => setSelected(sym)}
              style={{
                padding: "8px 20px", borderRadius: 24, fontWeight: 600, cursor: "pointer",
                background: selected === sym ? "#26a69a" : "#e0f2f1",
                color: selected === sym ? "#fff" : "#004d40",
                border: 'none', boxShadow: selected === sym ? "0 4px 14px rgba(38,166,154,0.3)" : "none",
                transition: 'all 0.3s',
              }}>
              {sym.replace(".NS", "")}
            </button>
          ))}
        </div>

        <div
          style={{
            width: '100%',
            height: 450,
            background: "#e0f2f1",
            borderRadius: 20,
            padding: 0,           
            boxSizing: 'border-box', 
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#b2dfdb" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={t =>
                  new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                }
                minTickGap={40}
                stroke="#004d40"
              />
              <YAxis
                yAxisId="left"
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={v => Number(v).toFixed(2)}
                stroke="#004d40"
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                stroke="#00897b"
                tickFormatter={v => (v / 1000).toFixed(1) + "k"} 
              />
              <Tooltip
                formatter={v => Number(v).toFixed(2)}
                labelFormatter={l => new Date(l).toLocaleString("en-IN")}
                contentStyle={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 20 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                stroke="#024a4aff"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                name="Price"
              />
              <Bar 
                yAxisId="right" 
                dataKey="volume" 
                fill="#0d0918ff" 
                opacity={0.4}         
                name="Volume" 
                barSize={20}           
                radius={[4, 4, 0, 0]}   
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}