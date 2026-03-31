import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';
import api from '../api/axios';
import { API_ORIGIN } from '../utils/api_base';

// Custom Map Car Icon
const carIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/744/744465.png', // Temporary car icon
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Helper component to auto-pan map to the driver
function MapUpdater({ driverLocation }) {
    const map = useMap();
    useEffect(() => {
        if (driverLocation) {
            map.flyTo([driverLocation.latitude, driverLocation.longitude], 15, { animate: true });
        }
    }, [driverLocation, map]);
    return null;
}

export default function LiveTrackingMap({ rideId, onClose }) {
    const [driverLocation, setDriverLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState('');
    const [isFallbackActive, setIsFallbackActive] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const pollingIntervalRef = useRef(null);
    const shouldReconnectRef = useRef(true);

    const buildWebSocketUrl = () => {
        const fallbackOrigin = window.location.origin;
        let apiOrigin;

        try {
            apiOrigin = new URL(API_ORIGIN || fallbackOrigin, fallbackOrigin);
        } catch {
            apiOrigin = new URL(fallbackOrigin);
        }

        const protocol = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${apiOrigin.host}/ws/location/${rideId}/`;
    };

    useEffect(() => {
        shouldReconnectRef.current = true;

        const fetchLatestLocation = async () => {
            try {
                const response = await api.get(`location/rides/${rideId}/latest/`);
                const latestDriverLocation = response.data?.driver_location;

                if (
                    latestDriverLocation &&
                    latestDriverLocation.latitude != null &&
                    latestDriverLocation.longitude != null
                ) {
                    setDriverLocation({
                        latitude: latestDriverLocation.latitude,
                        longitude: latestDriverLocation.longitude,
                        heading: latestDriverLocation.heading || 0,
                    });
                    setIsFallbackActive(true);
                    setConnectionError('');
                }
            } catch (error) {
                console.error('Latest location fetch failed:', error);
            }
        };

        const connect = () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }

            const socket = new WebSocket(buildWebSocketUrl());
            wsRef.current = socket;

            socket.onopen = () => {
                console.log("WebSocket connected for ride:", rideId);
                setIsConnected(true);
                setIsFallbackActive(false);
                setConnectionError('');
            };

            socket.onclose = () => {
                setIsConnected(false);
                if (!shouldReconnectRef.current) return;
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
            };

            socket.onerror = (error) => {
                console.error("WS Error:", error);
                if (!driverLocation) {
                    setConnectionError('Live websocket unavailable. Falling back to periodic updates.');
                }
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (
                        data.role === 'driver' &&
                        data.latitude != null &&
                        data.longitude != null
                    ) {
                        setDriverLocation({
                            latitude: data.latitude,
                            longitude: data.longitude,
                            heading: data.heading || 0
                        });
                    }
                } catch (err) {
                    console.error("Parse error", err);
                }
            };
        };

        fetchLatestLocation();
        pollingIntervalRef.current = setInterval(fetchLatestLocation, 1000);
        connect();

        return () => {
            shouldReconnectRef.current = false;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [rideId]);

    const trackingReady = isConnected || isFallbackActive || Boolean(driverLocation);
    const statusText = isConnected
        ? "Connected to Driver"
        : trackingReady
            ? "Tracking driver location"
            : "Connecting...";

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-indigo-500/30 rounded-[2rem] w-full max-w-4xl h-[80vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 relative">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-slate-950/80 z-10 relative">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none"></div>
                    <div className="relative z-10">
                        <h2 className="text-xl font-black text-white tracking-tight">Live Driver Tracking</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`w-2 h-2 rounded-full ${trackingReady ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse'}`}></span>
                            <span className="text-sm font-semibold text-slate-400">
                                {statusText}
                            </span>
                        </div>
                        {connectionError && !trackingReady ? (
                            <p className="text-xs font-medium text-amber-300 mt-2">{connectionError}</p>
                        ) : null}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10 text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Map Area */}
                <div className="flex-1 bg-slate-950 relative">
                    {!driverLocation ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/80 backdrop-blur-md">
                            <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                            <p className="font-bold text-indigo-200">Waiting for driver's GPS signal...</p>
                        </div>
                    ) : (
                        <MapContainer
                            center={[driverLocation.latitude, driverLocation.longitude]}
                            zoom={15}
                            style={{ height: '100%', width: '100%', zIndex: 1 }}
                        >
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            />

                            <Marker
                                position={[driverLocation.latitude, driverLocation.longitude]}
                                icon={carIcon}
                            >
                                <Popup className="font-bold text-slate-900">Driver is here!</Popup>
                            </Marker>

                            <MapUpdater driverLocation={driverLocation} />
                        </MapContainer>
                    )}
                </div>
            </div>
        </div>
    );
}
